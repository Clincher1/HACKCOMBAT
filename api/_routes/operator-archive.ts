import { FIELD_REPORTS } from '../../shared/fieldReports.config';
import { STORY_EPISODES } from '../../shared/story.config';
import { RETURN_CASE_STAGES, buildReturnCaseScenes, getReturnCaseProgress } from '../../shared/returnTrace.config';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin';
import { authenticateRequest, enforceHttpSecurity, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../_lib/http';

/** Separate from player snapshots: no balance/mission/inventory writes. */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!enforceHttpSecurity(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  try {
    const body = await readJsonBody<{ action?: unknown; key?: unknown; reply?: unknown }>(req);
    const user = authenticateRequest(req, body);
    if (!user.isVerifiedTelegram) return sendJson(res, 401, { ok: false, error: 'Для сохранения архива открой игру через Telegram.' });
    const sb = getSupabaseAdmin();
    if (!sb) return sendJson(res, 503, { ok: false, error: 'Архив временно недоступен: нет подключения к хранилищу.' });
    const player = await sb.from('players').select('id').eq('tg_id', user.tgId).maybeSingle();
    if (player.error || !player.data) throw new Error('Не удалось найти аккаунт. Открой игру заново.');
    const playerId = player.data.id;
    if (body.action === 'sync') {
      // Frozen at the transition, not the current mission count: old short
      // chapters must not start unlocking again as the new case progresses.
      const cutoff = await sb.from('operator_legacy_cutoff').select('total_missions').eq('tg_id', user.tgId).maybeSingle();
      if (cutoff.error) throw new Error('Не удалось проверить прежние записи.');
      const missions = Math.max(0, Math.floor(Number(cutoff.data?.total_missions) || 0));
      const cityRows = FIELD_REPORTS.map((report, i) => ({ tg_id: user.tgId, entry_key: `city:${i + 1}`, category: 'city', position: i + 1,
        content: { title: report.title, text: report.message, sender: report.sender, carefulReply: report.carefulReply, focusedReply: report.focusedReply } }));
      const storyRows = STORY_EPISODES.filter(entry => entry.missions <= missions).map(entry => ({ tg_id: user.tgId,
        entry_key: `story:${entry.id}`, category: 'story', position: entry.id,
        content: { title: entry.title, text: entry.text, season: entry.season } }));
      // Ignore conflicts so neither a stale sync nor a concurrent read/reply changes existing records.
      const inserted = await sb.from('operator_archive').upsert([...cityRows, ...storyRows], { onConflict: 'tg_id,entry_key', ignoreDuplicates: true });
      if (inserted.error) throw new Error('Не удалось сохранить открытые записи.');
      const result = await sb.from('operator_archive').select('entry_key, category, position, content, unlocked_at, read_at, reply').eq('tg_id', user.tgId).order('position');
      if (result.error || !result.data) throw new Error('Не удалось загрузить архив.');
      // Read only authoritative, completed mission rows. A failed evidence lookup
      // never hides the previously saved archive or invents a story outcome.
      let entries = result.data;
      let caseAvailable = false;
      let caseAttempted = false;
      try {
        const evidenceResults = await Promise.all(RETURN_CASE_STAGES.map(stage => sb.from('missions')
          .select('mission_key,outcome').eq('player_id', playerId).eq('status', 'completed')
          .eq('outcome', 'success').in('mission_key', [...stage.missions]).order('mission_key').limit(1)));
        if (evidenceResults.some(item => item.error || !Array.isArray(item.data))) throw new Error('case evidence unavailable');
        const evidence = evidenceResults.flatMap(item => item.data ?? []);
        const saved = new Set(entries.map(item => String(item.entry_key)));
        const scenes = buildReturnCaseScenes(saved, evidence);
        if (scenes.length) {
          const write = await sb.from('operator_archive').upsert(scenes.map(scene => ({ ...scene, tg_id: user.tgId })), { onConflict: 'tg_id,entry_key', ignoreDuplicates: true });
          if (write.error) throw new Error('case snapshot unavailable');
          const refreshed = await sb.from('operator_archive').select('entry_key, category, position, content, unlocked_at, read_at, reply').eq('tg_id', user.tgId).order('position');
          if (refreshed.error || !refreshed.data) throw new Error('case reload unavailable');
          entries = refreshed.data;
        }
        caseAvailable = true;
        const next = getReturnCaseProgress(new Set(entries.map(item => String(item.entry_key)))).next;
        if (next) {
          const attempts = await sb.from('missions').select('mission_key').eq('player_id', playerId)
            .eq('status', 'completed').in('outcome', ['partial', 'fail']).in('mission_key', [...next.missions]).limit(1);
          caseAttempted = !attempts.error && !!attempts.data?.length;
        }
      } catch (err) { console.error('case sync:', err); }
      return sendJson(res, 200, { ok: true, entries, caseAvailable, caseAttempted });
    }
    const key = typeof body.key === 'string' ? body.key : '';
    if (!/^(story|city|case):[1-9]\d{0,5}$/.test(key)) return sendJson(res, 400, { ok: false, error: 'Неверная запись.' });
    if (body.action === 'read') {
      // Conditional update is idempotent; never writes over a selected reply.
      const result = await sb.from('operator_archive').update({ read_at: new Date().toISOString() }).eq('tg_id', user.tgId).eq('entry_key', key).is('read_at', null);
      if (result.error) throw new Error('Не удалось сохранить отметку о прочтении.');
      const read = await sb.from('operator_archive').select('entry_key, category, position, content, unlocked_at, read_at, reply').eq('tg_id', user.tgId).eq('entry_key', key).maybeSingle();
      if (read.error || !read.data) throw new Error('Запись ещё не открыта.');
      return sendJson(res, 200, { ok: true, entry: read.data });
    }
    if (body.action === 'reply') {
      if (!key.startsWith('city:') || (body.reply !== 'careful' && body.reply !== 'focused')) return sendJson(res, 400, { ok: false, error: 'Неверный ответ.' });
      const result = await sb.from('operator_archive').update({ reply: body.reply }).eq('tg_id', user.tgId).eq('entry_key', key).select('entry_key, category, position, content, unlocked_at, read_at, reply').maybeSingle();
      if (result.error || !result.data) throw new Error('Не удалось сохранить ответ.');
      return sendJson(res, 200, { ok: true, entry: result.data });
    }
    return sendJson(res, 400, { ok: false, error: 'Неизвестное действие.' });
  } catch (error) {
    console.error('operator archive:', error);
    return sendJson(res, 503, { ok: false, error: error instanceof Error ? error.message : 'Архив временно недоступен.' });
  }
}
