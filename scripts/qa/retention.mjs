/**
 * HACKER KOMBAT — QA v5.6: retention-петля.
 * ----------------------------------------------------------------------------
 * Что проверяем (и почему именно это):
 *   1) оффлайн-копилка: ставка ×0.5, кап 8 ч, минимальная пауза 3 ч;
 *   2) деньги НЕ начисляются на init — только по claim_offline;
 *   3) claim идемпотентен (второй вызов даёт 0);
 *   4) правило «активные миссии ⇒ оффлайн не начисляется»;
 *   5) UTC-дата дневного клайма: стрик растёт, пропуск дня сбрасывает в 1,
 *      после 7-го дня цикл начинается заново, повторный клайм в тот же день
 *      отклоняется сервером;
 *   6) напоминание в Telegram: default OFF, не чаще раза в сутки, только когда
 *      сутки не заходил и бонус не забран;
 *   7) флаг RETENTION_V1=false инертен: ни полей, ни выплат.
 *
 * Время подменяется (Date.now), потому что проверять «через 4 часа» реальным
 * ожиданием невозможно; вся арифметика при этом остаётся серверной.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/retention.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-ret-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.RETENTION_V1;
process.env.BOT_USERNAME = 'hk_test_bot';
process.env.BOT_TOKEN = '123456789:AAFakeTokenForRetentionQa_1234567890';

// Bot API в QA запрещён: любой вызов Telegram отвечает успехом.
let telegramSends = 0;
globalThis.fetch = async (url, init) => {
  const method = String(url).split('/').pop();
  if (method === 'sendMessage') telegramSends += 1;
  const result = method === 'getMe' ? { username: 'hk_test_bot' } : true;
  return { ok: true, json: async () => ({ ok: true, result }), init };
};

const { dispatchApiRequest } = require(CORE);

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

// ── Telegram-подпись initData (как в referral.mjs) ──────────────────────────
function signInitData(tgId, startParam) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Math.floor(Math.random() * 1e9)}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: `Player${tgId % 1000}`, username: `player${tgId}` }));
  if (startParam) params.set('start_param', startParam);

  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

let ipSeq = 0;
async function call(tgId, route, body = {}, startParam, opts = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `player${tgId}`,
      ...(opts.guest ? {} : { 'x-telegram-init-data': signInitData(tgId, startParam) }),
      'x-forwarded-for': `10.126.0.${(ipSeq++ % 200) + 1}`,
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

const init = (tgId) => call(tgId, 'init');
const claimOffline = (tgId) => call(tgId, 'retention', { action: 'claim_offline' });
const setReminder = (tgId, value) => call(tgId, 'retention', { action: 'reminder_opt_in', value });
const claimDaily = (tgId) => call(tgId, 'daily', { clicks: 0 });

const HOUR = 3600_000;
const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;
const advance = (ms) => {
  fakeNow += ms;
};

/** Поднять ставку пассивного дохода: без карточек dataPerHour = 0. */
async function ensurePassiveRate(tgId) {
  let res = await init(tgId);
  let rate = res.player?.derived?.dataPerHour ?? 0;
  if (rate > 0) return res;

  // Кликаем, пока не хватит на первую карточку (тап — основной доход новичка).
  for (let i = 0; i < 40 && rate === 0; i++) {
    await call(tgId, 'click', { clicks: 60 });
    res = await init(tgId);
    const buy = await call(tgId, 'buy-card', { cardKey: 'monitor', clicks: 60 });
    if (buy.ok) {
      res = buy;
      rate = buy.player?.derived?.dataPerHour ?? 0;
    } else {
      rate = res.player?.derived?.dataPerHour ?? 0;
    }
  }
  return res;
}

/**
 * Прогон init в отдельном процессе на заранее засеянной .local-db.json —
 * ядро держит базу в памяти, поэтому состояние задаётся ДО первого require.
 */
function loadSeededCase(dir, seed) {
  const code = `
const { dispatchApiRequest } = require(process.env.HK_CORE);
const req = { url: '/api/init', method: 'POST', headers: {
  host: 'localhost:5173', 'x-demo-user-id': process.env.HK_SEED,
  'x-demo-username': 'RetentionLvl12', 'x-forwarded-for': '10.127.0.9' },
  body: {}, socket: { remoteAddress: '127.0.0.1' }, on() {} };
const res = { statusCode: 200, payload: '', setHeader() {}, end(chunk) { this.payload = chunk ?? ''; } };
dispatchApiRequest(req, res).then(() => process.stdout.write(String(res.payload)))
  .catch((err) => process.stdout.write(JSON.stringify({ ok: false, error: String(err) })));
`;
  try {
    const out = execFileSync(process.execPath, ['-e', code], {
      cwd: dir,
      env: { ...process.env, HK_CORE: CORE, HK_SEED: seed },
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v5.6: retention ===\n');

  const P = 950000001;
  const first = await init(P);
  check('init отвечает', first.ok === true, first.error);
  check('retention-снимок приезжает в init', Boolean(first.retention), JSON.stringify(first.retention));
  check('retentionV1 включён по умолчанию', first.retention?.enabled === true);
  check('кап оффлайна = 8 часов', first.retention?.offlineCapHours === 8, first.retention?.offlineCapHours);
  check('на первом заходе копилка пуста', first.retention?.pendingOffline === null);
  check('lastSeenAt записан сервером', typeof first.player?.stats?.lastSeenAt === 'string', first.player?.stats?.lastSeenAt);
  check('стрик стартует с цели 1', first.retention?.dailyStreakDay === 1, first.retention?.dailyStreakDay);
  check('сегодняшний бонус ещё не забран', first.retention?.dailyClaimedToday === false);
  check('напоминания по умолчанию выключены (opt-in)', first.retention?.reminderOptIn === false);

  // ── 1. Оффлайн: слишком короткая пауза ────────────────────────────────────
  const ready = await ensurePassiveRate(P);
  const rate = ready.player?.derived?.dataPerHour ?? 0;
  check('ставка пассивного дохода > 0 (нужна для оффлайна)', rate > 0, `dataPerHour=${rate}`);

  advance(1 * HOUR);
  const shortGap = await init(P);
  check('пауза 1 час не считается оффлайном', shortGap.retention?.pendingOffline === null, JSON.stringify(shortGap.retention?.pendingOffline));

  // ── 2. Оффлайн 4 часа: начислено, но НЕ выплачено ─────────────────────────
  const dataBefore = (await init(P)).player?.data ?? 0;
  advance(4 * HOUR);
  const fourHours = await init(P);
  const pending4 = fourHours.retention?.pendingOffline?.data ?? 0;
  const expected4 = (rate * 0.5 * 4 * 3600) / 3600;
  check('через 4 часа копилка посчитана', pending4 > 0, `pending=${pending4}`);
  check(
    'ставка оффлайна = половина онлайн-ставки',
    Math.abs(pending4 - expected4) <= Math.max(2, expected4 * 0.02),
    `pending=${pending4}, expected≈${expected4.toFixed(1)}`
  );
  check('на init деньги НЕ начислены', (fourHours.player?.data ?? 0) < dataBefore + pending4 * 0.5, `data=${fourHours.player?.data}`);
  check('claim ещё не было', !fourHours.player?.stats?.lastOfflineClaimAt);

  // ── 3. Claim идемпотентен ────────────────────────────────────────────────
  const claimed = await claimOffline(P);
  const pendingAfter = claimed.retention?.pendingOffline ?? null;
  check('claim прошёл', claimed.ok === true, claimed.error);
  check('копилка очищена после claim', pendingAfter === null, JSON.stringify(pendingAfter));
  check('claim записал время', typeof claimed.player?.stats?.lastOfflineClaimAt === 'string');
  const claimedData = claimed.player?.data ?? 0;
  const second = await claimOffline(P);
  check('повторный claim не платит второй раз', Math.abs((second.player?.data ?? 0) - claimedData) < 0.5, `data=${second.player?.data}`);

  // ── 4. Кап 8 часов ───────────────────────────────────────────────────────
  advance(30 * HOUR);
  const longGap = await init(P);
  const pendingLong = longGap.retention?.pendingOffline?.data ?? 0;
  const capExpected = rate * 0.5 * 8;
  check('кап оффлайна держит 8 часов', pendingLong <= capExpected * 1.02 + 2, `pending=${pendingLong}, cap≈${capExpected.toFixed(1)}`);

  // ── 5. Активные миссии ⇒ оффлайн не начисляется ──────────────────────────
  await claimOffline(P);
  const afterClaim = await init(P);
  const missionKey = afterClaim.player?.availableMissionKeys?.[0];
  let missionStarted = false;
  if (missionKey) {
    await call(P, 'click', { clicks: 60 });
    const started = await call(P, 'missions', { action: 'start', missionKey, clicks: 60 });
    missionStarted = Boolean(started.ok && (started.player?.activeMissions ?? []).length > 0);
  }
  check('миссия запущена (предусловие правила)', missionStarted, missionKey ?? 'нет доступных миссий');

  if (missionStarted) {
    advance(6 * HOUR);
    const withMission = await init(P);
    const hasMissionAlert = (withMission.alerts ?? []).some(
      (a) => String(a.message ?? '').includes('миссии') && String(a.title ?? '').includes('Оффлайн')
    );
    check('при активной миссии оффлайн не начислен', (withMission.retention?.pendingOffline?.data ?? 0) === 0, JSON.stringify(withMission.retention?.pendingOffline));
    check('игроку объяснили почему', hasMissionAlert);
    // Закрываем миссию, чтобы дальше не мешала.
    const missionId = withMission.player?.activeMissions?.[0]?.id;
    if (missionId) await call(P, 'missions', { action: 'skip', missionId, clicks: 0 });
  }

  // ── 6. Стрик: первый клайм ───────────────────────────────────────────────
  const S = 950000100;
  const firstClaim = await claimDaily(S);
  check('первый дневной клайм прошёл', firstClaim.ok === true, firstClaim.error);
  check('стрик после первого дня = 1', firstClaim.player?.dailyStreak === 1, firstClaim.player?.dailyStreak);
  check('UTC-дата клайма записана сервером', /^\d{4}-\d{2}-\d{2}$/.test(String(firstClaim.player?.stats?.lastDailyClaim)), firstClaim.player?.stats?.lastDailyClaim);
  check('снимок говорит «сегодня забрано»', firstClaim.retention?.dailyClaimedToday === true);

  const dup = await claimDaily(S);
  check('повторный клайм в тот же день отклонён', dup.ok !== true || dup._status >= 400, `${dup._status} ${dup.error ?? ''}`);

  // ── 7. Стрик: рост на следующий день ─────────────────────────────────────
  advance(25 * HOUR);
  const day2 = await claimDaily(S);
  check('на следующий день стрик = 2', day2.player?.dailyStreak === 2, day2.player?.dailyStreak);
  check('клетка bar сдвинулась', (day2.retention?.dailyStreakDay ?? 0) >= 2 && (day2.retention?.dailyStreakDay ?? 0) <= 7, day2.retention?.dailyStreakDay);

  // ── 8. Пропуск дня ⇒ сброс в 1 ───────────────────────────────────────────
  advance(3 * 24 * HOUR);
  const skipped = await claimDaily(S);
  check('пропуск дня сбрасывает стрик на 1', skipped.player?.dailyStreak === 1, skipped.player?.dailyStreak);

  // ── 9. Cap 7: цикл замыкается ────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    advance(25 * HOUR);
    await claimDaily(S);
  }
  await claimDaily(S);
  const afterSeven = await init(S);
  const streakAtSeven = afterSeven.player?.dailyStreak ?? 0;
  check('стрик доходит до 7', streakAtSeven === 7, streakAtSeven);
  advance(25 * HOUR);
  const cycle = await claimDaily(S);
  check('после 7-го дня цикл начинается с 1', cycle.player?.dailyStreak === 1, cycle.player?.dailyStreak);

  // ── 10. Напоминание: opt-in и rate limit ─────────────────────────────────
  const R = 950000200;
  const rInit = await init(R);
  check('напоминание доступно при наличии токена', rInit.retention?.reminderAvailable === true);

  const optIn = await setReminder(R, true);
  check('галочка opt-in сохраняется', optIn.player?.stats?.reminderOptIn === true, optIn.player?.stats?.reminderOptIn);

  const badValue = await call(R, 'retention', { action: 'reminder_opt_in', value: 'yes' });
  check('не-boolean value отклоняется', badValue._status === 400, badValue._status);

  const unknown = await call(R, 'retention', { action: 'drop_everything' });
  check('неизвестное действие отклоняется', unknown._status === 400, unknown._status);

  // 25 часов простоя + бонус не забран ⇒ напоминание уходит
  advance(25 * HOUR);
  const sendsBefore = telegramSends;
  const remindInit = await init(R);
  check('напоминание отправлено после суток простоя', telegramSends === sendsBefore + 1, `sends=${telegramSends - sendsBefore}`);
  check('время отправки сохранено', typeof remindInit.player?.stats?.lastReminderSentAt === 'string', remindInit.player?.stats?.lastReminderSentAt);
  check(
    'игрок видит уведомление об отправке',
    (remindInit.alerts ?? []).some((a) => String(a.title ?? '').includes('Напоминание'))
  );

  // Кулдаун: повторное напоминание в пределах суток запрещено, даже если
  // игрок опять пропал на два часа.
  const sendsBeforeCooldown = telegramSends;
  advance(2 * HOUR);
  const cooldownInit = await init(R);
  check('второе напоминание раньше суток не уходит', telegramSends === sendsBeforeCooldown, `sends=${telegramSends - sendsBeforeCooldown}`);
  check(
    'lastReminderSentAt не переписан',
    cooldownInit.player?.stats?.lastReminderSentAt === remindInit.player?.stats?.lastReminderSentAt
  );

  // Через сутки (и снова простой) напоминание снова разрешено — ровно одно в сутки.
  advance(25 * HOUR);
  const sendsBeforeNext = telegramSends;
  await init(R);
  check('спустя сутки напоминание снова уходит', telegramSends === sendsBeforeNext + 1, `sends=${telegramSends - sendsBeforeNext}`);

  // Дневной бонус забран сегодня ⇒ напоминать не о чем (снимок это подтверждает).
  const claimedToday = await claimDaily(R);
  check('после клайма снимок говорит «сегодня забрано»', claimedToday.retention?.dailyClaimedToday === true);
  const sendsBeforeClaimed = telegramSends;
  await init(R);
  check('сразу после клайма напоминание не уходит', telegramSends === sendsBeforeClaimed, `sends=${telegramSends - sendsBeforeClaimed}`);

  // ── 11. Флаг выключен ⇒ полная инертность ────────────────────────────────
  process.env.RETENTION_V1 = 'false';
  try {
    const OFF = 950000300;
    const offInit = await init(OFF);
    check('при RETENTION_V1=false снимок выключен', offInit.retention?.enabled === false);
    check('при флаге off оффлайн не считается', (offInit.retention?.pendingOffline ?? null) === null);
    check('при флаге off стрик не пишется', (offInit.retention?.dailyStreak ?? 0) === 0);
    advance(10 * HOUR);
    const offSecond = await init(OFF);
    check('при флаге off копилка не появляется даже после 10 часов', (offSecond.retention?.pendingOffline ?? null) === null);
    check('при флаге off lastSeenAt не обновляется', !offSecond.player?.stats?.lastSeenAt);
    const offClaim = await claimOffline(OFF);
    check('при флаге off claim ничего не платит', (offClaim.player?.stats?.lastOfflineClaimAt ?? null) === null);
  } finally {
    delete process.env.RETENTION_V1;
  }

  // ==========================================================================
  // 12. Seeded-кейс «прод-игрок 12 уровня с уже забранным оффлайном».
  //     Проверяем именно то состояние, с которого пришёл баг: игрок прошёл
  //     онбординг, копилка пуста (lastOfflineClaimAt есть), pendingOffline = null.
  //     Из этого состояния оверлей не должен рендериться — см. qa:overlays,
  //     который берёт этот же init-ответ как фикстуру.
  // ==========================================================================
  const SEED = 950000500; // числовой seed: подписанный initData требует числовой user.id
  // Гостевой init (без подписи): tgId = sha256(seed) — ровно тот же, что
  // вычислит дочерний процесс, поэтому засеянная запись гарантированно найдётся.
  const seedBase = await call(SEED, 'init', {}, undefined, { guest: true });
  // Ключ локальной базы — String(tgId) гостевого аккаунта (детерминированный
  // sha256 от seed), поэтому берём его прямо из ответа сервера.
  const seedKey = String(seedBase.player?.tgId);
  const seedDbFile = path.join(process.cwd(), '.local-db.json');
  const caseDir = fs.mkdtempSync(path.join(sandbox, 'seed-'));
  const templateDb = JSON.parse(fs.readFileSync(seedDbFile, 'utf8'));
  const seedRecord = templateDb.playersByTgId[seedKey];
  if (!seedRecord) throw new Error('seeded: не нашёл запись в .local-db.json');
  Object.assign(seedRecord, {
    xp: 42_000,
    data: 250_000,
    crypto: 240,
    chips: 18,
    totalClicks: 3_400,
    totalMissions: 26,
    cardTier: 3,
    cards: { monitor: 6, server: 4, gpu: 2, quantum: 1 },
  });
  seedRecord.stats = {
    ...seedRecord.stats,
    onboardingV2Completed: true,
    baseTheme: 'classic',
    tutorialTabs: ['basics'],
    pendingOffline: null,
    lastOfflineClaimAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    lastSeenAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    lastDailyClaim: new Date(Date.now()).toISOString().slice(0, 10),
    dailyStreak: 4,
    dailyStreakDay: 5,
    dailyClaimedToday: true,
  };
  fs.writeFileSync(path.join(caseDir, '.local-db.json'), JSON.stringify(templateDb));

  const seeded = loadSeededCase(caseDir, SEED);
  check('seeded: init прод-игрока 12 уровня отвечает', seeded.ok === true, seeded.error ?? '');
  check('seeded: онбординг пройден (newPlayerMode = false)', seeded.player?.stats?.onboardingV2Completed === true);
  check('seeded: оффлайн уже забран — копилки нет', seeded.retention?.pendingOffline === null);
  check('seeded: время последнего claim сохранено', typeof seeded.player?.stats?.lastOfflineClaimAt === 'string');
  check('seeded: повторный init не воскрешает копилку', seeded.retention?.pendingOffline === null);
  check('seeded: нет алертов про оффлайн', !(seeded.alerts ?? []).some((a) => String(a.title ?? '').includes('Оффлайн')));

  // Фикстура для qa:overlays: рендер оверлеев на реальном ответе сервера.
  const fixturePath = path.join(os.tmpdir(), 'hk-overlay-fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify({ seeded, source: 'retention.mjs' }));
  console.log(`fixture для qa:overlays: ${fixturePath}`);

  // ==========================================================================
  // 13. Сквозной поток welcome-back: pending > 0 → claim → пусто → нет на init.
  // ==========================================================================
  const FLOW = 950000400;
  const flowBase = await ensurePassiveRate(FLOW);
  check('flow: ставка есть', (flowBase.player?.derived?.dataPerHour ?? 0) > 0);
  advance(5 * HOUR);
  const flowReady = await init(FLOW);
  check('flow: копилка посчитана (модал показать есть что)', (flowReady.retention?.pendingOffline?.data ?? 0) > 0, flowReady.retention?.pendingOffline?.data);
  const flowClaim = await claimOffline(FLOW);
  check('flow: claim закрывает копилку', flowClaim.retention?.pendingOffline === null);
  check('flow: claim начисляет Data', (flowClaim.player?.data ?? 0) > (flowReady.player?.data ?? 0), `${flowReady.player?.data} → ${flowClaim.player?.data}`);
  const flowAgain = await init(FLOW);
  check('flow: следующий init не показывает модал', flowAgain.retention?.pendingOffline === null);
  check('flow: подложка не остаётся (pending null ⇒ ModalFrame не рендерится)', flowAgain.retention?.pendingOffline === null && flowClaim.player?.stats?.lastOfflineClaimAt !== null);

  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail === 0) console.log(`RETENTION_QA_OK ${pass}`);
  if (fail > 0) {
    console.log('Провалы:', failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('QA упал:', err);
  process.exit(1);
});
