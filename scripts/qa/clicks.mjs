/**
 * HACKER KOMBAT — тест v3.1: клики не должны упираться в rate-limit.
 *
 *   node scripts/qa/clicks.mjs
 *
 * v6.4: темп тапа — 6/с (паритет с HACK_MAX_TAPS_PER_SEC), запас — 20 тапов
 *       (одна клиентская пачка). CPU Charge остаётся жёстким потолком.
 *
 * Сценарий 1: живой палец — 5 кликов/сек в течение 30 секунд (150 кликов).
 *             Ожидание: 0 ответов 429, все клики учтены.
 * Сценарий 2: быстрее лимита — 20 кликов/сек.
 *             Ожидание: принимается ~6/с, остальное режется без 500.
 * Сценарий 3: автокликер-флуд — 40 запросов/сек.
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

// ─────────────────────────────────────────────── Сценарий 1: живой палец
console.log('=== Сценарий 1: живой тап (5 кликов/сек, 30 секунд) ===');
const fast = 'fast';
const initFast = await post('init', {}, fast);
const startData = initFast.json.player.data;
const startClicks = initFast.json.player.totalClicks;

let requests = 0;
let limited = 0;
const byStatus = {};

const startedAt = Date.now();
// 5 кликов/сек = пачка из 10 кликов каждые 2 секунды (как в приложении).
for (let i = 0; i < 15; i++) {
  const t0 = Date.now();
  const res = await post('click', { clicks: 10 }, fast);
  requests += 1;
  byStatus[res.status] = (byStatus[res.status] ?? 0) + 1;
  if (res.status === 429) limited += 1;
  const elapsed = Date.now() - t0;
  await sleep(Math.max(0, 2000 - elapsed));
}
const durSec = (Date.now() - startedAt) / 1000;

const afterFast = await post('init', {}, fast);
const clicksGained = (afterFast.json.player.totalClicks ?? 0) - startClicks;
const dataGained = (afterFast.json.player.data ?? 0) - startData;

console.log(
  `  запросов: ${requests} за ${durSec.toFixed(1)} c, статусы: ${JSON.stringify(byStatus)}, зачтено ${clicksGained} кликов`
);
check('ни одного 429 за полминуты живого тапа', limited === 0, `429: ${limited}`);
check('тапы на своём темпе не теряются (5/с × 30 с ≈ 150)', clicksGained >= 140, `${clicksGained} кликов`);
check('Data выросла от тапов', dataGained > 0, `+${dataGained.toFixed(1)} Data`);
check('энергия не ушла в минус', afterFast.json.player.energy >= 0, afterFast.json.player.energy);

// ─────────────────────────────────────────── Сценарий 2: быстрее 6 тап/с
console.log('\n=== Сценарий 2: темп выше лимита (20 кликов/сек) ===');
const speedy = 'speedy';
await post('init', {}, speedy);
let accepted = 0;
let rejectedByRate = 0;
for (let i = 0; i < 10; i++) {
  const res = await post('click', { clicks: 20 }, speedy);
  const applied = Number(res.json.appliedClicks ?? 0);
  accepted += applied;
  if (applied < 20) rejectedByRate += 1;
  check(`пачка ${i + 1}: принято не больше запаса (${applied} ≤ 20)`, applied <= 20, applied);
}
const speedyAfter = await post('init', {}, speedy);
console.log(`  принято ${accepted} из 200, урезано пачек: ${rejectedByRate}/10`);
check('темп режется: за 10 пачек принято заметно меньше 200', accepted < 200, accepted);
check('лишние тапы не съедают CPU без начисления',
  speedyAfter.json.player.energy === 1500 - accepted || speedyAfter.json.player.energy >= 1500 - accepted,
  `energy=${speedyAfter.json.player.energy}, принято ${accepted}`);
check('сервер жив после быстрых пачек', speedyAfter.status === 200 && speedyAfter.json.ok === true);

// ─────────────────────────────────────────────── Сценарий 2: флуд
console.log('\n=== Сценарий 3: автокликер-флуд (40 запросов/сек) ===');
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
