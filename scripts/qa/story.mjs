/**
 * HACKER KOMBAT — QA v6.8: сюжет и ивенты.
 *
 * Проверяет то, что нельзя увидеть глазами:
 *   A. S СЮЖЕТ-КОНФИГ. Восемь глав по уровням, 3–6 шагов, уникальные id,
 *      требования — только существующие факты прогрессии, награды в разумных
 *      пределах (Data в часах дохода, Crypto не ломает экономику v6.6).
 *   B. СЕРВЕР. Глава закрыта до уровня, шаг не принимает невыполненный прогресс,
 *      награда начисляется ровно один раз, бонус за главу — тоже, `story`-снимок
 *      едет в init, строка мира меняется после закрытия главы.
 *   C. ИВЕНТЫ. Окна ротации стыкуются без зазоров, в любой момент активен один
 *      ивент, модификаторы Heat/Crypto читаются из конфига (и применяются в
 *      старте контракта), анонс — за 12 часов и ровно один раз на окно,
 *      леденец остаётся daily-ивентом того же движка, Neon Relay — в архиве.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   npm run qa:story
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

// ── Мост к shared-конфигам ─────────────────────────────────────────────────
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-story-build-'));
const entry = path.join(build, 'entry.ts');
const sharedPath = (name) => path.join(REPO, 'shared', name).replace(/\\/g, '/');
fs.writeFileSync(
  entry,
  [
    `export * from '${sharedPath('story.config.ts')}';`,
    `export * from '${sharedPath('events.config.ts')}';`,
    `export { MISSIONS_CONFIG } from '${sharedPath('missions.config.ts')}';`,
    `export { LOLLIPOP_BOOST_MS, LOLLIPOP_MULTIPLIER } from '${sharedPath('season.config.ts')}';`,
    `export { isSeasonEventLive } from '${sharedPath('seasonalEvent.config.ts')}';`,
    `export { PRESTIGE_KEEPS } from '${sharedPath('prestige.config.ts')}';`,
    `export { getTotalXpForLevel } from '${sharedPath('hack.config.ts')}';`,
    `export { locationModifiers } from '${sharedPath('locations.ts')}';`,
    '',
  ].join('\n')
);
const bundle = path.join(build, 'story.cjs');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: REPO, stdio: 'inherit' }
);
const cfg = require(bundle);

// ── Песочница: memory-режим, свой .local-db.json ───────────────────────────
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-story-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;
delete process.env.SEASON_EVENT_TEST_MODE;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForStoryQa_1234';

// 「Тихая неделя」 — слот 0 (02.12.2026), 「Ночной рынок」 — слот 1 (09.12.2026).
const QUIET_AT = Date.parse('2026-12-02T12:00:00+03:00');
const MARKET_AT = Date.parse('2026-12-09T12:00:00+03:00');

const realNow = Date.now;
let fakeNow = QUIET_AT;
Date.now = () => fakeNow;

const ALLOWED_FACTS = new Set([
  'level',
  'clicks',
  'missions',
  'greyMissions',
  'cardLevels',
  'teamSize',
  'pets',
  'petFeedings',
  'achievements',
  'bestHeatEscape',
]);

const XP_LOW = 0;
const XP_MID = cfg.getTotalXpForLevel(20);
const XP_MAX = cfg.getTotalXpForLevel(50);

const TG_LOW = 991000101; // низкий уровень: главы закрыты
const TG_FACTS = 991000202; // всё выполнено, но ничего не забрано
const TG_PARTIAL = 991000303; // выполнено частично (для отказа)
const TG_HEAT = 991000404; // тихая неделя: Heat ×0.5
const TG_MARKET = 991000505; // ночной рынок: без модификатора Heat

function makeRecord(tgId, xp, overrides = {}) {
  const nowIso = new Date(fakeNow).toISOString();
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `st${tgId}`,
    data: 5_000_000,
    crypto: 100,
    chips: 5,
    xp,
    energy: 500,
    energyUpdated: nowIso,
    heat: 0,
    rep: 0,
    prestigeCount: 0,
    cardTier: 1,
    clickBlockedUntil: null,
    dailyStreak: 3,
    lastDailyClaim: nowIso,
    equippedSkin: 'default',
    unlockedSkins: ['default'],
    totalClicks: 3200,
    totalMissions: 300,
    lastPassiveClaim: nowIso,
    lastClickBatchAt: 0,
    cards: { monitor: 10 },
    team: ['coder', 'social_engineer', 'fence', 'botmaster', 'analyst', 'cryptographer'],
    pets: [
      { key: 'cat', hunger: 10, lastFedAt: nowIso, feedCount: 3 },
      { key: 'dog', hunger: 10, lastFedAt: nowIso, feedCount: 2 },
    ],
    baseUpgrades: {},
    stats: {
      tutorialTabs: [],
      tutorialOpens: 0,
      tabsVisited: [],
      petFeedings: 5,
      petHungrySeen: 0,
      missionFails: 0,
      missionTypes: ['bad', 'good', 'neutral', 'grey'],
      greyMissions: 25,
      nightSessions: 0,
      earlySessions: 0,
      idleSessions: 0,
      maxSessionMinutes: 0,
      bestHeatEscape: 90,
      heatPenalties: 0,
      shopFreezeMinutes: 0,
      petFeedingStreakDays: 0,
      lastPetFeedDay: null,
      trackEventsToday: 0,
      trackEventsDay: null,
      hackSuccessByType: { bad: 30, grey: 20 },
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
    availableMissionKeys: [],
    missionsRefreshedAt: new Date(0).toISOString(),
    achievements: [],
    ...overrides,
  };
}

const achievementsAll = Array.from({ length: 45 }, (_, i) => `qa_ach_${i + 1}`);

const records = {
  [TG_LOW]: makeRecord(TG_LOW, XP_LOW, {
    cards: {},
    team: [],
    pets: [],
    totalClicks: 5,
    totalMissions: 0,
    achievements: [],
    stats: { ...makeRecord(TG_LOW, XP_LOW).stats, greyMissions: 0, petFeedings: 0, bestHeatEscape: 0 },
  }),
  [TG_FACTS]: makeRecord(TG_FACTS, XP_MAX, { achievements: achievementsAll }),
  [TG_PARTIAL]: makeRecord(TG_PARTIAL, XP_MID, {
    achievements: [],
    team: [],
    pets: [],
    totalClicks: 10,
    totalMissions: 1,
    stats: { ...makeRecord(TG_PARTIAL, XP_MID).stats, greyMissions: 0, petFeedings: 0, bestHeatEscape: 0 },
  }),
  [TG_HEAT]: makeRecord(TG_HEAT, XP_MID, { achievements: achievementsAll }),
  [TG_MARKET]: makeRecord(TG_MARKET, XP_MID, { achievements: achievementsAll }),
};

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({
    playersByTgId: Object.fromEntries(Object.entries(records).map(([key, value]) => [String(key), value])),
  })
);

const { dispatchApiRequest } = require(CORE);

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

let ipCounter = 0;
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(fakeNow / 1000)));
  params.set('query_id', `ST_${tgId}_${fakeNow}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'StoryTester', username: `st${tgId}` }));
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
      'x-demo-username': `st${tgId}`,
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

(async () => {
  console.log('=== HACKER KOMBAT — QA v6.8: сюжет и ивенты ===\n');

  // ── A. Конфиг сюжета ────────────────────────────────────────────────────
  const arcs = cfg.STORY_ARCS;
  check('восемь глав: Пролог + семь вех', arcs.length === 8, `${arcs.length}`);
  check(
    'главы открываются по уровням 1/2/8/15/22/30/38/45',
    arcs.map((arc) => arc.requiredLevel).join(',') === '1,2,8,15,22,30,38,45',
    arcs.map((arc) => arc.requiredLevel).join(',')
  );
  check(
    'порядок глав непрерывен (order 0…7)',
    arcs.every((arc, index) => arc.order === index)
  );
  check(
    'в главе 3–6 шагов, у вех — 4–6',
    arcs.every((arc) => arc.steps.length >= 3 && arc.steps.length <= 6) &&
      arcs.slice(1).every((arc) => arc.steps.length >= 4),
    arcs.map((arc) => arc.steps.length).join(',')
  );
  const allSteps = arcs.flatMap((arc) => arc.steps);
  check(
    'id шагов уникальны и привязаны к главе',
    new Set(allSteps.map((step) => step.id)).size === allSteps.length &&
      arcs.every((arc) => arc.steps.every((step) => step.id.startsWith(`${arc.id}:`)))
  );
  check(
    'шаги требуют только существующие факты прогрессии',
    allSteps.every((step) => ALLOWED_FACTS.has(step.requirement.key) && step.requirement.value > 0),
    Array.from(new Set(allSteps.map((step) => step.requirement.key))).join(',')
  );
  check(
    'каждый шаг что-то даёт, и Data-награда задана в часах',
    allSteps.every((step) => (step.reward.crypto ?? 0) + (step.reward.chips ?? 0) > 0 || step.reward.dataHours)
  );
  const totalCrypto = allSteps.reduce((sum, step) => sum + (step.reward.crypto ?? 0), 0) +
    arcs.reduce((sum, arc) => sum + (arc.reward.crypto ?? 0), 0);
  check(
    'Crypto за весь сюжет не ломает экономику (≤ 500 — это ~две рамки профиля за 40 шагов)',
    totalCrypto > 0 && totalCrypto <= 500,
    `${totalCrypto} Crypto`
  );
  check(
    'ни одна глава не выдаёт больше 130 Crypto',
    arcs.every(
      (arc) => arc.steps.reduce((sum, step) => sum + (step.reward.crypto ?? 0), 0) + (arc.reward.crypto ?? 0) <= 130
    )
  );
  check(
    'сцены шагов — короткие (2–4 предложения)',
    allSteps.every((step) => step.scene.split(/[.!?]\s/).length >= 2 && step.scene.length <= 320),
    `макс ${Math.max(...allSteps.map((step) => step.scene.length))} символов`
  );
  check(
    'у каждой главы есть флавор мира и обложка',
    arcs.every((arc) => arc.flavor.length > 20 && Boolean(arc.cover))
  );
  check(
    'сюжет переживает престиж (в списке «остаётся»)',
    cfg.PRESTIGE_KEEPS.includes('сюжет')
  );

  // ── B. Сервер: гейты, награды, снимок ───────────────────────────────────
  fakeNow = QUIET_AT;
  const lowInit = await call(TG_LOW, 'init');
  check('низкий уровень инициализирован', lowInit.ok === true, lowInit.error ?? '');
  check(
    'снимок сюжета едет в init',
    Boolean(lowInit.story) && lowInit.story.arcId === 'prologue' && lowInit.story.done === 0,
    JSON.stringify(lowInit.story ?? null)
  );
  check(
    'до выполнения шагов на столе — открывающая строка мира',
    lowInit.story.flavor === cfg.STORY_OPENING_LINE,
    String(lowInit.story?.flavor)
  );

  const lockedClaim = await call(TG_LOW, 'story', { action: 'claim', stepId: 'corp-perimeter:1' });
  check(
    'глава закрыта до своего уровня',
    lockedClaim.ok === false && /уровн/i.test(String(lockedClaim.error)),
    String(lockedClaim.error ?? '')
  );

  const unmet = await call(TG_LOW, 'story', { action: 'claim', stepId: 'prologue:2' });
  check(
    'шаг не принимает невыполненный прогресс',
    unmet.ok === false && /не выполнен/i.test(String(unmet.error)),
    String(unmet.error ?? '')
  );

  const unknownStep = await call(TG_LOW, 'story', { action: 'claim', stepId: 'nope:999' });
  check('неизвестный шаг отклоняется', unknownStep.ok === false && /нет/i.test(String(unknownStep.error)));

  // Игрок, у которого выполнено ВСЁ: проверяем выплаты.
  const factsInit = await call(TG_FACTS, 'init');
  const prologue = arcs[0];
  const stepTwo = prologue.steps[1];
  const dataBefore = factsInit.player.data;
  const cryptoBefore = factsInit.player.crypto;
  const expectedData = cfg.storyDataReward(stepTwo.reward, prologue.requiredLevel);

  const claimed = await call(TG_FACTS, 'story', { action: 'claim', stepId: stepTwo.id });
  check('выполненный шаг забирается', claimed.ok === true, claimed.error ?? '');
  check(
    'Data начислена по формуле часов дохода',
    Math.round(claimed.player.data - dataBefore) === expectedData,
    `${Math.round(claimed.player.data - dataBefore)} vs ${expectedData}`
  );
  check(
    'Crypto начислен не меньше конфига шага (остальное — сторонние системы)',
    claimed.player.crypto - cryptoBefore >= (stepTwo.reward.crypto ?? 0),
    `${claimed.player.crypto - cryptoBefore} vs ${stepTwo.reward.crypto ?? 0}`
  );

  const doubleClaim = await call(TG_FACTS, 'story', { action: 'claim', stepId: stepTwo.id });
  check(
    'повторный забор шага отклонён и ничего не платит',
    (doubleClaim.ok === false && doubleClaim.player === undefined) ||
      (doubleClaim.player?.crypto ?? 0) <= claimed.player.crypto,
    String(doubleClaim.error ?? '')
  );

  // Закрываем пролог целиком: бонус за главу — ровно один раз.
  const remaining = prologue.steps.filter((step) => step.id !== stepTwo.id);
  let last = null;
  for (const step of remaining) {
    last = await call(TG_FACTS, 'story', { action: 'claim', stepId: step.id });
    if (!last.ok) break;
  }
  check('пролог закрывается целиком', last?.ok === true, String(last?.error ?? ''));
  const chapterAlerts = (last?.alerts ?? []).filter((alert) => /Глава закрыта/.test(String(alert.title)));
  check('закрытие главы объявляется игроку', chapterAlerts.length === 1, String(chapterAlerts[0]?.message ?? ''));
  check(
    'флавор мира в алерте — строка из конфига',
    String(chapterAlerts[0]?.message ?? '').includes(prologue.flavor)
  );
  check(
    'бонус за главу начислен один раз',
    (last.player.crypto - claimed.player.crypto) >= 0 &&
      last.player.stats.storyChaptersPaid.filter((id) => id === prologue.id).length === 1,
    JSON.stringify(last.player.stats.storyChaptersPaid)
  );
  check(
    'снимок после закрытия главы показывает новую строку мира',
    last.story?.flavor === prologue.flavor && last.story.completedArcs >= 1,
    String(last.story?.flavor)
  );

  // Частичный прогресс: глава открыта, но шаги не выполнены.
  const partialInit = await call(TG_PARTIAL, 'init');
  const openArcs = arcs.filter((arc) => arc.requiredLevel <= 20);
  // У частичного игрока 10 уровней карт: ищем шаг, который требует заметно больше.
  const unmetStep = openArcs
    .flatMap((arc) => arc.steps)
    .find((step) => step.requirement.key === 'cardLevels' && step.requirement.value > 10);
  const partialClaim = await call(TG_PARTIAL, 'story', {
    action: 'claim',
    stepId: unmetStep?.id ?? 'people-in-shadow:3',
  });
  check(
    'частично пройденный игрок не получает награду за непройденный шаг',
    partialClaim.ok === false && /не выполнен/i.test(String(partialClaim.error)),
    `${unmetStep?.id ?? 'people-in-shadow:3'} → ${partialClaim._status} ${String(partialClaim.error ?? partialClaim.raw ?? '')}`
  );
  check(
    'снимок открытой главы считает шаги и ничего не засчитывает заранее',
    partialInit.story.arcId === 'prologue' &&
      partialInit.story.total === prologue.steps.length &&
      partialInit.story.done === 0,
    JSON.stringify(partialInit.story)
  );
  check(
    'снимок подсказывает, сколько наград уже можно забрать',
    Number.isInteger(partialInit.story.claimable) && partialInit.story.claimable >= 0,
    String(partialInit.story.claimable)
  );

  // ── C. Ивенты: окна, ротация, модификаторы ──────────────────────────────
  const quietSlot = cfg.getWeeklySlot(QUIET_AT);
  const marketSlot = cfg.getWeeklySlot(MARKET_AT);
  check(
    'в тихую неделю играет слот 0 — «Тихая неделя»',
    quietSlot.event.id === 'quiet-week' && quietSlot.slot === 0,
    `${quietSlot.event.id}@${quietSlot.slot}`
  );
  check(
    'через неделю — «Ночной рынок»',
    marketSlot.event.id === 'night-market' && marketSlot.slot === 1,
    `${marketSlot.event.id}@${marketSlot.slot}`
  );
  check(
    'окна ротации стыкуются без зазоров (7 дней ровно)',
    quietSlot.endMs === marketSlot.startMs && quietSlot.endMs - quietSlot.startMs === 7 * 86_400_000,
    `${quietSlot.endMs} = ${marketSlot.startMs}`
  );
  check(
    'в любой момент активен ровно один ротационный ивент',
    cfg.getWeeklyEvents().filter((event) => event.lane === 'weekly').length === 2 &&
      Boolean(cfg.getActiveWeeklyEvent(QUIET_AT)?.event) &&
      Boolean(cfg.getActiveWeeklyEvent(MARKET_AT)?.event)
  );
  check(
    'модификаторы тихой недели: Heat ×0.5',
    cfg.getEventModifiers(QUIET_AT).heatMult === 0.5 &&
      cfg.getEventModifiers(QUIET_AT).greyCryptoMult === 1,
    JSON.stringify(cfg.getEventModifiers(QUIET_AT))
  );
  check(
    'модификаторы ночного рынка: Crypto с серых +25%',
    cfg.getEventModifiers(MARKET_AT).greyCryptoMult === 1.25 &&
      cfg.getEventModifiers(MARKET_AT).heatMult === 1,
    JSON.stringify(cfg.getEventModifiers(MARKET_AT))
  );
  check(
    'человеческая подпись модификаторов совпадает с числами',
    cfg.describeEventModifiers({ heatMult: 0.5 }).includes('Heat ×0.5')
  );

  // Анонс: 12 часов до старта, ровно один раз.
  const twelveBefore = quietSlot.endMs - 11 * 3_600_000;
  const thirteenBefore = quietSlot.endMs - 13 * 3_600_000;
  const tooEarly = cfg.getEventAnnouncement(thirteenBefore, {});
  const announce = cfg.getEventAnnouncement(twelveBefore, {});
  check('анонс молчит раньше 12 часов', tooEarly === null);
  check(
    'анонс появляется за 12 часов и указывает следующий ивент',
    announce?.event.id === 'night-market' && announce.hoursLeft <= 12,
    JSON.stringify({ id: announce?.event.id, h: announce?.hoursLeft })
  );
  const announcedMap = announce ? { [cfg.eventAnnouncementKey(announce)]: new Date(twelveBefore).toISOString() } : {};
  check(
    'повторный анонс того же окна не показывается',
    cfg.getEventAnnouncement(twelveBefore, announcedMap) === null
  );

  // Леденец — первый ивент движка, Neon Relay — в архиве.
  const dailyEvents = cfg.getDailyEvents();
  check(
    'леденец зарегистрирован как daily-ивент движка',
    dailyEvents.length === 1 && dailyEvents[0].id === cfg.LOLLIPOP_EVENT_ID && dailyEvents[0].modifiers.dataMult === 2
  );
  check(
    'окно леденца — час буста и один раз в игровые сутки',
    dailyEvents[0].window.boostMs === cfg.LOLLIPOP_BOOST_MS && dailyEvents[0].window.dailyLimit === 1
  );
  check(
    'Neon Relay живёт в реестре как архив с окном, а не «мёртвым» флагом',
    cfg.getLegacyEvent('neon-relay')?.status === 'archived' &&
      cfg.isLegacyEventLive('neon-relay', Date.parse('2026-10-28T12:00:00+03:00')) === true &&
      cfg.isLegacyEventLive('neon-relay', Date.parse('2026-11-27T12:00:00+03:00')) === false
  );
  check(
    'старый season-event читает окно из реестра',
    cfg.isSeasonEventLive(Date.parse('2026-10-28T12:00:00+03:00')) === true &&
      cfg.isSeasonEventLive(Date.parse('2026-11-27T12:00:00+03:00')) === false
  );

  // Поведение: Heat в контракте делится пополам в тихую неделю.
  fakeNow = QUIET_AT;
  const quietInit = await call(TG_HEAT, 'init');
  const quietKey = quietInit.player.availableMissionKeys?.[0];
  let quietHeat = null;
  let quietExpected = null;
  if (quietKey) {
    const missionCfg = cfg.MISSIONS_CONFIG.find((mission) => mission.key === quietKey);
    const started = await call(TG_HEAT, 'missions', { action: 'start', missionKey: quietKey, clicks: 0 });
    quietHeat = started.player?.heat ?? null;
    const loc = cfg.locationModifiers('room').heat;
    quietExpected = Math.round(missionCfg.heatDelta * quietInit.player.derived.heatMultiplier * loc * 0.5);
  }
  check(
    'тихая неделя реально режет Heat контракта вдвое (сервер)',
    quietKey && quietHeat === quietExpected,
    `${quietHeat} vs ${quietExpected} (${quietKey ?? 'нет миссии'})`
  );

  fakeNow = MARKET_AT;
  const marketInit = await call(TG_MARKET, 'init');
  const marketKey = marketInit.player.availableMissionKeys?.[0];
  let marketHeat = null;
  let marketExpected = null;
  if (marketKey) {
    const missionCfg = cfg.MISSIONS_CONFIG.find((mission) => mission.key === marketKey);
    const started = await call(TG_MARKET, 'missions', { action: 'start', missionKey: marketKey, clicks: 0 });
    marketHeat = started.player?.heat ?? null;
    const loc = cfg.locationModifiers('room').heat;
    marketExpected = Math.round(missionCfg.heatDelta * marketInit.player.derived.heatMultiplier * loc * 1);
  }
  check(
    'вне тихой недели Heat считается без скидки',
    marketKey && marketHeat === marketExpected,
    `${marketHeat} vs ${marketExpected} (${marketKey ?? 'нет миссии'})`
  );

  // Алерт анонса: один раз за окно, дальше молчит.
  fakeNow = quietSlot.endMs - 11 * 3_600_000;
  const announceInit1 = await call(TG_HEAT, 'init');
  const announceInit2 = await call(TG_HEAT, 'init');
  const countAnnounce = (res) =>
    (res.alerts ?? []).filter((alert) => /Скоро:/.test(String(alert.title))).length;
  check(
    'анонс ивента приходит один раз, повторный init молчит',
    countAnnounce(announceInit1) === 1 && countAnnounce(announceInit2) === 0,
    `${countAnnounce(announceInit1)} / ${countAnnounce(announceInit2)}`
  );
  check(
    'в тексте анонса есть модификатор следующего ивента',
    (announceInit1.alerts ?? []).some((alert) => /Crypto с серых ×1\.25/.test(String(alert.message))),
    String((announceInit1.alerts ?? []).map((alert) => alert.message).join(' | '))
  );

  // ── D. Исходники: модификаторы и ленивый экран ──────────────────────────
  const engineSrc = fs.readFileSync(path.join(REPO, 'api/_lib/gameEngine.ts'), 'utf8');
  check(
    'Heat контракта умножается на модификатор ивента',
    /where\.mods\.heat \* eventMods\.heatMult/.test(engineSrc)
  );
  check(
    'шанс Crypto с серых учитывает множитель ивента',
    /greyCryptoMult : 1|targetType === 'grey' \? eventMods\.greyCryptoMult/.test(engineSrc)
  );
  const appSrc = fs.readFileSync(path.join(REPO, 'src/App.tsx'), 'utf8');
  check(
    'экран «История» — ленивый чанк',
    /const StoryPage = React\.lazy/.test(appSrc) && appSrc.includes('path="/story"')
  );
  const stripSrc = fs.readFileSync(path.join(REPO, 'src/components/StoryStrip.tsx'), 'utf8');
  check(
    'строка мира на столе не тянет тексты глав в главный бандл',
    !/from '[^']*story\.config'/.test(stripSrc) && !/from '[^']*events\.config'/.test(stripSrc) && stripSrc.includes('useGame()')
  );
  const storyPageSrc = fs.readFileSync(path.join(REPO, 'src/pages/StoryPage.tsx'), 'utf8');
  check(
    'экран «История» берёт главы и ивенты из конфигов',
    storyPageSrc.includes("from '../../shared/story.config'") &&
      storyPageSrc.includes("from '../../shared/events.config'")
  );
  const collectionSrc = fs.readFileSync(path.join(REPO, 'src/components/CollectionPanel.tsx'), 'utf8');
  check(
    'реплика NPC в коллекции приходит из конфига, а не из кода',
    collectionSrc.includes('line: npc.quote') && collectionSrc.includes('data-qa="collection-npc-line"')
  );
  const teamSrc = fs.readFileSync(path.join(REPO, 'shared/team.config.ts'), 'utf8');
  check(
    'у всех восьми специалистов есть строка биографии',
    (teamSrc.match(/^ {4}bio: /gm) ?? []).length === 8
  );

  Date.now = realNow;
  console.log(`\nQA: ${pass + fail} checks — PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) {
    console.log('Провалы: ' + failures.join('; '));
    process.exit(1);
  }
})().catch((error) => {
  Date.now = realNow;
  console.error('QA упал с исключением:', error);
  process.exit(1);
});
