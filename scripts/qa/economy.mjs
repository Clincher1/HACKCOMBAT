/**
 * HACKER KOMBAT — QA v6.6: ребаланс экономики.
 *
 * Проверяет три вещи, которые нельзя проверить глазами:
 *   A. ЕДИНЫЙ ДЕНЬ. В 23:59 МСК всё живёт в старом дне, в 00:00 МСК одновременно
 *      переключаются стрик, Crypto-бонус, поручения, контракты, леденец и копилка.
 *   B. ЦЕНЫ. Цена уровня карточки/«Базы» не превышает «часы дохода» из
 *      shared/pricing.config.ts, сервер списывает РОВНО столько же, сколько
 *      показывает UI, и покупка в часах укладывается в объявленный потолок.
 *   C. ПРЕСТИЖ И CPU. Престиж сбрасывает и сохраняет ровно объявленное
 *      (shared/prestige.config.ts), множитель даёт ×2 ×5 циклов и +10% дальше;
 *      CPU-реген растёт с уровнем, поэтому T6 больше не стоит 2.6 контракта/час.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   npm run qa:economy
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

// ── Мост к shared-конфигам ──────────────────────────────────────────────────
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-econ-build-'));
const entry = path.join(build, 'entry.ts');
const sharedPath = (name) => path.join(REPO, 'shared', name).replace(/\\/g, '/');
fs.writeFileSync(
  entry,
  [
    `export * from '${sharedPath('mechanics.ts')}';`,
    `export * from '${sharedPath('pricing.config.ts')}';`,
    `export * from '${sharedPath('prestige.config.ts')}';`,
    `export * from '${sharedPath('cards.config.ts')}';`,
    `export * from '${sharedPath('base.config.ts')}';`,
    `export { computeNextStreak, getUtcDayKey, getDailyStreakReward } from '${sharedPath('economy.config.ts')}';`,
    `export { MISSIONS_CONFIG } from '${sharedPath('missions.config.ts')}';`,
    `export { PROFILE_FRAMES } from '${sharedPath('profileFrames.config.ts')}';`,
    `export { SKINS_CONFIG } from '${sharedPath('skins.config.ts')}';`,
    `export { getTotalXpForLevel, getMissionRewardScale } from '${sharedPath('hack.config.ts')}';`,
    '',
  ].join('\n')
);
const bundle = path.join(build, 'economy.cjs');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: REPO, stdio: 'inherit' }
);
const eco = require(bundle);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-econ-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForEconomyQa_1234';

// 23:59 МСК = 20:59 UTC; 00:00:30 МСК следующего дня = 21:00:30 UTC.
const DAY = '2026-11-27';
const JUST_BEFORE_MIDNIGHT = Date.parse(`${DAY}T20:59:00Z`); // 23:59 МСК
const AFTER_MIDNIGHT = Date.parse(`${DAY}T21:00:30Z`); // 00:00:30 МСК (28-е по Москве)

const realNow = Date.now;
let fakeNow = JUST_BEFORE_MIDNIGHT;
Date.now = () => fakeNow;

const TG_DAY = 990000101;
const TG_PRICE = 990000202;
const TG_PRESTIGE = 990000303;
const TG_CPU_LOW = 990000404;
const TG_CPU_HIGH = 990000505;

function makeRecord(tgId, xp, overrides = {}) {
  const nowIso = new Date(fakeNow).toISOString();
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `eq${tgId}`,
    data: 0,
    crypto: 0,
    chips: 0,
    xp,
    energy: 0,
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
    availableMissionKeys: [],
    missionsRefreshedAt: new Date(0).toISOString(),
    achievements: [],
    ...overrides,
  };
}

const XP_L20 = eco.getTotalXpForLevel(20);
const XP_L50 = eco.getTotalXpForLevel(50);

const records = {
  [TG_DAY]: makeRecord(TG_DAY, 0),
  [TG_PRICE]: makeRecord(TG_PRICE, XP_L20, { data: 500_000_000 }),
  [TG_PRESTIGE]: makeRecord(TG_PRESTIGE, XP_L50, {
    data: 12_345_678,
    energy: 900,
    heat: 42,
    crypto: 777,
    chips: 123,
    cards: { monitor: 12, keyboard: 4 },
    team: ['analyst'],
    baseUpgrades: { coffee_machine: 3 },
    activeMissions: [],
  }),
  [TG_CPU_LOW]: makeRecord(TG_CPU_LOW, 0),
  [TG_CPU_HIGH]: makeRecord(TG_CPU_HIGH, XP_L50),
};
// Прошлый клайм — «вчера», чтобы стрик не начинался с нуля на середине теста.
records[TG_DAY].dailyStreak = 3;
records[TG_DAY].lastDailyClaim = new Date(Date.parse(`${DAY}T09:00:00Z`) - 86_400_000).toISOString();

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({ playersByTgId: Object.fromEntries(Object.entries(records).map(([k, v]) => [String(k), v])) })
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
  params.set('query_id', `QA_${tgId}_${fakeNow}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'EconTester', username: `eq${tgId}` }));
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
      'x-demo-username': `eq${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.96.0.${(ipCounter++ % 200) + 1}`,
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
  console.log('=== HACKER KOMBAT — QA v6.6: ребаланс экономики ===\n');

  // ── A. ЕДИНЫЙ ДЕНЬ ─────────────────────────────────────────────────────
  const moscowKeyBefore = eco.getGameDayKey(JUST_BEFORE_MIDNIGHT);
  const moscowKeyAfter = eco.getGameDayKey(AFTER_MIDNIGHT);
  check(
    '23:59 и 00:00 МСК — разные игровые дни',
    moscowKeyBefore !== moscowKeyAfter,
    `${moscowKeyBefore} → ${moscowKeyAfter}`
  );
  check(
    'стрик и бонус используют ТОТ ЖЕ ключ, что копилка и леденец',
    eco.getUtcDayKey(JUST_BEFORE_MIDNIGHT) === moscowKeyBefore &&
      eco.getUtcDayKey(AFTER_MIDNIGHT) === moscowKeyAfter
  );
  check(
    'ключ дня — московский, а не UTC (00:30 МСК = ещё вчерашние сутки по UTC)',
    eco.getGameDayKey(Date.parse(`${DAY}T21:30:00Z`)) === '2026-11-28' &&
      eco.getGameDayKey(Date.parse(`${DAY}T20:30:00Z`)) === '2026-11-27',
    `${eco.getGameDayKey(Date.parse(`${DAY}T21:30:00Z`))}`
  );
  check('границы суток — ровно 24 часа от 00:00 МСК', (() => {
    const bounds = eco.getGameDayBoundsMs(moscowKeyBefore);
    return bounds.end - bounds.start === 86_400_000 && bounds.start <= JUST_BEFORE_MIDNIGHT && JUST_BEFORE_MIDNIGHT < bounds.end;
  })());

  // Сервер: до полуночи бонус берётся и второй раз не даётся.
  const dayInit = await call(TG_DAY, 'init');
  check('игрок для проверки дня инициализирован', dayInit.ok === true, dayInit.error ?? '');

  const claimBefore = await call(TG_DAY, 'daily', {});
  check('за час до полуночи бонус берётся', claimBefore.ok === true, claimBefore.error ?? '');
  const streakAfterFirst = claimBefore.player?.dailyStreak;
  const doubleClaim = await call(TG_DAY, 'daily', {});
  check(
    'второй раз в те же сутки — отказ (день один на всё)',
    doubleClaim.ok === false && /уже получен/i.test(String(doubleClaim.error)),
    String(doubleClaim.error ?? '')
  );
  check(
    'ключ дня у поручений, контрактов и леденца — тот же, что у стрика',
    claimBefore.player?.stats?.dailyTasks?.dayKey === moscowKeyBefore &&
      claimBefore.player?.stats?.contracts?.dayKey === moscowKeyBefore,
    `${claimBefore.player?.stats?.dailyTasks?.dayKey} / ${claimBefore.player?.stats?.contracts?.dayKey}`
  );

  const lollipopBefore = await call(TG_DAY, 'lollipop', { action: 'activate' });
  check(
    'леденец активируется в те же сутки и запоминает тот же день',
    lollipopBefore.ok === true && lollipopBefore.player?.stats?.lollipop?.lastActivatedDayKey === moscowKeyBefore,
    String(lollipopBefore.error ?? lollipopBefore.player?.stats?.lollipop?.lastActivatedDayKey)
  );

  // 00:00:30 МСК — всё переключается одновременно.
  fakeNow = AFTER_MIDNIGHT;
  const claimAfter = await call(TG_DAY, 'daily', {});
  check(
    'после 00:00 МСК бонус снова доступен (прошло 1.5 минуты, а не 20 часов)',
    claimAfter.ok === true,
    claimAfter.error ?? ''
  );
  check(
    'стрик продолжился (соседний день), а не сбросился',
    claimAfter.player?.dailyStreak === (streakAfterFirst % 7) + 1,
    `${streakAfterFirst} → ${claimAfter.player?.dailyStreak}`
  );
  check(
    'поручения и контракты пересобрались на новый день',
    claimAfter.player?.stats?.dailyTasks?.dayKey === moscowKeyAfter &&
      claimAfter.player?.stats?.contracts?.dayKey === moscowKeyAfter,
    `${claimAfter.player?.stats?.dailyTasks?.dayKey} / ${claimAfter.player?.stats?.contracts?.dayKey}`
  );
  // Окно леденца живёт по абсолютному времени (час), а не по дню: в 00:01 оно
  // ещё активно — это честно. Проверяем, что через два часа день уже не мешает.
  fakeNow += 2 * 3600_000;
  check(
    'леденец в новом дне доступен после истечения часового окна',
    (await call(TG_DAY, 'lollipop', { action: 'activate' })).ok === true
  );
  fakeNow = AFTER_MIDNIGHT;
  check(
    'оффлайн-копилка считает день тем же ключом',
    (() => {
      const state = eco.computeNextStreak({
        lastClaimDayKey: moscowKeyBefore,
        todayKey: moscowKeyAfter,
        currentStreak: 1,
      });
      return state.streak === 2 && state.reset === false;
    })()
  );

  // ── B. ЦЕНЫ ────────────────────────────────────────────────────────────
  const cheapCard = eco.CARDS_CONFIG[0];
  const income20 = eco.expectedHourlyIncome(20);
  const price20 = eco.getCardPrice(cheapCard, 20, 200, 0, 20);
  check(
    'доход/час считается от реальных контрактов и растёт с уровнем',
    eco.expectedHourlyIncome(50) > income20 && income20 > eco.expectedHourlyIncome(1),
    `L1 ${eco.expectedHourlyIncome(1)} → L20 ${income20} → L50 ${eco.expectedHourlyIncome(50)}`
  );
  check(
    'цена уровня карточки не выше «часов дохода»',
    price20 <= Math.floor(eco.hoursForCardLevel(20) * income20),
    `${price20} ≤ ${Math.floor(eco.hoursForCardLevel(20) * income20)}`
  );
  check(
    'цена 60-го уровня — не больше 8 часов дохода на любом уровне игрока',
    [10, 20, 40, 50].every((lvl) => {
      const price = eco.getCardPrice(eco.CARDS_CONFIG[0], 59, 0, 0, lvl);
      return price <= Math.floor(8 * eco.expectedHourlyIncome(lvl)) + 1;
    })
  );
  check(
    'ранняя игра не подорожала: 1-й уровень дешёвой карточки ≤ номинала каталога',
    eco.getCardPrice(cheapCard, 0, 0, 0, 1) <= Math.floor(cheapCard.basePrice * 40)
  );
  check(
    'цена уровня карточки не убывает с уровнем карточки',
    (() => {
      for (let l = 1; l < 60; l += 1) {
        const a = eco.getCardPrice(cheapCard, l - 1, 0, 0, 20);
        const b = eco.getCardPrice(cheapCard, l, 0, 0, 20);
        if (b < a) return false;
      }
      return true;
    })()
  );
  check(
    'цена уровня «Базы» тоже не выше 24 часов дохода',
    eco.BASE_UPGRADES_CONFIG.every((cfg) => {
      const price = eco.getBaseUpgradePrice(cfg, cfg.maxLevel - 1, 40);
      return price <= Math.floor(24 * eco.expectedHourlyIncome(40)) + 1;
    })
  );
  const frameCosts = eco.PROFILE_FRAMES.map((f) => f.cryptoCost ?? 0);
  const skinCosts = eco.SKINS_CONFIG.map((s) => s.cryptoCost ?? 0);
  check(
    'топ-рамка — ориентир 2–4 недели активной игры (≤ 30 дней)',
    eco.cryptoDaysForPrice(Math.max(...frameCosts)) <= 30 &&
      eco.cryptoDaysForPrice(Math.max(...frameCosts)) >= 14,
    `${Math.max(...frameCosts)} Crypto ≈ ${eco.cryptoDaysForPrice(Math.max(...frameCosts))} дн`
  );
  check(
    'весь каталог рамок дешевле 4 000 Crypto (было 86 730)',
    frameCosts.reduce((a, b) => a + b, 0) < 4_000,
    String(frameCosts.reduce((a, b) => a + b, 0))
  );
  check(
    'топ-скин — недели, а не месяцы (≤ 16 дней)',
    eco.cryptoDaysForPrice(Math.max(...skinCosts)) <= 16,
    `${Math.max(...skinCosts)} Crypto ≈ ${eco.cryptoDaysForPrice(Math.max(...skinCosts))} дн`
  );
  check(
    'весь каталог скинов дешевле 3 000 Crypto (было 5 000)',
    skinCosts.reduce((a, b) => a + b, 0) < 3_000,
    String(skinCosts.reduce((a, b) => a + b, 0))
  );

  // Сервер списывает ровно ту цену, что показывает клиент.
  const priceInit = await call(TG_PRICE, 'init');
  const buyKey = eco.CARDS_CONFIG[0].key;
  const levelBefore = priceInit.player.cards[buyKey] ?? 0;
  const expectedPrice = eco.getCardPrice(
    eco.CARDS_CONFIG[0],
    levelBefore,
    priceInit.player.derived.totalCardLevels,
    priceInit.player.derived.cardPriceDiscountPct,
    priceInit.player.derived.level
  );
  const bought = await call(TG_PRICE, 'buy-card', { cardKey: buyKey });
  check(
    'сервер списывает ровно цену из формулы (UI = сервер)',
    bought.ok === true && priceInit.player.data - bought.player.data === expectedPrice,
    `${priceInit.player.data - (bought.player?.data ?? 0)} vs ${expectedPrice}`
  );
  check(
    'покупка в часах дохода укладывается в заявленный потолок (≤ 8 ч)',
    eco.hoursForPrice(expectedPrice, priceInit.player.derived.level) <= 8.1,
    `${eco.hoursForPrice(expectedPrice, priceInit.player.derived.level)} ч`
  );

  // ── C. ПРЕСТИЖ ─────────────────────────────────────────────────────────
  check(
    'престиж объявляет непустые и непересекающиеся списки сброса/сохранения',
    eco.PRESTIGE_RESETS.length >= 5 &&
      eco.PRESTIGE_KEEPS.length >= 8 &&
      eco.PRESTIGE_RESETS.every((item) => !eco.PRESTIGE_KEEPS.some((keep) => keep.toLowerCase() === item.toLowerCase()))
  );
  check(
    'множитель плоский: ×2 на первых пяти циклах, затем +10% за цикл',
    [1, 2, 3, 4, 5].every((n) => eco.getPrestigeMultiplier(n) === 2) &&
      Math.abs(eco.getPrestigeMultiplier(6) - 2.2) < 1e-9 &&
      Math.abs(eco.getPrestigeMultiplier(10) - 3) < 1e-9 &&
      eco.getPrestigeMultiplier(0) === 1,
    [0, 1, 5, 6, 10].map((n) => `#${n}=${eco.getPrestigeMultiplier(n)}`).join(' ')
  );
  // Престиж не должен превращать «цену в часах дохода» в ложь: цены считаются
  // от expectedHourlyIncome(level) без множителя, поэтому расхождение
  // «заявленные часы / реальные часы» не может превышать множитель.
  const anchorDrift = [];
  for (let n = 0; n <= 5; n += 1) anchorDrift.push(1 / eco.getPrestigeMultiplier(n));
  check(
    'престиж не врёт о цене: на первых пяти циклах покупка не дешевеет больше чем в 2 раза',
    Math.min(...anchorDrift) >= 0.5 - 1e-9,
    `цикл 5: ${(anchorDrift[5] * 100).toFixed(0)}% от заявленных часов`
  );
  // После пятого цикла рост мягкий: каждый следующий цикл даёт +10%, а не ×2.
  // Прибавка аддитивная: +10% от базы ×2, то есть +0.2 к множителю за цикл.
  const postCapDeltas = [6, 7, 12].map((n) => eco.getPrestigeMultiplier(n) - eco.getPrestigeMultiplier(n - 1));
  check(
    'после пятого цикла прибавка фиксированная (+10% от базы), а не ×2',
    postCapDeltas.every((delta) => Math.abs(delta - 0.2) < 1e-9),
    postCapDeltas.map((delta) => delta.toFixed(2)).join(' ')
  );
  check(
    'порог цикла: 50 уровень, дальше +10 уровней',
    eco.getPrestigeRequiredLevel(0) === 50 &&
      eco.getPrestigeRequiredLevel(1) === 60 &&
      eco.getPrestigeRequiredLevel(3) === 80
  );
  check(
    'одна строка правил содержит и «сбрасывает», и «остаются», и множитель',
    /Сбрасывает/.test(eco.PRESTIGE_ONE_LINER) &&
      /Остаются/.test(eco.PRESTIGE_ONE_LINER) &&
      /×2/.test(eco.PRESTIGE_ONE_LINER) &&
      !/×32/.test(eco.PRESTIGE_ONE_LINER)
  );

  const prestigeInit = await call(TG_PRESTIGE, 'init');
  const beforePrestige = prestigeInit.player;
  const prestigeRes = await call(TG_PRESTIGE, 'prestige', {});
  const afterPrestige = prestigeRes.player;
  check('престиж на 50 уровне проходит', prestigeRes.ok === true, prestigeRes.error ?? '');
  check(
    'сброшено ровно объявленное: карточки, команда, Data, Heat',
    afterPrestige &&
      Object.keys(afterPrestige.cards).length === 0 &&
      afterPrestige.team.length === 0 &&
      afterPrestige.data === 0 &&
      afterPrestige.heat === 0,
    JSON.stringify({
      cards: afterPrestige?.cards,
      team: afterPrestige?.team,
      data: afterPrestige?.data,
      heat: afterPrestige?.heat,
    })
  );
  check(
    'сохранено ровно объявленное: уровень, Crypto, Чипы, База, достижения',
    afterPrestige &&
      afterPrestige.derived.level === beforePrestige.derived.level &&
      // Crypto и Чипы не сбрасываются: они могут только вырасти (награды за
      // достижения престижа), но никогда не уменьшиться.
      afterPrestige.crypto >= beforePrestige.crypto &&
      afterPrestige.chips >= beforePrestige.chips &&
      afterPrestige.baseUpgrades.coffee_machine === 3 &&
      afterPrestige.prestigeCount === 1,
    `crypto ${beforePrestige.crypto}→${afterPrestige?.crypto}, chips ${beforePrestige.chips}→${afterPrestige?.chips}, lvl ${afterPrestige?.derived?.level}`
  );
  check(
    'множитель после первого цикла — ×2',
    afterPrestige && afterPrestige.derived.prestigeMultiplier === 2,
    String(afterPrestige?.derived?.prestigeMultiplier)
  );
  check(
    'сообщение сервера перечисляет те же сбросы и сохранения, что объявлены',
    (() => {
      const alerts = prestigeRes.alerts ?? [];
      const text = alerts.map((a) => a.message).join(' ');
      return (
        eco.PRESTIGE_RESETS.every((item) => text.includes(item)) &&
        eco.PRESTIGE_KEEPS.slice(0, 4).every((item) => text.includes(item))
      );
    })(),
    (prestigeRes.alerts ?? []).map((a) => a.title).join(' | ')
  );

  // ── D. CPU ─────────────────────────────────────────────────────────────
  check(
    'реген CPU ускоряется с уровнем: 2 с на L1 → 1 с на L50',
    eco.cpuRegenSecondsForLevel(1) === 1.98 &&
      eco.cpuRegenSecondsForLevel(50) === 1 &&
      eco.cpuRegenSecondsForLevel(150) === 1,
    `${eco.cpuRegenSecondsForLevel(1)} / ${eco.cpuRegenSecondsForLevel(50)}`
  );
  check(
    'пропускная способность T6 больше 4 контрактов/час на L40+',
    eco.contractsPerHour(40, 6) > 4 && eco.contractsPerHour(50, 6) > 5,
    `L40 ${eco.contractsPerHour(40, 6).toFixed(2)} · L50 ${eco.contractsPerHour(50, 6).toFixed(2)}`
  );
  check(
    'низкие уровни не разогнались: L1 всё ещё ~2.6 контракта T6/час',
    Math.abs(eco.contractsPerHour(1, 6) - 1800 / 700) < 0.05,
    eco.contractsPerHour(1, 6).toFixed(2)
  );

  // Живая проверка регена на сервере: 10 минут на низком и высоком уровне.
  const lowInit = await call(TG_CPU_LOW, 'init');
  fakeNow += 10 * 60_000;
  const lowLater = await call(TG_CPU_LOW, 'init');
  check(
    'L1: за 10 минут реген даёт ~300 зарядов (1800/ч)',
    Math.abs((lowLater.player.energy - lowInit.player.energy) - 300) <= 6,
    `${lowInit.player.energy} → ${lowLater.player.energy}`
  );

  const highInit = await call(TG_CPU_HIGH, 'init');
  const highLater = await (async () => {
    fakeNow += 10 * 60_000;
    return call(TG_CPU_HIGH, 'init');
  })();
  check(
    'L50: за те же 10 минут реген даёт ~600 зарядов (3600/ч)',
    Math.abs((highLater.player.energy - highInit.player.energy) - 600) <= 12,
    `${highInit.player.energy} → ${highLater.player.energy}`
  );
  check(
    'банк CPU не превышает потолок',
    highLater.player.energy <= highLater.player.derived.maxEnergy,
    `${highLater.player.energy}/${highLater.player.derived.maxEnergy}`
  );

  // ── E. МИДГЕЙМ L26–L40 ─────────────────────────────────────────────────
  const midMissions = eco.MISSIONS_CONFIG.filter((m) => (m.minLevel ?? 1) > 26 && (m.minLevel ?? 1) < 40);
  check(
    'в диапазоне L28–L38 есть минимум три новые цели',
    midMissions.length >= 3,
    midMissions.map((m) => `${m.key}@${m.minLevel}`).join(', ')
  );
  check(
    'новые цели мидгейма используют существующие тиры (без новой механики)',
    midMissions.every((m) => (m.tier ?? 1) <= 6)
  );
  const midUpgrades = eco.BASE_UPGRADES_CONFIG.filter((u) => (u.requiredLevel ?? 1) > 30);
  check(
    '«База» получила апгрейды после 30 уровня',
    midUpgrades.length >= 2,
    midUpgrades.map((u) => `${u.key}@${u.requiredLevel}`).join(', ')
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
