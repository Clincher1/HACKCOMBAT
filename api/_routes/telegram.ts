import crypto from 'node:crypto';
import {
  buildDonatePayload,
  DONATE_CURRENCY,
  DONATE_DESCRIPTION,
  DONATE_THANKS,
  DONATE_TIER_STARS,
  DONATE_TITLE,
  formatStars,
  parseDonatePayload,
  resolveExternalDonate,
} from '../../shared/donate.config';
import {
  createDonateInvoiceLink,
  findDonationByChargeId,
  getDonationSummary,
  listDonations,
  markDonationRefunded,
  recordDonation,
  tgApi,
  validatePreCheckoutQuery,
} from '../_lib/donations';
import {
  buildReferralLink,
  getOrCreateReferralCode,
  getReferralStats,
} from '../_lib/referrals';
import { REFERRAL_QUALIFY_ACTIVE_SECONDS, REFERRAL_RULES_SHORT } from '../../shared/referral.config';
import { readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../_lib/http';
import { isRealBotToken } from '../_lib/telegramAuth';

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: TelegramUser;
    text?: string;
    successful_payment?: TelegramSuccessfulPayment;
  };
  // Telegram присылает это перед оплатой и ждёт ответ ≤10 секунд,
  // иначе платёж отменяется. Без allowed_updates=pre_checkout_query
  // апдейт вообще не придёт — и любая оплата отвалится.
  pre_checkout_query?: {
    id: string;
    from?: TelegramUser;
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  callback_query?: {
    id: string;
    from?: TelegramUser;
    data?: string;
    message?: { chat: { id: number } };
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
 * Экран «Пригласи друга» (v3.5). Один и тот же текст для /invite и кнопки.
 * Ссылка ведёт на мини-апп с startapp=ref_<код>: код приезжает в подписанном
 * initData либо в отдельном Telegram launch-параметре, который сервер
 * принимает только после проверки подписи initData.
 */
async function sendReferralScreen(
  token: string,
  chatId: number,
  tgId: number,
  webAppUrl: string
): Promise<void> {
  if (!token) return;
  const code = await getOrCreateReferralCode(tgId);
  const me = await tgApi<{ username?: string }>(token, 'getMe');
  const link = buildReferralLink(me.ok ? me.result?.username ?? null : null, code);
  const stats = await getReferralStats(tgId, code);

  await tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text:
      `🔗 <b>Пригласи друга в HACKER KOMBAT</b>\n\n` +
      `Твоя ссылка:\n<code>${escapeHtml(link ?? 'недоступна')}</code>\n\n` +
      `${escapeHtml(REFERRAL_RULES_SHORT)}\n\n` +
      `Уже засчитано: <b>${stats.qualified}</b> из ${stats.invited} приглашённых.`,
    parse_mode: 'HTML',
    reply_markup: webAppUrl
      ? { inline_keyboard: [[{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }]] }
      : undefined,
  });
}

/**
 * Экран доната. Если stars === null — показываем выбор суммы кнопками.
 * Оплата в Stars проходит прямо в чате (sendInvoice) — без Mini App и без
 * сторонних провайдеров, это требование Telegram для цифровых платежей.
 */
async function sendDonateInvoice(
  token: string,
  chatId: number,
  stars: number | null,
  tgId: number
): Promise<void> {
  if (!token) return;

  if (stars === null) {
    // v3.6.8: если владелец задал DONATE_CARD_URL — добавляем вторую строку
    // кнопок со ссылкой на внешнюю страницу доната (карта/СБП/ЮMoney).
    // Внутри Telegram по-прежнему только Stars: это правило Bot ToS §6.2.
    const external = resolveExternalDonate(process.env.DONATE_CARD_URL, process.env.DONATE_CARD_LABEL);
    const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
      DONATE_TIER_STARS.map((amount) => ({
        text: `${amount} ⭐`,
        callback_data: `donate:${amount}`,
      })),
    ];
    if (external) keyboard.push([{ text: external.label, url: external.url }]);

    await tgApi(token, 'sendMessage', {
      chat_id: chatId,
      text:
        '❤️ <b>Поддержать HACKER KOMBAT</b>\n\n' +
        'Игра бесплатная, без рекламы и без платных преимуществ. Если хочется угостить ' +
        'разработчика звёздами — вот кнопки. Донат <b>не даёт</b> Data, чипов, скинов ' +
        'со статами или ускорений: только «спасибо» и содержание серверов.\n\n' +
        'Оплата — Telegram Stars ⭐ (встроенная валюта Telegram).' +
        (external
          ? '\n💳 Картой или через СБП — на внешней странице кнопкой ниже (откроется в браузере).'
          : '') +
        '\n<i>Возврат: /paysupport • Условия: /terms</i>',
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
    return;
  }

  const link = await createDonateInvoiceLink(tgId, stars);
  if (!link.ok || !link.invoiceLink) {
    await tgApi(token, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Не удалось выставить счёт: ${escapeHtml(link.error ?? 'ошибка')}`,
      parse_mode: 'HTML',
    });
    return;
  }
  await tgApi(token, 'sendInvoice', {
    chat_id: chatId,
    title: DONATE_TITLE.slice(0, 32),
    description: DONATE_DESCRIPTION.slice(0, 255),
    payload: buildDonatePayload(tgId, stars),
    currency: DONATE_CURRENCY,
    prices: [{ label: 'Поддержка проекта', amount: stars }],
  });
}

/**
 * POST / GET /api/telegram — Serverless Webhook для Telegram-бота + Мастер подключения в 1 клик
 */
/**
 * v3.6.7: список админов бота из ADMIN_TG_IDS.
 * Нужен для служебных команд (/refund, /stars) — раньше проверка была
 * зашита прямо в /refund и /stars просто не существовало.
 */
function getAdminIds(): string[] {
  return (process.env.ADMIN_TG_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function isBotAdmin(tgId: unknown): boolean {
  const id = String(tgId ?? '');
  return id !== '' && getAdminIds().includes(id);
}

/** Баланс звёзд бота (Telegram хранит его на своей стороне, не у нас). */
async function fetchBotStarBalance(
  botToken: string
): Promise<{ amount: number; nanostar: number } | null> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMyStarBalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then((r) => r.json())
    .catch(() => null);
  if (!res?.ok || !res.result) return null;
  return {
    amount: Number(res.result.amount ?? 0) || 0,
    nanostar: Number(res.result.nanostar_amount ?? 0) || 0,
  };
}

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
        // Явно перечисляем типы апдейтов: pre_checkout_query нужен для оплаты
        // Stars, иначе Telegram не спросит подтверждение и платёж отвалится.
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
        ...(derivedSecret ? { secret_token: derivedSecret } : {}),
      }),
    }).then((r) => r.json());

    // Команды в меню ☰: раньше они жили только в локальном bot/setup-bot.mjs,
    // поэтому /donate, /paysupport, /terms и /invite не появлялись у игроков.
    const commandsRes = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Запустить HACKER KOMBAT' },
          { command: 'invite', description: 'Пригласи друга и получи бонус' },
          { command: 'donate', description: 'Поддержать проект (Telegram Stars)' },
          { command: 'paysupport', description: 'Помощь по платежам и возврат' },
          { command: 'terms', description: 'Условия донатов' },
          { command: 'help', description: 'Как играть и механики' },
          { command: 'legal', description: 'Правовая информация (12+)' },
        ],
      }),
    }).then((r) => r.json()).catch(() => null);

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
    // Диагностика оплаты: если в allowed_updates нет pre_checkout_query,
    // Telegram не пришлёт подтверждение и Stars-платёж отвалится по таймауту.
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
      .then((r) => r.json())
      .catch(() => null);
    const allowedUpdates: string[] = Array.isArray(infoRes?.result?.allowed_updates)
      ? infoRes.result.allowed_updates
      : [];
    return sendJson(res, 200, {
      ok: Boolean(whRes.ok && menuRes.ok && (commandsRes?.ok ?? false)),
      commandsRegistered: Boolean(commandsRes?.ok),
      botUsername: meRes?.result?.username || null,
      webhookUrl,
      webAppUrl,
      webhookSecretProtected: Boolean(derivedSecret),
      allowedUpdates,
      preCheckoutEnabled: allowedUpdates.length === 0 || allowedUpdates.includes('pre_checkout_query'),
      pendingUpdates: Number(infoRes?.result?.pending_update_count ?? 0),
      lastError: infoRes?.result?.last_error_message ?? null,
    });
  }

  // При открытии /api/telegram в браузере отдаём мастер настройки бота в 1 клик (с CSP-заголовком)
  const accept = String(req.headers.accept || '');
  if (req.method === 'GET' && accept.includes('text/html') && urlObj.searchParams.get('format') !== 'json') {
    const hasEnvToken = isRealBotToken(botToken);
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
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      }),
    }).catch(() => undefined);
  }

  try {
    const update = await readJsonBody<TelegramUpdate>(req);

    // ========================================================================
    // ПЛАТЕЖИ В TELEGRAM STARS (v3.4)
    // ------------------------------------------------------------------------
    // Порядок строго по документации Telegram:
    //   1) pre_checkout_query  → ответить за 10 секунд (иначе платёж отменяется);
    //   2) successful_payment  → выдать благодарность (и только тут!);
    //   3) charge_id           → сохранить, по нему делается возврат.
    // ========================================================================
    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;
      const problem = validatePreCheckoutQuery(q);
      await tgApi(botToken ?? '', 'answerPreCheckoutQuery', {
        pre_checkout_query_id: q.id,
        ok: problem === null,
        ...(problem ? { error_message: problem.slice(0, 200) } : {}),
      });
      return sendJson(res, 200, { ok: true, preCheckout: problem === null });
    }

    if (update.message?.successful_payment) {
      const pay = update.message.successful_payment;
      const payerId = update.message.from?.id ?? update.message.chat.id;
      const parsed = parseDonatePayload(pay.invoice_payload);

      // Три состояния вместо двух: «записали», «уже было» и «не смогли
      // записать» (например, не применена миграция). Игрок в любом случае
      // должен увидеть спасибо, а не «платёж уже учтён» на первом платеже.
      let recordState: 'recorded' | 'duplicate' | 'unknown' = 'unknown';
      if (parsed && parsed.tgId === payerId && pay.currency === 'XTR') {
        try {
          const result = await recordDonation({
            tgId: payerId,
            stars: pay.total_amount,
            chargeId: pay.telegram_payment_charge_id,
            providerChargeId: pay.provider_payment_charge_id ?? null,
            payload: pay.invoice_payload,
          });
          recordState = result.created ? 'recorded' : 'duplicate';
        } catch (err) {
          // Деньги уже у нас: молчим в чат, но пишем в логи — по charge_id
          // платёж всегда можно найти в Telegram и оформить возврат вручную.
          console.error('[donate] не удалось записать платёж', err);
          recordState = 'unknown';
        }
      }

      const receipt = escapeHtml(pay.telegram_payment_charge_id.slice(0, 40));
      const text =
        recordState === 'duplicate'
          ? `❤️ Спасибо! Этот платёж уже учтён ранее — повторно ничего не списывалось.\n\n<i>Возврат: /paysupport</i>`
          : `${DONATE_THANKS}\n\n⭐ <b>${pay.total_amount}</b> — чек: <code>${receipt}</code>\n\n<i>Возврат: /paysupport • Условия: /terms</i>`;

      await tgApi(botToken ?? '', 'sendMessage', {
        chat_id: update.message.chat.id,
        text,
        parse_mode: 'HTML',
      });
      return sendJson(res, 200, { ok: true, donationRecorded: recordState === 'recorded', recordState });
    }

    // Кнопки «Поддержать проект» (инлайн-клавиатура с суммами)
    if (update.callback_query) {
      const cq = update.callback_query;
      const cqChatId = cq.message?.chat.id;
      const data = String(cq.data ?? '');
      await tgApi(botToken ?? '', 'answerCallbackQuery', { callback_query_id: cq.id });

      if (cqChatId && data === 'invite:menu') {
        // Переиспользуем тот же экран, что и команда /invite.
        await sendReferralScreen(botToken ?? '', cqChatId, cq.from?.id ?? cqChatId, webAppUrl);
        return sendJson(res, 200, { ok: true });
      }

      if (cqChatId && data.startsWith('donate:')) {
        const raw = data.slice('donate:'.length);
        const stars = raw === 'menu' ? null : Number(raw);
        await sendDonateInvoice(botToken ?? '', cqChatId, stars, cq.from?.id ?? cqChatId);
      }
      return sendJson(res, 200, { ok: true });
    }

    const chatId = update.message?.chat?.id;
    const text = (update.message?.text ?? '').trim();
    const rawName = update.message?.from?.first_name || update.message?.from?.username || 'Хакер';
    const safeName = escapeHtml(rawName.slice(0, 40));

    if (!chatId || !Number.isSafeInteger(chatId) || !botToken) {
      return sendJson(res, 200, { ok: true, note: 'Webhook acknowledged' });
    }

    // --- Рефералка ------------------------------------------------------------
    // Переход по «бот-ссылке» t.me/<bot>?start=ref_<код>: превращаем её в
    // кнопку на мини-апп с startapp — только так Telegram передаст start_param
    // внутрь приложения (и код попадёт в подписанный initData).
    if (text.startsWith('/start ref_')) {
      const incomingCode = text.slice('/start '.length).trim().toLowerCase().slice(4);
      const me = await tgApi<{ username?: string }>(botToken, 'getMe');
      const botName = me.ok ? me.result?.username : null;
      if (botName && /^[a-z0-9]{8}$/.test(incomingCode)) {
        const appLink = `https://t.me/${botName}?startapp=ref_${incomingCode}`;
        await tgApi(botToken, 'sendMessage', {
          chat_id: chatId,
          text:
            '🔗 <b>Тебя пригласили в HACKER KOMBAT</b>\n\n' +
            'Жми кнопку ниже — и получишь стартовый бонус.\n' +
            '<i>Донат и покупки не нужны: игра бесплатная.</i>',
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🚀 Принять приглашение', url: appLink }]] },
        });
        return sendJson(res, 200, { ok: true, inviteAccepted: true });
      }
    }

    if (text.startsWith('/invite')) {
      await sendReferralScreen(botToken, chatId, update.message?.from?.id ?? chatId, webAppUrl);
      return sendJson(res, 200, { ok: true, invite: true });
    }

    // --- Команды донат-контура ------------------------------------------------
    if (text.startsWith('/donate') || text.startsWith('/start donate')) {
      await sendDonateInvoice(botToken, chatId, null, update.message?.from?.id ?? chatId);
      return sendJson(res, 200, { ok: true, donate: true });
    }

    if (text.startsWith('/paysupport')) {
      const rows = await listDonations(update.message?.from?.id ?? chatId, 5);
      const summary = await getDonationSummary(update.message?.from?.id ?? chatId);
      const list =
        rows.length > 0
          ? rows
              .map(
                (row) =>
                  `• ${formatStars(row.stars)} — ${row.createdAt.slice(0, 10)}${
                    row.refundedAt ? ' (возвращено)' : ''
                  }\n  <code>${escapeHtml(row.chargeId.slice(0, 48))}</code>`
              )
              .join('\n')
          : 'Платежей пока нет.';
      await tgApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text:
          `💬 <b>Поддержка по платежам</b>\n\n` +
          `Всего поддержано: <b>${summary.stars}</b> ⭐ (${summary.count} платежей)\n${list}\n\n` +
          `Если платёж прошёл, а благодарность не пришла — пришлите строку чека из ` +
          `«Настройки → Мои звёзды → Транзакции».\n` +
          `Возврат делается через Telegram: Stars → возврат в полном размере (refundStarPayment).\n\n` +
          `<i>Донат добровольный и не даёт игровых преимуществ.</i>`,
        parse_mode: 'HTML',
      });
      return sendJson(res, 200, { ok: true, paysupport: true });
    }

    if (text.startsWith('/terms')) {
      await tgApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text:
          '📄 <b>Условия донатов</b>\n\n' +
          '1. Донат добровольный и не является покупкой: он не даёт Data, чипов, ' +
          'ускорений или иных игровых преимуществ.\n' +
          '2. Оплата проходит в Telegram Stars. Возврат возможен по запросу через /paysupport.\n' +
          '3. Игра вымышленная (12+), не обучает реальному взлому.\n' +
          '4. Персональные данные не собираются: нам виден только ваш Telegram ID и номер чека.',
        parse_mode: 'HTML',
      });
      return sendJson(res, 200, { ok: true, terms: true });
    }

    // ---------------------------------------------------------------
    // /stars — служебная проверка баланса для владельца бота.
    //
    // Зачем: Telegram отдаёт заработанные звёзды в интерфейсе, но у многих
    // владельцев пункт Balance в BotFather не появляется (пункт Telegram Stars
    // в меню — это справка, а не баланс). Bot API умеет отдавать баланс
    // напрямую, поэтому показываем его здесь, в чате с ботом.
    // ---------------------------------------------------------------
    if (text.startsWith('/stars')) {
      const fromId = String(update.message?.from?.id ?? '');
      if (!isBotAdmin(fromId)) {
        await tgApi(botToken, 'sendMessage', {
          chat_id: chatId,
          text: 'Служебная команда. Баланс своих звёзд смотрите: Настройки → Мои звёзды.',
        });
        return sendJson(res, 200, { ok: true });
      }

      const balance = await fetchBotStarBalance(botToken);
      const summary = await getDonationSummary(update.message?.from?.id ?? chatId);
      const rows = await listDonations(update.message?.from?.id ?? chatId, 5);

      const recent =
        rows.length > 0
          ? rows
              .map(
                (row) =>
                  `• ${formatStars(row.stars)} — ${row.createdAt.slice(0, 10)}${
                    row.refundedAt ? ' (возвращено)' : ''
                  }`
              )
              .join('\n')
          : 'платежей пока нет';

      await tgApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text:
          `⭐ <b>Звёзды бота</b>\n` +
          (balance
            ? `Баланс на стороне Telegram: <b>${balance.amount}</b> ⭐\n` +
              `<i>Заработанные звёзды доступны к выводу через 21 день, минимум 1000 ⭐.</i>\n\n`
            : `Баланс недоступен: Telegram вернул ошибку.\n\n`) +
          `❤️ <b>Твоя поддержка</b>\nВсего: <b>${summary.stars}</b> ⭐ (${summary.count} платежей)\n${recent}\n\n` +
          `<i>Донат не даёт игровой валюты — это поддержка проекта.</i>`,
        parse_mode: 'HTML',
      });
      return sendJson(res, 200, { ok: true, stars: balance?.amount ?? null });
    }

    if (text.startsWith('/refund')) {
      const fromId = String(update.message?.from?.id ?? '');
      if (!isBotAdmin(fromId)) {
        await tgApi(botToken, 'sendMessage', {
          chat_id: chatId,
          text: 'Возврат оформляется через поддержку: /paysupport',
        });
        return sendJson(res, 200, { ok: true });
      }
      const chargeId = text.replace('/refund', '').trim();
      const donation = chargeId ? await findDonationByChargeId(chargeId) : null;
      if (!donation) {
        await tgApi(botToken, 'sendMessage', { chat_id: chatId, text: 'Платёж не найден.' });
        return sendJson(res, 200, { ok: true });
      }
      const refund = await tgApi(botToken, 'refundStarPayment', {
        user_id: donation.tgId,
        telegram_payment_charge_id: donation.chargeId,
      });
      if (refund.ok) await markDonationRefunded(donation.chargeId);
      await tgApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text: refund.ok
          ? `↩️ Возврат ${formatStars(donation.stars)} оформлен.`
          : `❌ Возврат не удался: ${refund.description ?? 'неизвестная ошибка'}`,
      });
      return sendJson(res, 200, { ok: true, refunded: refund.ok });
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
            // Донат добровольный: игра полностью играбельна бесплатно.
            [{ text: '⭐ Поддержать проект', callback_data: 'donate:menu' }],
            [{ text: '🔗 Пригласи друга', callback_data: 'invite:menu' }],
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
