'use strict';
// Mocked webhook only: no live Telegram, no player database and no webhook setup.
const path = require('node:path');
const crypto = require('node:crypto');
for (const key of Object.keys(process.env)) if (/SUPABASE|TELEGRAM|BOT_TOKEN|ADMIN_TG|^VITE_/i.test(key)) delete process.env[key];
process.env.BOT_TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
process.env.PUBLIC_WEBAPP_URL = 'https://example.invalid';
const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ method: String(url).split('/').at(-1), body: options.body ? JSON.parse(options.body) : null });
  return { ok: true, json: async () => ({ ok: true, result: { username: 'test_bot' } }) };
};
const core = require(path.join(process.cwd(), 'api/_core.cjs'));
const secret = crypto.createHmac('sha256', 'hk-webhook-v2').update(process.env.BOT_TOKEN).digest('hex').slice(0, 48);
let count = 0, ip = 0;
function check(label, value) { if (!value) throw new Error(`FAIL ${label}`); console.log(`PASS ${label}`); count++; }
async function webhook(text, type = 'private', signed = true) {
  calls.length = 0;
  const headers = { host: 'localhost', 'x-forwarded-for': `guide-test-${ip++}` };
  if (signed) headers['x-telegram-bot-api-secret-token'] = secret;
  const req = { method: 'POST', url: '/api/telegram', headers, body: { message: { chat: { id: 123, type }, from: { id: 123, first_name: 'Test' }, text } }, socket: { remoteAddress: '127.0.0.1' }, on() {} };
  const res = { statusCode: 200, setHeader() {}, end(value) { this.body = value; } };
  await core.dispatchApiRequest(req, res);
  return { status: res.statusCode, data: JSON.parse(res.body), calls: [...calls] };
}
(async () => {
  for (const cmd of ['menu', 'play', 'story', 'characters', 'hack', 'events', 'stats', 'save', 'load', 'shop', 'upgrade', 'settings', 'accessibility']) {
    const result = await webhook(`/${cmd}`);
    const message = result.calls.find(c => c.method === 'sendMessage')?.body;
    check(`/${cmd} responds with a private Mini App button`, result.status === 200 && result.data.ok && result.calls.length === 1 && message?.text && message.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url === 'https://example.invalid');
    if (cmd === 'story') check('story points to the existing archive', message.text.includes('сюжетный архив'));
    if (cmd === 'save') check('save explains automatic server persistence', message.text.includes('сервере автоматически'));
  }
  let result = await webhook('/STORY@test_bot');
  check('addressed command is recognized', result.calls[0]?.body?.text?.includes('сюжетный архив'));
  result = await webhook('/story', 'group');
  check('group response does not use a private-only Mini App button', result.data.ok && !result.calls[0]?.body?.reply_markup);
  result = await webhook('/story', 'private', false);
  check('unsigned command rejected', result.status === 401 && result.calls.length === 0);
  result = await webhook('/start ref_12345678');
  check('referral start retains its invite link', result.data.inviteAccepted && result.calls.some(c => c.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.url?.includes('startapp=ref_12345678')));
  result = await webhook('/donate');
  check('donate still shows Stars menu', result.data.donate && result.calls[0]?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('donate:'));
  console.log(`${count} passed; mocked Telegram only.`);
})().catch(err => { console.error(err); process.exitCode = 1; });
