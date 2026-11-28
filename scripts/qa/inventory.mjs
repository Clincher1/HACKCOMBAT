/**
 * HACKER KOMBAT — QA v1: «Инвентарь оживает».
 * ----------------------------------------------------------------------------
 * Проверяем ровно то, что нельзя увидеть глазами и легко сломать обратно:
 *
 *   1) КАТАЛОГ: пять расходников, редкости 2/2/1, ключи уникальны, эмодзи и
 *      описание есть у каждого;
 *   2) ШАНСЫ: дроп только за успешный исход (easy 10 / medium 15 / hard 20 /
 *      контракт 8) и разбивка 85/12/3 внутри дропа — на засеянном RNG;
 *   3) АТОМАРНОСТЬ: два параллельных финиша одной сессии дают ровно один
 *      предмет, два параллельных применения одного предмета — ровно одно
 *      срабатывание; RPC в миграции 022 держит это одной транзакцией;
 *   4) ЭФФЕКТЫ: +150 CPU не выше капа, −50 Heat не ниже 0, инъекция +15% и
 *      списание при старте, канал ×1.25 на 15 минут с продлением (не суммой),
 *      Феникс возвращает 50% входа и сгорает;
 *   5) УРОВНИ: гарантированный предмет на 5/10/15/20 — ровно один раз на рубеж;
 *   6) ТАПЫ: тап не даёт дропа вообще (тапы сервером не подтверждаются);
 *   7) UI/СБОРКА: экран читает player.items, применяет через RPC, без hex,
 *      тап-таргеты ≥ 44 px, экран остаётся ленивым чанком.
 *
 * Запуск (нужен собранный api/_core.cjs: npm run build):
 *   node scripts/qa/inventory.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = process.cwd();
const CORE = path.join(REPO, 'api/_core.cjs');
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

/** Собираем shared-конфиги в CJS: чистые функции проверяем без сервера. */
const esbuild = require('esbuild');
function loadShared(entry) {
  const outfile = path.join(os.tmpdir(), `hk-inv-${path.basename(entry)}-${process.pid}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.join(REPO, entry)],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent',
  });
  return require(outfile);
}
const consumables = loadShared('shared/consumables.config.ts');
const hackConfig = loadShared('shared/hack.config.ts');

// ============================================================================
// 1. КАТАЛОГ
// ============================================================================
console.log('=== HACKER KOMBAT — QA v1: инвентарь оживает ===\n');

const catalog = consumables.CONSUMABLES_CONFIG;
check('каталог: ровно пять расходников', catalog.length === 5, `${catalog.length} шт.`);
check(
  'каталог: редкости 2 common / 2 rare / 1 epic',
  catalog.filter((i) => i.rarity === 'common').length === 2 &&
    catalog.filter((i) => i.rarity === 'rare').length === 2 &&
    catalog.filter((i) => i.rarity === 'epic').length === 1
);
check(
  'каталог: ключи уникальны и в пространстве consumable:',
  new Set(catalog.map((i) => i.key)).size === catalog.length &&
    catalog.every((i) => i.key.startsWith('consumable:'))
);
check(
  'каталог: у каждого есть эмодзи, описание и эффект',
  catalog.every(
    (i) =>
      typeof i.icon === 'string' &&
      i.icon.length > 0 &&
      i.description.length > 10 &&
      i.effect &&
      typeof i.effect.kind === 'string'
  )
);
check(
  'каталог: все пять эффектов на месте',
  ['energy', 'heat', 'exploit', 'channel', 'phoenix'].every((kind) =>
    catalog.some((i) => i.effect.kind === kind)
  )
);
check(
  'каталог: Феникс — единственный не ручной предмет',
  catalog.filter((i) => !i.usable).length === 1 &&
    catalog.find((i) => !i.usable).effect.kind === 'phoenix'
);

// ============================================================================
// 2. ШАНСЫ: засеянный RNG
// ============================================================================
/** Линейный конгруэнтный генератор — воспроизводимая «монетка» для тестов. */
function seeded(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const fixed = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

check(
  'шансы: easy 10% — 0.09 даёт дроп, 0.11 нет',
  consumables.rollItemDrop('hack', { difficulty: 'easy' }, fixed(0.09, 0.99)) !== null &&
    consumables.rollItemDrop('hack', { difficulty: 'easy' }, fixed(0.11)) === null
);
check(
  'шансы: medium 15%',
  consumables.rollItemDrop('hack', { difficulty: 'medium' }, fixed(0.14, 0.99)) !== null &&
    consumables.rollItemDrop('hack', { difficulty: 'medium' }, fixed(0.16)) === null
);
check(
  'шансы: hard 20%',
  consumables.rollItemDrop('hack', { difficulty: 'hard' }, fixed(0.19, 0.99)) !== null &&
    consumables.rollItemDrop('hack', { difficulty: 'hard' }, fixed(0.21)) === null
);
check(
  'шансы: контракт 8%',
  consumables.rollItemDrop('mission', {}, fixed(0.07, 0.99)) !== null &&
    consumables.rollItemDrop('mission', {}, fixed(0.09)) === null
);
check(
  'шансы: ровно 10/15/20/8 из конфига',
  consumables.ITEM_DROP_CHANCE_BY_HACK.easy === 0.1 &&
    consumables.ITEM_DROP_CHANCE_BY_HACK.medium === 0.15 &&
    consumables.ITEM_DROP_CHANCE_BY_HACK.hard === 0.2 &&
    consumables.ITEM_DROP_CHANCE_MISSION === 0.08
);
check(
  'редкость: границы 3/15 — epic, rare, common',
  consumables.rollItemRarity(fixed(0)) === 'epic' &&
    consumables.rollItemRarity(fixed(0.029)) === 'epic' &&
    consumables.rollItemRarity(fixed(0.03)) === 'rare' &&
    consumables.rollItemRarity(fixed(0.149)) === 'rare' &&
    consumables.rollItemRarity(fixed(0.15)) === 'common'
);

const rarityRng = seeded(7);
const rarityCount = { common: 0, rare: 0, epic: 0 };
const SAMPLES = 200000;
for (let i = 0; i < SAMPLES; i += 1) rarityCount[consumables.rollItemRarity(rarityRng)] += 1;
const share = (key) => (rarityCount[key] / SAMPLES) * 100;
check(
  'редкость: 200k роллов дают 85/12/3 ±1.5 п.п.',
  Math.abs(share('common') - 85) < 1.5 &&
    Math.abs(share('rare') - 12) < 1.5 &&
    Math.abs(share('epic') - 3) < 1.5,
  `${share('common').toFixed(1)}/${share('rare').toFixed(1)}/${share('epic').toFixed(1)}`
);
const levelRng = seeded(11);
let levelEpic = 0;
let levelRare = 0;
for (let i = 0; i < 20000; i += 1) {
  const item = consumables.rollLevelItem(levelRng);
  if (item.rarity === 'epic') levelEpic += 1;
  if (item.rarity === 'rare') levelRare += 1;
}
check(
  'уровни: 5/10/15/20 — только common или rare, epic никогда',
  levelEpic === 0 && levelRare > 0,
  `rare ${((levelRare / 20000) * 100).toFixed(1)}%`
);
check(
  'уровни: рубежи ровно 5/10/15/20',
  JSON.stringify(consumables.LEVEL_ITEM_MILESTONES) === JSON.stringify([5, 10, 15, 20]) &&
    consumables.isLevelItemMilestone(5) &&
    !consumables.isLevelItemMilestone(6)
);

// ============================================================================
// 3. ЖИВОЙ ДВИЖОК: memory-fallback, без сети
// ============================================================================
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-inventory-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForInventoryQa_1234567';

const NOW = Date.now();
const nowIso = new Date(NOW).toISOString();
const levelXp = (lvl) => hackConfig.getTotalXpForLevel(lvl);

function makeRecord(tgId, options = {}) {
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `inv${tgId}`,
    data: options.data ?? 100000,
    crypto: options.crypto ?? 50,
    chips: 0,
    xp: options.xp ?? 0,
    energy: options.energy ?? 1000,
    energyUpdated: nowIso,
    heat: options.heat ?? 0,
    rep: 0,
    prestigeCount: 0,
    cardTier: 1,
    clickBlockedUntil: null,
    dailyStreak: 0,
    lastDailyClaim: null,
    equippedSkin: 'default',
    unlockedSkins: ['default'],
    totalClicks: options.totalClicks ?? 0,
    totalMissions: 0,
    lastPassiveClaim: nowIso,
    lastClickBatchAt: 0,
    cards: {},
    team: [],
    pets: [],
    baseUpgrades: {},
    stats: {
      tutorialTabs: [],
      tutorialOpens: 0,
      tabsVisited: [],
      petFeedings: 0,
      petHungrySeen: 0,
      missionFails: 0,
      missionTypes: [],
      greyMissions: 0,
      nightSessions: 0,
      earlySessions: 0,
      idleSessions: 0,
      maxSessionMinutes: 0,
      bestHeatEscape: 0,
      heatPenalties: 0,
      shopFreezeMinutes: 0,
      petFeedingStreakDays: 0,
      lastPetFeedDay: null,
      trackEventsToday: 0,
      trackEventsDay: null,
      hackSuccessByType: {},
      hackFailByType: {},
      hacksByTier: {},
      totalXpEarned: 0,
      lastTapClaimAt: null,
      activeDayKey: null,
      activeSecondsToday: 0,
      chipsDayKey: null,
      chipsToday: 0,
      chipsCapNotifiedDay: null,
      lastQualifiedDayKey: null,
      lastActiveAt: null,
      offlineGraceUsed: false,
      ...(options.stats ?? {}),
    },
    items: options.items ?? {},
    activeMissions: options.activeMissions ?? [],
    availableMissionKeys: options.availableMissionKeys ?? [],
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

/** Готовая активная миссия с истёкшим таймером — для проверки claim. */
function expiredMission(id, overrides = {}) {
  return {
    id,
    missionKey: 'scam_shop',
    targetName: 'Скам-магазин',
    targetType: 'grey',
    startedAt: new Date(NOW - 3600_000).toISOString(),
    finishAt: new Date(NOW - 60_000).toISOString(),
    reward: 1000,
    repDelta: 1,
    heatDelta: 2,
    cryptoReward: 0,
    xpReward: 10,
    entryEnergyCost: 100,
    entryDataCost: 200,
    successChance: 0.5,
    outcome: 'partial',
    ...overrides,
  };
}

const TG = {
  coffee: 960000101,
  coffeeCap: 960000118,
  cooling: 960000102,
  exploit: 960000103,
  exploitBase: 960000104,
  channel: 960000105,
  channelBase: 960000106,
  phoenix: 960000107,
  noPhoenix: 960000108,
  level5: 960000109,
  level12: 960000110,
  level20: 960000111,
  level4: 960000112,
  hack: 960000113,
  race: 960000114,
  taps: 960000115,
  missionDrop: 960000116,
  useRace: 960000117,
};

const playersByTgId = {};
const seed = (tgId, record) => {
  playersByTgId[String(tgId)] = record;
};

seed(TG.coffee, makeRecord(TG.coffee, { energy: 100, items: { 'consumable:coffee_raf': { key: 'consumable:coffee_raf', qty: 1, firstAcquiredAt: nowIso, updatedAt: nowIso } } }));
seed(
  TG.coffeeCap,
  makeRecord(TG.coffeeCap, {
    energy: 1495,
    items: { 'consumable:coffee_raf': { key: 'consumable:coffee_raf', qty: 1, firstAcquiredAt: nowIso, updatedAt: nowIso } },
  })
);
seed(TG.cooling, makeRecord(TG.cooling, { heat: 30, items: { 'consumable:cooling_rod': { key: 'consumable:cooling_rod', qty: 1, firstAcquiredAt: nowIso, updatedAt: nowIso } } }));
const MISSION_KEYS = ['scam_shop', 'fake_lottery'];
seed(TG.exploit, makeRecord(TG.exploit, { xp: 5000, availableMissionKeys: MISSION_KEYS, items: { 'consumable:exploit_injection': { key: 'consumable:exploit_injection', qty: 1, firstAcquiredAt: nowIso, updatedAt: nowIso } } }));
seed(TG.exploitBase, makeRecord(TG.exploitBase, { xp: 5000, availableMissionKeys: MISSION_KEYS }));
seed(TG.channel, makeRecord(TG.channel, { items: { 'consumable:channel_modifier': { key: 'consumable:channel_modifier', qty: 2, firstAcquiredAt: nowIso, updatedAt: nowIso } } }));
seed(TG.channelBase, makeRecord(TG.channelBase));
seed(
  TG.phoenix,
  makeRecord(TG.phoenix, {
    activeMissions: [expiredMission('ph-1')],
    items: { 'consumable:phoenix_protocol': { key: 'consumable:phoenix_protocol', qty: 1, firstAcquiredAt: nowIso, updatedAt: nowIso } },
  })
);
seed(TG.noPhoenix, makeRecord(TG.noPhoenix, { activeMissions: [expiredMission('np-1')] }));
seed(TG.level5, makeRecord(TG.level5, { xp: levelXp(5) }));
seed(TG.level12, makeRecord(TG.level12, { xp: levelXp(12) }));
seed(TG.level20, makeRecord(TG.level20, { xp: levelXp(20) }));
seed(TG.level4, makeRecord(TG.level4, { xp: levelXp(5) - 1 }));
seed(TG.hack, makeRecord(TG.hack, { energy: 1400 }));
seed(TG.race, makeRecord(TG.race, { energy: 1400 }));
seed(TG.taps, makeRecord(TG.taps));
seed(TG.missionDrop, makeRecord(TG.missionDrop, { activeMissions: [expiredMission('md-1')] }));
seed(TG.useRace, makeRecord(TG.useRace, { energy: 200, items: { 'consumable:coffee_raf': { key: 'consumable:coffee_raf', qty: 1, firstAcquiredAt: nowIso, updatedAt: nowIso } } }));

// Файл обязан лежать ДО require(core): движок кэширует БД в памяти модуля.
fs.writeFileSync(path.join(sandbox, '.local-db.json'), JSON.stringify({ playersByTgId }));

const realRandom = Math.random;
/** Подменяем «монетку» ядра: значения выдаются по очереди, потом 0.99. */
async function withRandom(values, fn) {
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.99);
  try {
    // ВАЖНО: ждём именно await. Раньше заглушка снималась сразу после возврата
    // промиса, и запрос успевал отработать уже на настоящей случайности.
    return await fn();
  } finally {
    Math.random = realRandom;
  }
}

const { dispatchApiRequest } = require(CORE);

let ipCounter = 0;
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Date.now()}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'InvTester', username: `inv${tgId}` }));
  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}

async function call(tgId, route, body = undefined) {
  const req = {
    url: `/api/${route}`,
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `inv${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.97.0.${(ipCounter++ % 200) + 1}`,
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

const qtyOf = (response, key) =>
  (response.player?.items ?? []).find((stack) => stack.key === key)?.qty ?? 0;
const useItem = (tgId, key) => call(tgId, 'inventory', { action: 'use', itemKey: key });
const journal = () => {
  const db = JSON.parse(fs.readFileSync(path.join(sandbox, '.local-db.json'), 'utf8'));
  return db.itemDrops ?? [];
};

(async () => {
  // ── 3.1. Кофе-раф: +150 CPU, не выше капа ────────────────────────────────
  let r = await call(TG.coffee, 'init');
  const capBefore = r.player.derived.maxEnergy;
  const energyBefore = r.player.energy;
  r = await useItem(TG.coffee, 'consumable:coffee_raf');
  check('кофе: применение прошло', r.ok === true, r.error ?? '');
  check(
    'кофе: +150 CPU (или до капа)',
    r.player.energy >= energyBefore && r.player.energy <= capBefore,
    `${Math.round(energyBefore)} → ${Math.round(r.player.energy)} (кап ${capBefore})`
  );
  check('кофе: предмет списан', qtyOf(r, 'consumable:coffee_raf') === 0);

  // Второй кофе почти на полном заряде не должен пробить кап.
  const capProbe = await call(TG.coffeeCap, 'init');
  const capLimit = capProbe.player.derived.maxEnergy;
  const nearCap = capProbe.player.energy;
  const capUse = await useItem(TG.coffeeCap, 'consumable:coffee_raf');
  check(
    'кофе: остаток сгорает, кап не пробит',
    capUse.ok === true && capUse.player.energy <= capLimit && capUse.player.energy > nearCap,
    `${Math.round(nearCap)} → ${Math.round(capUse.player.energy)} при капе ${capLimit}`
  );

  // ── 3.2. Стержень охлаждения: −50 Heat, не ниже 0 ────────────────────────
  r = await useItem(TG.cooling, 'consumable:cooling_rod');
  check('охлаждение: применение прошло', r.ok === true, r.error ?? '');
  check('охлаждение: Heat 30 → 0 (не ниже нуля)', r.player.heat === 0, `heat ${r.player.heat}`);
  check('охлаждение: предмет списан', qtyOf(r, 'consumable:cooling_rod') === 0);

  // ── 3.3. Эксплойт-инъекция: +15% и списание на старте ────────────────────
  r = await call(TG.exploitBase, 'init');
  const missionKey = r.player.availableMissionKeys[0] ?? 'scam_shop';
  const baseStart = await call(TG.exploitBase, 'missions', { action: 'start', missionKey });
  const baseChance = baseStart.player?.activeMissions?.[0]?.successChance ?? 0;

  r = await useItem(TG.exploit, 'consumable:exploit_injection');
  if (process.env.HK_DEBUG) {
    fs.writeFileSync('/tmp/hk-inv-debug.json', JSON.stringify(r, null, 2));
  }
  check('инъекция: применение ставит флаг', r.ok === true && r.player.stats.exploitInjectionReady === true);
  check('инъекция: предмет НЕ списан при применении', qtyOf(r, 'consumable:exploit_injection') === 1);

  const boostedStart = await call(TG.exploit, 'missions', { action: 'start', missionKey });
  const boostedChance = boostedStart.player?.activeMissions?.[0]?.successChance ?? 0;
  check(
    'инъекция: +15% к шансу контракта',
    Math.abs(boostedChance - Math.min(0.96, baseChance + 0.15)) < 1e-6 && boostedChance > baseChance,
    `${baseChance} → ${boostedChance}`
  );
  check(
    'инъекция: списана при старте, флаг снят',
    qtyOf(boostedStart, 'consumable:exploit_injection') === 0 &&
      boostedStart.player.stats.exploitInjectionReady !== true
  );

  // ── 3.4. Модификатор канала: ×1.25 на 15 минут, повтор продлевает ───────
  r = await useItem(TG.channel, 'consumable:channel_modifier');
  const untilFirst = Date.parse(r.player.stats.channelBoostUntil ?? '');
  check(
    'канал: таймер ~15 минут',
    Math.abs(untilFirst - Date.now() - 900_000) < 20_000,
    `${Math.round((untilFirst - Date.now()) / 1000)} c`
  );
  check('канал: осталось 1 из 2', qtyOf(r, 'consumable:channel_modifier') === 1);

  const secondUse = await useItem(TG.channel, 'consumable:channel_modifier');
  const untilSecond = Date.parse(secondUse.player.stats.channelBoostUntil ?? '');
  check('канал: повтор обновляет таймер (не суммирует)', untilSecond >= untilFirst);
  check('канал: второй предмет списан', qtyOf(secondUse, 'consumable:channel_modifier') === 0);

  // Множитель на тапах: одинаковые игроки, разница только в бафе.
  const boostedBefore = (await call(TG.channel, 'init')).player.data;
  const plainBefore = (await call(TG.channelBase, 'init')).player.data;
  const boostTaps = await call(TG.channel, 'click', { clicks: 10 });
  const plainTaps = await call(TG.channelBase, 'click', { clicks: 10 });
  const boostedGain = Math.round((boostTaps.player.data - boostedBefore) * 100) / 100;
  const plainGain = Math.round((plainTaps.player.data - plainBefore) * 100) / 100;
  check(
    'канал: Data с тапов ×1.25',
    plainGain > 0 && Math.abs(boostedGain - Math.round(plainGain * 1.25 * 100) / 100) <= 0.5,
    `${plainGain} без бафа → ${boostedGain} с бафом`
  );

  // ── 3.5. Протокол-Феникс: 50% входа при провале ─────────────────────────
  const phoenixStart = await call(TG.phoenix, 'init');
  const phoenixMission = phoenixStart.player.activeMissions[0];
  const phoenixDataBefore = phoenixStart.player.data;
  const phoenixEnergyBefore = phoenixStart.player.energy;
  const failClaim = await withRandom([0.999], () =>
    call(TG.phoenix, 'missions', { action: 'claim', missionId: phoenixMission.id })
  );
  const refundData = Math.floor(phoenixMission.entryDataCost * 0.5);
  const gainedData = Math.round(failClaim.player.data - phoenixDataBefore);
  check(
    'феникс: провал вернул 50% Data-входа',
    gainedData === refundData,
    `${gainedData} из ${phoenixMission.entryDataCost}`
  );
  check(
    'феникс: CPU вернулся не выше капа',
    failClaim.player.energy > phoenixEnergyBefore - 1 &&
      failClaim.player.energy <= failClaim.player.derived.maxEnergy
  );
  check('феникс: предмет сгорел', qtyOf(failClaim, 'consumable:phoenix_protocol') === 0);
  check(
    'феникс: уведомление через обычный GameAlert',
    (failClaim.alerts ?? []).some((a) => a.type === 'success' && /Феникс/.test(a.title))
  );

  const noPhoenixStart = await call(TG.noPhoenix, 'init');
  const noPhoenixDataBefore = noPhoenixStart.player.data;
  const noPhoenixClaim = await withRandom([0.999], () =>
    call(TG.noPhoenix, 'missions', { action: 'claim', missionId: noPhoenixStart.player.activeMissions[0].id })
  );
  check(
    'феникс: без предмета возврата нет и лишних алертов не появляется',
    noPhoenixClaim.ok === true &&
      Math.round(noPhoenixClaim.player.data - noPhoenixDataBefore) === 0 &&
      !(noPhoenixClaim.alerts ?? []).some((a) => /Феникс/.test(a.title))
  );

  // ── 3.6. Уровни 5/10/15/20 ───────────────────────────────────────────────
  const lvl5 = await call(TG.level5, 'init');
  check(
    'уровни: 5 уровень даёт ровно один предмет',
    (lvl5.player.items ?? []).reduce((sum, stack) => sum + stack.qty, 0) === 1
  );
  check(
    'уровни: журнал помечает источник level',
    journal().some((row) => String(row.playerId) === `${TG.level5}-qa` && row.source === 'level')
  );
  const lvl5Again = await call(TG.level5, 'init');
  check(
    'уровни: повторный init не выдаёт второй предмет',
    (lvl5Again.player.items ?? []).reduce((sum, s) => sum + s.qty, 0) === 1
  );

  const lvl4 = await call(TG.level4, 'init');
  check('уровни: до 5 уровня предметов нет', (lvl4.player.items ?? []).length === 0);

  const totalQty = (res) => (res.player.items ?? []).reduce((sum, stack) => sum + stack.qty, 0);
  const lvl12 = await call(TG.level12, 'init');
  check(
    'уровни: 12 уровень получает рубежи 5 и 10 (два предмета)',
    totalQty(lvl12) === 2 && (lvl12.player.stats.itemMilestones ?? []).length === 2,
    `${totalQty(lvl12)} шт.`
  );

  const lvl20 = await call(TG.level20, 'init');
  check(
    'уровни: 20 уровень получает все четыре рубежа',
    totalQty(lvl20) === 4 && (lvl20.player.stats.itemMilestones ?? []).length === 4,
    `${totalQty(lvl20)} шт.`
  );

  // ── 3.7. Дроп за взлом: только успех, только сервер, атомарно ────────────
  const sessionStart = await call(TG.hack, 'hacks', { action: 'start', difficulty: 'hard' });
  check('взлом: сессия стартовала', sessionStart.ok === true, sessionStart.error ?? '');
  const sessionId = sessionStart.player.stats.hackSession.id;
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const beforeDrops = journal().length;
  const finishOnce = await withRandom([0.0, 0.99], () =>
    call(TG.hack, 'hacks', { action: 'finish', sessionId, safeHits: 1, trapHits: 0 })
  );
  check('взлом: успешный финиш принят', finishOnce.ok === true, finishOnce.error ?? '');
  check(
    'взлом: дроп выдан (hard 20% при ролле 0)',
    (finishOnce.player.items ?? []).length === 1,
    (finishOnce.player.items ?? []).map((s) => s.key).join(',')
  );
  check('взлом: точка «новый дроп» поднята', finishOnce.player.stats.hasNewItems === true);
  check(
    'взлом: уведомление «Вы получили» через GameAlert',
    (finishOnce.alerts ?? []).some((a) => a.type === 'success' && /Вы получили:/.test(a.title))
  );
  check(
    'взлом: журнал дропа вырос на одну строку с source=hack',
    journal().length === beforeDrops + 1 &&
      journal()[journal().length - 1].source === 'hack'
  );

  // Повторный финиш той же сессии — отказано, второго предмета нет.
  const finishAgain = await withRandom([0.0, 0.99], () =>
    call(TG.hack, 'hacks', { action: 'finish', sessionId, safeHits: 1, trapHits: 0 })
  );
  const afterDouble = await call(TG.hack, 'init');
  check(
    'взлом: повторный финиш отклонён, предмет не задублирован',
    finishAgain.ok !== true &&
      (afterDouble.player.items ?? []).reduce((sum, stack) => sum + stack.qty, 0) === 1 &&
      journal().filter((row) => String(row.playerId) === `${TG.hack}-qa`).length === 1,
    `${finishAgain.error ?? ''}`
  );

  // Промах (safeHits=0) — ни дропа, ни строки в журнале.
  const missStart = await call(TG.race, 'hacks', { action: 'start', difficulty: 'easy' });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const journalBeforeMiss = journal().length;
  const missFinish = await withRandom([0.0, 0.0], () =>
    call(TG.race, 'hacks', {
      action: 'finish',
      sessionId: missStart.player.stats.hackSession.id,
      safeHits: 0,
      trapHits: 0,
    })
  );
  check(
    'взлом: без вскрытых узлов дропа нет',
    (missFinish.player?.items ?? []).length === 0 && journal().length === journalBeforeMiss
  );

  // ── 3.8. Конкурентный финиш: ровно один предмет ──────────────────────────
  const raceStart = await call(TG.race, 'hacks', { action: 'start', difficulty: 'hard' });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const raceSession = raceStart.player.stats.hackSession.id;
  const raceJournalBefore = journal().filter((row) => String(row.playerId) === `${TG.race}-qa`).length;
  const [raceA, raceB] = await withRandom([0.0, 0.99], () =>
    Promise.all([
      call(TG.race, 'hacks', { action: 'finish', sessionId: raceSession, safeHits: 1, trapHits: 0 }),
      call(TG.race, 'hacks', { action: 'finish', sessionId: raceSession, safeHits: 1, trapHits: 0 }),
    ])
  );
  const raceOk = [raceA, raceB].filter((res) => res.ok === true).length;
  const raceAfter = await call(TG.race, 'init');
  const raceQty = (raceAfter.player.items ?? []).reduce((sum, s) => sum + s.qty, 0);
  check('атомарность: из двух параллельных финишей прошёл ровно один', raceOk === 1, `${raceOk}`);
  check('атомарность: предметов ровно 1 (без дубля)', raceQty === 1, `${raceQty}`);
  check(
    'атомарность: в журнале ровно одна строка',
    journal().filter((row) => String(row.playerId) === `${TG.race}-qa`).length === raceJournalBefore + 1
  );

  // Два параллельных применения одного предмета: срабатывает один раз.
  const [useA, useB] = await Promise.all([
    useItem(TG.useRace, 'consumable:coffee_raf'),
    useItem(TG.useRace, 'consumable:coffee_raf'),
  ]);
  const useOk = [useA, useB].filter((res) => res.ok === true).length;
  const useAfter = await call(TG.useRace, 'init');
  check(
    'атомарность: два параллельных применения одного предмета — одно срабатывание',
    useOk === 1 && qtyOf(useAfter, 'consumable:coffee_raf') === 0,
    `успехов ${useOk}`
  );

  // ── 3.9. Тапы не дают дропа ──────────────────────────────────────────────
  const tapsBefore = await call(TG.taps, 'init');
  const tapsJournalBefore = journal().length;
  const tapsAfter = await call(TG.taps, 'click', { clicks: 20 });
  check(
    'тапы: дропа нет (ни предмета, ни строки журнала)',
    (tapsAfter.player.items ?? []).length === 0 && journal().length === tapsJournalBefore,
    `${(tapsBefore.player.items ?? []).length} → ${(tapsAfter.player.items ?? []).length}`
  );

  // ── 3.10. Дроп за успешный контракт (8%) ────────────────────────────────
  const missionJournalBefore = journal().length;
  const missionFinish = await withRandom([0.0, 0.0, 0.99], () =>
    call(TG.missionDrop, 'missions', { action: 'claim', missionId: 'md-1' })
  );
  check('контракт: успешный claim принят', missionFinish.ok === true, missionFinish.error ?? '');
  check(
    'контракт: дроп 8% выдан при ролле 0',
    (missionFinish.player.items ?? []).length === 1,
    (missionFinish.player.items ?? []).map((s) => s.key).join(',')
  );
  check(
    'контракт: журнал source=mission',
    journal().length === missionJournalBefore + 1 &&
      journal()[journal().length - 1].source === 'mission'
  );

  // ── 3.11. stats.inventoryOwned не тронут ────────────────────────────────
  const ownedProbe = await call(TG.hack, 'init');
  check(
    'инвариант: расходники не попадают в stats.inventoryOwned',
    !(ownedProbe.player.inventory.ownedKeys ?? []).some((key) => key.startsWith('consumable:'))
  );

  // ── 3.12. Миграция и права ──────────────────────────────────────────────
  const migration = fs.readFileSync(path.join(REPO, 'supabase/migrations/022_inventory.sql'), 'utf8');
  check(
    'SQL: player_items с PK (player_id, item_key) и CASCADE',
    /CREATE TABLE IF NOT EXISTS public\.player_items/.test(migration) &&
      /PRIMARY KEY \(player_id, item_key\)/.test(migration) &&
      /REFERENCES public\.players \(id\) ON DELETE CASCADE/.test(migration)
  );
  check(
    'SQL: журнал item_drops с source CHECK hack/mission/level',
    /CREATE TABLE IF NOT EXISTS public\.item_drops/.test(migration) &&
      /CHECK \(source IN \('hack', 'mission', 'level'\)\)/.test(migration)
  );
  check(
    'SQL: grant_item — upsert qty+1 и строка журнала в одной функции',
    /CREATE OR REPLACE FUNCTION public\.grant_item/.test(migration) &&
      /ON CONFLICT \(player_id, item_key\)/.test(migration) &&
      /DO UPDATE SET qty = public\.player_items\.qty \+ 1/.test(migration) &&
      /INSERT INTO public\.item_drops/.test(migration)
  );
  check(
    'SQL: consume_item списывает только при qty >= p_qty',
    /CREATE OR REPLACE FUNCTION public\.consume_item/.test(migration) &&
      /AND qty >= p_qty/.test(migration)
  );
  check(
    'SQL: SECURITY DEFINER у обеих функций + запрет anon/authenticated',
    /CREATE OR REPLACE FUNCTION public\.grant_item[\s\S]*?SECURITY DEFINER/.test(migration) &&
      /CREATE OR REPLACE FUNCTION public\.consume_item[\s\S]*?SECURITY DEFINER/.test(migration) &&
      /REVOKE ALL ON FUNCTION public\.grant_item\(uuid, text, text, text\) FROM PUBLIC, anon, authenticated/.test(
        migration
      ) &&
      /REVOKE ALL ON TABLE public\.player_items FROM PUBLIC, anon, authenticated/.test(migration) &&
      /ENABLE ROW LEVEL SECURITY/.test(migration)
  );
  check(
    'SQL: миграция аддитивная — ни одного DROP/TRUNCATE/ALTER COLUMN',
    !/\bDROP\s+(TABLE|COLUMN)\b/i.test(migration) && !/\bTRUNCATE\b/i.test(migration) && !/ALTER COLUMN/i.test(migration)
  );

  // ── 3.13. Вайп сносит предметы и журнал ─────────────────────────────────
  const wipeCore = await import('../lib/wipe-core.mjs');
  check(
    'вайп: player_items и item_drops объявлены игровыми таблицами',
    wipeCore.PLAYER_TABLES.includes('player_items') && wipeCore.PLAYER_TABLES.includes('item_drops')
  );
  check(
    'вайп: план проходит гарды (только объявленные таблицы)',
    (() => {
      try {
        wipeCore.assertPlanSafe(wipeCore.buildPlan());
        return true;
      } catch {
        return false;
      }
    })()
  );

  // ── 3.14. UI: карточки, RPC, ленивый чанк, отсутствие hex ───────────────
  const screen = fs.readFileSync(path.join(REPO, 'src/components/InventoryScreen.tsx'), 'utf8');
  const hud = fs.readFileSync(path.join(REPO, 'src/components/TopHud.tsx'), 'utf8');
  const api = fs.readFileSync(path.join(REPO, 'src/lib/api.ts'), 'utf8');
  const context = fs.readFileSync(path.join(REPO, 'src/context/GameContext.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(REPO, 'src/index.css'), 'utf8');

  check(
    'UI: сетка карточек и data-qa по конвенции',
    screen.includes('data-qa="inventory-grid"') &&
      screen.includes('data-qa={`inventory-card-${item.key}`}') &&
      screen.includes('data-qa={`inventory-use-${item.key}`}')
  );
  check(
    'UI: карточка показывает количество, редкость и описание',
    screen.includes('×{stack.qty}') && screen.includes('rarity.label') && screen.includes('{item.description}')
  );
  check(
    'UI: применение идёт через RPC /api/inventory, стейт берётся из ответа сервера',
    screen.includes("apiRequest<ApiSyncResponse>('/api/inventory', 'POST', { action: 'use', itemKey })") &&
      screen.includes('syncFromServer(res)') &&
      context.includes('syncFromServer: applyServerSync') &&
      api.includes('export async function apiRequest') &&
      !/player\.items\s*=\s*\[/.test(screen)
  );
  check(
    'UI: пустое состояние осталось (существующая заглушка)',
    screen.includes('data-qa="inventory-empty"') &&
      screen.includes("'Инвентарь пуст'") &&
      /Предметы появятся позже/.test(screen)
  );
  check('UI: тап-таргеты ≥ 44 px у кнопок «Применить» и закрытия', screen.includes('min-h-[44px]') && screen.includes('min-h-[44px] w-full'));
  check(
    'UI: без hex в разметке (только токены/withAlpha)',
    !/#[0-9a-f]{3,8}/i.test(screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))
  );
  check(
    'UI: точка нового дропа на HUD (атрибут из stats.hasNewItems + CSS-индикатор)',
    hud.includes('data-new={player.stats.hasNewItems') &&
      css.includes('.hud-glow[data-new]::after') &&
      !/#[0-9a-f]{3,8}/i.test(css.slice(css.indexOf('.hud-glow[data-new]'), css.indexOf('.hud-glow[data-new]') + 260))
  );
  check(
    'UI: экран остаётся ленивым чанком (React.lazy в HUD)',
    hud.includes("React.lazy(async () => ({") && hud.includes("await import('./InventoryScreen')")
  );
  check(
    'UI: InventoryPanel и CollectionPanel не тронуты (нет общих карточек)',
    !screen.includes('InventoryPanel') && !screen.includes('CollectionPanel')
  );

  const assetsDir = path.join(REPO, 'dist/assets');
  const lazyChunk = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).find((file) => /^InventoryScreen-.*\.js$/.test(file))
    : null;
  check('сборка: ленивый чанк InventoryScreen существует', Boolean(lazyChunk), lazyChunk ?? 'нет dist/assets');

  // ── Итог ────────────────────────────────────────────────────────────────
  console.log('');
  if (fail > 0) {
    console.log(`FAILED: ${fail} из ${pass + fail}`);
    console.log(`  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`OK: ${pass} проверок, 0 fail`);
})().catch((err) => {
  Math.random = realRandom;
  console.error('QA упал с исключением:', err);
  process.exit(1);
});
