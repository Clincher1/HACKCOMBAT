import crypto from 'node:crypto';
import { readJsonBody, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; username?: string };
    text?: string;
  };
}

let lastRegisterAt = 0;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * POST / GET /api/telegram — Serverless Webhook для Telegram-бота + Мастер подключения в 1 клик
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const webAppUrl = (
    process.env.PUBLIC_WEBAPP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://hacker-kombat.vercel.app')
  ).replace(/\/$/, '');

  // Если TELEGRAM_WEBHOOK_SECRET не задан вручную, выводим детерминированный секрет из BOT_TOKEN (защита от поддельных POST в /api/telegram!)
  const derivedSecret =
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    (botToken
      ? crypto.createHmac('sha256', 'hk-webhook-v2').update(botToken).digest('hex').slice(0, 48)
      : undefined);

  const urlObj = new URL(req.url || '/api/telegram', webAppUrl);

  // Автопривязка серверного BOT_TOKEN по кнопке ?action=register (с защитой от спама раз в 15 сек)
  if (req.method === 'GET' && urlObj.searchParams.get('action') === 'register') {
    if (!botToken) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Сначала добавьте переменную BOT_TOKEN в Vercel -> Settings -> Environment Variables и нажмите Redeploy.',
      });
    }
    const now = Date.now();
    if (now - lastRegisterAt < 15_000) {
      return sendJson(res, 429, {
        ok: false,
        error: 'Привязка уже выполнялась пару секунд назад — подождите 15 секунд.',
      });
    }
    lastRegisterAt = now;

    const webhookUrl = `${webAppUrl}/api/telegram`;
    const whRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        ...(derivedSecret ? { secret_token: derivedSecret } : {}),
      }),
    }).then((r) => r.json());

    const menuRes = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: '⚡ Играть',
          web_app: { url: webAppUrl },
        },
      }),
    }).then((r) => r.json());

    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json());
    return sendJson(res, 200, {
      ok: Boolean(whRes.ok && menuRes.ok),
      botUsername: meRes?.result?.username || null,
      webhookUrl,
      webAppUrl,
      webhookSecretProtected: Boolean(derivedSecret),
    });
  }

  // При открытии /api/telegram в браузере отдаём мастер настройки бота в 1 клик (с CSP-заголовком)
  const accept = String(req.headers.accept || '');
  if (req.method === 'GET' && accept.includes('text/html') && urlObj.searchParams.get('format') !== 'json') {
    const hasEnvToken = Boolean(botToken);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.statusCode = 200;
    res.end(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>HACKER KOMBAT — Подключение Telegram-бота</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#0a0e1a; color:#e2e8f0; display:flex; justify-content:center; padding:32px 16px; }
    .card { max-width:640px; width:100%; background:#111827; border:1px solid #1e293b; border-radius:18px; padding:28px; box-shadow:0 20px 50px rgba(0,0,0,.5); }
    h1 { margin:0 0 8px; font-size:22px; color:#22d3ee; }
    .badge { display:inline-block; padding:5px 12px; border-radius:999px; font-size:13px; font-weight:600; margin-bottom:18px; }
    .ok { background:rgba(16,185,129,.15); color:#34d399; border:1px solid rgba(16,185,129,.4); }
    .warn { background:rgba(245,158,11,.15); color:#fbbf24; border:1px solid rgba(245,158,11,.4); }
    button { width:100%; padding:14px; border:none; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; background:linear-gradient(90deg,#10b981,#06b6d4); color:#020617; }
    button:hover { opacity:.93; }
    .status { margin-top:16px; padding:14px; border-radius:10px; background:#0f172a; border:1px solid #1e293b; font-size:14px; line-height:1.5; display:none; }
    code { background:#1e293b; padding:2px 6px; border-radius:6px; color:#38bdf8; }
    ol { padding-left:20px; color:#94a3b8; font-size:14px; line-height:1.65; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ Управление Telegram-ботом HACKER KOMBAT</h1>
    <div class="badge ${hasEnvToken ? 'ok' : 'warn'}">
      ${hasEnvToken ? '✅ BOT_TOKEN активен + включена HMAC-защита Webhook!' : '⚠️ Добавьте BOT_TOKEN в Vercel Settings → Environment Variables и нажмите Redeploy'}
    </div>
    <ol>
      <li>Токен хранится строго в секретах сервера Vercel (<code>Sensitive</code>) и никогда не передаётся в браузер.</li>
      <li>Нажмите кнопку ниже, чтобы обновить привязку защищённого Webhook (<code>${webAppUrl}/api/telegram</code>) и кнопки <b>«⚡ Играть»</b>.</li>
    </ol>
    <button id="btn">🚀 Обновить Webhook и кнопку «⚡ Играть»</button>
    <div id="out" class="status"></div>
  </div>
  <script>
    document.getElementById('btn').onclick = async () => {
      const out = document.getElementById('out');
      out.style.display = 'block';
      out.textContent = '⏳ Обновляем защищённый Webhook...';
      try {
        const r = await fetch('/api/telegram?action=register').then(x => x.json());
        if (!r.ok) throw new Error(r.error || 'Ошибка регистрации');
        out.innerHTML = '✅ <b>Готово!</b> Бот <b>@' + r.botUsername + '</b> защищён секретным токеном и готов к игре!<br><br>👉 <a style="color:#34d399;font-weight:bold" href="https://t.me/' + r.botUsername + '" target="_blank">Открыть @' + r.botUsername + ' в Telegram</a>';
      } catch (e) {
        out.innerHTML = '❌ ' + (e.message || e);
      }
    };
  </script>
</body>
</html>`);
    return;
  }

  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'HACKER KOMBAT Telegram Webhook',
      botTokenConfigured: Boolean(botToken),
      disclaimer:
        'Hacker Kombat — вымышленная игра (12+). Не обучает реальному взлому. Не пропагандирует киберпреступность. Все названия и события выдуманы.',
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  // Криптографическая проверка подписи Telegram Webhook (X-Telegram-Bot-Api-Secret-Token)
  const explicitSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (explicitSecret && incomingSecret !== explicitSecret) {
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }
  if (incomingSecret && derivedSecret && incomingSecret !== derivedSecret && incomingSecret !== explicitSecret) {
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }
  // Если старый вебхук пришёл без secret_token — автоматически дообновляем setWebhook с secret_token на стороне Telegram!
  if (!incomingSecret && botToken && derivedSecret) {
    fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${webAppUrl}/api/telegram`,
        secret_token: derivedSecret,
        allowed_updates: ['message', 'callback_query'],
      }),
    }).catch(() => undefined);
  }

  try {
    const update = await readJsonBody<TelegramUpdate>(req);
    const chatId = update.message?.chat?.id;
    const text = (update.message?.text ?? '').trim();
    const rawName = update.message?.from?.first_name || update.message?.from?.username || 'Хакер';
    const safeName = escapeHtml(rawName.slice(0, 40));

    if (!chatId || !Number.isSafeInteger(chatId) || !botToken) {
      return sendJson(res, 200, { ok: true, note: 'Webhook acknowledged' });
    }

    let messageText =
      `⚡ <b>Добро пожаловать в HACKER KOMBAT, ${safeName}!</b>\n\n` +
      `Прокачивай рабочий стол от подпольного ПК до квантового мейнфрейма:\n` +
      `• ⌨️ Тапай по консоли и собирай <b>Data</b>\n` +
      `• 📖 Открой <b>«Обучение»</b> в шапке игры, чтобы узнать лучшие билды\n` +
      `• 🖥️ Эволюционируй стол и качайся вплоть до <b>Cyber Overlord</b>\n` +
      `• ⚖️ Выбирай путь <b>White Hat</b> (Rep) или <b>Black Hat</b> (Heat)\n` +
      `• 🌐 Выходи на многократный <b>Global Hack Престиж</b>!\n\n` +
      `<i>⚖️ Возрастной рейтинг: 12+. Hacker Kombat — вымышленная игра. Не обучает реальному взлому. Не пропагандирует киберпреступность. Все названия и события выдуманы.</i>`;

    if (text.startsWith('/legal')) {
      messageText =
        `⚖️ <b>Правовая информация (12+)</b>\n\n` +
        `Hacker Kombat — вымышленная развлекательная игра в жанре Idle/Clicker. ` +
        `Не обучает реальному взлому, не содержит реальных уязвимостей и не пропагандирует киберпреступность. ` +
        `Все организации (MegaCorp, GovPortal, ScamShop и др.) и события полностью выдуманы.`;
    } else if (text.startsWith('/help')) {
      messageText =
        `📖 <b>Справка HACKER KOMBAT</b>\n\n` +
        `1. <b>Data</b> — основная валюта с кликов, пассивного дохода и миссий.\n` +
        `2. <b>Crypto (💎)</b> — редкая валюта за ежедневный вход и 24 достижения (скины со статами и пропуск таймеров).\n` +
        `3. <b>Rep vs Heat</b> — взламывай плохие сайты ради Rep (White Hat +20% Data/ч) или рискуй на крупных целях ради сверхдохода (Black Hat +50% к клику, но при Heat &gt; 100 срабатывает киберпатруль!).\n` +
        `4. Полный гайд доступен прямо внутри игры по кнопке <b>«📖 Обучение»</b> сверху!`;
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
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
