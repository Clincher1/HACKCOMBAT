/**
 * HACKER KOMBAT — QA v3.10: платный запуск контрактов.
 *
 * Проверяет новый цикл «тапы -> оборотный Data/взнос -> контракт -> XP/Data»:
 *   1) пустой баланс не позволяет взять контракт;
 *   2) запуск списывает ровно зафиксированные Data и Energy;
 *   3) взнос сохраняется в активной миссии и показывается после init;
 *   4) pending clicks доезжают вместе со стартом;
 *   5) быстрый пропуск даёт частичный результат, но не возвращает взнос;
 *   6) fail тоже не возвращает взнос, а claim нельзя повторить;
 *   7) параллельный double-start даёт ровно одну миссию и одно списание;
 *   8) нехватка Energy блокирует запуск на сервере.
 */
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-mission-cost-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let runtime = require(CORE);
const realNow = Date.now;
const realRandom = Math.random;
let fakeNow = Date.parse('2026-10-27T12:00:00Z');
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

async function api(route, body = {}, seed = 'mission-cost-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'MissionCostTester',
      'x-forwarded-for': '10.40.0.1',
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

async function earnTaps(seed, batches = 3) {
  let result;
  for (let index = 0; index < batches; index += 1) {
    fakeNow += 3_000;
    result = await api('click', { clicks: 60 }, seed);
  }
  return result;
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.10: платный запуск контрактов ===\n');

  const empty = await api('init', {}, 'mission-empty');
  const missionKey = empty.player.availableMissionKeys[0];
  // В memory fallback новый игрок получает стартовый Data-капитал. Тратим
  // ровно его на два первых модуля и оставляем меньше минимального взноса.
  for (let index = 0; index < 10; index += 1) {
    fakeNow += 3_000;
    await api('click', { clicks: 60 }, 'mission-empty');
  }
  const spent = await api('buy-card', { cardKey: 'monitor' }, 'mission-empty');
  const emptyStart = await api('missions', { action: 'start', missionKey }, 'mission-empty');
  const emptyReload = await api('init', {}, 'mission-empty');
  check('без достаточного Data контракт не запускается', emptyStart.ok === false, emptyStart.error);
  check('отказ по Data не создаёт активную миссию', emptyReload.player?.activeMissions?.length === 0, String(spent.player?.data));

  const pendingSeed = 'mission-pending-clicks';
  const pendingBefore = (await api('init', {}, pendingSeed)).player;
  const pendingMission = pendingBefore.availableMissionKeys[0];
  const pendingStart = await api(
    'missions',
    { action: 'start', missionKey: pendingMission, clicks: 5 },
    pendingSeed
  );
  const pendingActive = pendingStart.player?.activeMissions?.[0];
  check('pending clicks доезжают вместе со стартом', pendingStart.ok === true && pendingStart.appliedClicks === 5, pendingStart.error);
  check(
    'pending clicks сначала создают Data для взноса',
    pendingStart.player?.data === pendingBefore.data + 5 - Number(pendingActive?.entryDataCost ?? 0),
    `${pendingBefore.data} + 5 − ${pendingActive?.entryDataCost ?? 0} → ${pendingStart.player?.data}`
  );
  if (pendingActive) {
    await api('missions', { action: 'skip', missionId: pendingActive.id }, pendingSeed);
  }

  // Старый active-row без новых полей всё равно должен корректно завершаться.
  const legacySeed = 'mission-legacy-active';
  const legacyBefore = (await api('init', {}, legacySeed)).player;
  const legacyStart = await api(
    'missions',
    { action: 'start', missionKey: legacyBefore.availableMissionKeys[0] },
    legacySeed
  );
  const legacyFile = JSON.parse(fs.readFileSync('.local-db.json', 'utf8'));
  const legacyMissionId = legacyStart.player?.activeMissions?.[0]?.id;
  const legacyPlayerKey = Object.keys(legacyFile.playersByTgId).find((key) =>
    legacyFile.playersByTgId[key].activeMissions?.some((mission) => mission.id === legacyMissionId)
  );
  const legacyStored = legacyPlayerKey ? legacyFile.playersByTgId[legacyPlayerKey] : null;
  if (legacyStored?.activeMissions?.[0]) {
    delete legacyStored.activeMissions[0].entryDataCost;
    delete legacyStored.activeMissions[0].entryEnergyCost;
    fs.writeFileSync('.local-db.json', JSON.stringify(legacyFile));
  }
  delete require.cache[require.resolve(CORE)];
  runtime = require(CORE);
  const legacyReload = await api('init', {}, legacySeed);
  const legacyActive = legacyReload.player?.activeMissions?.[0];
  const legacyClaim = legacyActive
    ? await api('missions', { action: 'skip', missionId: legacyActive.id }, legacySeed)
    : { ok: false, error: 'legacy active mission missing' };
  check('legacy active-миссия без costs загружается', legacyStart.ok === true && Boolean(legacyActive), legacyClaim.error);
  check('legacy active-миссия без costs завершается', legacyClaim.ok === true && legacyClaim.player?.activeMissions?.length === 0, legacyClaim.error);

  let player = (await api('init', {}, 'mission-paid')).player;
  const paidMissionKey = player.availableMissionKeys[0];
  const beforeTaps = { data: player.data, energy: player.energy, xp: player.xp };
  player = (await earnTaps('mission-paid', 3)).player;
  check('тапы создают стартовый Data-капитал', player.data > beforeTaps.data);

  const started = await api('missions', { action: 'start', missionKey: paidMissionKey }, 'mission-paid');
  const active = started.player?.activeMissions?.[0];
  check('контракт запускается после накопления Data', started.ok === true && Boolean(active), started.error);
  check('в активной миссии зафиксирован Data-взнос', Number(active?.entryDataCost ?? 0) >= 25, active?.entryDataCost);
  check('в активной миссии зафиксирован Energy-взнос', Number(active?.entryEnergyCost ?? 0) > 0, active?.entryEnergyCost);
  check(
    'Data-взнос совпадает с shared-формулой 12% / минимум 25',
    Number(active?.entryDataCost) === Math.max(25, Math.ceil(Number(active?.reward ?? 0) * 0.12)),
    `${active?.reward} → ${active?.entryDataCost}`
  );
  check(
    'Energy-взнос совпадает с длительностью контракта',
    Number(active?.entryEnergyCost) === Math.max(10, Math.ceil((Date.parse(active?.finishAt) - Date.parse(active?.startedAt)) / 1000)),
    `${active?.startedAt} → ${active?.entryEnergyCost}`
  );
  check(
    'запуск списывает ровно Data-взнос',
    Math.round((player.data - started.player.data) * 10) / 10 === Number(active?.entryDataCost ?? -1),
    `${player.data} → ${started.player.data}`
  );
  check(
    'запуск списывает ровно Energy-взнос',
    player.energy - started.player.energy === Number(active?.entryEnergyCost ?? -1),
    `${player.energy} → ${started.player.energy}`
  );

  const reloaded = await api('init', {}, 'mission-paid');
  const reloadedActive = reloaded.player?.activeMissions?.[0];
  check(
    'взнос сохраняется после повторного init',
    reloadedActive?.entryDataCost === active?.entryDataCost &&
      reloadedActive?.entryEnergyCost === active?.entryEnergyCost
  );

  const dataAfterStart = started.player.data;
  const xpAfterStart = started.player.xp;
  const skipped = await api('missions', { action: 'skip', missionId: active.id }, 'mission-paid');
  const expectedPartialData = Math.round(active.reward * 0.45);
  check('пропуск закрывает контракт частичным результатом', skipped.ok === true && skipped.player.activeMissions.length === 0, skipped.error);
  check('частичный результат начисляет Data по контракту', skipped.player.data === dataAfterStart + expectedPartialData, `${skipped.player.data}`);
  check('XP начисляется после закрытия контракта', skipped.player.xp > xpAfterStart, `${xpAfterStart} → ${skipped.player.xp}`);
  check(
    'взнос не возвращается при частичном результате',
    skipped.player.data === dataAfterStart + expectedPartialData,
    `${dataAfterStart} + ${expectedPartialData} → ${skipped.player.data}`
  );
  const duplicateClaim = await api('missions', { action: 'skip', missionId: active.id }, 'mission-paid');
  check('claim/skip нельзя забрать дважды', duplicateClaim.ok === false && /мисси|получ/i.test(duplicateClaim.error ?? ''), duplicateClaim.error);

  // Отдельный игрок: принудительно доводим контракт до fail. Взнос остаётся
  // потерянным, XP получает только существующий fail-множитель.
  const failSeed = 'mission-fail';
  let failPlayer = (await api('init', {}, failSeed)).player;
  const failMissionKey = failPlayer.availableMissionKeys[0];
  Math.random = () => 1;
  const failStart = await api('missions', { action: 'start', missionKey: failMissionKey }, failSeed);
  const failActive = failStart.player?.activeMissions?.[0];
  const failDataAfterStart = failStart.player?.data;
  const failXpAfterStart = failStart.player?.xp;
  fakeNow += (Number(failActive?.finishAt ? Date.parse(failActive.finishAt) - fakeNow : 0) + 1_000);
  const failClaim = await api('missions', { action: 'claim', missionId: failActive?.id }, failSeed);
  Math.random = realRandom;
  check('fail сохраняет существующий исход контракта', failStart.ok === true && failClaim.ok === true && failClaim.player?.activeMissions?.length === 0, failClaim.error);
  check('fail не возвращает Data-взнос', failClaim.player?.data === failDataAfterStart, `${failDataAfterStart} → ${failClaim.player?.data}`);
  check('fail начисляет XP по существующему множителю', failClaim.player?.xp > failXpAfterStart, `${failXpAfterStart} → ${failClaim.player?.xp}`);
  check('повторный claim после fail отклоняется', (await api('missions', { action: 'claim', missionId: failActive?.id }, failSeed)).ok === false);

  // Параллельный double-start: персональный lock в memory-ветке должен
  // пропустить ровно один запрос, а не списать стоимость дважды.
  const parallelSeed = 'mission-parallel-start';
  const parallelBefore = (await api('init', {}, parallelSeed)).player;
  const parallelMissionKey = parallelBefore.availableMissionKeys[0];
  const parallelResults = await Promise.all([
    api('missions', { action: 'start', missionKey: parallelMissionKey }, parallelSeed),
    api('missions', { action: 'start', missionKey: parallelMissionKey }, parallelSeed),
  ]);
  const parallelSuccesses = parallelResults.filter((result) => result.ok === true);
  const parallelReload = await api('init', {}, parallelSeed);
  const parallelActive = parallelReload.player?.activeMissions?.[0];
  check('параллельный double-start даёт ровно один успех', parallelSuccesses.length === 1);
  check('параллельный double-start списывает ровно один взнос', parallelActive && parallelReload.player.data === parallelBefore.data - parallelActive.entryDataCost);
  check('параллельный double-start оставляет одну миссию', parallelReload.player?.activeMissions?.length === 1);
  if (parallelActive) {
    await api('missions', { action: 'skip', missionId: parallelActive.id }, parallelSeed);
  }

  // Отдельный игрок: даже при достаточном Data сервер не даёт начать цель,
  // если весь Energy уже потрачен тапами.
  let energyPlayer = (await api('init', {}, 'mission-energy')).player;
  const energyMissionKey = energyPlayer.availableMissionKeys[0];
  for (let index = 0; index < 32; index += 1) {
    fakeNow += 3_000;
    const clicked = await api('click', { clicks: 60 }, 'mission-energy');
    energyPlayer = clicked.player;
  }
  const energyStart = await api('missions', { action: 'start', missionKey: energyMissionKey }, 'mission-energy');
  const energyReload = await api('init', {}, 'mission-energy');
  check('нехватка Energy блокирует запуск на сервере', energyStart.ok === false && /Energy/.test(energyStart.error ?? ''), energyStart.error);
  check('нехватка Energy не создаёт активную миссию', energyReload.player?.activeMissions?.length === 0);

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})()
  .catch((err) => {
    console.error('QA упал:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    Date.now = realNow;
    Math.random = realRandom;
  });
