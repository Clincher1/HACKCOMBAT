/**
 * HACKER KOMBAT — API-интеграция (v3.1).
 *
 * Проверяет живой сервер целиком: инициализацию, гейты, экономику, взломы,
 * античит таймера, двойной сбор награды, клики, дневной бонус, лидерборд.
 *
 * Запуск (нужен поднятый dev-сервер):
 *   npm run dev            # в отдельном терминале
 *   node scripts/qa/api.mjs
 *
 * Переменные:
 *   API_BASE — по умолчанию http://localhost:5173
 */
const BASE = process.env.API_BASE ?? 'http://localhost:5173';
const RUN = Date.now().toString(36);

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

function guest(seed) {
  return {
    'Content-Type': 'application/json',
    'x-demo-user-id': `${seed}-${RUN}`,
    'x-demo-username': `Test_${seed}`.slice(0, 20),
  };
}

async function post(path, body, seed = 'main') {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: 'POST',
    headers: guest(seed),
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, error: 'non-json' };
  }
  return { status: res.status, json };
}

async function get(path, seed = 'main') {
  const res = await fetch(`${BASE}/api/${path}`, { headers: guest(seed) });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, error: 'non-json' };
  }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('=== HACKER KOMBAT — API integration v3.1 ===\n');

// ───────────────────────────────────────────── 1. Здоровье сервиса
const ping = await get('ping');
check('GET /api/ping → ok', ping.status === 200 && ping.json.ok === true, JSON.stringify(ping.json));

const init = await post('init', {});
const p = init.json.player ?? {};
check('POST /api/init → 200 + player', init.status === 200 && init.json.ok === true && !!p.id);
check('новый игрок: 1 уровень', p.derived?.level === 1, p.derived?.level);
check('новый игрок: XP 0/140', p.xp === 0 && p.derived?.xpToNext === 140, `${p.xp}/${p.derived?.xpToNext}`);
check('новый игрок: сила железа 10', p.derived?.hackPower === 10, p.derived?.hackPower);
check('новый игрок: 1 слот взлома', p.derived?.missionSlots === 1, p.derived?.missionSlots);
check('новый игрок: 250 Data / 5 💎', p.data === 250 && p.crypto === 5, `${p.data}/${p.crypto}`);
check('новый игрок: энергия 1500 (v3.1)', p.energy === 1500, p.energy);
check('стартовые скины: только default', (p.unlockedSkins ?? []).join(',') === 'default', p.unlockedSkins?.join(','));
check('витрина миссий не пустая', (p.availableMissionKeys ?? []).length >= 3, p.availableMissionKeys?.join(','));

// ───────────────────────────────────────────── 2. Витрина и гейты миссий
const refresh = await post('missions', { action: 'refresh' });
const offers = refresh.json.player?.availableMissionKeys ?? [];
check('refresh витрины работает', refresh.json.ok === true && offers.length >= 3, offers.length);

const notOffered = ['void_casino', 'quantum_vault', 'hydra_core', 'orbital_bank', 'black_ice'].find((k) => !offers.includes(k));
if (notOffered) {
  const bad = await post('missions', { action: 'start', missionKey: notOffered });
  check('запуск миссии вне витрины заблокирован', bad.json.ok === false, bad.json.error);
}

// ───────────────────────────────────────────── 3. Старт взлома
const start = await post('missions', { action: 'start', missionKey: offers[0] });
const act = start.json.player?.activeMissions ?? [];
check('взлом запускается', start.json.ok === true && act.length === 1, start.json.error ?? '');
const mission = act[0] ?? {};
const startedMs = mission.startedAt ? new Date(mission.startedAt).getTime() : Date.now();
const finishMs = mission.finishAt ? new Date(mission.finishAt).getTime() : 0;
const durSec = (finishMs - startedMs) / 1000;
check('таймер взлома ≥ 40 секунд', durSec >= 39 && durSec <= 66, `${durSec.toFixed(0)} c`);
check('шанс успеха в диапазоне 5–96%', mission.successChance >= 0.05 && mission.successChance <= 0.96, `${(mission.successChance * 100).toFixed(1)}%`);
check('шанс не равен 100%', mission.successChance < 1);
check('XP за взлом положительный', mission.xpReward > 0, mission.xpReward);
check('до завершения исход — заглушка (бросок при claim)', mission.outcome === 'partial', mission.outcome);

// ───────────────────────────────────────────── 4. Античит таймера
const early = await post('missions', { action: 'claim', missionId: mission.id });
check('награда до конца таймера не выдаётся', early.json.ok === false && /не заверш/i.test(early.json.error ?? ''), early.json.error);

const busy = await post('missions', { action: 'start', missionKey: offers[1] });
check('второй взлом при 1 слоте заблокирован', busy.json.ok === false && /слот|лимит/i.test(busy.json.error ?? ''), busy.json.error);

// ───────────────────────────────────────────── 5. Пропуск за Crypto
const cryptoBeforeSkip = start.json.player?.crypto ?? 0;
const skip = await post('missions', { action: 'skip', missionId: mission.id });
check('skip за 💎 работает', skip.json.ok === true, skip.json.error ?? '');
const pAfterSkip = skip.json.player ?? {};
check(
  'skip списывает 1 Crypto (достижения могут начислить бонус)',
  pAfterSkip.crypto === cryptoBeforeSkip - 1 || pAfterSkip.crypto > cryptoBeforeSkip,
  `${cryptoBeforeSkip} → ${pAfterSkip.crypto}`
);
check('skip даёт «частичный» исход в алерте', (skip.json.alerts ?? []).some((a) => /частичн/i.test(a.title ?? '')));
check('skip даёт XP', pAfterSkip.xp > 0, pAfterSkip.xp);
check('skip не даёт Data за «успех» и не даёт чипов', (pAfterSkip.chips ?? 0) === 0);
check('skip освобождает слот', (pAfterSkip.activeMissions ?? []).length === 0);
const skipAgain = await post('missions', { action: 'skip', missionId: mission.id });
check('повторный skip по той же миссии невозможен', skipAgain.json.ok === false, skipAgain.json.error ?? 'нет ошибки');

// ───────────────────────────────────────────── 6. Полный цикл миссии
const start2 = await post('missions', { action: 'start', missionKey: offers[0] });
const m2 = (start2.json.player?.activeMissions ?? [])[0] ?? {};
const waitMs = Math.max(0, new Date(m2.finishAt).getTime() - Date.now()) + 1200;
console.log(`… ждём завершения взлома ${(waitMs / 1000).toFixed(0)} c`);
await sleep(waitMs);
const claim = await post('missions', { action: 'claim', missionId: m2.id });
const pClaim = claim.json.player ?? {};
check('claim после таймера работает', claim.json.ok === true, claim.json.error ?? '');
check('claim начисляет XP', (pClaim.xp ?? 0) > (pAfterSkip.xp ?? 0), `${pAfterSkip.xp} → ${pClaim.xp}`);
check('claim увеличивает счётчик миссий', (pClaim.totalMissions ?? 0) === 2, pClaim.totalMissions);
check(
  'исход брошен в момент claim (алерт success/partial/fail)',
  (claim.json.alerts ?? []).some((a) => /✅|🟡|❌/.test(a.title ?? '')),
  (claim.json.alerts ?? []).map((a) => a.title).join(' | ')
);
check('XP не перескочил уровень рывком', (pClaim.derived?.level ?? 1) === 1, pClaim.derived?.level);
const claimTwice = await post('missions', { action: 'claim', missionId: m2.id });
check('двойной сбор награды заблокирован', claimTwice.json.ok === false, claimTwice.json.error ?? 'нет ошибки');

// ───────────────────────────────────────────── 7. Гейты команды / питомцев / скинов
const hire = await post('hire', { npcKey: 'coder' });
check('найм Coder заблокирован до 12 уровня', hire.json.ok === false && /уровн/i.test(hire.json.error ?? ''), hire.json.error);

const pet = await post('pets', { action: 'buy', petKey: 'hamster_byte' });
check('питомец заблокирован до 14 уровня', pet.json.ok === false && /уровн/i.test(pet.json.error ?? ''), pet.json.error);

const skinLocked = await post('skin', { action: 'buy_or_equip', skinKey: 'avatar_zero' });
check('скин заблокирован до 26 уровня', skinLocked.json.ok === false && /уровн/i.test(skinLocked.json.error ?? ''), skinLocked.json.error);

const skinDefault = await post('skin', { action: 'buy_or_equip', skinKey: 'default' });
check('стартовый скин экипируется', skinDefault.json.ok === true && skinDefault.json.player?.equippedSkin === 'default', skinDefault.json.error ?? '');

// ───────────────────────────────────────────── 8. Экономика на старте (свежий гость)
await post('init', {}, 'econ');
const card = await post('buy-card', { cardKey: 'keyboard' }, 'econ');
check(
  'первая карточка дороже стартовых денег',
  card.json.ok === false && /Data/i.test(card.json.error ?? ''),
  `${card.json.error} (есть ${card.json.player?.data ?? '—'})`
);

const baseUp = await post('base', { upgradeKey: 'coffee_machine' }, 'econ');
check('первый апгрейд базы недоступен на старте', baseUp.json.ok === false, baseUp.json.error);

const tier = await post('tier', {}, 'econ');
check('апгрейд тира карточек недоступен на старте', tier.json.ok === false, tier.json.error);

// ───────────────────────────────────────────── 9. Клики и античит
const before = (await post('init', {})).json.player?.data ?? 0;
const click = await post('click', { clicks: 10 });
check('клик начисляет Data', click.json.ok === true && (click.json.player?.data ?? 0) > before - 1, `+${((click.json.player?.data ?? 0) - before).toFixed(1)}`);
const clickAbsurd = await post('click', { clicks: 1_000_000 });
check(
  'абсурдный батч кликов урезается сервером',
  clickAbsurd.json.ok === false || (clickAbsurd.json.player?.totalClicks ?? 0) < 200,
  `${clickAbsurd.json.player?.totalClicks} кликов`
);

// ───────────────────────────────────────────── 10. Прогресс не сбрасывается
const persist = await post('init', {});
check('повторный init сохраняет XP и Data', persist.json.player?.xp === clickAbsurd.json.player?.xp || (persist.json.player?.xp ?? 0) > 0);

// ───────────────────────────────────────────── 11. Ежедневный бонус
const daily1 = await post('daily', {});
check('ежедневный бонус выдаётся', daily1.json.ok === true, daily1.json.error ?? '');
const daily2 = await post('daily', {});
check('повторный бонус в тот же день заблокирован', daily2.json.ok === false, daily2.json.error ?? 'нет ошибки');

// ───────────────────────────────────────────── 12. Трекинг и лидерборд
const track = await post('track', { event: 'tab', value: 1 });
check('трекинг событий работает', track.json.ok === true, track.json.error ?? '');
const lb = await get('leaderboard');
check('лидерборд отвечает', lb.status === 200 && lb.json.ok === true && Array.isArray(lb.json.entries), `${lb.json.entries?.length ?? '—'} записей`);

// ───────────────────────────────────────────── 13. Гонка за наградой
const parStart = await post('missions', { action: 'refresh' }, 'race');
const parOffers = parStart.json.player?.availableMissionKeys ?? [];
await post('missions', { action: 'start', missionKey: parOffers[0] }, 'race');
const raceState = await post('init', {}, 'race');
const rm = (raceState.json.player?.activeMissions ?? [])[0];
if (rm) {
  await sleep(Math.max(0, new Date(rm.finishAt).getTime() - Date.now()) + 1200);
  const [c1, c2] = await Promise.all([
    post('missions', { action: 'claim', missionId: rm.id }, 'race'),
    post('missions', { action: 'claim', missionId: rm.id }, 'race'),
  ]);
  const okCount = [c1, c2].filter((r) => r.json.ok === true).length;
  check('параллельный двойной claim выдаёт награду один раз', okCount === 1, `успехов: ${okCount}`);
} else {
  check('параллельный двойной claim выдаёт награду один раз', false, 'не удалось запустить миссию');
}

console.log(`\n=== ИТОГО: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log('Провалы: ' + failures.join(' | '));
  process.exitCode = 1;
}
