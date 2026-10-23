import { readJsonBody, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; username?: string };
    text?: string;
  };
}

/**
 * POST /api/telegram — Serverless Webhook для Telegram-бота (Шаг 2 и раздел 9 ТЗ)
 * Отправляет кнопку запуска Mini App «Открыть HACKER KOMBAT» и юридический дисклеймер 12+.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'HACKER KOMBAT Telegram Webhook',
      disclaimer:
        'Hacker Kombat — вымышленная игра (12+). Не обучает реальному взлому. Не пропагандирует киберпреступность. Все названия и события выдуманы.',
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  // Опциональная проверка секретного заголовка Webhook от Telegram
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (expectedSecret && incomingSecret !== expectedSecret) {
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webAppUrl = (
    process.env.PUBLIC_WEBAPP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')
  ).replace(/\/$/, '');

  try {
    const update = await readJsonBody<TelegramUpdate>(req);
    const chatId = update.message?.chat?.id;
    const text = (update.message?.text ?? '').trim();
    const name = update.message?.from?.first_name || update.message?.from?.username || 'Хакер';

    if (!chatId || !botToken) {
      return sendJson(res, 200, { ok: true, note: 'Webhook acknowledged' });
    }

    let messageText =
      `⚡ *Добро пожаловать в HACKER KOMBAT, ${name}!*\n\n` +
      `Прокачивай рабочий стол от подвального ПК до квантового мейнфрейма:\n` +
      `• ⌨️ Тапай по консоли и собирай *Data*\n` +
      `• 🖥️ Эволюционируй стол каждые 5 уровней\n` +
      `• ⚖️ Выбирай путь *White Hat* (Rep) или *Black Hat* (Heat)\n` +
      `• 🤝 Нанимай элитную кибер-команду и выходи на *Global Hack Престиж*!\n\n` +
      `_⚖️ Возрастной рейтинг: 12+. Hacker Kombat — вымышленная игра. Не обучает реальному взлому. Не пропагандирует киберпреступность. Все названия и события выдуманы._`;

    if (text.startsWith('/legal')) {
      messageText =
        `⚖️ *Правовая информация (12+)*\n\n` +
        `Hacker Kombat — вымышленная развлекательная игра в жанре Idle/Clicker. ` +
        `Не обучает реальному взлому, не содержит реальных уязвимостей и не пропагандирует киберпреступность. ` +
        `Все организации (MegaCorp, GovPortal, ScamShop и др.) и события полностью выдуманы.`;
    } else if (text.startsWith('/help')) {
      messageText =
        `📖 *Справка HACKER KOMBAT*\n\n` +
        `1. *Data* — основная валюта с кликов, пассивного дохода и миссий.\n` +
        `2. *Crypto* — редкая валюта за ежедневный вход и ачивки (скины и пропуск таймеров).\n` +
        `3. *Rep vs Heat* — взламывай плохие сайты ради Rep (White Hat +20% Data/ч) или рискуй на крупных целях ради сверхдохода (Black Hat +50% к клику, но при Heat > 100 срабатывает киберпатруль!).`;
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Открыть HACKER KOMBAT',
                web_app: { url: webAppUrl },
              },
            ],
          ],
        },
      }),
    });

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 200, {
      ok: false,
      error: err instanceof Error ? err.message : 'Webhook error',
    });
  }
}
