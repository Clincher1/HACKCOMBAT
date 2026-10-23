import crypto from 'node:crypto';

export interface VerifiedTelegramUser {
  tgId: number;
  username: string;
  firstName?: string;
  isVerifiedTelegram: boolean;
}

const MAX_AUTH_AGE_SECONDS = 86400; // 24 часа свежести подписи Telegram initData

/**
 * Очищает никнейм от управляющих символов, HTML-тегов и лишних пробелов (защита от XSS / инъекций в никнеймах).
 */
export function sanitizeUsername(raw: string | undefined, fallbackId: number): string {
  const cleaned = String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F<>`"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
  return cleaned.length >= 2 ? cleaned : `Hacker_${Math.abs(fallbackId)}`;
}

/**
 * Генерирует изолированный отрицательный ID для браузерного превью (-900_000_000 .. -100_000_000).
 * Критично для безопасности: никто через curl / DevTools не может подделать заголовок x-demo-user-id
 * и получить доступ к чужому реальному Telegram-аккаунту (tg_id > 0) или попасть в глобальный Топ-100!
 */
function deriveIsolatedGuestId(seed: string | undefined): number {
  const digest = crypto
    .createHash('sha256')
    .update(`hk-guest-sandbox:${seed || 'default-preview-guest'}`)
    .digest();
  const num = digest.readUInt32BE(0) % 800_000_000;
  return -(100_000_000 + num);
}

/**
 * Официальная криптографическая проверка подписи Telegram WebApp initData через HMAC-SHA256:
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * hex(HMAC_SHA256(secret_key, sorted_data_check_string)) === hash
 */
export function verifyTelegramInitData(
  rawInitData: string | undefined,
  botToken: string | undefined,
  demoHeaderId?: string,
  demoHeaderName?: string
): VerifiedTelegramUser {
  const cleaned = (rawInitData ?? '').trim();
  const hasRealBotToken = Boolean(botToken && !botToken.includes('AAExampleBotToken'));

  if (cleaned && hasRealBotToken && botToken) {
    const params = new URLSearchParams(cleaned);
    const receivedHash = params.get('hash');
    if (!receivedHash || !/^[0-9a-f]{64}$/i.test(receivedHash)) {
      throw new Error('Missing or malformed hash in Telegram initData');
    }

    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') {
        pairs.push(`${key}=${value}`);
      }
    });
    pairs.sort((a, b) => a.localeCompare(b));
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const a = Buffer.from(receivedHash.toLowerCase(), 'hex');
    const b = Buffer.from(expectedHash.toLowerCase(), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Invalid Telegram initData signature');
    }

    // Строгая проверка auth_date: запрещаем пустой auth_date и replay старых сессий (> 24 ч)
    const authDate = Number(params.get('auth_date') ?? '0');
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(authDate) || authDate <= 0 || nowSec - authDate > MAX_AUTH_AGE_SECONDS || authDate > nowSec + 300) {
      throw new Error('Expired or invalid Telegram initData timestamp');
    }

    const userJson = params.get('user');
    if (!userJson) {
      throw new Error('Missing user payload in initData');
    }

    const parsed = JSON.parse(userJson) as {
      id: number;
      username?: string;
      first_name?: string;
    };

    const tgId = Math.trunc(Number(parsed.id));
    if (!Number.isSafeInteger(tgId) || tgId <= 0) {
      throw new Error('Invalid Telegram user ID');
    }

    return {
      tgId,
      username: sanitizeUsername(parsed.username || parsed.first_name, tgId),
      firstName: parsed.first_name ? sanitizeUsername(parsed.first_name, tgId) : undefined,
      isVerifiedTelegram: true,
    };
  }

  // Если передан rawInitData при наличии BOT_TOKEN — мы уже проверили его выше; если дошли сюда,
  // значит запрос пришёл без initData (например, превью в обычном браузере вне Telegram).
  if (process.env.STRICT_TELEGRAM_AUTH === 'true') {
    throw new Error('Telegram WebApp authorization required');
  }

  // Изолированная гостевая песочница для браузерного превью:
  // НИКОГДА не позволяет обратиться к реальному tg_id > 0 или соперникам -1009..-1001!
  const guestId = deriveIsolatedGuestId(demoHeaderId);
  const guestName = sanitizeUsername(demoHeaderName || 'CyberGuest', guestId);
  return {
    tgId: guestId,
    username: guestName,
    firstName: guestName,
    isVerifiedTelegram: false,
  };
}
