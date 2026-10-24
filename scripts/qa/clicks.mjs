/**
 * HACKER KOMBAT — тест v3.1: клики не должны упираться в rate-limit.
 *
 *   node scripts/qa/clicks.mjs
 *
 * Сценарий 1: быстрый палец — 10 кликов/сек в течение 60 секунд (600 кликов).
 *             Ожидание: 0 ответов 429, все клики учтены.
 * Сценарий 2: автокликер-флуд — 40 запросов/сек.
 *             Ожидание: сервер режет (429 или меньше кликов), но не падает.
 * Оффлайн-копилка проверяется отдельно: node scripts/qa/offline-taps.mjs (нужен рестарт сервера).
 */

const BASE = process.env.API_BASE ?? 'http://localhost:5173';
const DB_FILE = '/home/user/HACKCOMBAT/.local-db.json';
const RUN = Date.now().toString(36);

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

function headers(seed) {
  return {
    'Content-Type': 'application/json',
    'x-demo-user-id': `${seed}-${RUN}`,
    'x-demo-username': `Tester_${seed}`,
  };
}

async function post(path, body, seed) {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: headers(seed),
    body: JSON.stringify(body ?? {}),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────── Сценарий 1: быстрый палец
console.log('=== Сценарий 1: живой быстрый тап (10 кликов/сек, 60 секунд) ===');
const fast = 'fast';
const initFast = await post('init', {}, fast);
const startData = initFast.json.player.data;
const startClicks = initFast.json.player.totalClicks;

let requests = 0;
let limited = 0;
let acceptedClicks = 0;
const byStatus = {};

const startedAt = Date.now();
// 10 кликов/сек = пачка из 20 кликов каждые 2 секунды (как в приложении)
let sentClicks = 0;
for (let i = 0; i < 30; i++) {
  const t0 = Date.now();
  const res = await post('click', { clicks: 20 }, fast);
  requests += 1;
  byStatus[res.status] = (byStatus[res.status] ?? 0) + 1;
  if (res.status === 429) {
    limited += 1;
  } else {
    sentClicks += Number(res.json.player?.totalClicks ?? 0) > 0 ? 20 : 0;
    acceptedClicks += Math.min(20, Math.max(0, (res.json.player?.totalClicks ?? 0)));
  }
  const elapsed = Date.now() - t0;
  await sleep(Math.max(0, 2000 - elapsed));
}
const durSec = (Date.now() - startedAt) / 1000;

const afterFast = await post('init', {}, fast);
const clicksGained = (afterFast.json.player.totalClicks ?? 0) - startClicks;
const dataGained = (afterFast.json.player.data ?? 0) - startData;

console.log(
  `  запросов: ${requests} за ${durSec.toFixed(1)} c (${(requests / (durSec / 60)).toFixed(0)}/мин), статусы: ${JSON.stringify(byStatus)}`
);
check('ни одного 429 за минуту быстрого тапа', limited === 0, `429: ${limited}`);
check('клики реально зачлись (не потерялись)', clicksGained >= 400, `${clicksGained} кликов`);
check('Data выросла от кликов', dataGained > 0, `+${dataGained.toFixed(1)} Data`);
check('энергия не ушла в минус', afterFast.json.player.energy >= 0, afterFast.json.player.energy);

// ─────────────────────────────────────────────── Сценарий 2: флуд
console.log('\n=== Сценарий 2: автокликер-флуд (40 запросов/сек) ===');
const flood = 'flood';
await post('init', {}, flood);
let floodStatuses = {};
let floodLimited = 0;
const floodStart = Date.now();
await Promise.all(
  Array.from({ length: 120 }, async () => {
    const res = await post('click', { clicks: 60 }, flood);
    floodStatuses[res.status] = (floodStatuses[res.status] ?? 0) + 1;
    if (res.status === 429) floodLimited += 1;
  })
);
const floodDur = (Date.now() - floodStart) / 1000;
const floodAfter = await post('init', {}, flood);
console.log(
  `  120 запросов × 60 кликов за ${floodDur.toFixed(1)} c, статусы: ${JSON.stringify(floodStatuses)}`
);
check(
  'флуд не пробивает сервер (429 или урезанные клики)',
  floodLimited > 0 || (floodAfter.json.player.totalClicks ?? 0) < 120 * 60,
  `429: ${floodLimited}, зачтено кликов: ${floodAfter.json.player.totalClicks}`
);
check('сервер жив после флуда', floodAfter.status === 200 && floodAfter.json.ok === true);

console.log(`\n=== ИТОГО: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log('Провалы: ' + failures.join(' | '));
  process.exitCode = 1;
}
