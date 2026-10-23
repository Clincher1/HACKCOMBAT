import { readJsonBody, sendJson, type ApiRequest, type ApiResponse } from './_lib/http';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; username?: string };
    text?: string;
  };
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

  const urlObj = new URL(req.url || '/api/telegram', webAppUrl);

  // Автопривязка серверного BOT_TOKEN по кнопке ?action=register
  if (req.method === 'GET' && urlObj.searchParams.get('action') === 'register') {
    if (!botToken) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Сначала добавьте переменную BOT_TOKEN в Vercel -> Settings -> Environment Variables и нажмите Redeploy, либо вставьте токен прямо в поле ниже.',
      });
    }
    const webhookUrl = `${webAppUrl}/api/telegram`;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const whRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        ...(secret ? { secret_token: secret } : {}),
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
    });
  }

  // При открытии /api/telegram в браузере отдаём удобный русский мастер настройки бота в 1 клик
  const accept = String(req.headers.accept || '');
  if (req.method === 'GET' && accept.includes('text/html') && urlObj.searchParams.get('format') !== 'json') {
    const hasEnvToken = Boolean(botToken);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 200;
    res.end(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>HACKER KOMBAT — Подключение Telegram-бота в 1 клик</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#0a0e1a; color:#e2e8f0; display:flex; justify-content:center; padding:32px 16px; }
    .card { max-width:640px; width:100%; background:#111827; border:1px solid #1e293b; border-radius:18px; padding:28px; box-shadow:0 20px 50px rgba(0,0,0,.5); }
    h1 { margin:0 0 8px; font-size:22px; color:#22d3ee; }
    .badge { display:inline-block; padding:5px 12px; border-radius:999px; font-size:13px; font-weight:600; margin-bottom:18px; }
    .ok { background:rgba(16,185,129,.15); color:#34d399; border:1px solid rgba(16,185,129,.4); }
    .warn { background:rgba(245,158,11,.15); color:#fbbf24; border:1px solid rgba(245,158,11,.4); }
    label { display:block; font-size:14px; margin-bottom:8px; color:#cbd5e1; }
    input { width:100%; box-sizing:border-box; padding:12px 14px; border-radius:10px; border:1px solid #334155; background:#0f172a; color:#f8fafc; font-size:15px; margin-bottom:14px; }
    button { width:100%; padding:14px; border:none; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; background:linear-gradient(90deg,#10b981,#06b6d4); color:#020617; }
    button:hover { opacity:.93; }
    .status { margin-top:16px; padding:14px; border-radius:10px; background:#0f172a; border:1px solid #1e293b; font-size:14px; line-height:1.5; display:none; }
    code { background:#1e293b; padding:2px 6px; border-radius:6px; color:#38bdf8; }
    ol { padding-left:20px; color:#94a3b8; font-size:14px; line-height:1.65; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ Мастер подключения Telegram-бота</h1>
    <div class="badge ${hasEnvToken ? 'ok' : 'warn'}">
      ${hasEnvToken ? '✅ Переменная BOT_TOKEN уже найдена на сервере Vercel!' : '⚠️ Переменная BOT_TOKEN ещё не добавлена в Vercel Settings → Environment Variables'}
    </div>
    <ol>
      <li>Откройте <b>@BotFather</b> в Telegram → отправьте <code>/newbot</code> → скопируйте выданный токен.</li>
      <li>Вставьте токен ниже и нажмите кнопку — мы <b>автоматически</b> пропишем кнопку меню <b>«⚡ Играть»</b> (<code>${webAppUrl}</code>) и Webhook (<code>${webAppUrl}/api/telegram</code>)!</li>
      <li>Чтобы работал ответ на <code>/start</code> и серверная проверка подписи <code>initData</code>, также сохраните этот токен как <code>BOT_TOKEN</code> в <b>Vercel → Settings → Environment Variables</b> и нажмите <b>Redeploy</b>.</li>
    </ol>
    <label for="token">Токен бота из @BotFather ${hasEnvToken ? '(оставьте пустым, чтобы использовать BOT_TOKEN из Vercel)' : ''}:</label>
    <input id="token" type="password" placeholder="1234567890:AAH..." autocomplete="off" />
    <button id="btn">🚀 Подключить кнопку «⚡ Играть» и Webhook в 1 клик</button>
    <div id="out" class="status"></div>
  </div>
  <script>
    const webAppUrl = ${JSON.stringify(webAppUrl)};
    document.getElementById('btn').onclick = async () => {
      const out = document.getElementById('out');
      out.style.display = 'block';
      out.textContent = '⏳ Подключаем бота к HACKER KOMBAT...';
      const raw = document.getElementById('token').value.trim();
      try {
        if (!raw) {
          const r = await fetch('/api/telegram?action=register').then(x => x.json());
          if (!r.ok) throw new Error(r.error || 'Ошибка регистрации');
          out.innerHTML = '✅ <b>Готово!</b> Бот <b>@' + r.botUsername + '</b> полностью подключён!<br><br>👉 Откройте <a style="color:#34d399" href="https://t.me/' + r.botUsername + '" target="_blank">https://t.me/' + r.botUsername + '</a> и нажмите <b>/start</b> или синюю кнопку <b>«⚡ Играть»</b>!';
          return;
        }
        const me = await fetch('https://api.telegram.org/bot' + raw + '/getMe').then(x => x.json());
        if (!me.ok) throw new Error('Неверный токен бота: ' + (me.description || 'проверьте токен из @BotFather'));
        await fetch('https://api.telegram.org/bot' + raw + '/setWebhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webAppUrl + '/api/telegram' })
        });
        await fetch('https://api.telegram.org/bot' + raw + '/setChatMenuButton', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menu_button: { type: 'web_app', text: '⚡ Играть', web_app: { url: webAppUrl } } })
        });
        out.innerHTML = '✅ <b>Кнопка «⚡ Играть» и Webhook успешно привязаны к @' + me.result.username + '!</b><br><br>' +
          '👉 Уже сейчас можете открыть <a style="color:#34d399;font-weight:bold" href="https://t.me/' + me.result.username + '" target="_blank">https://t.me/' + me.result.username + '</a> и нажать кнопку <b>«⚡ Играть»</b> внизу чата!<br>' +
          '📌 Не забудьте также добавить <code>BOT_TOKEN</code> в Vercel → Settings → Environment Variables → Redeploy для ответа на команду <code>/start</code>.';
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

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (expectedSecret && incomingSecret !== expectedSecret) {
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }

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
