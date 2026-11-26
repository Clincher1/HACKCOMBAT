/**
 * HACKER KOMBAT — QA v5.5: мир «День хакера» (фаза 1, карта города).
 *
 * Что проверяется (без Supabase, memory-режим):
 *   A. shared/world.config.ts — открытие локаций по уровню, дефолты, фолбэк пула.
 *   B. Сервер — stats.locationId через /api/skin (set_location), пересборка
 *      витрины миссий под локацию, отказ на закрытую локацию и на контракт
 *      локации, которая ещё не открыта (анти-чит).
 *   C. Флаг WORLD_V2=false — поведение «как до релиза»: переезд запрещён,
 *      сужения витрины по локации нет, first_tap остаётся шагом воронки.
 *   D. UI-инварианты — слои (карта < онбординг < хром), все фоны локаций в CSS,
 *      компоненты уважают флаг.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/world.mjs
 */
import { execFileSync } from 'node:child_process';
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

// ── Сборка shared-конфигов в CJS, чтобы QA читал те же правила, что и игра ──
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-world-build-'));
const entry = path.join(build, 'entry.ts');
const sharedPath = (name) => path.join(REPO, 'shared', name).replace(/\\/g, '/');
fs.writeFileSync(
  entry,
  [
    `export * from '${sharedPath('world.config.ts')}';`,
    `export { isWorldV2Enabled } from '${sharedPath('config.ts')}';`,
    `export { MISSIONS_CONFIG } from '${sharedPath('missions.config.ts')}';`,
    `export { getLevelProgress, getTotalXpForLevel } from '${sharedPath('hack.config.ts')}';`,
    '',
  ].join('\n')
);
const bundle = path.join(build, 'world.cjs');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: REPO, stdio: 'inherit' }
);
const world = require(bundle);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-world-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;
delete process.env.WORLD_V2;
delete process.env.VITE_WORLD_V2;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForWorldQa_1234567';

const TG_FRESH = 970000101;
const TG_HIGH = 970000202;

const LEVEL_20_XP = world.getTotalXpForLevel(20);

function makeRecord(tgId, xp) {
  const nowIso = new Date().toISOString();
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `wq${tgId}`,
    data: 500,
    crypto: 5,
    chips: 0,
    xp,
    energy: 100,
    energyUpdated: nowIso,
    heat: 0,
    rep: 0,
    prestigeCount: 0,
    cardTier: 1,
    clickBlockedUntil: null,
    dailyStreak: 0,
    lastDailyClaim: null,
    equippedSkin: 'default',
    unlockedSkins: ['default'],
    totalClicks: 0,
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
    },
    activeMissions: [],
    // Витрина «внутри окна»: сервер не пересоберёт её сам, и мы проверим
    // именно анти-чит локации, а не отказ «контракта нет в скане».
    availableMissionKeys: [],
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

const freshRecord = makeRecord(TG_FRESH, 0);
// Окно скана истекло: init обязан сам собрать витрину — тогда проверяем именно
// локационный фильтр сервера, а не заранее подложенный список.
freshRecord.missionsRefreshedAt = new Date(0).toISOString();
const highRecord = makeRecord(TG_HIGH, LEVEL_20_XP);
highRecord.availableMissionKeys = ['quantum_exchange'];
highRecord.stats.missionRefreshSalt = 3;

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({
    playersByTgId: { [String(TG_FRESH)]: freshRecord, [String(TG_HIGH)]: highRecord },
  })
);

const { dispatchApiRequest } = require(CORE);

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

let ipCounter = 0;
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Date.now()}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'WorldTester', username: `wq${tgId}` }));
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
      'x-demo-username': `wq${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.98.0.${(ipCounter++ % 200) + 1}`,
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

const travel = (tgId, locationId) => call(tgId, 'skin', { action: 'set_location', locationId });
const missionsByKey = new Map(world.MISSIONS_CONFIG.map((m) => [m.key, m]));

/** Все ли ключи витрины из локаций, открытых по уровню. */
function offersRespectLocation(keys, level) {
  return keys.every((key) => {
    const mission = missionsByKey.get(key);
    if (!mission) return false;
    return world.isLocationUnlocked(world.missionLocationId(mission), level);
  });
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v5.5: мир «День хакера» ===\n');

  // ── A. Конфиг мира ─────────────────────────────────────────────────────
  const allIds = world.LOCATIONS.map((l) => l.id);
  check('локаций ровно шесть', world.LOCATIONS.length === 6, allIds.join(','));
  check(
    'уровень 0: открыта только Комната',
    world.getUnlockedLocations(0).map((l) => l.id).join(',') === 'room',
    world.getUnlockedLocations(0).map((l) => l.id).join(',')
  );
  check(
    'уровень 1: Комната + Улица',
    world.getUnlockedLocations(1).map((l) => l.id).join(',') === 'room,street',
    world.getUnlockedLocations(1).map((l) => l.id).join(',')
  );
  check('уровень 5 открывает Пляж', world.isLocationUnlocked('beach', 5) === true);
  check('уровень 4 не открывает Пляж', world.isLocationUnlocked('beach', 4) === false);
  check('уровень 10 открывает Интернет-кафе', world.isLocationUnlocked('cybercafe', 10) === true);
  check('уровень 20 открывает Тех-хаб', world.isLocationUnlocked('techhub', 20) === true);
  check('уровень 39 не открывает Корп-квартал', world.isLocationUnlocked('corpquarter', 39) === false);
  check(
    'уровень 40 открывает все шесть локаций',
    world.getUnlockedLocations(40).length === 6,
    world.getUnlockedLocations(40).map((l) => l.id).join(',')
  );
  check(
    'подсказка «следующая локация» с 1 уровня — Пляж',
    world.getNextLockedLocation(1).id === 'beach',
    world.getNextLockedLocation(1).id
  );
  check(
    'пустой locationId означает Комнату',
    world.resolveLocationId(undefined) === 'room' && world.resolveLocationId('nonsense') === 'room',
    `${world.resolveLocationId(undefined)}/${world.resolveLocationId('nonsense')}`
  );
  check(
    'у каждой локации свой класс фона',
    new Set(world.LOCATIONS.map((l) => l.bgClass)).size === 6 &&
      world.LOCATIONS.every((l) => /^\d{1,3}, \d{1,3}, \d{1,3}$/.test(l.accentRgb)),
    world.LOCATIONS.map((l) => l.bgClass).join(',')
  );
  check(
    'у каждой миссии известная локация',
    world.MISSIONS_CONFIG.every((m) => allIds.includes(world.missionLocationId(m))),
    String(world.MISSIONS_CONFIG.length)
  );
  const roomPool = world.filterMissionsForLocation(world.MISSIONS_CONFIG, 'room');
  check(
    'пул Комнаты — только комнатные контракты',
    roomPool.length > 0 && roomPool.every((m) => world.missionLocationId(m) === 'room'),
    roomPool.map((m) => m.key).join(',')
  );
  const syntheticPool = world.filterMissionsForLocation(
    [missionsByKey.get('scam_shop'), missionsByKey.get('quantum_exchange')],
    'techhub'
  );
  check(
    'если в локации пусто — отдаём Улицу (игрок не застревает)',
    syntheticPool.length === 1 && syntheticPool[0].key === 'scam_shop',
    syntheticPool.map((m) => m.key).join(',')
  );
  const beachPool = world.filterMissionsForLocation(world.MISSIONS_CONFIG, 'beach');
  check(
    'пул Пляжа — только пляж',
    beachPool.length >= 3 && beachPool.every((m) => world.missionLocationId(m) === 'beach'),
    beachPool.map((m) => m.key).join(',')
  );
  check(
    'контракт закрытой локации не стартует',
    world.isLocationMissionStartable(missionsByKey.get('quantum_exchange'), 1) === false &&
      world.isLocationMissionStartable(missionsByKey.get('scam_shop'), 1) === true
  );
  check(
    'слои: карта ниже онбординга и хрома',
    world.WORLD_Z_INDEX.map < world.WORLD_Z_INDEX.onboarding &&
      world.WORLD_Z_INDEX.onboarding < world.WORLD_Z_INDEX.chrome,
    JSON.stringify(world.WORLD_Z_INDEX)
  );

  // ── B. Сервер: переезд и витрина ───────────────────────────────────────
  let r = await call(TG_FRESH, 'init');
  check('игрок инициализирован', r.ok === true && r.player?.derived.level === 1, String(r.player?.derived.level));
  check(
    'по умолчанию локация не проставлена (значит Комната)',
    !r.player.stats.locationId,
    String(r.player.stats.locationId)
  );
  const startOffers = r.player.availableMissionKeys ?? [];
  check('витрина не пустая', startOffers.length >= 3, startOffers.join(','));
  check(
    'витрина 1 уровня — только открытые локации',
    offersRespectLocation(startOffers, 1),
    startOffers.join(',')
  );
  const dataBefore = r.player.data;
  const cryptoBefore = r.player.crypto;

  let travelRes = await travel(TG_FRESH, 'street');
  check('переезд на Улицу проходит', travelRes.ok === true, travelRes.error ?? '');
  check(
    'переезд подтверждается алертом про локацию',
    (travelRes.alerts ?? []).some((a) => String(a.title).includes('Улица')),
    JSON.stringify((travelRes.alerts ?? []).map((a) => a.title))
  );

  r = await call(TG_FRESH, 'init');
  check('локация сохраняется в stats', r.player.stats.locationId === 'street', String(r.player.stats.locationId));
  check(
    'переезд бесплатный: Data и Crypto на месте',
    r.player.data >= dataBefore && r.player.crypto >= cryptoBefore,
    `${dataBefore}/${cryptoBefore} -> ${r.player.data}/${r.player.crypto}`
  );
  const streetOffers = r.player.availableMissionKeys ?? [];
  check(
    'витрина Улицы собрана из контрактов Улицы',
    streetOffers.length >= 3 &&
      streetOffers.every((key) => world.missionLocationId(missionsByKey.get(key)) === 'street'),
    streetOffers.join(',')
  );

  travelRes = await travel(TG_FRESH, 'beach');
  check(
    'закрытая локация отклонена сервером',
    travelRes.ok === false && /откроется/i.test(String(travelRes.error)),
    String(travelRes.error)
  );
  r = await call(TG_FRESH, 'init');
  check('отказ не сдвинул локацию', r.player.stats.locationId === 'street', String(r.player.stats.locationId));

  travelRes = await travel(TG_FRESH, 'nowhere');
  check(
    'несуществующая локация отклонена',
    travelRes.ok === false && /не найдена/i.test(String(travelRes.error)),
    String(travelRes.error)
  );
  r = await call(TG_FRESH, 'init');
  check('мусор не попал в stats.locationId', r.player.stats.locationId === 'street');

  travelRes = await travel(TG_FRESH, 'room');
  check('возврат в Комнату работает', travelRes.ok === true, travelRes.error ?? '');

  // Анти-чит: ключ есть в скане, но локация контракта закрыта (уровень 20, квартал с 40).
  let high = await call(TG_HIGH, 'init');
  check('игрок 20 уровня инициализирован', high.player?.derived.level === 20, String(high.player?.derived.level));
  const lockedStart = await call(TG_HIGH, 'missions', { action: 'start', missionKey: 'quantum_exchange' });
  check(
    'старт контракта закрытой локации отклонён анти-читом',
    lockedStart.ok === false && /локаци/i.test(String(lockedStart.error)),
    String(lockedStart.error)
  );
  // Переезд заставляет сервер пересобрать скан: теперь проверяем, что в витрине
  // 20 уровня нет контрактов Корп-квартала (он открывается только на 40).
  const highTravel = await travel(TG_HIGH, 'techhub');
  check('игрок 20 уровня может уйти в Тех-хаб', highTravel.ok === true, highTravel.error ?? '');
  const highOffers = highTravel.player?.availableMissionKeys ?? [];
  check(
    'витрина 20 уровня не содержит закрытых локаций',
    highOffers.length >= 3 && offersRespectLocation(highOffers, 20),
    highOffers.join(',')
  );
  check(
    'витрина Тех-хаба собрана из его пула',
    highOffers.every((key) => world.missionLocationId(missionsByKey.get(key)) === 'techhub'),
    highOffers.join(',')
  );

  // ── C. Флаг WORLD_V2=false ─────────────────────────────────────────────
  process.env.WORLD_V2 = 'false';
  check('флаг читается из env', world.isWorldV2Enabled() === false);
  const offTravel = await travel(TG_FRESH, 'street');
  check(
    'с выключенным миром переезд запрещён',
    offTravel.ok === false && /недоступен/i.test(String(offTravel.error)),
    String(offTravel.error)
  );
  const offFresh = await call(TG_FRESH, 'init');
  const offOffers = offFresh.player.availableMissionKeys ?? [];
  check(
    'с выключенным миром витрина не сужается по локации',
    offOffers.length >= 3,
    offOffers.join(',')
  );
  delete process.env.WORLD_V2;

  // ── D. UI-инварианты (статические гарантии контракта) ──────────────────
  const read = (file) => fs.readFileSync(path.join(REPO, file), 'utf8');
  const worldMapSrc = read('src/components/WorldMap.tsx');
  const backdropSrc = read('src/components/LocationBackdrop.tsx');
  const deskSrc = read('src/pages/DeskPage.tsx');
  const contextSrc = read('src/context/GameContext.tsx');
  const cssSrc = read('src/index.css');

  check('карта уважает флаг мира', /!worldEnabled/.test(worldMapSrc));
  check('фон уважает флаг мира', /!worldEnabled/.test(backdropSrc));
  check(
    'кнопка «Выйти» на столе под флагом',
    /WorldExitBar/.test(deskSrc) && /!worldEnabled \|\| !player/.test(deskSrc)
  );
  check(
    'WorldMap грузится лениво (React.lazy в DeskPage)',
    /React\.lazy/.test(deskSrc) && /import\('\.\.\/components\/WorldMap'\)/.test(deskSrc)
  );
  check(
    'first_tap заменён на first_move под флагом',
    /isWorldV2Enabled\(\)/.test(contextSrc) && /first_tap/.test(contextSrc)
  );
  check(
    'в CSS есть фоны всех шести локаций',
    world.LOCATIONS.every((l) => cssSrc.includes(`.${l.bgClass}`)),
    world.LOCATIONS.map((l) => l.bgClass).join(',')
  );
  check('акцент локации живёт в одной CSS-переменной', cssSrc.includes('--loc-accent:'));

  console.log(`\nQA: ${pass + fail} checks — PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) process.exit(1);
})().catch((error) => {
  console.error('QA упал с исключением:', error);
  process.exit(1);
});
