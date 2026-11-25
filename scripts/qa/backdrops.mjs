/**
 * HACKER KOMBAT — QA v4.1: «вид из окна» (deskBackdrop).
 *
 * Что проверяем:
 *   1) фон включается и записывается в players.stats.deskBackdrop;
 *   2) выбор переживает перезагрузку (init возвращает тот же ключ);
 *   3) чужой/битый ключ отклоняется — в jsonb не попадает мусор;
 *   4) сброс пустым ключом возвращает сцену по уровню;
 *   5) фон НЕ списывает Data и Crypto (это косметика, а не покупка);
 *   6) фон не сбрасывает надетый скин стола (независимые слоты косметики).
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/backdrops.mjs
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-backdrops-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForBackdropsQa_123456';

const TG = 960000001;

function makeRecord(tgId) {
  const nowIso = new Date().toISOString();
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `bd${tgId}`,
    data: 12345,
    crypto: 40,
    chips: 0,
    xp: 0,
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
    unlockedSkins: ['default', 'sakura'],
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
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({ playersByTgId: { [String(TG)]: makeRecord(TG) } })
);

// Только после подкладки сейва — движок кэширует БД в модуле.
const { dispatchApiRequest } = require(CORE);

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail++;
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

let ipCounter = 0;
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Date.now()}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'BackdropTester', username: `bd${tgId}` }));
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
      'x-demo-username': `bd${tgId}`,
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

const setBackdrop = (key) => call(TG, 'skin', { action: 'set_backdrop', skinKey: key });

(async () => {
  console.log('=== HACKER KOMBAT — QA v4.1: «вид из окна» ===\n');

  let r = await call(TG, 'init');
  check('игрок создан', r.ok === true, r.player?.id);
  check('по умолчанию фон не выбран', !r.player.stats.deskBackdrop, String(r.player.stats.deskBackdrop));

  const dataBefore = r.player.data;
  const cryptoBefore = r.player.crypto;

  // ── 1. Включение ───────────────────────────────────────────────────────
  let res = await setBackdrop('rooftop_sunset');
  check('фон включается', res.ok === true, res.error ?? '');
  check(
    'в ответе пришёл алерт про фон',
    Array.isArray(res.alerts) && res.alerts.some((a) => String(a.title).includes('Вид из окна')),
    JSON.stringify((res.alerts ?? []).map((a) => a.title))
  );

  r = await call(TG, 'init');
  check('ключ сохранился в stats', r.player.stats.deskBackdrop === 'rooftop_sunset', r.player.stats.deskBackdrop);
  check(
    'косметика бесплатна: Data не списались',
    r.player.data >= dataBefore - 1,
    `${dataBefore} -> ${r.player.data}`
  );
  check(
    'косметика бесплатна: Crypto не списались',
    r.player.crypto === cryptoBefore,
    `${cryptoBefore} -> ${r.player.crypto}`
  );

  // ── 2. Независимость от скина стола ────────────────────────────────────
  await call(TG, 'skin', { action: 'buy_or_equip', skinKey: 'sakura' });
  r = await call(TG, 'init');
  check('фон не сбрасывает скин стола', r.player.equippedSkin === 'sakura', r.player.equippedSkin);
  check('скин стола не сбрасывает фон', r.player.stats.deskBackdrop === 'rooftop_sunset', r.player.stats.deskBackdrop);

  // ── 3. Валидация ───────────────────────────────────────────────────────
  res = await setBackdrop('evil_backdrop');
  check('чужой ключ отклонён', res.ok === false, String(res.error));
  r = await call(TG, 'init');
  check('мусор не попал в jsonb', r.player.stats.deskBackdrop === 'rooftop_sunset', r.player.stats.deskBackdrop);

  // ── 4. Переключение и сброс ────────────────────────────────────────────
  await setBackdrop('rain_window');
  r = await call(TG, 'init');
  check('переключение работает', r.player.stats.deskBackdrop === 'rain_window', r.player.stats.deskBackdrop);

  res = await setBackdrop('');
  check('сброс принимается', res.ok === true, res.error ?? '');
  r = await call(TG, 'init');
  check('после сброса — сцена по уровню', !r.player.stats.deskBackdrop, String(r.player.stats.deskBackdrop));

  console.log(`\nИтого: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
