import crypto from 'node:crypto';

export interface VerifiedTelegramUser {
  tgId: number;
  username: string;
  firstName?: string;
  isVerifiedTelegram: boolean;
}

/**
 * Официальная проверка подписи Telegram WebApp initData через HMAC-SHA256 (Шаг 2 ТЗ):
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

  if (cleaned && botToken && !botToken.includes('AAExampleBotToken')) {
    const params = new URLSearchParams(cleaned);
    const receivedHash = params.get('hash');
    if (!receivedHash) {
      throw new Error('Missing hash in Telegram initData');
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

    const a = Buffer.from(receivedHash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Invalid Telegram initData signature');
    }

    // Проверка свежести auth_date (24 часа DEFAULT)
    const authDate = Number(params.get('auth_date') ?? '0');
    if (authDate > 0 && Math.abs(Date.now() / 1000 - authDate) > 86400) {
      throw new Error('Expired Telegram initData');
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

    return {
      tgId: Number(parsed.id),
      username: parsed.username || parsed.first_name || `Hacker_${parsed.id}`,
      firstName: parsed.first_name,
      isVerifiedTelegram: true,
    };
  }

  // DEFAULT: если игра открыта в браузерном превью (вне Telegram или до указания BOT_TOKEN),
  // разрешаем гостевую сессию, если не включён строгий production-флаг STRICT_TELEGRAM_AUTH=true
  if (process.env.STRICT_TELEGRAM_AUTH === 'true') {
    throw new Error('Telegram WebApp authorization required');
  }

  // Если передан невалидированный initData в dev-режиме без BOT_TOKEN — извлекаем имя пользователя для удобства теста
  if (cleaned) {
    try {
      const params = new URLSearchParams(cleaned);
      const userJson = params.get('user');
      if (userJson) {
        const u = JSON.parse(userJson) as { id?: number; username?: string; first_name?: string };
        if (u.id) {
          return {
            tgId: Number(u.id),
            username: u.username || u.first_name || `Hacker_${u.id}`,
            firstName: u.first_name,
            isVerifiedTelegram: false,
          };
        }
      }
    } catch {
      // ignore parse fallback
    }
  }

  const fallbackId = Number(demoHeaderId) || 777001;
  const fallbackName = (demoHeaderName || 'NeoRunner').slice(0, 28);
  return {
    tgId: fallbackId,
    username: fallbackName,
    firstName: fallbackName,
    isVerifiedTelegram: false,
  };
}
