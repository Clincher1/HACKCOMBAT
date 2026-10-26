/**
 * HACKER KOMBAT — QA v3.5: Чипы и суточный лимит.
 *
 * Что проверяем:
 *   1) кап CHIP_DAILY_CAP реально применяется (раньше константа была
 *      импортирована, но не использовалась — лимит жил только в README);
 *   2) сверх лимита Чипы не капают, но контракт всё равно засчитывается:
 *      Data/XP продолжают начисляться, игрок не теряет миссию;
 *   3) при смене игровых суток счётчик обнуляется и Чипы снова падают;
 *   4) счётчик виден в API (stats.chipsToday) — на нём держится карточка в профиле.
 *
 * Миссии длятся 40+ секунд, поэтому время двигаем вручную (Date.now), как в
 * qa:offline и qa:referral. Сеть не нужна.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/chips.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-chips-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForChipsQa_1234567890';

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

// Время под контролем: миссии «досиживаем» мгновенно.
const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;

let ipCounter = 0;
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(fakeNow / 1000)));
  params.set('query_id', `QA_${tgId}_${fakeNow}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'ChipTester', username: `chip${tgId}` }));
  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}

async function tgPost(tgId, route, body = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `chip${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.93.0.${(ipCounter++ % 200) + 1}`,
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

/**
 * Один полный контракт: старт → перемотка времени → забор.
 * Возвращает, сколько Чипов прибавилось и был ли успех.
 */
async function runMission(tgId, state) {
  // Если остался незакрытый контракт (прошлый claim не удался) — сначала забираем его.
  let mission = (state.player.activeMissions ?? [])[0] ?? null;

  if (!mission) {
    let offer = state.player.availableMissionKeys ?? [];
    if (offer.length === 0) {
      const refreshed = await tgPost(tgId, 'missions', { action: 'refresh' });
      if (!refreshed.ok) return { ok: false, reason: refreshed.error };
      state.player = refreshed.player;
      offer = refreshed.player.availableMissionKeys ?? [];
      if (offer.length === 0) return { ok: false, reason: 'нет витрины' };
    }

    let started = await tgPost(tgId, 'missions', { action: 'start', missionKey: offer[0] });
    if (!started.ok) {
      // Витрина могла устареть — обновляем и пробуем ещё раз.
      const refreshed = await tgPost(tgId, 'missions', { action: 'refresh' });
      if (!refreshed.ok) return { ok: false, reason: started.error };
      state.player = refreshed.player;
      const retryKey = (refreshed.player.availableMissionKeys ?? [])[0];
      if (!retryKey) return { ok: false, reason: 'нет витрины' };
      started = await tgPost(tgId, 'missions', { action: 'start', missionKey: retryKey });
      if (!started.ok) return { ok: false, reason: started.error };
    }

    state.player = started.player;
    mission = (started.player.activeMissions ?? [])[0] ?? null;
    if (!mission) return { ok: false, reason: 'миссия не создалась' };
  }

  const chipsBefore = state.player.chips ?? 0;
  const chipsTodayBefore = state.player.stats.chipsToday ?? 0;

  // Перематываем за время миссии (шаг < 45 с, чтобы активность считалась).
  fakeNow += 45_000;
  fakeNow += 900_000;

  const claimed = await tgPost(tgId, 'missions', { action: 'claim', missionId: mission.id });
  if (!claimed.ok) {
    state.player = (await tgPost(tgId, 'init')).player;
    return { ok: false, reason: claimed.error };
  }

  state.player = claimed.player;
  return {
    ok: true,
    chipsGained: (state.player.chips ?? 0) - chipsBefore,
    chipsTodayBefore,
    chipsToday: state.player.stats.chipsToday ?? 0,
    alerts: claimed.alerts ?? [],
  };
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.5: Чипы и дневной лимит ===\n');

  const TG = 910000001;
  let r = await tgPost(TG, 'init');
  check('игрок создан', r.ok === true, r.player?.id);
  check('счётчик Чипов стартует с нуля', (r.player.stats.chipsToday ?? 0) === 0);

  const state = { player: r.player };

  // ── 1. Чипы вообще падают с контрактов ────────────────────────────────────
  let totalChips = 0;
  let successes = 0;
  let capAlertSeen = 0;

  // До 240 попыток: часть миссий провалится (шанс ~0.88), но кап в 45 упрёмся.
  for (let i = 0; i < 240; i++) {
    const res = await runMission(TG, state);
    if (!res.ok) break;
    if (res.chipsGained > 0) successes += 1;
    totalChips += res.chipsGained;
    if (res.alerts.some((a) => /лимит Чипов/i.test(a.title))) capAlertSeen += 1;
    if ((res.chipsToday ?? 0) >= 45) break;
  }

  check('Чипы падают за успешные контракты', successes > 0, `успехов=${successes}`);
  check(
    'дневной лимит не превышен',
    (state.player.stats.chipsToday ?? 0) <= 45,
    `chipsToday=${state.player.stats.chipsToday}`
  );
  check('лимит реально упёрся в 45', (state.player.stats.chipsToday ?? 0) === 45, state.player.stats.chipsToday);

  // Предупреждение показывается на первом УСПЕШНОМ контракте сверх лимита
  // (провал Чипов не просит — значит и повода предупреждать нет) и только раз.
  let capAlerts = 0;
  for (let i = 0; i < 12 && capAlerts === 0; i++) {
    const res = await runMission(TG, state);
    if (!res.ok) break;
    if (res.alerts.some((a) => /лимит Чипов/i.test(a.title))) capAlerts += 1;
  }
  check('предупреждение о лимите показано', capAlerts === 1, `раз=${capAlerts}`);

  let repeats = 0;
  for (let i = 0; i < 5; i++) {
    const res = await runMission(TG, state);
    if (!res.ok) break;
    if (res.alerts.some((a) => /лимит Чипов/i.test(a.title))) repeats += 1;
  }
  check('повторно про лимит не спамим', repeats === 0, `повторов=${repeats}`);

  // ── 2. Сверх лимита: счётчик за сутки стоит, но контракт засчитывается ───
  // ВАЖНО: общий баланс Чипов всё-таки может вырасти — награды за достижения
  // идут В ОБХОД лимита (одноразовые, не фарм). Инвариант капа — «chipsToday»,
  // он обязан стоять на 45, а не общий баланс.
  // Секции выше прокрутили игровое время — день мог смениться и счётчик
  // обнулиться. Догоняем кап заново, чтобы проверять именно состояние «на лимите».
  let catchUp = 0;
  while ((state.player.stats.chipsToday ?? 0) < 45 && catchUp < 300) {
    const res = await runMission(TG, state);
    catchUp += 1;
    if (!res.ok) break;
  }

  const chipsAtCap = state.player.chips;
  const chipsTodayAtCap = state.player.stats.chipsToday;
  const dayAtCap = state.player.stats.chipsDayKey;
  const xpAtCap = state.player.xp;
  const dataAtCap = state.player.data;

  let missionsBeyondCap = 0;
  let counterGrew = 0;
  let dayRolled = false;
  let overCap = 0;
  for (let i = 0; i < 5; i++) {
    const res = await runMission(TG, state);
    if (!res.ok) break;
    missionsBeyondCap += 1;
    const today = state.player.stats.chipsToday ?? 0;
    if (today > 45) overCap += 1;
    // Каждые ~15 миссий игровое время уходит за полночь и счётчик легально
    // обнуляется — это штатный сброс, а не «рост сверх капа».
    if (state.player.stats.chipsDayKey !== dayAtCap) {
      dayRolled = true;
      break;
    }
    if (today > chipsTodayAtCap) counterGrew += 1;
  }
  check('перед проверкой снова стоим на капе', chipsTodayAtCap === 45, `chipsToday=${chipsTodayAtCap}`);
  check(
    'счётчик за сутки не растёт сверх капа',
    counterGrew === 0 && overCap === 0,
    `chipsToday=${state.player.stats.chipsToday}${dayRolled ? ' (перешли в новые сутки — сброс штатный)' : ''}`
  );
  check(
    'но контракт всё равно засчитан (XP/Data идут)',
    state.player.xp > xpAtCap || state.player.data > dataAtCap + 100,
    `xp ${xpAtCap}→${state.player.xp}`
  );
  check('после капа миссии всё равно закрываются', missionsBeyondCap > 0, `контрактов=${missionsBeyondCap}`);

  // Общий баланс мог вырасти только за счёт достижений (они вне лимита).
  if (state.player.chips > chipsAtCap) {
    console.log(
      `  (справка: общий баланс ${chipsAtCap}→${state.player.chips} вырос за счёт достижений — это штатно)`
    );
  }

  // ── 3. Смена суток обнуляет счётчик ──────────────────────────────────────
  fakeNow += 24 * 3600 * 1000;
  r = await tgPost(TG, 'init');
  state.player = r.player;
  check('после полуночи счётчик обнулился', (r.player.stats.chipsToday ?? 0) === 0, r.player.stats.chipsToday);

  // Исход контракта случайный (~88% успеха), поэтому пробуем несколько раз:
  // важно, что кап СНЯЛСЯ, а не что повезло с первого взлома.
  let nextDayChips = 0;
  for (let i = 0; i < 6 && nextDayChips === 0; i++) {
    const resNextDay = await runMission(TG, state);
    if (!resNextDay.ok) break;
    nextDayChips = state.player.stats.chipsToday ?? 0;
  }
  check('на следующий день Чипы снова падают', nextDayChips > 0, `chipsToday=${nextDayChips}`);

  // ── 4. Счётчик в API ─────────────────────────────────────────────────────
  r = await tgPost(TG, 'init');
  check(
    'stats.chipsToday доступен клиенту',
    Number.isFinite(Number(r.player.stats.chipsToday)),
    r.player.stats.chipsToday
  );

  Date.now = realNow;

  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.log('Провалы:', failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  Date.now = realNow;
  console.error('QA упал:', err);
  process.exit(1);
});
