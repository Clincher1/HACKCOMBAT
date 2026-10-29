/** Server-level regression: online rate, offline eligibility/caps and rounding. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = path.join(process.cwd(), 'api/_core.cjs');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-income-'));
const configProbe = path.join(sandbox, 'cards.cjs');
require('esbuild').buildSync({ entryPoints: [path.join(process.cwd(), 'shared/cards.config.ts')], outfile: configProbe, bundle: true, format: 'cjs', platform: 'node', logLevel: 'silent' });
const { CARDS_CONFIG, getCardPrice } = require(configProbe);
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { dispatchApiRequest } = require(core);
const realNow = Date.now;
let now = Date.parse('2026-10-24T08:00:00Z');
Date.now = () => now;
const advance = seconds => { now += seconds * 1000; };
let calls = 0;
async function api(route, body = {}) {
  const req = { url: `/api/${route}`, method: 'POST', body,
    headers: { host: 'localhost:5173', 'x-demo-user-id': 'online-income-qa', 'x-demo-username': 'IncomeTester', 'x-forwarded-for': `10.75.${Math.floor(calls / 200) % 200}.${++calls % 200 + 1}` },
    socket: { remoteAddress: '127.0.0.1' }, on() {} };
  const res = { statusCode: 200, payload: '', setHeader() {}, end(value) { this.payload = value ?? ''; } };
  await dispatchApiRequest(req, res);
  const result = JSON.parse(res.payload);
  if (!result.ok) throw new Error(`${route}: ${result.error || res.statusCode}`);
  return result;
}
let pass = 0, fail = 0;
function check(label, result, extra = '') {
  console.log(`${result ? 'PASS' : 'FAIL'} — ${label}${extra ? ` :: ${extra}` : ''}`);
  if (result) pass++; else fail++;
}
const close = (a, b, margin = 0.12) => Math.abs(a-b) <= margin;
try {
  let p = (await api('init')).player;
  // Честно зарабатываем на первую карточку, не достигая 8 минут активности.
  for (let i=0; i<10; i++) { advance(30); p=(await api('click', {clicks:60})).player; }
  p = (await api('buy-card', { cardKey: 'monitor' })).player;
  const hourly = p.derived.dataPerHour;
  check('карточка даёт базовую ставку', hourly > 0);
  const start = p.data;
  advance(30); let result = await api('init'); p = result.player;
  check('в игре начисляется 100% ещё до 8 минут активности', close(p.data-start, hourly/120), `${p.data-start} ≈ ${hourly/120}`);
  check('онлайн не выдаёт фоновые оффлайн-тапы', result.offlineEarned === undefined && result.offlineTaps === undefined);
  const startFrequent = p.data;
  const rawBalance = () => Object.values(JSON.parse(fs.readFileSync(path.join(sandbox, ".local-db.json"), "utf8")).playersByTgId)[0].data;
  const beforeRaw = rawBalance();
  for (let i=0;i<100;i++) { advance(0.2); p=(await api('init')).player; }
  check('частые запросы сохраняют дробный пассив', close(p.data-startFrequent, hourly*20/3600), `${p.data-startFrequent} ≈ ${hourly*20/3600}`);
  check('точность серверного баланса при частых запросах', close(rawBalance()-beforeRaw, hourly*20/3600, 0.015), `${rawBalance()-beforeRaw} ≈ ${hourly*20/3600}`);
  const repeat = p.data;
  p=(await api('init')).player;
  check('повтор без времени не даёт доход', p.data === repeat);
  advance(45); p=(await api('init')).player;
  check('45 секунд — онлайн по полной ставке', close(p.data-repeat, hourly*45/3600));
  const beforeUnqualified = p.data;
  advance(46); p=(await api('init')).player;
  check('пауза 46 секунд — оффлайн, до 8 минут не платится', close(p.data, beforeUnqualified, 0.001));
  for (let i=0;i<16;i++) { advance(30); p=(await api('init')).player; }
  check('после 8 минут оффлайн открыт', p.stats.lastQualifiedDayKey === p.stats.activeDayKey);
  const beforeOffline = p.data, tapPower = p.derived.clickPower;
  advance(75*60); result=await api('init'); p=result.player;
  const expected = Math.floor(hourly*0.5*1.25*10)/10 + Math.floor(75*60*0.1)*tapPower;
  check('за 75 минут оффлайна 50% + фоновые тапы', close(p.data-beforeOffline, expected, 0.2), `${p.data-beforeOffline} ≈ ${expected}`);
  check('повторный запрос не выдаёт копилку дважды', close((await api('init')).player.data, p.data, 0.001));
  const afterReturn=p.data;
  advance(30); result=await api('init'); p=result.player;
  check('после возвращения снова 100% без оффлайн-тапов', close(p.data-afterReturn, hourly/120) && result.offlineEarned === undefined);
  advance(3*3600); p=(await api('init')).player;
  const oldRate=p.derived.dataPerHour, beforeUpgrade=p.data;
  const upgradePrice=getCardPrice(CARDS_CONFIG.find(c=>c.key==='monitor'), p.cards.monitor, p.derived.totalCardLevels, p.derived.cardPriceDiscountPct);
  advance(30); p=(await api('buy-card',{cardKey:'monitor'})).player;
  check('улучшение начисляет прошедшее время по старой ставке', p.derived.dataPerHour > oldRate && close(p.data - beforeUpgrade + upgradePrice, oldRate/120, 0.2), `до: ${beforeUpgrade}; после: ${p.data}`);
  const newRate=p.derived.dataPerHour, afterUpgrade=p.data;
  advance(30);p=(await api('init')).player;
  check('после улучшения применяется новая ставка', close(p.data-afterUpgrade,newRate/120));
  now=Date.parse('2026-10-24T20:59:45Z');
  p=(await api('init')).player;
  const beforeMidnight=p.data;
  advance(30); result=await api('init'); p=result.player;
  check('онлайн не прерывается при смене московских суток', close(p.data-beforeMidnight,newRate/120) && result.offlineEarned === undefined);
  const beforeNewDayOffline=p.data;
  advance(3600); p=(await api('init')).player;
  check('оффлайн новых суток не платит до их квалификации', close(p.data,beforeNewDayOffline,0.001));
  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail) process.exitCode=1;
} catch(e) { console.error(e); process.exitCode=1; }
finally { Date.now=realNow; fs.rmSync(sandbox,{recursive:true,force:true}); }
