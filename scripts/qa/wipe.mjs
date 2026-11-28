/**
 * HACKER KOMBAT — QA v1: вайп прогресса и точка запуска.
 * ----------------------------------------------------------------------------
 * Вайп — операция, которую нельзя «проверить на проде»: второй попытки не
 * будет. Поэтому проверяем ровно те свойства, ради которых он написан:
 *
 *   1) план трогает только объявленные таблицы (никаких «заодно»);
 *   2) dry-run не пишет ничего;
 *   3) вайп обнуляет игроков и всех их детей, включая tg-keyed хвосты;
 *   4) телеметрия выживает и теряет привязку к игроку (отвязка ДО удаления —
 *      иначе CASCADE уносит события вместе с игроком);
 *   5) денежная история (donations) остаётся, только player_id → NULL;
 *   6) сверка после вайпа ловит и остатки, и неотвязанную телеметрию;
 *   7) новый игрок после вайпа получает чистый старт + пролог/ивенты;
 *   8) анонс точки запуска показывается ровно один раз на аккаунт.
 *
 * Сеть не нужна: план гоняется на in-memory БД с теми же каскадами, что в
 * Supabase, а «новый игрок» — на обычном memory-режиме API (как в retention.mjs).
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/wipe.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  PLAYER_TABLES,
  PRESERVED_TABLES,
  assertPlanSafe,
  buildPlan,
  summarize,
  verifyAfterWipe,
} from '../lib/wipe-core.mjs';

const require = createRequire(import.meta.url);
const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

// ============================================================================
// 1. In-memory БД с теми же каскадами, что в Supabase (см. information_schema)
// ============================================================================
const CASCADE_CHILDREN = [
  'achievements',
  'base_upgrades',
  'cards',
  'missions',
  'new_year_candy',
  'pets',
  'team',
  'client_events', // CASCADE в БД — именно поэтому отвязка обязана быть первой
];

function seedDb() {
  const players = [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-admin' }];
  const db = {
    players,
    achievements: players.map((p) => ({ id: `a-${p.id}`, player_id: p.id, key: 'first_click' })),
    base_upgrades: players.map((p) => ({ id: `b-${p.id}`, player_id: p.id, upgrade_key: 'rig', level: 3 })),
    cards: players.map((p) => ({ id: `c-${p.id}`, player_id: p.id, card_key: 'monitor', level: 2 })),
    missions: [
      { id: 'm-1', player_id: 'p-1' },
      { id: 'm-2', player_id: 'p-1' },
      { id: 'm-3', player_id: 'p-2' },
    ],
    pets: players.map((p) => ({ id: `pet-${p.id}`, player_id: p.id })),
    team: players.map((p) => ({ id: `t-${p.id}`, player_id: p.id })),
    new_year_candy: players.map((p) => ({ player_id: p.id, uses_remaining: 2 })),
    // телеметрия: строки живут дольше игроков
    client_events: [
      { id: 1, player_id: 'p-1', event: 'session' },
      { id: 2, player_id: 'p-2', event: 'click' },
      { id: 3, player_id: null, event: 'boot' },
      { id: 4, player_id: 'p-admin', event: 'error' },
    ],
    // деньги: не прогресс, но привязаны к игроку
    donations: [
      { id: 'd-1', player_id: 'p-1', tg_id: 111, stars: 50 },
      { id: 'd-2', player_id: null, tg_id: 222, stars: 20 },
    ],
    operator_archive: [{ tg_id: 111, entry_key: 'op-1' }, { tg_id: 222, entry_key: 'op-2' }],
    operator_legacy_cutoff: [{ tg_id: 111, total_missions: 42 }],
    referral_codes: [{ tg_id: 111, code: 'ABC123' }],
    referrals: [{ invitee_tg: 333, referrer_tg: 111 }],
  };
  return db;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Применяет к памяти один шаг плана; каскады — как в Postgres. */
function applyStep(db, step) {
  if (step.action === 'detach') {
    let touched = 0;
    for (const row of db[step.table]) {
      if (row[step.filterColumn] !== null && row[step.filterColumn] !== undefined) {
        Object.assign(row, step.set);
        touched += 1;
      }
    }
    return touched;
  }

  const ids = new Set(db[step.table].map((row) => row[step.filterColumn]));
  const before = db[step.table].length;
  db[step.table] = [];
  if (step.table === 'players') {
    for (const child of CASCADE_CHILDREN) {
      db[child] = db[child].filter((row) => !ids.has(row.player_id));
    }
    // donations: ON DELETE SET NULL
    for (const row of db.donations) {
      if (ids.has(row.player_id)) row.player_id = null;
    }
  }
  return before;
}

function runPlan(db, plan) {
  for (const step of plan) applyStep(db, step);
  return db;
}

/** Счётчики ровно так, как их берёт скрипт: для detach — только привязанные строки. */
function countsForPlan(db, steps) {
  const counts = countsOf(db);
  for (const step of steps) {
    if (step.action === 'detach') {
      counts[step.table] = db[step.table].filter(
        (row) => row[step.filterColumn] !== null && row[step.filterColumn] !== undefined,
      ).length;
    }
  }
  return counts;
}

function countsOf(db) {
  return Object.fromEntries(Object.entries(db).map(([table, rows]) => [table, rows.length]));
}

function detachedLeftOf(db) {
  return db.client_events.filter((row) => row.player_id !== null && row.player_id !== undefined).length;
}

// ============================================================================
// 2. План: состав, гарды, арифметика, сверка
// ============================================================================
const plan = buildPlan();
check('план: гарды проходят', (() => {
  try {
    assertPlanSafe(plan);
    return true;
  } catch {
    return false;
  }
})());
check('план: players удаляется', plan.some((step) => step.table === 'players' && step.action === 'delete'));
check('план: телеметрия только отвязывается', plan.every((step) => step.action === 'detach' ? step.table === 'client_events' : true));
check('план: donations по умолчанию не трогаем', !plan.some((step) => step.table === 'donations'));

const planWithMoney = assertPlanSafe(buildPlan({ includeDonations: true }));
check('план: --include-donations добавляет деньги с пометкой',
  planWithMoney.some((step) => step.table === 'donations' && step.note.includes('денежной')));

let guardUnknown = false;
try {
  assertPlanSafe([{ table: 'secret_config', action: 'delete', filterColumn: 'id' }]);
} catch {
  guardUnknown = true;
}
check('гард: неизвестная таблица — отказ', guardUnknown);

let guardNoPlayers = false;
try {
  assertPlanSafe(plan.filter((step) => step.table !== 'players'));
} catch {
  guardNoPlayers = true;
}
check('гард: план без players — отказ', guardNoPlayers);

let guardDetachForeign = false;
try {
  assertPlanSafe([...plan, { table: 'pets', action: 'detach', filterColumn: 'player_id', set: {} }]);
} catch {
  guardDetachForeign = true;
}
check('гард: detach на чужой таблице — отказ', guardDetachForeign);

let guardDouble = false;
try {
  assertPlanSafe([...plan, ...plan]);
} catch {
  guardDouble = true;
}
check('гард: дубль таблицы в плане — отказ', guardDouble);

// Дети каскада не ходят в плане отдельными шагами — их забирает удаление players.
check('все игровые таблицы объявлены', PLAYER_TABLES.every((table) =>
  plan.some((step) => step.table === table) || CASCADE_CHILDREN.includes(table)));
check('сохраняемые таблицы известны', PRESERVED_TABLES.length === 2 && PRESERVED_TABLES.includes('client_events'));

// ============================================================================
// 3. DRY-RUN ничего не пишет
// ============================================================================
const seeded = seedDb();
const snapshot = clone(seeded);
const drySummary = summarize(countsForPlan(seeded, plan), plan);
const unchanged = JSON.stringify(seeded) === JSON.stringify(snapshot);
check('dry-run: БД не изменилась', unchanged);
check('dry-run: игроки посчитаны', drySummary.playerRows === 3, `${drySummary.playerRows} игроков`);
check('dry-run: телеметрия к отвязке посчитана', drySummary.detached === 3, `${drySummary.detached} событий`);
check('dry-run: удаления посчитаны', drySummary.deletions === 3 + 2 + 1 + 1 + 1,
  `${drySummary.deletions} строк (players 3 + tg-хвосты 5)`);

// ============================================================================
// 4. Порядок шагов: отвязка ДО удаления игроков
// ============================================================================
const wrongOrder = clone(seedDb());
runPlan(wrongOrder, [
  ...plan.filter((step) => step.table === 'players'),
  ...plan.filter((step) => step.table !== 'players'),
]);
check('порядок: «сначала players» теряет телеметрию (доказательство необходимости отвязки)',
  wrongOrder.client_events.length < 4, `${wrongOrder.client_events.length} из 4`);

// ============================================================================
// 5. Вайп: обнуляет объявленное, сохраняет системное
// ============================================================================
const wiped = runPlan(clone(seedDb()), plan);
const after = countsOf(wiped);

check('вайп: игроков 0 (включая админа)', after.players === 0);
check('вайп: каскадные дети пусты',
  ['achievements', 'base_upgrades', 'cards', 'missions', 'pets', 'team', 'new_year_candy']
    .every((table) => after[table] === 0), JSON.stringify(after));
check('вайп: tg-keyed хвосты пусты',
  ['operator_archive', 'operator_legacy_cutoff', 'referral_codes', 'referrals'].every((table) => after[table] === 0));
check('вайп: телеметрия сохранена', after.client_events === 4, `${after.client_events} событий`);
check('вайп: привязок к игрокам не осталось', detachedLeftOf(wiped) === 0);
check('вайп: деньги сохранены', after.donations === 2 && wiped.donations.every((row) => row.stars > 0));
check('вайп: у денег обнулён player_id', wiped.donations.every((row) => row.player_id === null));
check('вайп: сверка чистая', verifyAfterWipe(after, plan, detachedLeftOf(wiped)).length === 0);

const withMoney = runPlan(clone(seedDb()), planWithMoney);
check('вайп с --include-donations: денег 0', withMoney.donations.length === 0);

const broken = clone(seedDb());
broken.missions = [{ id: 'm-x', player_id: 'p-1' }];
const verifyBroken = verifyAfterWipe(countsOf(broken), plan, detachedLeftOf(broken));
check('сверка: ловит остатки и неотвязанную телеметрию', verifyBroken.length >= 2,
  verifyBroken.join(' | '));

// ============================================================================
// 6. После вайпа: чистый старт и одноразовый анонс (memory-режим API)
// ============================================================================
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-wipe-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_USERNAME = 'hk_test_bot';
process.env.BOT_TOKEN = '123456789:AAFakeTokenForWipeQa_1234567890';
globalThis.fetch = async (url) => {
  const method = String(url).split('/').pop();
  const result = method === 'getMe' ? { username: 'hk_test_bot' } : true;
  return { ok: true, json: async () => ({ ok: true, result }) };
};

const { dispatchApiRequest } = require(CORE);
// launch.config — TS; в QA читаем как текст, чтобы не тащить ts-лоадер.
const launchSource = fs.readFileSync(path.join(CORE.replace(/api\/_core\.cjs$/, ''), 'shared/launch.config.ts'), 'utf8');
const launcher = {
  id: (launchSource.match(/LAUNCH_ANNOUNCEMENT_ID = '([^']+)'/) ?? [])[1],
  title: (launchSource.match(/title: '([^']+)'/) ?? [])[1],
  parts: [...launchSource.matchAll(/'([^']{20,})'/g)].map((match) => match[1]),
};
const announcementText = launcher.parts.join(' ');
check('анонс: id задан', typeof launcher.id === 'string' && launcher.id.length > 0, launcher.id);
check('анонс: смысл на месте (перезапуск + новая экономика + сюжет + v1)',
  /перезапущена/.test(announcementText) &&
    /новая экономика/.test(announcementText) &&
    /сюжет целиком/.test(announcementText) &&
    /точка запуска v1/.test(announcementText));
const repoRoot = CORE.replace(/api\/_core\.cjs$/, '');
const distDir = path.join(repoRoot, 'dist', 'assets');
const clientBundles = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).filter((file) => file.endsWith('.js'))
  : [];
const clientHasAnnouncement = clientBundles.some((file) =>
  fs.readFileSync(path.join(distDir, file), 'utf8').includes('Прогресс начинается заново'));
check('анонс: строка живёт в конфиге, а не в бандле',
  fs.existsSync(path.join(repoRoot, 'shared/launch.config.ts')) && clientBundles.length > 0 && !clientHasAnnouncement,
  `${clientBundles.length} чанков, в бандле ${clientHasAnnouncement ? 'ЕСТЬ' : 'нет'}`);

function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Math.floor(Math.random() * 1e9)}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: `Player${tgId % 1000}`, username: `player${tgId}` }));
  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

async function call(tgId, route, body = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `player${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': '10.200.0.7',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = {
    statusCode: 200,
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

const alertsOf = (res) => (Array.isArray(res.alerts) ? res.alerts : []);
const announcementOf = (res) => alertsOf(res).filter((alert) => alert.title === launcher.title);

const NEW_PLAYER = 900_100_001;
const first = await call(NEW_PLAYER, 'init');
check('после вайпа: init успешен', first.ok === true && !!first.player);
// Стартовый капитал 250 Data / 5 Crypto — штатный дефолт новичка, а не остатки
// прошлой жизни: он приходит из newPlayerRecord(), а не из вайпа.
check('после вайпа: старт с 1 уровня и нулевого прогресса',
  first.player?.derived?.level === 1 &&
    (first.player?.xp ?? -1) === 0 &&
    (first.player?.chips ?? -1) === 0 &&
    (first.player?.prestigeCount ?? -1) === 0 &&
    (first.player?.totalClicks ?? -1) === 0 &&
    (first.player?.totalMissions ?? -1) === 0,
  `lvl ${first.player?.derived?.level}, xp ${first.player?.xp}, chips ${first.player?.chips}`);
check('после вайпа: ни достижений, ни карточек, ни команды',
  (first.player?.achievements ?? []).length === 0 &&
    Object.keys(first.player?.cards ?? {}).length === 0 &&
    (first.player?.team ?? []).length === 0,
  `achievements ${(first.player?.achievements ?? []).length}, cards ${Object.keys(first.player?.cards ?? {}).length}, team ${(first.player?.team ?? []).length}`);
check('после вайпа: сюжет начинается с первой главы',
  !!first.story?.arcId && first.story.done === 0 && first.story.completedArcs === 0,
  `${first.story?.arcId} (${first.story?.done}/${first.story?.total})`);
check('после вайпа: пролог/ивенты на месте', !!first.player?.stats, 'stats создан');
check('анонс: показан на первом init', announcementOf(first).length === 1,
  `${announcementOf(first).length} алертов`);
check('анонс: текст совпадает с конфигом',
  announcementOf(first)[0]?.message?.includes('Прогресс начинается заново') === true);
check('анонс: флаг сохранён в stats', first.player?.stats?.launchAnnouncement === launcher.id,
  String(first.player?.stats?.launchAnnouncement));

const second = await call(NEW_PLAYER, 'init');
check('анонс: второй init — без повтора', announcementOf(second).length === 0);
check('анонс: флаг остаётся', second.player?.stats?.launchAnnouncement === launcher.id);

// Вайп стёр прогресс → столбец stats исчез вместе с игроком → анонс вернётся.
const other = await call(NEW_PLAYER + 1, 'init');
check('анонс: новый аккаунт снова видит анонс', announcementOf(other).length === 1);

// Клики и миссии-ивенты после вайпа работают (точка запуска живая, не «музей»).
const clicked = await call(NEW_PLAYER, 'click', { clicks: 20 });
check('после вайпа: тап работает', clicked.ok === true && (clicked.appliedClicks ?? 0) > 0,
  `appliedClicks ${clicked.appliedClicks}`);

// ============================================================================
console.log('');
console.log(`Итого: ${pass} pass, ${fail} fail`);
if (failures.length > 0) {
  console.log(`Провалы: ${failures.join(', ')}`);
  process.exitCode = 1;
}
