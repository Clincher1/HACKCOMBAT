// ============================================================================
// РЕФЕРАЛКИ — серверный слой (v3.5)
// ----------------------------------------------------------------------------
// Как устроено и почему именно так:
//   • Код приглашения приезжает из подписанного Telegram initData
//     (start_param) либо из Telegram launch-параметра, который сервер
//     принимает только после успешной проверки initData. Веб-клиентский
//     fallback не работает для синтетических demo-id и всё равно проходит
//     проверку кода/новизны ниже.
//   • Привязка одноразовая: PRIMARY KEY(invitee_tg). Кто позвал первым, тот и
//     получает друга навсегда; повторные ссылки ничего не меняют.
//   • Награда — не за клик, а за 8 реальных минут игры приглашённого
//     (тот же activeSecondsToday, что и у оффлайн-копилки).
//   • Награда пригласившему начисляется НЕ в запросе приглашённого, а на
//     ближайшем синке самого пригласившего (status='qualified' → 'rewarded').
//     Так мы не трогаем чужую запись под чужим мьютексом: ни дедлоков, ни
//     «двойной выдачи» при параллельных запросах.
//   • Потолки считаются в момент выплаты по текущему уровню пригласившего,
//     поэтому рефералка никогда не обгоняет саму игру.
// ============================================================================
import crypto from 'node:crypto';
import {
  getInviteeXpReward,
  getReferrerDataReward,
  getReferrerXpReward,
  REFERRAL_CODE_LENGTH,
  REFERRAL_DAILY_LIMIT,
  REFERRAL_DATA_WEEKLY_HOURS,
  REFERRAL_INVITEE_DATA_REWARD,
  REFERRAL_MAX_SAME_NETWORK_PER_DAY,
  REFERRAL_QUALIFY_ACTIVE_SECONDS,
  REFERRAL_WEEKLY_LIMIT,
  REFERRAL_XP_DAILY_LEVELS,
  REFERRAL_XP_WEEKLY_LEVELS,
  isValidReferralCode,
} from '../../shared/referral.config';
import { getXpToNext } from '../../shared/hack.config';
import type { StoredPlayerRecord } from './gameEngine';
import { getSupabaseAdmin } from './supabaseAdmin';

export interface ReferralStats {
  code: string;
  invited: number;
  qualified: number;
  xpEarned: number;
  dataEarned: number;
}

interface ReferralRow {
  referrer_tg: number;
  invitee_tg: number;
  status: 'attributed' | 'qualified' | 'rewarded' | 'flagged';
  reward_xp: number;
  reward_data: number;
  created_at: string;
  qualified_at: string | null;
}

// Локальный режим (dev/preview без Supabase) — в памяти процесса.
// В прод не попадает: там всегда Supabase.
const localCodes = new Map<number, string>();
const localReferrals: ReferralRow[] = [];

function hashNetwork(ip: string | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.REFERRAL_IP_SALT || process.env.TELEGRAM_WEBHOOK_SECRET || 'hk-ref-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Код, из которого нельзя восстановить Telegram ID. */
function newCode(seed: string): string {
  const salt = process.env.REFERRAL_CODE_SALT || process.env.BOT_TOKEN || 'hk-ref-code';
  return crypto.createHash('sha256').update(`${salt}:${seed}`).digest('hex').slice(0, REFERRAL_CODE_LENGTH);
}

export function buildReferralLink(botUsername: string | null, code: string): string | null {
  if (!botUsername) return null;
  return `https://t.me/${botUsername.replace(/^@/, '')}?startapp=ref_${code}`;
}

/** Код игрока: создаём при первом обращении, дальше отдаём тот же. */
export async function getOrCreateReferralCode(tgId: number): Promise<string> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data: existing } = await sb
      .from('referral_codes')
      .select('code')
      .eq('tg_id', tgId)
      .maybeSingle();
    if (existing?.code) return String(existing.code);

    const code = newCode(String(tgId));
    const { error } = await sb.from('referral_codes').insert({ tg_id: tgId, code });
    if (!error) return code;
    // Параллельный запрос уже создал код — перечитываем, конфликт не страшен.
    const { data: fallback } = await sb
      .from('referral_codes')
      .select('code')
      .eq('tg_id', tgId)
      .maybeSingle();
    return fallback?.code ? String(fallback.code) : code;
  }

  const cached = localCodes.get(tgId);
  if (cached) return cached;
  const code = newCode(String(tgId));
  localCodes.set(tgId, code);
  return code;
}

async function resolveCodeOwner(code: string): Promise<number | null> {
  if (!isValidReferralCode(code)) return null;
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data } = await sb.from('referral_codes').select('tg_id').eq('code', code).maybeSingle();
    return data?.tg_id ? Number(data.tg_id) : null;
  }
  for (const [tgId, stored] of localCodes.entries()) {
    if (stored === code) return tgId;
  }
  return null;
}

/**
 * «Совсем новый игрок»: ни одного тапа, ни опыта, ни контрактов.
 * Иначе мнимые «друзья» на прокачанных аккаунтах давали бы бесконечный бонус.
 */
function looksLikeNewPlayer(record: StoredPlayerRecord): boolean {
  return (record.totalClicks ?? 0) === 0 && (record.xp ?? 0) === 0 && (record.totalMissions ?? 0) === 0;
}

/**
 * Привязка «кто позвал» по start_param. Идемпотентна: повторный вызов
 * (перезапуск мини-аппа) ничего не меняет благодаря PK(invitee_tg).
 */
export async function attributeReferral(
  record: StoredPlayerRecord,
  startParam: string | undefined,
  ip?: string
): Promise<void> {
  if (!startParam) return;
  const raw = startParam.trim().toLowerCase();
  if (!raw.startsWith('ref_')) return;
  const code = raw.slice(4);
  if (!isValidReferralCode(code)) return;

  // Гостям браузерного превью рефералки не считаем — их id синтетические.
  if (!Number.isSafeInteger(record.tgId) || record.tgId <= 0) return;
  if (!looksLikeNewPlayer(record)) return;

  const referrerTg = await resolveCodeOwner(code);
  if (!referrerTg || referrerTg === record.tgId) return;

  const ipHash = hashNetwork(ip);
  const sb = getSupabaseAdmin();

  if (sb) {
    let status: ReferralRow['status'] = 'attributed';
    if (ipHash) {
      // Много «друзей» из одной сети за сутки — награда ждёт проверки.
      const { count } = await sb
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
      if ((count ?? 0) >= REFERRAL_MAX_SAME_NETWORK_PER_DAY) status = 'flagged';
    }
    // 23505 (уже привязан) — нормальный повтор, просто ничего не делаем.
    const { error: insertError } = await sb.from('referrals').insert({
      referrer_tg: referrerTg,
      invitee_tg: record.tgId,
      code,
      status,
      ip_hash: ipHash,
    });
    if (insertError && insertError.code !== '23505') {
      // Не проглатываем реальные ошибки схемы/прав доступа: иначе игрок
      // видит «0 из 0», хотя Telegram-параметр был получен.
      console.error('[referral] attribution insert failed', {
        inviteeTg: record.tgId,
        referrerTg,
        code,
        error: insertError.message,
      });
    }
    return;
  }

  if (localReferrals.some((r) => r.invitee_tg === record.tgId)) return;
  localReferrals.push({
    referrer_tg: referrerTg,
    invitee_tg: record.tgId,
    status: 'attributed',
    reward_xp: 0,
    reward_data: 0,
    created_at: new Date().toISOString(),
    qualified_at: null,
  });
}

/**
 * Приглашённый наиграл 8 минут → помечаем запись 'qualified' и сразу даём
 * ему собственный бонус. Награда пригласившему будет выплачена на его синке.
 */
export async function qualifyInvitee(record: StoredPlayerRecord, level: number): Promise<string | null> {
  if (!Number.isSafeInteger(record.tgId) || record.tgId <= 0) return null;
  if ((record.stats.activeSecondsToday ?? 0) < REFERRAL_QUALIFY_ACTIVE_SECONDS) return null;

  const sb = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  let referrerTg: number | null = null;

  if (sb) {
    const { data: row } = await sb
      .from('referrals')
      .select('referrer_tg, status')
      .eq('invitee_tg', record.tgId)
      .maybeSingle();
    if (!row || row.status !== 'attributed') return null;

    // Оптимистичная блокировка: переводим в qualified только из attributed.
    const { data: updated } = await sb
      .from('referrals')
      .update({ status: 'qualified', qualified_at: nowIso })
      .eq('invitee_tg', record.tgId)
      .eq('status', 'attributed')
      .select('referrer_tg')
      .maybeSingle();
    if (!updated) return null;
    referrerTg = Number(updated.referrer_tg);
  } else {
    const row = localReferrals.find((r) => r.invitee_tg === record.tgId && r.status === 'attributed');
    if (!row) return null;
    row.status = 'qualified';
    row.qualified_at = nowIso;
    referrerTg = row.referrer_tg;
  }

  // Бонус самому приглашённому — маленький, чтобы не сломать старт игры.
  record.xp += getInviteeXpReward(level);
  record.data += REFERRAL_INVITEE_DATA_REWARD;
  return referrerTg ? String(referrerTg) : null;
}

export interface ReferralPayout {
  count: number;
  xp: number;
  data: number;
  held: number;
}

/**
 * Выплата наград пригласившему. Вызывается на его собственном синке:
 * считаем по его ТЕКУЩЕМУ уровню, проверяем потолки и начисляем.
 */
export async function payoutReferrals(
  record: StoredPlayerRecord,
  level: number,
  dataPerHour: number
): Promise<ReferralPayout> {
  if (!Number.isSafeInteger(record.tgId) || record.tgId <= 0) return { count: 0, xp: 0, data: 0, held: 0 };

  const sb = getSupabaseAdmin();
  let rows: ReferralRow[] = [];

  if (sb) {
    const { data } = await sb
      .from('referrals')
      .select('referrer_tg, invitee_tg, status, reward_xp, reward_data, created_at, qualified_at')
      .eq('referrer_tg', record.tgId)
      .in('status', ['qualified', 'rewarded']);
    rows = (data ?? []) as ReferralRow[];
  } else {
    rows = localReferrals.filter(
      (r) => r.referrer_tg === record.tgId && (r.status === 'qualified' || r.status === 'rewarded')
    );
  }

  const pending = rows.filter((r) => r.status === 'qualified');
  if (pending.length === 0) return { count: 0, xp: 0, data: 0, held: 0 };

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const paidDay = rows.filter((r) => r.status === 'rewarded' && (r.qualified_at ?? '') >= dayAgo);
  const paidWeek = rows.filter((r) => r.status === 'rewarded' && (r.qualified_at ?? '') >= weekAgo);

  let dayCount = paidDay.length;
  let weekCount = paidWeek.length;
  let xpWeek = paidWeek.reduce((s, r) => s + Number(r.reward_xp ?? 0), 0);
  let dataWeek = paidWeek.reduce((s, r) => s + Number(r.reward_data ?? 0), 0);

  const xpEach = getReferrerXpReward(level);
  const dataEach = getReferrerDataReward(dataPerHour);
  const xpDayCap = getXpToNext(level) * REFERRAL_XP_DAILY_LEVELS;
  const xpWeekCap = getXpToNext(level) * REFERRAL_XP_WEEKLY_LEVELS;
  const dataWeekCap = 3600 * REFERRAL_DATA_WEEKLY_HOURS;

  let count = 0;
  let xp = 0;
  let data = 0;
  let held = 0;
  const toReward: number[] = [];
  const toHold: number[] = [];

  for (const row of pending) {
    const overDaily = dayCount >= REFERRAL_DAILY_LIMIT;
    const overWeekly = weekCount >= REFERRAL_WEEKLY_LIMIT;
    const overXp = xpWeek + xpEach > xpWeekCap || xp + xpEach > xpDayCap;
    const overData = dataWeek + dataEach > dataWeekCap;

    if (overDaily || overWeekly || overXp || overData) {
      // Потолок: не платим сейчас, но и не сжигаем друга — держим в flagged.
      toHold.push(row.invitee_tg);
      held += 1;
      continue;
    }

    toReward.push(row.invitee_tg);
    count += 1;
    xp += xpEach;
    data += dataEach;
    dayCount += 1;
    weekCount += 1;
    xpWeek += xpEach;
    dataWeek += dataEach;
  }

  if (count > 0) {
    record.xp += xp;
    record.data += data;
  }

  const nowIso = new Date().toISOString();
  if (sb) {
    if (toReward.length > 0) {
      await sb
        .from('referrals')
        .update({ status: 'rewarded', reward_xp: xpEach, reward_data: dataEach, rewarded_at: nowIso })
        .eq('referrer_tg', record.tgId)
        .in('invitee_tg', toReward)
        .eq('status', 'qualified');
    }
    if (toHold.length > 0) {
      await sb
        .from('referrals')
        .update({ status: 'flagged' })
        .eq('referrer_tg', record.tgId)
        .in('invitee_tg', toHold)
        .eq('status', 'qualified');
    }
  } else {
    for (const row of localReferrals) {
      if (row.referrer_tg !== record.tgId) continue;
      if (toReward.includes(row.invitee_tg)) {
        row.status = 'rewarded';
        row.reward_xp = xpEach;
        row.reward_data = dataEach;
      } else if (toHold.includes(row.invitee_tg)) {
        row.status = 'flagged';
      }
    }
  }

  return { count, xp, data, held };
}

/** Статистика для карточки «Пригласи друга». */
export async function getReferralStats(tgId: number, code: string): Promise<ReferralStats> {
  const sb = getSupabaseAdmin();
  const empty: ReferralStats = { code, invited: 0, qualified: 0, xpEarned: 0, dataEarned: 0 };

  if (sb) {
    const { data } = await sb
      .from('referrals')
      .select('status, reward_xp, reward_data')
      .eq('referrer_tg', tgId);
    const rows = data ?? [];
    return {
      code,
      invited: rows.length,
      qualified: rows.filter((r) => r.status === 'rewarded').length,
      xpEarned: rows.reduce((s, r) => s + Number(r.reward_xp ?? 0), 0),
      dataEarned: rows.reduce((s, r) => s + Number(r.reward_data ?? 0), 0),
    };
  }

  const rows = localReferrals.filter((r) => r.referrer_tg === tgId);
  return {
    code,
    invited: rows.length,
    qualified: rows.filter((r) => r.status === 'rewarded').length,
    xpEarned: rows.reduce((s, r) => s + r.reward_xp, 0),
    dataEarned: rows.reduce((s, r) => s + r.reward_data, 0),
  };
}
