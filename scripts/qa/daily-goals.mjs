/**
 * HACKER KOMBAT — QA v1.6: «Цели дня».
 * ----------------------------------------------------------------------------
 * Проверяем петлю возврата целиком и то, что она не задела живые механики:
 *
 *   1) КОНФИГ: три цели в день, шесть типов в пуле, таргеты по трём тирам,
 *      награда Chips 3–5 + 1 Crypto, достижимость первого тира за ~15–20 минут;
 *   2) ДЕТЕРМИНИЗМ: одна дата + один игрок → одна и та же тройка и тот же
 *      порядок; разные игроки и даты дают разные доски;
 *   3) СБРОС: старый сейв без поля получает доску сам, UTC-полночь пересобирает
 *      доску, прогресс и claimed чистые;
 *   4) ПРОГРЕСС: каждый тип цели двигается только своим серверным событием
 *      (тапы после античита, успешный взлом, успешный контракт, CPU Charge,
 *      Data, применение расходника);
 *   5) СБОР: неготовую цель забрать нельзя, готовая даёт ровно 3–5 Чипов и
 *      1 Crypto, повторный сбор отклоняется, два параллельных сбора дают одну
 *      награду;
 *   6) ПОЛНЫЙ СБОР: третья цель выдаёт предмет source='daily', только
 *      common/rare, и ставит точку «новый предмет»;
 *   7) МИГРАЦИЯ 023: расширенный CHECK, grant_item с 'daily', claim_daily_goal
 *      с FOR UPDATE, предмет в той же транзакции, права только service_role;
 *   8) ЖИВЫЕ МЕХАНИКИ: контракты дня, ежедневные поручения, дневной бонус и
 *      инцидент продолжают работать и не смешиваются с целями дня;
 *   9) UI: секция в TasksPage, data-qa, тап-таргеты ≥ 44 px, без hex.
 *
 * Запуск (нужен собранный api/_core.cjs: npm run build):
 *   npm run qa:daily-goals
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = process.cwd();
const CORE = path.join(REPO, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-daily-goals-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let runtime = require(CORE);

// ── Мост к настоящим конфигам (в тесте нет второй копии чисел) ───────────────
const esbuild = require('esbuild');
function loadShared(entry) {
  const outfile = path.join(sandbox, `hk-${path.basename(entry)}-${process.pid}.mjs`);
  esbuild.buildSync({
    entryPoints: [path.join(REPO, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
  });
  return import(pathToFileURL(outfile).href);
}
const GOALS = await loadShared('shared/dailyGoals.config.ts');
const CONSUMABLES = await loadShared('shared/consumables.config.ts');
const ECONOMY = await loadShared('shared/economy.config.ts');
const HACKS = await loadShared('shared/hacks.config.ts');

const {
  DAILY_GOALS_PER_DAY,
  DAILY_GOAL_POOL,
  DAILY_GOAL_TARGETS,
  DAILY_GOAL_CRYPTO_REWARD,
  DAILY_GOAL_CHIPS,
  DAILY_GOAL_CHIPS_MIN,
  DAILY_GOAL_CHIPS_MAX,
  buildDailyGoalsBoard,
  dailyGoalTierIndex,
  getDailyGoalTarget,
  getUtcDayKey,
  selectDailyGoalKinds,
} = GOALS;

const realNow = Date.now;
let fakeNow = Date.parse('2026-11-28T09:00:00Z');
Date.now = () => fakeNow;

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

function makeRes() {
  return {
    statusCode: 200,
    payload: '',
    setHeader() {},
    end(chunk) {
      this.payload = chunk ?? '';
    },
  };
}

async function api(route, body = {}, seed = 'daily-goals-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'GoalsTester',
      'x-forwarded-for': '10.51.0.1',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = makeRes();
  await runtime.dispatchApiRequest(req, res);
  try {
    return { ...JSON.parse(res.payload), _status: res.statusCode };
  } catch {
    return { ok: false, error: String(res.payload), _status: res.statusCode };
  }
}

function reloadRuntime() {
  delete require.cache[require.resolve(CORE)];
  runtime = require(CORE);
  return runtime;
}

/** Гостевой tg-id выводится на сервере тем же sha256, что и в telegramAuth. */
function guestTgId(seed) {
  const digest = crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest();
  return -(100_000_000 + (digest.readUInt32BE(0) % 800_000_000));
}

/** Прямая правка memory-fallback сейва: подготовка состояния, не проверка. */
function patchBoard(seed, mutate) {
  const db = JSON.parse(fs.readFileSync('.local-db.json', 'utf8'));
  const tgId = guestTgId(seed);
  const row = db.playersByTgId[String(tgId)];
  if (!row) throw new Error(`В локальной БД нет гостя ${seed} (${tgId})`);
  mutate(row);
  fs.writeFileSync('.local-db.json', JSON.stringify(db));
  reloadRuntime();
  return row;
}

/** Доска игрока из ответа API. */
function board(result) {
  return result?.player?.stats?.dailyGoals;
}

/** Индекс цели нужного типа на доске или -1. */
function goalIndex(state, kind) {
  return state?.goals?.findIndex((goal) => goal.key === kind) ?? -1;
}

/** В ответе API предметы — массив стопок; для сверки приводим к map по ключу. */
function itemTotals(player) {
  const totals = {};
  for (const stack of player?.items ?? []) {
    if (!stack?.key) continue;
    totals[stack.key] = (totals[stack.key] ?? 0) + (stack.qty ?? 0);
  }
  return totals;
}

/** Сервер считает контракт успешным только при чистом success — ловим по алерту. */
function missionWasSuccess(result) {
  return (result?.alerts ?? []).some((alert) => String(alert.title).includes('взломана'));
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v1.6: цели дня ===\n');

  // ════════════════════════════════════════════════════════════════════════
  // 1. КОНФИГ
  // ════════════════════════════════════════════════════════════════════════
  check('конфиг: ровно три цели в день', DAILY_GOALS_PER_DAY === 3, String(DAILY_GOALS_PER_DAY));
  check(
    'конфиг: пул из шести типов, включая item_use',
    DAILY_GOAL_POOL.length === 6 &&
      ['taps', 'hacks', 'contracts', 'cpu', 'data', 'item_use'].every((kind) =>
        DAILY_GOAL_POOL.includes(kind)
      ),
    DAILY_GOAL_POOL.join(', ')
  );
  check(
    'конфиг: у каждого типа цели есть таргеты на три тира',
    DAILY_GOAL_POOL.every((kind) => DAILY_GOAL_TARGETS[kind]?.length === 3)
  );
  check(
    'конфиг: таргеты растут вместе с тиром',
    DAILY_GOAL_POOL.every((kind) => {
      const [t1, t2, t3] = DAILY_GOAL_TARGETS[kind];
      // item_use растёт только на третьем тире (1/1/2) — он монотонный, не строгий.
      return t1 > 0 && t1 <= t2 && t2 <= t3 && t1 < t3;
    })
  );
  check(
    'конфиг: Chips за цель внутри 3–5',
    DAILY_GOAL_POOL.every(
      (kind) =>
        DAILY_GOAL_CHIPS[kind] >= DAILY_GOAL_CHIPS_MIN && DAILY_GOAL_CHIPS[kind] <= DAILY_GOAL_CHIPS_MAX
    ),
    DAILY_GOAL_POOL.map((kind) => `${kind}:${DAILY_GOAL_CHIPS[kind]}`).join(' ')
  );
  check('конфиг: за цель ровно 1 Crypto', DAILY_GOAL_CRYPTO_REWARD === 1);

  const tierProbe = [1, 5, 9, 10, 12, 19, 20, 35];
  check(
    'тиры: 1–9 / 10–19 / 20+ без дыр на границах',
    tierProbe.every((level) => {
      const expected = level >= 20 ? 2 : level >= 10 ? 1 : 0;
      return dailyGoalTierIndex(level) === expected;
    }),
    tierProbe.map((level) => `${level}→${dailyGoalTierIndex(level)}`).join(' ')
  );
  check(
    'тиры: таргет берётся из конфига по уровню',
    getDailyGoalTarget('taps', 1) === DAILY_GOAL_TARGETS.taps[0] &&
      getDailyGoalTarget('taps', 15) === DAILY_GOAL_TARGETS.taps[1] &&
      getDailyGoalTarget('taps', 40) === DAILY_GOAL_TARGETS.taps[2]
  );

  // Достижимость первого тира: бюджет 20 минут активной игры.
  const cpuBudget = 20 * 60 * 0.5 + 1500; // реген 1 CPU / 2 c + стартовый запас
  const easyHackCost = HACKS.getHackDifficulty('easy').cost;
  check(
    'достижимость тира 1: тапы ≤ 20 минут по 6 тап/с и по заряду',
    DAILY_GOAL_TARGETS.taps[0] <= 20 * 60 * 6 && DAILY_GOAL_TARGETS.taps[0] <= cpuBudget,
    `taps=${DAILY_GOAL_TARGETS.taps[0]}, бюджет заряда ${cpuBudget}`
  );
  check(
    'достижимость тира 1: CPU Charge ≤ бюджета 20 минут',
    DAILY_GOAL_TARGETS.cpu[0] <= cpuBudget,
    `cpu=${DAILY_GOAL_TARGETS.cpu[0]} ≤ ${cpuBudget}`
  );
  check(
    'достижимость тира 1: взломы ≤ 20 минут (сессия 30 с + заряд)',
    DAILY_GOAL_TARGETS.hacks[0] * HACKS.HACK_SESSION_SECONDS <= 20 * 60 &&
      DAILY_GOAL_TARGETS.hacks[0] * easyHackCost <= cpuBudget,
    `hacks=${DAILY_GOAL_TARGETS.hacks[0]}, вход ${easyHackCost}`
  );
  check(
    'достижимость тира 1: контракты ≤ 20 минут при длительности тира 1',
    DAILY_GOAL_TARGETS.contracts[0] * 65 <= 20 * 60 &&
      DAILY_GOAL_TARGETS.contracts[0] * ECONOMY.getContractCpuCost(1) <= cpuBudget,
    `contracts=${DAILY_GOAL_TARGETS.contracts[0]}`
  );

  // ════════════════════════════════════════════════════════════════════════
  // 2. ДЕТЕРМИНИЗМ ВЫБОРА
  // ════════════════════════════════════════════════════════════════════════
  const dayKey = getUtcDayKey(fakeNow);
  const first = selectDailyGoalKinds(777001, dayKey);
  const again = selectDailyGoalKinds(777001, dayKey);
  check(
    'детерминизм: одна дата + игрок → одна тройка и один порядок',
    first.length === 3 && JSON.stringify(first) === JSON.stringify(again),
    first.join(', ')
  );
  check('детерминизм: три РАЗНЫЕ цели без повторов', new Set(first).size === 3);
  check(
    'детерминизм: доска собирается одинаково (таргеты и порядок)',
    JSON.stringify(buildDailyGoalsBoard(777001, dayKey, 4)) ===
      JSON.stringify(buildDailyGoalsBoard(777001, dayKey, 4))
  );
  const sampleBoard = buildDailyGoalsBoard(777001, dayKey, 4);
  check(
    'детерминизм: версия и UTC-дата на месте',
    sampleBoard.version === 1 && sampleBoard.date === dayKey && /^\d{4}-\d{2}-\d{2}$/.test(sampleBoard.date)
  );

  const playerVariants = new Set();
  for (let tg = 900000; tg < 900060; tg += 1) {
    playerVariants.add(selectDailyGoalKinds(tg, dayKey).join('|'));
  }
  check(
    'детерминизм: разные игроки получают разные тройки',
    playerVariants.size > 3,
    `${playerVariants.size} вариантов на 60 игроков`
  );
  const dayVariants = new Set();
  for (let offset = 0; offset < 14; offset += 1) {
    dayVariants.add(selectDailyGoalKinds(777001, getUtcDayKey(fakeNow + offset * 86_400_000)).join('|'));
  }
  check(
    'детерминизм: разные даты дают разные тройки',
    dayVariants.size > 2,
    `${dayVariants.size} вариантов на 14 дней`
  );
  check(
    'детерминизм: item_use исключён, когда расходников нет',
    Array.from({ length: 60 }, (_, index) => selectDailyGoalKinds(555000 + index, dayKey, false)).every(
      (kinds) => !kinds.includes('item_use')
    )
  );
  check(
    'детерминизм: Math.random не участвует в выборе',
    (() => {
      const original = Math.random;
      Math.random = () => 0.999999;
      const a = selectDailyGoalKinds(424242, dayKey);
      Math.random = () => 0;
      const b = selectDailyGoalKinds(424242, dayKey);
      Math.random = original;
      return JSON.stringify(a) === JSON.stringify(b);
    })()
  );

  // ════════════════════════════════════════════════════════════════════════
  // 3. СТАРЫЙ СЕЙВ + ПОВТОРНЫЙ INIT
  // ════════════════════════════════════════════════════════════════════════
  const legacySeed = 'daily-goals-legacy';
  const legacyInit = await api('init', {}, legacySeed);
  check(
    'init создаёт доску целей дня',
    legacyInit.ok === true && board(legacyInit)?.goals?.length === 3,
    legacyInit.error
  );
  const legacyBoard = board(legacyInit);
  check(
    'доска: у каждой цели согласованы target/progress/claimed',
    legacyBoard.goals.every(
      (goal) =>
        typeof goal.key === 'string' && goal.target > 0 && goal.progress === 0 && goal.claimed === false
    )
  );

  // Сейв «как до релиза»: поля нет вовсе.
  const db0 = JSON.parse(fs.readFileSync('.local-db.json', 'utf8'));
  const legacyRow = db0.playersByTgId[String(guestTgId(legacySeed))];
  const statsBefore = {
    totalXpEarned: legacyRow.stats.totalXpEarned,
    activeDayKey: legacyRow.stats.activeDayKey,
    dailyTasks: JSON.stringify(legacyRow.stats.dailyTasks),
    contracts: JSON.stringify(legacyRow.stats.contracts),
  };
  delete legacyRow.stats.dailyGoals;
  fs.writeFileSync('.local-db.json', JSON.stringify(db0));
  reloadRuntime();
  const legacyMigrated = await api('init', {}, legacySeed);
  check(
    'старый сейв без dailyGoals автоматически получает свежую доску',
    legacyMigrated.ok === true && board(legacyMigrated)?.goals?.length === 3,
    legacyMigrated.error
  );
  check(
    'миграция доски не трогает остальные под-состояния',
    legacyMigrated.player.stats.totalXpEarned === statsBefore.totalXpEarned &&
      legacyMigrated.player.stats.activeDayKey === statsBefore.activeDayKey &&
      JSON.stringify(legacyMigrated.player.stats.dailyTasks) === statsBefore.dailyTasks &&
      JSON.stringify(legacyMigrated.player.stats.contracts) === statsBefore.contracts
  );
  const stable = await api('init', {}, legacySeed);
  check(
    'повторный init не пересобирает доску',
    JSON.stringify(board(stable)) === JSON.stringify(board(legacyMigrated))
  );

  // ════════════════════════════════════════════════════════════════════════
  // 4. ПРОГРЕСС ПО КАЖДОМУ ТИПУ ЦЕЛИ
  // ════════════════════════════════════════════════════════════════════════
  const progressSeed = 'daily-goals-progress';
  const initProgress = await api('init', {}, progressSeed);
  let state = board(initProgress);
  check('прогресс: доска пришла с сервера', state?.goals?.length === 3);

  // Тапы: 60 кликов через античит.
  const tapIdx = goalIndex(state, 'taps');
  const afterTaps = await api('click', { clicks: 60 }, progressSeed);
  state = board(afterTaps);
  check(
    'прогресс: тапы двигают цель taps',
    tapIdx < 0 || (state.goals[tapIdx]?.progress ?? 0) > 0,
    tapIdx < 0 ? 'цели taps нет в этой доске' : `${state.goals[tapIdx].progress}/${state.goals[tapIdx].target}`
  );
  check(
    'прогресс: тапы не двигают hacks/contracts/cpu',
    ['hacks', 'contracts', 'cpu'].every((kind) => {
      const index = goalIndex(state, kind);
      return index < 0 || state.goals[index].progress === 0;
    })
  );
  const dataIdx = goalIndex(state, 'data');
  check(
    'прогресс: заработанные Data считаются',
    dataIdx < 0 || state.goals[dataIdx].progress > 0,
    dataIdx < 0 ? 'цели data нет в этой доске' : `${state.goals[dataIdx].progress}/${state.goals[dataIdx].target}`
  );

  // Взлом easy: старт списывает CPU (цель cpu), финиш с узлами — цель hacks.
  const cpuIdx = goalIndex(state, 'cpu');
  const cpuBeforeHack = cpuIdx < 0 ? 0 : state.goals[cpuIdx].progress;
  const hackStart = await api('hacks', { action: 'start', difficulty: 'easy' }, progressSeed);
  const sessionId = hackStart.player?.stats?.hackSession?.id;
  check('прогресс: сессия взлома стартует для QA', hackStart.ok === true && Boolean(sessionId), hackStart.error);
  state = board(hackStart);
  check(
    'прогресс: вход в взлом списывает CPU и двигает цель cpu',
    cpuIdx < 0 || state.goals[cpuIdx].progress >= cpuBeforeHack + easyHackCost,
    cpuIdx < 0 ? 'цели cpu нет в этой доске' : `${state.goals[cpuIdx].progress}`
  );

  fakeNow += (HACKS.HACK_SESSION_SECONDS + 1) * 1000;
  const hackFinish = await api(
    'hacks',
    { action: 'finish', sessionId, safeHits: 1, trapHits: 0 },
    progressSeed
  );
  check('прогресс: взлом закрывается для QA', hackFinish.ok === true, hackFinish.error);
  state = board(hackFinish);
  const hackIdx = goalIndex(state, 'hacks');
  check(
    'прогресс: успешный взлом засчитывается в hacks',
    hackIdx < 0 || state.goals[hackIdx].progress === 1,
    hackIdx < 0 ? 'цели hacks нет в этой доске' : `${state.goals[hackIdx].progress}/${state.goals[hackIdx].target}`
  );

  // Контракт: старт (cpu) и успешный финиш (contracts).
  const playerAfterHack = hackFinish.player;
  const missionStart = await api(
    'missions',
    { action: 'start', missionKey: playerAfterHack.availableMissionKeys?.[0] },
    progressSeed
  );
  check('прогресс: контракт стартует для QA', missionStart.ok === true, missionStart.error);
  const mission = missionStart.player?.activeMissions?.[0];
  check(
    'прогресс: взнос контракта двигает цель cpu',
    cpuIdx < 0 || (board(missionStart).goals[cpuIdx].progress ?? 0) > cpuBeforeHack,
    cpuIdx < 0 ? 'цели cpu нет в этой доске' : `${board(missionStart).goals[cpuIdx].progress}`
  );

  fakeNow = new Date(mission.finishAt).getTime() + 5_000;
  const missionClaim = await api('missions', { action: 'claim', missionId: mission.id }, progressSeed);
  check('прогресс: контракт закрывается для QA', missionClaim.ok === true, missionClaim.error);
  state = board(missionClaim);
  const contractIdx = goalIndex(state, 'contracts');
  const success = missionWasSuccess(missionClaim);
  check(
    'прогресс: contracts засчитываются только чистым успехом',
    contractIdx < 0 || state.goals[contractIdx].progress === (success ? 1 : 0),
    contractIdx < 0
      ? 'цели contracts нет в этой доске'
      : `исход ${success ? 'success' : 'не success'} → ${state.goals[contractIdx].progress}`
  );

  // Применение расходника: кладём предмет в сейв, кладём цель item_use в доску.
  const itemKey = 'consumable:coffee_raf';
  const itemCfg = CONSUMABLES.getConsumableItem(itemKey);
  check('расходник кофе есть в каталоге и он usable', Boolean(itemCfg?.usable), itemCfg?.key);
  patchBoard(progressSeed, (row) => {
    const stamp = new Date(fakeNow).toISOString();
    row.items = { [itemKey]: { key: itemKey, qty: 2, firstAcquiredAt: stamp, updatedAt: stamp } };
    const dailyGoals = row.stats.dailyGoals;
    const existing = dailyGoals.goals.findIndex((goal) => goal.key === 'item_use');
    if (existing >= 0) {
      [dailyGoals.goals[existing], dailyGoals.goals[2]] = [dailyGoals.goals[2], dailyGoals.goals[existing]];
    } else {
      dailyGoals.goals[2] = { key: 'item_use', target: 1, progress: 0, claimed: false };
    }
  });
  const useItem = await api('inventory', { action: 'use', itemKey }, progressSeed);
  check('прогресс: расходник применяется через API', useItem.ok === true, useItem.error);
  const itemUseGoal = board(useItem)?.goals?.find((goal) => goal.key === 'item_use');
  check(
    'прогресс: применение расходника засчитано в item_use',
    Boolean(itemUseGoal) && itemUseGoal.progress >= 1,
    itemUseGoal ? `${itemUseGoal.progress}/${itemUseGoal.target}` : 'цель исчезла из доски'
  );

  // ════════════════════════════════════════════════════════════════════════
  // 5. СБОР: неготово / готово / повтор / параллельно
  // ════════════════════════════════════════════════════════════════════════
  const claimSeed = 'daily-goals-claim';
  const claimInit = await api('init', {}, claimSeed);
  check('сбор: у гостя есть доска', board(claimInit)?.goals?.length === 3);

  const notReady = await api('daily-goals', { action: 'claim', goalIndex: 0 }, claimSeed);
  check('сбор: неготовую цель забрать нельзя', notReady.ok === false, notReady.error);
  const badIndex = await api('daily-goals', { action: 'claim', goalIndex: 3 }, claimSeed);
  check('сбор: индекс вне доски отклоняется', badIndex.ok === false, badIndex.error);
  const badAction = await api('daily-goals', { action: 'open', goalIndex: 0 }, claimSeed);
  check('сбор: мусорное действие отклоняется', badAction.ok === false, badAction.error);

  patchBoard(claimSeed, (row) => {
    for (const goal of row.stats.dailyGoals.goals) goal.progress = goal.target;
  });
  const ready = await api('init', {}, claimSeed);
  const readyState = board(ready);
  const chipsBefore = ready.player.chips;
  const cryptoBefore = ready.player.crypto;
  const firstGoal = readyState.goals[0];
  const expectedChips = DAILY_GOAL_CHIPS[firstGoal.key];

  const claim1 = await api('daily-goals', { action: 'claim', goalIndex: 0 }, claimSeed);
  check('сбор: готовую цель можно забрать', claim1.ok === true, claim1.error);
  check(
    'сбор: начислено ровно Chips по конфигу',
    claim1.player.chips === chipsBefore + expectedChips,
    `${chipsBefore} → ${claim1.player.chips} (ожидали +${expectedChips})`
  );
  check(
    'сбор: начислен ровно 1 Crypto',
    claim1.player.crypto === cryptoBefore + DAILY_GOAL_CRYPTO_REWARD,
    `${cryptoBefore} → ${claim1.player.crypto}`
  );
  check('сбор: цель помечена забранной', board(claim1).goals[0].claimed === true);
  check(
    'сбор: сбор не двигает Data и не привязывается к стрику',
    claim1.player.data <= ready.player.data + 1 && claim1.player.dailyStreak === ready.player.dailyStreak
  );
  check(
    'сбор: уведомление о награде ушло в AlertStack-канал',
    (claim1.alerts ?? []).some((alert) => String(alert.title).includes('Цель дня'))
  );

  // Снимок «до» берём отдельным init: достижение «первый Чип» могло начислить
  // свою награду в предыдущем ответе, и это не двойной claim.
  const beforeDuplicate = (await api('init', {}, claimSeed)).player;
  const duplicate = await api('daily-goals', { action: 'claim', goalIndex: 0 }, claimSeed);
  check('сбор: повторный claim отклонён', duplicate.ok === false, duplicate.error);
  const afterDuplicate = await api('init', {}, claimSeed);
  check(
    'сбор: повторный claim не начислил награду второй раз',
    afterDuplicate.player.chips === beforeDuplicate.chips &&
      afterDuplicate.player.crypto === beforeDuplicate.crypto,
    `chips ${beforeDuplicate.chips} → ${afterDuplicate.player.chips}, crypto ${beforeDuplicate.crypto} → ${afterDuplicate.player.crypto}`
  );

  const parallel = await Promise.all([
    api('daily-goals', { action: 'claim', goalIndex: 1 }, claimSeed),
    api('daily-goals', { action: 'claim', goalIndex: 1 }, claimSeed),
  ]);
  check(
    'сбор: два параллельных claim дают ровно один успех',
    parallel.filter((item) => item.ok === true).length === 1 &&
      parallel.filter((item) => item.ok === false).length === 1,
    parallel.map((item) => (item.ok ? 'ok' : item.error)).join(' | ')
  );
  const afterParallel = await api('init', {}, claimSeed);
  const secondGoal = readyState.goals[1];
  check(
    'сбор: параллельный claim начислил одну награду',
    afterParallel.player.chips === claim1.player.chips + DAILY_GOAL_CHIPS[secondGoal.key],
    `${claim1.player.chips} → ${afterParallel.player.chips}`
  );

  // ════════════════════════════════════════════════════════════════════════
  // 6. ПОЛНЫЙ СБОР → ГАРАНТИРОВАННЫЙ ПРЕДМЕТ
  // ════════════════════════════════════════════════════════════════════════
  const fullState = board(afterParallel);
  check(
    'полный сбор: две цели уже забраны, третья — нет',
    fullState.goals.filter((goal) => goal.claimed).length === 2
  );
  const itemsBefore = itemTotals(afterParallel.player);
  const drop = await api('daily-goals', { action: 'claim', goalIndex: 2 }, claimSeed);
  check('полный сбор: третья цель забирается', drop.ok === true, drop.error);
  const dropState = board(drop);
  check('полный сбор: все три цели закрыты', dropState.goals.every((goal) => goal.claimed));

  const itemsAfter = itemTotals(drop.player);
  const grantedKeys = Object.keys(itemsAfter).filter(
    (key) => (itemsAfter[key] ?? 0) > (itemsBefore[key] ?? 0)
  );
  check('полный сбор: выдан ровно один предмет', grantedKeys.length === 1, grantedKeys.join(', '));
  const grantedKey = grantedKeys[0];
  const grantedCfg = grantedKey ? CONSUMABLES.getConsumableItem(grantedKey) : null;
  check(
    'полный сбор: предмет из каталога и только common/rare',
    Boolean(grantedCfg) && ['common', 'rare'].includes(grantedCfg.rarity),
    `${grantedKey} · ${grantedCfg?.rarity}`
  );
  check('полный сбор: в инвентаре стоит точка «новый предмет»', drop.player.stats.hasNewItems === true);
  check(
    'полный сбор: уведомление о дропе ушло в AlertStack-канал',
    (drop.alerts ?? []).some((alert) => String(alert.title).includes('Вы получили'))
  );
  const journal = JSON.parse(fs.readFileSync('.local-db.json', 'utf8')).itemDrops ?? [];
  const dailyRow = journal.filter((row) => row.source === 'daily').at(-1);
  check(
    'полный сбор: журнал дропа пишет source=daily и outcome=full_collect',
    dailyRow?.key === grantedKey && dailyRow?.outcome === 'full_collect',
    JSON.stringify(dailyRow ?? null)
  );
  const noSecondDrop = await api('daily-goals', { action: 'claim', goalIndex: 2 }, claimSeed);
  check('полный сбор: повторный сбор не даёт второй предмет', noSecondDrop.ok === false);

  const fixed = (...values) => {
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)];
  };
  check(
    'полный сбор: 20% rare — ролл 0.19 даёт rare, 0.21 даёт common',
    CONSUMABLES.rollDailyFullSetItem(fixed(0.19, 0.1)).rarity === 'rare' &&
      CONSUMABLES.rollDailyFullSetItem(fixed(0.21, 0.1)).rarity === 'common'
  );
  let epicSeen = false;
  const rarities = new Set();
  for (let roll = 0; roll < 1000; roll += 1) {
    const rarity = CONSUMABLES.rollDailyFullSetItem(() => roll / 1000).rarity;
    rarities.add(rarity);
    if (rarity === 'epic') epicSeen = true;
  }
  check(
    'полный сбор: epic в дропе за цели дня не выпадает',
    epicSeen === false && rarities.has('common') && rarities.has('rare'),
    Array.from(rarities).join('/')
  );
  check(
    'полный сбор: предмет не попадает в коллекционные награды профиля',
    !(drop.player.stats.inventoryOwned ?? []).includes(grantedKey)
  );

  // ════════════════════════════════════════════════════════════════════════
  // 7. СМЕНА UTC-ДАТЫ
  // ════════════════════════════════════════════════════════════════════════
  const beforeRoll = board(await api('init', {}, claimSeed));
  fakeNow = Date.parse(`${getUtcDayKey(fakeNow)}T23:59:00Z`) + 2 * 60 * 1000;
  const nextDay = await api('init', {}, claimSeed);
  const nextState = board(nextDay);
  check(
    'смена даты: новая UTC-дата создаёт новую доску',
    nextState.date !== beforeRoll.date && nextState.date === getUtcDayKey(fakeNow),
    `${beforeRoll.date} → ${nextState.date}`
  );
  check(
    'смена даты: прогресс и claimed чистые',
    nextState.goals.every((goal) => goal.progress === 0 && goal.claimed === false)
  );
  check(
    'смена даты: таргеты пересобраны по текущему уровню',
    nextState.goals.every(
      (goal) => goal.target === getDailyGoalTarget(goal.key, nextDay.player.derived.level)
    )
  );
  check('смена даты: накопленные Чипы не сгорают', nextDay.player.chips >= drop.player.chips);
  const oldClaim = await api('daily-goals', { action: 'claim', goalIndex: 0 }, claimSeed);
  check('смена даты: вчерашняя доска не даёт награду', oldClaim.ok === false, oldClaim.error);

  // ════════════════════════════════════════════════════════════════════════
  // 8. ЖИВЫЕ МЕХАНИКИ НЕ ЗАДЕТЫ
  // ════════════════════════════════════════════════════════════════════════
  const liveSeed = 'daily-goals-live';
  const liveInit = await api('init', {}, liveSeed);
  const liveStats = liveInit.player.stats;
  check(
    'живые механики: контракты дня по-прежнему выдаются',
    liveStats.contracts?.ids?.length === 3,
    String(liveStats.contracts?.ids?.length)
  );
  check(
    'живые механики: ежедневные поручения по-прежнему выдаются',
    liveStats.dailyTasks?.taskKeys?.length === 3
  );
  check(
    'живые механики: ежедневный инцидент по-прежнему выбран',
    Boolean(liveStats.dailyIncident?.incidentKey)
  );
  check(
    'живые механики: цели дня не пересекаются с поручениями по ключам',
    liveStats.dailyGoals.goals.every(
      (goal) => !liveStats.dailyTasks.taskKeys.some((key) => key === goal.key)
    )
  );
  check(
    'живые механики: стрик не привязан к целям дня',
    typeof liveInit.player.dailyStreak === 'number' &&
      !JSON.stringify(liveStats.dailyGoals).includes('streak')
  );
  const dailyBonus = await api('daily', {}, liveSeed);
  check(
    'живые механики: дневной бонус Crypto работает как раньше',
    dailyBonus.ok === true,
    dailyBonus.error ?? 'ok'
  );
  check(
    'живые механики: дневной бонус не трогает доску целей',
    JSON.stringify((await api('init', {}, liveSeed)).player.stats.dailyGoals) ===
      JSON.stringify(liveStats.dailyGoals)
  );
  const missionAfter = await api(
    'missions',
    { action: 'start', missionKey: liveInit.player.availableMissionKeys?.[0] },
    liveSeed
  );
  check('живые механики: контракт запускается', missionAfter.ok === true, missionAfter.error);

  // ════════════════════════════════════════════════════════════════════════
  // 9. МИГРАЦИЯ 023 И СЕРВЕРНЫЙ КОД
  // ════════════════════════════════════════════════════════════════════════
  const migration = fs.readFileSync(path.join(REPO, 'supabase/migrations/023_daily_goals.sql'), 'utf8');
  const migrationCode = migration.replace(/--[^\n]*/g, '');
  check(
    'миграция 023: CHECK источника расширяется, а не пересоздаётся таблица',
    /DROP CONSTRAINT IF EXISTS item_drops_source_check/.test(migrationCode) &&
      /CHECK \(source IN \('hack', 'mission', 'level', 'daily'\)\)/.test(migrationCode)
  );
  check(
    'миграция 023: старые источники остались в списке',
    ['hack', 'mission', 'level'].every((source) => migrationCode.includes(`'${source}'`))
  );
  check(
    'миграция 023: grant_item принимает daily',
    /CREATE OR REPLACE FUNCTION public\.grant_item/.test(migrationCode) &&
      /p_source NOT IN \('hack', 'mission', 'level', 'daily'\)/.test(migrationCode)
  );
  check(
    'миграция 023: claim_daily_goal держит строку FOR UPDATE',
    /FUNCTION public\.claim_daily_goal/.test(migrationCode) && /FOR UPDATE/.test(migrationCode)
  );
  check(
    'миграция 023: claimed проверяется и ставится в одной транзакции',
    /DAILY_GOAL_ALREADY_CLAIMED/.test(migrationCode) &&
      /jsonb_set\(v_goals, ARRAY\[p_goal_index::text, 'claimed'\]/.test(migrationCode)
  );
  check(
    'миграция 023: предмет за полный сбор выдаётся той же транзакцией',
    /grant_item\(p_player_id, p_item_key, 'daily', 'full_collect'\)/.test(migrationCode)
  );
  check(
    'миграция 023: суммы Чипов/Crypto ограничены сверху',
    /p_chips > 10/.test(migrationCode) && /p_crypto > 5/.test(migrationCode)
  );
  check(
    'миграция 023: анониму и authenticated закрыт доступ',
    /REVOKE ALL ON FUNCTION public\.claim_daily_goal[\s\S]{0,200}FROM PUBLIC, anon, authenticated/.test(
      migrationCode
    ) &&
      /GRANT EXECUTE ON FUNCTION public\.claim_daily_goal[\s\S]{0,200}TO service_role/.test(migrationCode)
  );
  check(
    'миграция 023: ничего не удаляет и не обнуляет прогресс',
    !/\bTRUNCATE\b/i.test(migrationCode) &&
      !/\bDELETE\s+FROM\s+public\.(players|cards|player_items|item_drops)\b/i.test(migrationCode) &&
      !/\bDROP\s+(TABLE|COLUMN)\b/i.test(migrationCode)
  );
  check(
    'миграция 023: добавлено в CHECK только source, данные не пересчитываются',
    !/UPDATE\s+public\.(players|item_drops)\b/i.test(migrationCode.replace(/UPDATE public\.players\s+SET chips[\s\S]*?WHERE id = p_player_id/, ''))
  );
  const readme = fs.readFileSync(path.join(REPO, 'supabase/migrations/README.md'), 'utf8');
  check('миграция 023: описана в README миграций', readme.includes('023: «Цели дня»'));

  const engineSource = fs.readFileSync(path.join(REPO, 'api/_lib/gameEngine.ts'), 'utf8');
  check('сервер: сбор идёт через RPC claim_daily_goal', engineSource.includes("sb.rpc('claim_daily_goal'"));
  const rpcIndex = engineSource.indexOf("sb.rpc('claim_daily_goal'");
  const afterRpc = engineSource.slice(rpcIndex, engineSource.indexOf('export async function', rpcIndex));
  check(
    'сервер: после RPC нет полного сохранения снимка (иначе откат claimed)',
    rpcIndex > 0 && !afterRpc.includes('savePlayerCore('),
    afterRpc.includes('savePlayerCore(') ? 'найден savePlayerCore после RPC' : 'ok'
  );
  check(
    'сервер: прогресс двигают только проверенные серверные хендлеры',
    [
      /incrementDailyGoalProgress\(record, 'taps', validClicks\)/,
      /incrementDailyGoalProgress\(record, 'hacks', 1\)/,
      /incrementDailyGoalProgress\(record, 'contracts', 1\)/,
      /incrementDailyGoalProgress\(record, 'cpu', entryCost\.energy\)/,
      /incrementDailyGoalProgress\(record, 'cpu', difficulty\.cost\)/,
      /incrementDailyGoalProgress\(record, 'item_use', 1\)/,
      /incrementDailyGoalProgress\(record, 'data', tapDataGain\)/,
    ].every((pattern) => pattern.test(engineSource))
  );
  check(
    'сервер: прогресс не принимается из тела запроса',
    !/body\.(progress|goalProgress|earned|claimed)/.test(
      fs.readFileSync(path.join(REPO, 'api/_routes/daily-goals.ts'), 'utf8')
    )
  );
  check(
    'маршрут: /api/daily-goals зарегистрирован в едином роутере',
    fs.readFileSync(path.join(REPO, 'api/_router.ts'), 'utf8').includes("'daily-goals': dailyGoals")
  );

  // ════════════════════════════════════════════════════════════════════════
  // 10. UI
  // ════════════════════════════════════════════════════════════════════════
  const sectionSource = fs.readFileSync(path.join(REPO, 'src/components/DailyGoalsSection.tsx'), 'utf8');
  const sectionMarkup = sectionSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const tasksSource = fs.readFileSync(path.join(REPO, 'src/pages/TasksPage.tsx'), 'utf8');
  const quickLinks = fs.readFileSync(path.join(REPO, 'src/components/DeskQuickLinks.tsx'), 'utf8');
  check(
    'UI: секция «Цели дня» подключена на экран «Задания»',
    sectionMarkup.includes('data-qa="daily-goals"') && tasksSource.includes('<DailyGoalsSection')
  );
  check(
    'UI: у карточки data-qa daily-goal-<key>',
    /data-qa=\{`daily-goal-\$\{goal\.key\}`\}/.test(sectionMarkup)
  );
  check(
    'UI: у кнопки сбора data-qa daily-claim-<key>',
    /data-qa=\{`daily-claim-\$\{goal\.key\}`\}/.test(sectionMarkup)
  );
  check(
    'UI: кнопка активна только при 100% и не забрана',
    /disabled=\{!ready \|\| claimed \|\| pending\}/.test(sectionMarkup)
  );
  check(
    'UI: есть прогресс-бар N/M и статусы «Готово к сбору» / «Получено»',
    sectionMarkup.includes('scaleX(') &&
      sectionMarkup.includes('Готово к сбору') &&
      sectionMarkup.includes('Получено')
  );
  check('UI: тап-таргет кнопки ≥ 44 px', sectionMarkup.includes('min-h-[44px]'));
  check('UI: без хардкод-hex (только токены темы)', !/#[0-9a-fA-F]{3,8}\b/.test(sectionMarkup));
  check(
    'UI: индикатор готовой награды — точка на плитке «Задания», без новой кнопки в HUD',
    quickLinks.includes('data-qa={`${qa}-dot`}') &&
      quickLinks.includes('goalsReady') &&
      !/daily-goal/i.test(fs.readFileSync(path.join(REPO, 'src/components/TopHud.tsx'), 'utf8'))
  );
  check(
    'UI: секция не считает прогресс сама — только читает серверные target/progress',
    sectionMarkup.includes('goal.progress >= goal.target') &&
      !/setProgress|localProgress|progress\s*\+\s*1/.test(sectionMarkup)
  );
  check(
    'сборка: экран «Задания» остаётся ленивым чанком',
    /const TasksPage = React\.lazy/.test(fs.readFileSync(path.join(REPO, 'src/App.tsx'), 'utf8'))
  );

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
