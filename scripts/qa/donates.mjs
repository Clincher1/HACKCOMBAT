/**
 * HACKER KOMBAT — QA v3.4: донаты в Telegram Stars.
 *
 * Проверяем именно то, из-за чего платформу могут «заблокировать» или
 * обмануть игрока:
 *   1) сумму нельзя подставить с клиента — только из фиксированного списка;
 *   2) без BOT_TOKEN счёт не создаётся (никаких «тихих» оплат);
 *   3) pre_checkout_query валидируется: валюта XTR, сумма = payload, автор = payload;
 *   4) successful_payment записывается РОВНО ОДИН РАЗ (идемпотентность по charge_id);
 *   5) платёж с чужим tgId в payload не зачисляется.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/donates.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-donate-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.BOT_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN;
process.env.BOT_USERNAME = 'hk_test_bot';

// ---------------------------------------------------------------------------
// Заглушка Bot API. Сеть в QA не нужна и вредна: нам важно, ЧТО именно сервер
// отправляет в Telegram (валюта, prices, отсутствие provider_token,
// answerPreCheckoutQuery), а не ответ Telegram.
// ---------------------------------------------------------------------------
const tgCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const method = String(url).split('/').pop();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  tgCalls.push({ method, body });
  const result =
    method === 'getMe'
      ? { username: 'hk_test_bot' }
      : method === 'createInvoiceLink'
        ? 'https://t.me/$hk_test_invoice'
        : true;
  return {
    ok: true,
    json: async () => ({ ok: true, result }),
  };
};
process.on('exit', () => {
  globalThis.fetch = realFetch;
});
const lastCall = (method) => [...tgCalls].reverse().find((c) => c.method === method);

const { dispatchApiRequest } = require(CORE);

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

async function api(seed, route, body = {}, method = 'POST', headers = {}) {
  const req = {
    url: `/api/${route}`,
    method,
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': `Tester_${seed}`,
      'x-forwarded-for': '10.55.0.1',
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = {
    statusCode: 200,
    headers: {},
    payload: '',
    setHeader() {},
    end(chunk) {
      this.payload = chunk ?? '';
    },
  };
  await dispatchApiRequest(req, res);
  try {
    return { ...JSON.parse(res.payload), _status: res.statusCode };
  } catch {
    return { raw: res.payload, _status: res.statusCode };
  }
}

/** Прямой вызов вебхука Telegram (как будто пришёл апдейт от Telegram). */
const webhook = (update, ip = '10.55.0.9') =>
  api('wh', 'telegram', update, 'POST', { 'x-forwarded-for': ip });

const donatePayload = (tgId, stars, nonce = 'abc12345') => `d1:${tgId}:${stars}:${nonce}`;

function ledger() {
  const file = path.join(process.cwd(), '.local-db.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).donations ?? {};
  } catch {
    return {};
  }
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.4: донаты Stars ===\n');

  // ── 1. Витрина ─────────────────────────────────────────────────────────────
  let r = await api('dono', 'donate', {}, 'GET');
  check('витрина донатов доступна', r.ok === true);
  check('валюта — XTR', r.currency === 'XTR', r.currency);
  check('суммы фиксированы', JSON.stringify(r.tiers) === JSON.stringify([10, 25, 50, 100]), r.tiers);
  check('без BOT_TOKEN донат помечен выключенным', r.enabled === false);

  // ── 2. Произвольную сумму подставить нельзя ────────────────────────────────
  for (const bad of [37, 0, -10, 10.5, 1000, '10abc', null, undefined, '25']) {
    const res = await api(`bad-${String(bad)}`, 'donate', { stars: bad });
    check(`сумма ${JSON.stringify(bad)} отклонена`, res.ok === false && res._status === 400, res.error);
  }

  // ── 3. Без токена бота счёт не создаётся ───────────────────────────────────
  process.env.BOT_TOKEN = '123456789:AAFakeTokenForQaOnly_NotReal_123456789';
  r = await api('notoken', 'donate', { stars: 10 });
  check('с BOT_TOKEN счёт создаётся', r.ok === true && /t\.me/.test(String(r.invoiceLink)), r.error);
  const meReq = lastCall('createInvoiceLink');
  check('в счёте валюта XTR', meReq && meReq.body.currency === 'XTR', meReq && meReq.body.currency);
  check(
    'ровно одна цена (требование Telegram)',
    meReq && Array.isArray(meReq.body.prices) && meReq.body.prices.length === 1,
    meReq && JSON.stringify(meReq.body.prices)
  );
  check(
    'provider_token НЕ передаётся',
    meReq && !Object.prototype.hasOwnProperty.call(meReq.body, 'provider_token')
  );
  check(
    'сумма в счёте — из конфига',
    meReq && meReq.body.prices && meReq.body.prices[0].amount === 10,
    meReq && meReq.body.prices && meReq.body.prices[0].amount
  );

  delete process.env.BOT_TOKEN;
  r = await api('notoken2', 'donate', { stars: 10 });
  check('без BOT_TOKEN оплата не стартует', r.ok === false && /BOT_TOKEN/i.test(String(r.error)), r.error);
  process.env.BOT_TOKEN = '123456789:AAFakeTokenForQaOnly_NotReal_123456789';

  // ── 4. pre_checkout_query: валидация счёта ─────────────────────────────────
  const tgId = 555000111;

  r = await webhook({
    pre_checkout_query: {
      id: 'pcq-1',
      from: { id: tgId },
      currency: 'USD',
      total_amount: 10,
      invoice_payload: donatePayload(tgId, 10),
    },
  });
  check('чужая валюта не проходит pre-checkout', r.preCheckout === false);

  const preOkCallsBefore = tgCalls.filter((c) => c.method === 'answerPreCheckoutQuery').length;
  r = await webhook({
    pre_checkout_query: {
      id: 'pcq-2',
      from: { id: tgId },
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: donatePayload(tgId, 10),
    },
  });
  check('подмена суммы ловится', r.preCheckout === false);

  r = await webhook({
    pre_checkout_query: {
      id: 'pcq-3',
      from: { id: 999 },
      currency: 'XTR',
      total_amount: 10,
      invoice_payload: donatePayload(tgId, 10),
    },
  });
  check('счёт другому пользователю отклонён', r.preCheckout === false);

  r = await webhook({
    pre_checkout_query: {
      id: 'pcq-4',
      from: { id: tgId },
      currency: 'XTR',
      total_amount: 10,
      invoice_payload: 'hacked-payload',
    },
  });
  check('мусорный payload отклонён', r.preCheckout === false);

  r = await webhook({
    pre_checkout_query: {
      id: 'pcq-5',
      from: { id: tgId },
      currency: 'XTR',
      total_amount: 25,
      invoice_payload: donatePayload(tgId, 25, 'n1'),
    },
  });
  check('корректный счёт подтверждается', r.preCheckout === true);
  const preOk = lastCall('answerPreCheckoutQuery');
  check('answerPreCheckoutQuery вызван с ok:true', preOk && preOk.body.ok === true);
  check('на pre-checkout ничего не зачислено', Object.keys(ledger()).length === 0);

  // ── 5. successful_payment: запись и идемпотентность ────────────────────────
  const payment = {
    message: {
      chat: { id: tgId },
      from: { id: tgId, first_name: 'Dono' },
      successful_payment: {
        currency: 'XTR',
        total_amount: 25,
        invoice_payload: donatePayload(tgId, 25, 'pay1'),
        telegram_payment_charge_id: 'charge-test-001',
        provider_payment_charge_id: 'prov-001',
      },
    },
  };

  r = await webhook(payment);
  check('платёж записан', r.ok === true && r.donationRecorded === true, JSON.stringify(r));
  check('состояние записи — recorded', r.recordState === 'recorded', r.recordState);
  check('в леджере ровно одна запись', Object.keys(ledger()).length === 1);

  r = await webhook(payment);
  check(
    'повторный вебхук не создаёт дубль',
    r.ok === true && r.donationRecorded === false && r.recordState === 'duplicate' && Object.keys(ledger()).length === 1,
    JSON.stringify(r)
  );

  const row = Object.values(ledger())[0];
  check('сумма сохранена верно', row && row.stars === 25, row && row.stars);
  check('charge_id сохранён для возврата', row && row.chargeId === 'charge-test-001', row && row.chargeId);

  // ── 6. Чужой платёж не зачисляется на наш tgId ─────────────────────────────
  r = await webhook({
    message: {
      chat: { id: 777888999 },
      from: { id: 777888999 },
      successful_payment: {
        currency: 'XTR',
        total_amount: 100,
        invoice_payload: donatePayload(tgId, 100, 'pay2'),
        telegram_payment_charge_id: 'charge-test-002',
      },
    },
  });
  check('платёж с чужим tgId не зачислен', r.donationRecorded === false);
  check('в леджере по-прежнему одна запись', Object.keys(ledger()).length === 1);

  // ── 7. /paysupport и /terms не падают ──────────────────────────────────────
  r = await webhook({ message: { chat: { id: tgId }, from: { id: tgId }, text: '/paysupport' } });
  check('/paysupport отвечает', r.ok === true && r.paysupport === true);
  r = await webhook({ message: { chat: { id: tgId }, from: { id: tgId }, text: '/terms' } });
  check('/terms отвечает', r.ok === true && r.terms === true);
  r = await webhook({ message: { chat: { id: tgId }, from: { id: tgId }, text: '/donate' } });
  check('/donate отвечает', r.ok === true && r.donate === true);

  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.log('Провалы:', failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('QA упал:', err);
  process.exit(1);
});
