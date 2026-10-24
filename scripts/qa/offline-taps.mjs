/**
 * HACKER KOMBAT — проверка «фоновой копилки тапов».
 * Запускается в два шага, потому что memory-fallback держит БД в памяти процесса:
 *
 *   node scripts/qa/offline-taps.mjs setup     # создать игрока и вывести tgId
 *   # (остановить dev-сервер, откатить lastTapClaimAt в .local-db.json на 3 часа, поднять сервер)
 *   node scripts/qa/offline-taps.mjs check     # проверить начисление
 */
import fs from 'node:fs';

const BASE = process.env.API_BASE ?? 'http://localhost:5173';
const DB_FILE = '/home/user/HACKCOMBAT/.local-db.json';
const SEED = 'offline-fixed';

let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  if (cond) pass++;
  else fail++;
}

async function post(path, body = {}) {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-user-id': SEED,
      'x-demo-username': 'Tester_offline',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const mode = process.argv[2] ?? 'check';

if (mode === 'setup') {
  const init = await post('init');
  const p = init.json.player;
  console.log(JSON.stringify({ tgId: p.tgId, data: p.data, clickPower: p.derived.clickPower, taps: init.json.offlineTaps }));
} else {
  const before = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const store = before.playersByTgId ?? {};
  const rec = Object.values(store).find((p) => p.username === 'Tester_offline');
  if (!rec) {
    console.log('FAIL — не нашёл игрока Tester_offline (сначала setup)');
    process.exit(1);
  }
  const dataBefore = rec.data;

  const init = await post('init');
  const p = init.json.player;
  const gained = p.data - dataBefore;
  const expected = 3 * 3600 * 0.2 * p.derived.clickPower;

  console.log(
    `offlineTaps=${init.json.offlineTaps}, offlineEarned=${init.json.offlineEarned}, Data +${gained.toFixed(1)}, сила клика ${p.derived.clickPower}`
  );
  check('init отдаёт offlineTaps', init.json.offlineTaps > 0, init.json.offlineTaps);
  check('копилка начислила Data', gained > 0, `+${gained.toFixed(1)}`);
  check('начисление ≈ 3 ч × 12 тапов/мин × сила клика', Math.abs(gained - expected) <= expected * 0.15 + 5, `${gained.toFixed(0)} vs ${expected.toFixed(0)}`);
  check('копилка не превышает кап 8 ч', gained <= 8 * 3600 * 0.2 * p.derived.clickPower + 50, gained.toFixed(0));

  const again = await post('init');
  check('повторный init не начисляет копилку дважды', again.json.offlineTaps === undefined, again.json.offlineTaps);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}
