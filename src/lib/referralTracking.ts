import { track } from './analytics';
import type { PlayerState } from '../../shared/types';
import { isReferralV1Enabled } from '../../shared/config';

/**
 * HACKER KOMBAT — клиентские события рефералки (v5.6).
 * ----------------------------------------------------------------------------
 * Зачем отдельный модуль, а не правка src/lib/analytics.ts: analytics.ts —
 * замороженный контракт воронки v5.3, его трогать нельзя. Здесь только
 * использование публичного track().
 *
 * Событие `referral_first_session` — «приглашённый действительно начал играть»,
 * а не «открыл ссылку». Пишется ОДИН раз за сессию и только у тех, к кому
 * привязан пригласивший (stats.referredByTgId). Сервер принимает его через
 * /api/track в client_events (whitelisted в api/_lib/worldEvents.ts) и режет
 * штатным пятисекундным антифлудом.
 */

let sentThisSession = false;

/** Сбросить флаг (используется QA и повторным init после «Выйти»). */
export function resetReferralSessionFlag(): void {
  sentThisSession = false;
}

/**
 * Отправить referral_first_session, если игрок пришёл по приглашению.
 * Возвращает true, если событие реально ушло в сеть в этом вызове.
 */
export function trackReferralFirstSession(player: PlayerState | null): boolean {
  if (sentThisSession || !player) return false;
  if (!isReferralV1Enabled()) return false;
  const referrerTgId = player.stats.referredByTgId ?? 0;
  if (referrerTgId <= 0) return false;

  sentThisSession = true;
  track('referral_first_session', {
    referrerTgId,
    level: player.derived.level,
    source: 'init',
  });
  return true;
}
