import { FIELD_REPORTS } from '../../shared/fieldReports.config';
import { getLevelProgress } from '../../shared/hack.config';
import { STORY_EPISODES } from '../../shared/story.config';
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
    const player = await sb.from('players').select('id, xp, total_missions').eq('tg_id', user.tgId).maybeSingle();
    if (player.error || !player.data) throw new Error('Не удалось найти аккаунт. Открой игру заново.');
    const playerId = player.data.id;
    if (body.action === 'sync') {
      const [achievements, cards] = await Promise.all([
        sb.from('achievements').select('key').eq('player_id', playerId),
        sb.from('cards').select('level').eq('player_id', playerId).limit(1),
      ]);
      if (achievements.error || cards.error || !achievements.data || !cards.data) throw new Error('Не удалось проверить открытые главы.');
      const keys = new Set(achievements.data.map(row => String(row.key)));
      const missions = Math.max(0, Math.floor(Number(player.data.total_missions) || 0));
      const intro = (keys.has('first_upgrade') || cards.data.some(row => Number(row.level) > 0)) &&
        (keys.has('first_mission') || missions >= 1) && getLevelProgress(Number(player.data.xp) || 0).level >= 3 && missions >= 2;
      const cityRows = FIELD_REPORTS.map((report, i) => ({ tg_id: user.tgId, entry_key: `city:${i + 1}`, category: 'city', position: i + 1,
        content: { title: report.title, text: report.message, sender: report.sender, carefulReply: report.carefulReply, focusedReply: report.focusedReply } }));
      const storyRows = intro ? STORY_EPISODES.filter(entry => entry.missions <= missions).map(entry => ({ tg_id: user.tgId,
        entry_key: `story:${entry.id}`, category: 'story', position: entry.id,
        content: { title: entry.title, text: entry.text, season: entry.season } })) : [];
      // Ignore conflicts so neither a stale sync nor a concurrent read/reply changes existing records.
      const inserted = await sb.from('operator_archive').upsert([...cityRows, ...storyRows], { onConflict: 'tg_id,entry_key', ignoreDuplicates: true });
      if (inserted.error) throw new Error('Не удалось сохранить открытые записи.');
      const result = await sb.from('operator_archive').select('entry_key, category, position, content, unlocked_at, read_at, reply').eq('tg_id', user.tgId).order('position');
      if (result.error || !result.data) throw new Error('Не удалось загрузить архив.');
      return sendJson(res, 200, { ok: true, entries: result.data });
    }
    const key = typeof body.key === 'string' ? body.key : '';
    if (!/^(story|city):[1-9]\d{0,5}$/.test(key)) return sendJson(res, 400, { ok: false, error: 'Неверная запись.' });
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
