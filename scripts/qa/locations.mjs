/**
 * HACKER KOMBAT — QA v6.5: «локации как миры».
 *
 * Что проверяется (без Supabase, memory-режим):
 *   A. shared/locations.ts — шесть миров, множители Data/шанса/Heat, лор,
 *      привязка .webp-бэкдропов, честная подпись эффектов (та же, что в UI).
 *   B. Сервер — множители реально применяются: награда миссии, шанс успеха и
 *      Heat старта; Data за тап; Data и Heat за взлом. И отдельно — что
 *      выключенный WORLD_V2 возвращает Комнату (аварийный выключатель).
 *   C. UI-инварианты — один вход (полоса), bottom sheet с подписью из конфига,
 *      замок + тост, ленивая загрузка только активного бэкдропа, мемоизация.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/locations.mjs
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

// ── Сборка shared-конфигов в CJS: QA читает те же правила, что и игра ────
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-loc-build-'));
const entry = path.join(build, 'entry.ts');
const sharedPath = (name) => path.join(REPO, 'shared', name).replace(/\\/g, '/');
fs.writeFileSync(
  entry,
  [
    `export * from '${sharedPath('locations.ts')}';`,
    `export * from '${sharedPath('world.config.ts')}';`,
    `export { MISSIONS_CONFIG } from '${sharedPath('missions.config.ts')}';`,
    `export { getMissionRewardScale, getHackOdds, getTotalXpForLevel, HACK_MIN_CHANCE, HACK_MAX_CHANCE } from '${sharedPath('hack.config.ts')}';`,
    `export { HACK_DIFFICULTIES } from '${sharedPath('hacks.config.ts')}';`,
    `export { isWorldV2Enabled } from '${sharedPath('config.ts')}';`,
    '',
  ].join('\n')
);
const bundle = path.join(build, 'locations.cjs');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: REPO, stdio: 'inherit' }
);
const loc = require(bundle);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-loc-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;
delete process.env.WORLD_V2;
delete process.env.VITE_WORLD_V2;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForLocationsQa_123';

const TG_CORP = 981000101;
const TG_ROOM = 981000202;
const TG_TAPS_CORP = 981000303;
const TG_TAPS_ROOM = 981000404;
const TG_HACK_CORP = 981000505;
const TG_HACK_ROOM = 981000606;

const LEVEL_40_XP = loc.getTotalXpForLevel(40);

function makeRecord(tgId, xp) {
  const nowIso = new Date().toISOString();
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `lq${tgId}`,
    data: 5000,
    crypto: 5,
    chips: 0,
    xp,
    // CPU Charge: база 1500, контракт тира 5 стоит 440.
    energy: 1400,
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
    // Свежий таймштамп пассивного дохода: иначе init добавит офлайн-Data и
    // сломает сравнение «до/после» на тапах.
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
    // Витрина «внутри окна»: сервер не пересоберёт её сам — проверяем именно
    // множители локации, а не фильтр по пулу.
    availableMissionKeys: ['quantum_exchange'],
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

const corpRecord = makeRecord(TG_CORP, LEVEL_40_XP);
// Взнос за контракт тира 5 — доля награды: без крупного баланса старт не пройдёт.
corpRecord.data = 5_000_000;
corpRecord.stats.locationId = 'corpquarter';
const roomRecord = makeRecord(TG_ROOM, LEVEL_40_XP);
roomRecord.data = 5_000_000;
roomRecord.stats.locationId = 'room';
const tapsCorp = makeRecord(TG_TAPS_CORP, LEVEL_40_XP);
tapsCorp.stats.locationId = 'corpquarter';
const tapsRoom = makeRecord(TG_TAPS_ROOM, LEVEL_40_XP);
tapsRoom.stats.locationId = 'room';
const hackCorp = makeRecord(TG_HACK_CORP, LEVEL_40_XP);
hackCorp.stats.locationId = 'corpquarter';
const hackRoom = makeRecord(TG_HACK_ROOM, LEVEL_40_XP);
hackRoom.stats.locationId = 'room';

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({
    playersByTgId: {
      [String(TG_CORP)]: corpRecord,
      [String(TG_ROOM)]: roomRecord,
      [String(TG_TAPS_CORP)]: tapsCorp,
      [String(TG_TAPS_ROOM)]: tapsRoom,
      [String(TG_HACK_CORP)]: hackCorp,
      [String(TG_HACK_ROOM)]: hackRoom,
    },
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
  params.set('user', JSON.stringify({ id: tgId, first_name: 'LocTester', username: `lq${tgId}` }));
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
      'x-demo-username': `lq${tgId}`,
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

const missionsByKey = new Map(loc.MISSIONS_CONFIG.map((m) => [m.key, m]));
const CORP_MISSION = missionsByKey.get('quantum_exchange');

/** Ожидаемая награда/Heat/шанс по той же формуле, что в gameEngine. */
function expectedStart(mission, player, locationId) {
  const mods = loc.locationModifiers(locationId);
  const odds = loc.getHackOdds({
    mission,
    level: player.derived.level,
    hackPower: player.derived.hackPower,
    heat: player.heat,
    tierSuccesses: player.stats.hackSuccessByType?.[mission.targetType] ?? 0,
    tierFails: player.stats.hackFailByType?.[mission.targetType] ?? 0,
    successMultiplier: mods.success,
  });
  const whiteHat = player.derived.alignment === 'white_hat' && mission.targetType === 'bad' ? 2 : 1;
  const reward = Math.round(
    mission.baseDataReward *
      loc.getMissionRewardScale(player.derived.level) *
      whiteHat *
      player.derived.prestigeMultiplier *
      (1 + player.derived.missionRewardBonusPct) *
      mods.data
  );
  const heatDelta = Math.round(mission.heatDelta * player.derived.heatMultiplier * mods.heat);
  const chance = Math.round(
    Math.min(loc.HACK_MAX_CHANCE, Math.max(loc.HACK_MIN_CHANCE, odds.chance)) * 1000
  ) / 1000;
  return { reward, heatDelta, chance, mods };
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v6.5: локации как миры ===\n');

  // ── A. Конфиг миров ────────────────────────────────────────────────────
  const locationIds = loc.LOCATIONS.map((l) => l.id);
  const worldIds = Object.keys(loc.LOCATION_WORLDS);
  check(
    'у каждой из шести локаций есть свой мир',
    locationIds.length === 6 &&
      locationIds.every((id) => loc.LOCATION_WORLDS[id]) &&
      worldIds.length === 6,
    worldIds.join(',')
  );
  check(
    'множитель Data в заявленном диапазоне ×1.0…×1.6',
    locationIds.every((id) => {
      const v = loc.locationModifiers(id).data;
      return v >= 1 && v <= 1.6;
    }),
    locationIds.map((id) => `${id}:${loc.locationModifiers(id).data}`).join(' ')
  );
  check(
    'доход растёт вместе с уровнем открытия (нигде не падает)',
    (() => {
      const sorted = [...loc.LOCATIONS].sort((a, b) => a.minLevel - b.minLevel);
      let prev = 0;
      for (const l of sorted) {
        const v = loc.locationModifiers(l.id).data;
        if (v < prev) return false;
        prev = v;
      }
      return true;
    })(),
    [...loc.LOCATIONS]
      .sort((a, b) => a.minLevel - b.minLevel)
      .map((l) => `${l.id}=${loc.locationModifiers(l.id).data}`)
      .join(' ')
  );
  check(
    'Улица почти не даёт Heat (×≤0.75)',
    loc.locationModifiers('street').heat <= 0.75,
    String(loc.locationModifiers('street').heat)
  );
  check(
    'Комната — точка отсчёта: ни бонусов, ни штрафов',
    ['data', 'success', 'heat'].every((k) => loc.locationModifiers('room')[k] === 1),
    JSON.stringify(loc.locationModifiers('room'))
  );
  check(
    'Комната — база: самый низкий доход и меньше Heat, чем у рискованных мест',
    loc.locationModifiers('room').data ===
      Math.min(...locationIds.map((id) => loc.locationModifiers(id).data)) &&
      loc.locationModifiers('room').heat < loc.locationModifiers('techhub').heat &&
      loc.locationModifiers('room').heat < loc.locationModifiers('corpquarter').heat
  );
  check(
    'Тех-хаб: доход ×1.4, Heat ×1.3',
    loc.locationModifiers('techhub').data === 1.4 && loc.locationModifiers('techhub').heat === 1.3,
    JSON.stringify(loc.locationModifiers('techhub'))
  );
  check(
    'Корп-квартал: доход ×1.6, шанс ниже 1, Heat ×1.5',
    loc.locationModifiers('corpquarter').data === 1.6 &&
      loc.locationModifiers('corpquarter').success < 1 &&
      loc.locationModifiers('corpquarter').heat === 1.5,
    JSON.stringify(loc.locationModifiers('corpquarter'))
  );
  check(
    'жадный платит риском: у рискованных локаций Heat строго выше, чем у тихих',
    loc.locationModifiers('corpquarter').heat >= 1.5 &&
      loc.locationModifiers('techhub').heat > loc.locationModifiers('street').heat * 1.5 &&
      loc.locationModifiers('corpquarter').success < loc.locationModifiers('room').success
  );
  check(
    'неизвестный id — это Комната, а не ошибка',
    loc.locationModifiers('nonsense').data === loc.locationModifiers('room').data &&
      loc.getLocationWorld(undefined).id === 'room'
  );
  check(
    'выключенный WORLD_V2 возвращает Комнату (аварийный выключатель)',
    loc.economyModifiers('corpquarter', false).data === 1 &&
      loc.economyModifiers('corpquarter', false).heat === loc.locationModifiers('room').heat &&
      loc.economyModifiers('corpquarter', true).data === 1.6
  );

  // ── A2. Лор и бэкдропы ─────────────────────────────────────────────────
  check(
    'у каждой локации одна строка лора (1 ≤ длина ≤ 110, без переводов строк)',
    locationIds.every((id) => {
      const tagline = loc.locationTagline(id);
      return typeof tagline === 'string' && tagline.trim().length >= 12 && tagline.length <= 110 && !tagline.includes('\n');
    }),
    locationIds.map((id) => `${id}:${loc.locationTagline(id).length}`).join(' ')
  );
  check(
    'лор у всех разный',
    new Set(locationIds.map((id) => loc.locationTagline(id))).size === 6
  );

  const backdropFiles = locationIds.map((id) => loc.locationBackdropUrl(id));
  check(
    'у каждой локации свой .webp-бэкдроп',
    backdropFiles.every((url) => typeof url === 'string' && url.endsWith('.webp')) &&
      new Set(backdropFiles).size === 6,
    backdropFiles.join(' ')
  );
  check(
    'все .webp реально лежат в public и весят ≤ 200 кБ',
    backdropFiles.every((url) => {
      const file = path.join(REPO, 'public', url.replace(/^\//, ''));
      return fs.existsSync(file) && fs.statSync(file).size <= 200 * 1024;
    }),
    backdropFiles
      .map((url) => {
        const file = path.join(REPO, 'public', url.replace(/^\//, ''));
        return fs.existsSync(file) ? `${path.basename(url)}=${fs.statSync(file).size}` : `${url}=MISSING`;
      })
      .join(' ')
  );
  check(
    'все бэкдропы локаций — из папки /assets/backdrops',
    backdropFiles.every((url) => url.startsWith('/assets/backdrops/'))
  );

  // ── A3. Подпись эффектов = числа конфига ───────────────────────────────
  check(
    'подпись Тех-хаба дословно как в ТЗ',
    loc.locationEffectLabel('techhub') === 'Доход ×1.4 · Риск Heat ×1.3',
    loc.locationEffectLabel('techhub')
  );
  check(
    'подпись Корп-квартала показывает и шанс, и Heat',
    loc.locationEffectLabel('corpquarter') === 'Доход ×1.6 · Шанс ×0.9 · Риск Heat ×1.5',
    loc.locationEffectLabel('corpquarter')
  );
  check(
    'подпись каждой локации собирается из её множителей',
    locationIds.every((id) => {
      const label = loc.locationEffectLabel(id);
      const mods = loc.locationModifiers(id);
      const numbers = (label.match(/(\d+(?:\.\d+)?)/g) ?? []).map(Number);
      const expected = [mods.data];
      if (Math.abs(mods.success - 1) > 0.001) expected.push(mods.success);
      expected.push(mods.heat);
      return numbers.length === expected.length && numbers.every((n, i) => Math.abs(n - expected[i]) < 0.001);
    }),
    locationIds.map((id) => loc.locationEffectLabel(id)).join(' | ')
  );

  // ── B. Сервер: миссии ──────────────────────────────────────────────────
  const corpInit = await call(TG_CORP, 'init');
  check('игрок 40 уровня инициализирован', corpInit.ok === true && corpInit.player.derived.level >= 40, String(corpInit.player?.derived.level));

  const corpStart = await call(TG_CORP, 'missions', { action: 'start', missionKey: CORP_MISSION.key });
  check('контракт Корп-квартала стартует', corpStart.ok === true, corpStart.error ?? '');
  const corpMission = (corpStart.player?.activeMissions ?? [])[0];
  const corpExpected = corpMission ? expectedStart(CORP_MISSION, corpInit.player, 'corpquarter') : null;
  check(
    'награда миссии умножена на доход локации (каминная формула × 1.6)',
    Boolean(corpMission) && corpMission.reward === corpExpected.reward,
    `${corpMission?.reward} vs ${corpExpected?.reward}`
  );
  check(
    'Heat старта умножен на риск локации (× 1.5)',
    Boolean(corpMission) && corpMission.heatDelta === corpExpected.heatDelta,
    `${corpMission?.heatDelta} vs ${corpExpected?.heatDelta}`
  );
  check(
    'шанс успеха умножен на шанс локации (× 0.9) и зафиксирован на старте',
    Boolean(corpMission) && Math.abs(corpMission.successChance - corpExpected.chance) < 0.002,
    `${corpMission?.successChance} vs ${corpExpected?.chance}`
  );
  check(
    'шанс в Корп-квартале ниже, чем дал бы базовый расчёт без локации',
    (() => {
      const base = loc.getHackOdds({
        mission: CORP_MISSION,
        level: corpInit.player.derived.level,
        hackPower: corpInit.player.derived.hackPower,
        heat: corpInit.player.heat,
        tierSuccesses: 0,
        tierFails: 0,
      }).chance;
      return corpMission && corpMission.successChance < base;
    })()
  );

  const roomInit = await call(TG_ROOM, 'init');
  const roomStart = await call(TG_ROOM, 'missions', { action: 'start', missionKey: CORP_MISSION.key });
  const roomMission = (roomStart.player?.activeMissions ?? [])[0];
  const roomExpected = roomMission ? expectedStart(CORP_MISSION, roomInit.player, 'room') : null;
  check(
    'из Комнаты тот же контракт даёт меньше Data, чем из Корп-квартала',
    Boolean(roomMission) &&
      Boolean(corpMission) &&
      roomMission.reward < corpMission.reward &&
      roomMission.reward === roomExpected.reward,
    `${roomMission?.reward} < ${corpMission?.reward}`
  );
  check(
    'из Комнаты Heat за тот же контракт в 1.5 раза ниже, чем из Корп-квартала',
    Boolean(roomMission) && Boolean(corpMission) && Math.abs(roomMission.heatDelta * 1.5 - corpMission.heatDelta) <= 1,
    `${roomMission?.heatDelta} vs ${corpMission?.heatDelta}`
  );
  check(
    'из Комнаты шанс успеха выше, чем из Корп-квартала',
    Boolean(roomMission) && Boolean(corpMission) && roomMission.successChance > corpMission.successChance,
    `${roomMission?.successChance} vs ${corpMission?.successChance}`
  );

  // ── B2. Сервер: тапы ───────────────────────────────────────────────────
  const tapsCorpBefore = await call(TG_TAPS_CORP, 'init');
  const tapsRoomBefore = await call(TG_TAPS_ROOM, 'init');
  const corpTaps = await call(TG_TAPS_CORP, 'click', { clicks: 5 });
  const roomTaps = await call(TG_TAPS_ROOM, 'click', { clicks: 5 });
  const corpGain = Number((corpTaps.player.data - tapsCorpBefore.player.data).toFixed(2));
  const roomGain = Number((roomTaps.player.data - tapsRoomBefore.player.data).toFixed(2));
  check(
    'тап из Корп-квартала даёт Data × 1.6',
    Math.abs(corpGain - 5 * tapsCorpBefore.player.derived.clickPower * 1.6) < 0.51,
    `${corpGain} vs ${(5 * tapsCorpBefore.player.derived.clickPower * 1.6).toFixed(2)}`
  );
  check(
    'тап из Комнаты даёт базовый Data (× 1.0)',
    Math.abs(roomGain - 5 * tapsRoomBefore.player.derived.clickPower) < 0.51,
    `${roomGain} vs ${(5 * tapsRoomBefore.player.derived.clickPower).toFixed(2)}`
  );
  check('место множит только Data — CPU-заряд тапа не изменился', corpTaps.player.energy <= tapsCorpBefore.player.energy);

  // ── B3. Сервер: взломы (мини-игра) ─────────────────────────────────────
  const easy = loc.HACK_DIFFICULTIES.find((d) => d.key === 'easy');
  const hackCorpBefore = await call(TG_HACK_CORP, 'init');
  const hackRoomBefore = await call(TG_HACK_ROOM, 'init');
  const corpHackStart = await call(TG_HACK_CORP, 'hacks', { action: 'start', difficulty: easy.key });
  const roomHackStart = await call(TG_HACK_ROOM, 'hacks', { action: 'start', difficulty: easy.key });
  check(
    'взлом стартует в обеих локациях',
    corpHackStart.ok === true && roomHackStart.ok === true,
    `${corpHackStart.error ?? ''}${roomHackStart.error ?? ''}`
  );
  const corpHack = await call(TG_HACK_CORP, 'hacks', { action: 'finish', sessionId: corpHackStart.player?.stats?.hackSession?.id, safeHits: 1, trapHits: 1 });
  const roomHack = await call(TG_HACK_ROOM, 'hacks', { action: 'finish', sessionId: roomHackStart.player?.stats?.hackSession?.id, safeHits: 1, trapHits: 1 });
  check(
    'взлом закрывается в обеих локациях',
    corpHack.ok === true && roomHack.ok === true,
    `${corpHack.error ?? ''}${roomHack.error ?? ''}`
  );
  const corpHackData = Number((corpHack.player.data - hackCorpBefore.player.data).toFixed(2));
  const roomHackData = Number((roomHack.player.data - hackRoomBefore.player.data).toFixed(2));
  check(
    'взлом в Корп-квартале даёт Data × 1.6',
    corpHackData === easy.dataPerNode * 1.6,
    `${corpHackData} vs ${easy.dataPerNode * 1.6}`
  );
  check(
    'взлом в Комнате даёт базовый Data',
    roomHackData === easy.dataPerNode,
    `${roomHackData} vs ${easy.dataPerNode}`
  );
  const corpHackHeat = corpHack.player.heat - hackCorpBefore.player.heat;
  const roomHackHeat = roomHack.player.heat - hackRoomBefore.player.heat;
  check(
    'Heat за ловушку в Корп-квартале × 1.5, в Комнате — как в конфиге (× 1.0)',
    corpHackHeat === Math.round(easy.trapHeat * 1.5) && roomHackHeat === easy.trapHeat,
    `${corpHackHeat} / ${roomHackHeat}`
  );

  // ── B4. Переезд по-прежнему работает ───────────────────────────────────
  const travel = await call(TG_ROOM, 'skin', { action: 'set_location', locationId: 'street' });
  check(
    'переезд работает и после появления множителей',
    travel.ok === true && travel.player.stats.locationId === 'street',
    travel.error ?? String(travel.player?.stats?.locationId)
  );

  // ── C. UI-инварианты ───────────────────────────────────────────────────
  const read = (file) => fs.readFileSync(path.join(REPO, file), 'utf8');
  const deskSrc = read('src/pages/DeskPage.tsx');
  const stripSrc = read('src/components/LocationStrip.tsx');
  const backdropSrc = read('src/components/LocationBackdrop.tsx');
  const contextSrc = read('src/context/GameContext.tsx');
  const sceneSrc = read('src/components/DeskScene.tsx');
  const appSrc = read('src/App.tsx');
  const cssSrc = read('src/index.css');

  check(
    'на столе один вход: полоса между сценой и доской',
    deskSrc.indexOf('<DeskScene />') < deskSrc.indexOf('<LocationStrip />') &&
      deskSrc.indexOf('<LocationStrip />') < deskSrc.indexOf('<ContractBoard />')
  );
  check(
    'легаси-входы со стола убраны из рендера',
    !deskSrc.includes('WorldExitBar') &&
      !deskSrc.includes('DeskLocationBar') &&
      !deskSrc.includes('components/WorldMap') &&
      !deskSrc.includes('change-location-bar')
  );
  check('на сцене нет второй двери в локации', !sceneSrc.includes('scene-location-chip'));

  check(
    'полоса помечена для QA и мемоизирована',
    stripSrc.includes('data-qa="location-strip"') &&
      stripSrc.includes('data-qa="location-chip"') &&
      /export const LocationStrip = React\.memo/.test(stripSrc) &&
      /const LocationChip = React\.memo/.test(stripSrc)
  );
  check(
    'тап-таргет чипа ≥ 44 px',
    stripSrc.includes('min-h-[44px]'),
    (stripSrc.match(/h-\[\d+px\]/g) ?? []).join(' ')
  );
  check(
    'активная локация подсвечена, закрытые — с замком и уровнем',
    stripSrc.includes('data-active') &&
      stripSrc.includes('data-qa="location-lock"') &&
      stripSrc.includes('L{location.minLevel}')
  );
  check(
    'тап по закрытой локации даёт тост «Откроется на уровне N»',
    stripSrc.includes('pushClientAlert') &&
      stripSrc.includes('Откроется на уровне ${location.minLevel}')
  );
  check(
    'панель локации: bottom sheet с иконкой, названием, лором и эффектом',
    stripSrc.includes('<ModalFrame') &&
      stripSrc.includes('data-qa="location-sheet"') &&
      stripSrc.includes('data-qa="location-tagline"') &&
      stripSrc.includes('data-qa="location-effects"') &&
      stripSrc.includes('data-qa="location-travel"')
  );
  check(
    'подпись эффектов в панели берётся из конфига, а не пишется руками',
    stripSrc.includes('locationEffectLabel(entry.id)') &&
      !/Доход ×\d/.test(stripSrc)
  );
  check(
    'лор в панели — из shared/locations.ts',
    stripSrc.includes('LOCATION_WORLDS') && stripSrc.includes('entry.tagline')
  );

  check(
    'бэкдроп локации грузится лениво и только один',
    backdropSrc.includes('loading="lazy"') &&
      backdropSrc.includes('decoding="async"') &&
      backdropSrc.includes('locationBackdropUrl') &&
      (backdropSrc.match(/<img/g) ?? []).length === 1 &&
      /export const LocationBackdrop = React\.memo/.test(backdropSrc)
  );
  check(
    'градиент остаётся фолбэком под картинкой',
    backdropSrc.includes('loc-bg ${bgClass}') &&
      cssSrc.includes('.loc-bg-photo') &&
      /\.loc-bg-photo\s*\{[\s\S]{0,200}object-fit: cover/.test(cssSrc)
  );
  check(
    'фон в App.tsx идёт через мост (мемо не перерисовывается на тапах)',
    appSrc.includes('<LocationBackdropLayer />') &&
      /LocationBackdropLayer[\s\S]{0,220}<LocationBackdrop location=/.test(appSrc)
  );
  check(
    'активная локация мемоизирована по id, а не по всему stats',
    contextSrc.includes('readActiveLocationById(player?.stats.locationId)') &&
      !contextSrc.includes('readActiveLocation(player?.stats)')
  );
  check(
    'оптимистичный тап считает тот же множитель места, что и сервер',
    contextSrc.includes('tapDataBoost') && contextSrc.includes('economyModifiers')
  );

  // ── D. Перф: картинки не попадают в главный бандл и не прелоадятся ─────
  const distIndex = path.join(REPO, 'dist/index.html');
  if (fs.existsSync(distIndex)) {
    const html = fs.readFileSync(distIndex, 'utf8');
    check(
      'index.html не прелоадит бэкдропы локаций',
      !html.includes('backdrop-') && !/rel="preload"[^>]*\.webp/.test(html)
    );
  } else {
    check('index.html собран', false, 'нет dist/index.html — выполните npm run build');
  }

  console.log(`\nQA: ${pass + fail} checks — PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) process.exit(1);
})().catch((error) => {
  console.error('QA упал с исключением:', error);
  process.exit(1);
});
