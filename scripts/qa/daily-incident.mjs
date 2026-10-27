/**
 * HACKER KOMBAT — QA v3.13: ежедневные киберинциденты.
 *
 * Проверяет серверный MVP:
 *   1) старый save без dailyIncident получает совместимое состояние;
 *   2) один игрок получает стабильный сценарий в одни московские сутки;
 *   3) неверный ключ не меняет состояние;
 *   4) выбор начисляется ровно один раз и не меняет Chips;
 *   5) повторный запрос/double-tap блокируется;
 *   6) смена дня создаёт новый одноразовый выбор.
 *
 * Запуск: npm run qa:daily-incident
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-daily-incident-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let runtime = require(CORE);
const realNow = Date.now;
let fakeNow = Date.parse('2026-10-27T06:00:00Z');
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

async function api(route, body = {}, seed = 'daily-incident-qa') {
  const req = {
    url: `/api/${route}`,
    method: route === 'init' ? 'POST' : 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'IncidentTester',
      'x-forwarded-for': '10.42.0.1',
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

const firstChoiceByIncident = {
  corp_scanner: 'cover_tracks',
  lost_packet: 'return_packet',
  ghost_login: 'close_session',
  decoy_signal: 'clean_channel',
  quiet_backdoor: 'patch_backdoor',
  blackout_window: 'wait_blackout',
};

function reloadRuntime() {
  delete require.cache[require.resolve(CORE)];
  runtime = require(CORE);
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.13: ежедневные киберинциденты ===\n');

  // Старый JSONB-save: поле ещё отсутствует, но init должен мигрировать его
  // через обычный серверный sync, не ломая остальные stats.
  const legacySeed = 'daily-incident-legacy';
  const legacyInit = await api('init', {}, legacySeed);
  const db = JSON.parse(fs.readFileSync('.local-db.json', 'utf8'));
  const legacyRow = Object.values(db.playersByTgId).find((row) => row.username === 'IncidentTester');
  const legacyStatsBefore = { ...legacyRow.stats };
  delete legacyRow.stats.dailyIncident;
  fs.writeFileSync('.local-db.json', JSON.stringify(db));
  reloadRuntime();
  const legacyMigrated = await api('init', {}, legacySeed);
  check(
    'старый save без dailyIncident продолжает загружаться',
    legacyMigrated.ok === true && Boolean(legacyMigrated.player?.stats?.dailyIncident),
    legacyMigrated.error
  );
  check(
    'миграция не удаляет существующие stats',
    legacyMigrated.player.stats.totalXpEarned === legacyStatsBefore.totalXpEarned &&
      legacyMigrated.player.stats.activeDayKey === legacyStatsBefore.activeDayKey
  );

  const seed = 'daily-incident-main';
  let result = await api('init', {}, seed);
  let player = result.player;
  const initial = player.stats.dailyIncident;
  check(
    'init создаёт ежедневный incident state',
    result.ok === true && initial?.version === 1 && initial?.dayKey && initial?.incidentKey &&
      initial.choiceKey === null && initial.outcome === null
  );

  const snapshot = JSON.stringify(initial);
  const reloaded = await api('init', {}, seed);
  check('повторный init не reroll’ит incident', JSON.stringify(reloaded.player.stats.dailyIncident) === snapshot);
  player = reloaded.player;

  const chipsBefore = player.chips;
  const economyBefore = {
    data: player.data,
    crypto: player.crypto,
    rep: player.rep,
    heat: player.heat,
    chips: player.chips,
  };
  const firstChoice = firstChoiceByIncident[initial.incidentKey];
  check('для серверного incident есть канонический UI-выбор', Boolean(firstChoice), initial.incidentKey);

  const invalid = await api('daily-incident', { choiceKey: 'choice_from_another_incident' }, seed);
  check('чужой choiceKey отклоняется сервером', invalid.ok === false, invalid.error);
  const afterInvalid = (await api('init', {}, seed)).player;
  check('отклонённый выбор не меняет state', afterInvalid.stats.dailyIncident.choiceKey === null);

  const resolved = await api('daily-incident', { choiceKey: firstChoice }, seed);
  player = resolved.player;
  const outcome = player.stats.dailyIncident.outcome;
  check('валидный choiceKey закрывает incident',
    resolved.ok === true && player.stats.dailyIncident.choiceKey === firstChoice &&
      player.stats.dailyIncident.resolvedAt && outcome?.summary);
  check('server outcome содержит только ограниченные поля',
    outcome && Object.keys(outcome).sort().join(',') === 'crypto,data,heat,rep,summary');
  check('выбор не вводит новую валюту и не меняет Chips',
    player.chips === chipsBefore && Object.keys(player).every((key) => key !== 'incidentTokens'));
  check('сервер действительно применяет outcome к ресурсам',
    player.data === economyBefore.data + outcome.data &&
      player.crypto === economyBefore.crypto + outcome.crypto &&
      player.rep === Math.max(0, economyBefore.rep + outcome.rep) &&
      player.heat === Math.max(0, economyBefore.heat + outcome.heat),
    JSON.stringify({ before: economyBefore, after: { data: player.data, crypto: player.crypto, rep: player.rep, heat: player.heat } })
  );

  const economyAfter = {
    data: player.data,
    crypto: player.crypto,
    rep: player.rep,
    heat: player.heat,
    chips: player.chips,
  };
  const duplicate = await api('daily-incident', { choiceKey: firstChoice }, seed);
  const duplicateReload = await api('init', {}, seed);
  check('повторный choice заблокирован', duplicate.ok === false, duplicate.error);
  check('повторный choice не выдаёт награду второй раз',
    JSON.stringify({
      data: duplicateReload.player.data,
      crypto: duplicateReload.player.crypto,
      rep: duplicateReload.player.rep,
      heat: duplicateReload.player.heat,
      chips: duplicateReload.player.chips,
    }) === JSON.stringify(economyAfter));

  // Параллельные клики по одной кнопке: lock в fallback и серверный state
  // должны оставить ровно один успешный исход.
  const parallelSeed = 'daily-incident-parallel';
  const parallelInit = await api('init', {}, parallelSeed);
  const parallelChoice = firstChoiceByIncident[parallelInit.player.stats.dailyIncident.incidentKey];
  const parallel = await Promise.all([
    api('daily-incident', { choiceKey: parallelChoice }, parallelSeed),
    api('daily-incident', { choiceKey: parallelChoice }, parallelSeed),
  ]);
  check('double-tap даёт ровно один успешный response',
    parallel.filter((item) => item.ok === true).length === 1 &&
      parallel.filter((item) => item.ok === false).length === 1,
    parallel.map((item) => item.ok ? 'ok' : item.error).join(' | '));
  const parallelPlayer = (await api('init', {}, parallelSeed)).player;
  check('double-tap оставляет один сохранённый outcome',
    Boolean(parallelPlayer.stats.dailyIncident.choiceKey) &&
      parallelPlayer.stats.dailyIncident.outcome?.data >= 0);

  fakeNow += 86_400_000;
  const nextDay = await api('init', {}, seed);
  const nextIncident = nextDay.player.stats.dailyIncident;
  check('новые московские сутки создают новый incident state',
    nextIncident.dayKey !== initial.dayKey && nextIncident.choiceKey === null && nextIncident.outcome === null,
    `${initial.dayKey} → ${nextIncident.dayKey}`);
  const nextChoice = firstChoiceByIncident[nextIncident.incidentKey];
  const nextResolved = await api('daily-incident', { choiceKey: nextChoice }, seed);
  check('выбор доступен снова только после смены дня', nextResolved.ok === true && nextResolved.player.stats.dailyIncident.choiceKey === nextChoice);

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
