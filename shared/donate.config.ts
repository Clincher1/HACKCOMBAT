// ============================================================================
// ДОНАТЫ ЗА TELEGRAM STARS (v3.4)
// ----------------------------------------------------------------------------
// Правила, которые заложены прямо в конфиг, чтобы «не заблочили»:
//  • Донат — добровольный. Он НЕ даёт игровых преимуществ, Data, чипов и т.п.
//    Поэтому это не pay-to-win и не «продажа цифрового товара» в терминах
//    App Store/Google Play — просто поддержка проекта.
//  • Цифровые платежи внутри Telegram идут ТОЛЬКО через Stars (валюта XTR):
//    сторонний провайдер (ЮKassa и т.п.) внутри мини-аппа — прямое нарушение
//    Bot ToS §6.2 («digital goods and services — exclusive Stars»).
//    Исключение — донат без товара: там ничего не продаётся, поэтому реальные
//    рубли подключаются ОТДЕЛЬНОЙ внешней страницей (см. блок v3.6.8 ниже).
//    Внутри Telegram всё равно остаётся Stars.
//  • Суммы фиксированы конфигом. Клиент не может попросить произвольную цену:
//    сервер сверяет присланное число со списком и сам собирает payload.
//  • Каждый платёж проверяется по telegram_payment_charge_id (уникальный),
//    поэтому повторный вебхук не начислит «спасибо» дважды.
// ============================================================================

/** Суммы доната в Telegram Stars (ровно они показываются игроку). */
export const DONATE_TIER_STARS = [10, 25, 50, 100] as const;

export const DONATE_MIN_STARS = 1;
export const DONATE_MAX_STARS = 1000;

/** Код валюты Telegram Stars в Bot API. */
export const DONATE_CURRENCY = 'XTR';

/** Префикс payload — чтобы отличить донат от любых будущих платежей. */
export const DONATE_PAYLOAD_PREFIX = 'd1';

/** Лимиты Telegram: payload 1..128 байт, prices — ровно один элемент для XTR. */
export const DONATE_PAYLOAD_MAX_BYTES = 128;

export const DONATE_TITLE = 'Поддержать HACKER KOMBAT';
export const DONATE_DESCRIPTION =
  'Добровольная поддержка проекта в Telegram Stars. Игровых преимуществ не даёт: ' +
  'ни Data, ни чипов, ни ускорений. Только «спасибо» и содержание серверов.';

export const DONATE_THANKS =
  '❤️ Спасибо за поддержку! Твой вклад идёт на серверы, домен и новые обновления. ' +
  'Игровой баланс он не меняет — качаться всё равно честным тапом.';

/** Разрешена ли такая сумма доната (целые звёзды из фиксированного списка). */
export function isAllowedDonateAmount(stars: unknown): stars is number {
  const value = Number(stars);
  if (!Number.isInteger(value)) return false;
  if (value < DONATE_MIN_STARS || value > DONATE_MAX_STARS) return false;
  return (DONATE_TIER_STARS as readonly number[]).includes(value);
}

/**
 * Payload счёта: `d1:<tgId>:<stars>:<nonce>`.
 * Внутри — только то, что сервер сам же и проверит при оплате.
 */
export function buildDonatePayload(tgId: number, stars: number, nowMs: number = Date.now()): string {
  const safeTgId = Math.trunc(Number(tgId));
  const nonce = Math.abs(Math.trunc(nowMs)).toString(36).slice(-8);
  return `${DONATE_PAYLOAD_PREFIX}:${safeTgId}:${Math.trunc(stars)}:${nonce}`;
}

/** Длина строки в UTF-8 байтах (без Buffer — модуль импортируется и в браузер). */
function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Разбор payload. Возвращает null на любую подозрительную строку. */
export function parseDonatePayload(payload: unknown): { tgId: number; stars: number } | null {
  if (typeof payload !== 'string') return null;
  if (utf8Bytes(payload) > DONATE_PAYLOAD_MAX_BYTES) return null;
  const parts = payload.split(':');
  if (parts.length !== 4) return null;
  const [prefix, rawTgId, rawStars] = parts;
  if (prefix !== DONATE_PAYLOAD_PREFIX) return null;
  if (!/^-?\d{1,20}$/.test(rawTgId) || !/^\d{1,4}$/.test(rawStars)) return null;

  const tgId = Number(rawTgId);
  const stars = Number(rawStars);
  if (!Number.isSafeInteger(tgId) || tgId === 0) return null;
  if (!isAllowedDonateAmount(stars)) return null;

  return { tgId, stars };
}

/** Человекочитаемая подпись суммы для кнопок и сообщений. */
export function formatStars(stars: number): string {
  return `${stars} ⭐`;
}

// ============================================================================
// ВНЕШНИЙ ДОНАТ «настоящими деньгами» (v3.6.8)
// ----------------------------------------------------------------------------
// Зачем отдельный рельс:
//  • Stars — единственный разрешённый способ платить ВНУТРИ Telegram (§6.2);
//  • карта/СБП через ЮKassa живёт по Bot ToS §6.1 и только для физических
//    товаров и услуг. Донат ничего не продаёт, поэтому его место — обычная
//    веб-страница сбора средств ВНЕ мини-аппа;
//  • поэтому кнопка ведёт в браузер, а не рисует форму оплаты в игре.
//
// Фича выключена по умолчанию: пока владелец не задал DONATE_CARD_URL,
// витрина выглядит и работает точно как раньше (только Stars).
// ============================================================================

/** Максимальная длина ссылки: защита от мусора в env. */
export const DONATE_CARD_URL_MAX = 300;
/** Максимальная длина подписи кнопки. */
export const DONATE_CARD_LABEL_MAX = 32;
export const DONATE_CARD_DEFAULT_LABEL = 'Донат картой / СБП';
export const DONATE_CARD_NOTE =
  'Откроется внешняя страница доната в браузере. Telegram Stars остаются основным способом поддержки.';

export interface ExternalDonateLink {
  url: string;
  label: string;
}

/**
 * Приводит значение env к безопасной https-ссылке.
 * Возвращает null на всё подозрительное: http, javascript:, data:, мусор.
 */
export function normalizeExternalDonateUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > DONATE_CARD_URL_MAX) return null;
  // Пробелы/управляющие символы в URL — почти всегда ошибка копипаста.
  if (/\s/.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.includes('.')) return null;
  return parsed.toString();
}

/** Готовая ссылка на внешний донат или null, если фича не настроена. */
export function resolveExternalDonate(
  urlRaw: unknown,
  labelRaw: unknown = null
): ExternalDonateLink | null {
  const url = normalizeExternalDonateUrl(urlRaw);
  if (!url) return null;
  const label =
    typeof labelRaw === 'string' && labelRaw.trim().length > 0
      ? labelRaw.trim().slice(0, DONATE_CARD_LABEL_MAX)
      : DONATE_CARD_DEFAULT_LABEL;
  return { url, label };
}

/** t.me-ссылки в мини-аппе открываются не в браузере, а внутри Telegram. */
export function isTelegramLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 't.me' || host === 'telegram.me' || host === 'telegram.dog';
  } catch {
    return false;
  }
}

