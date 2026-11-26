/**
 * HACKER KOMBAT — QA v6.1: контракты дня.
 *
 * Покрывает:
 *   1) выдача: ровно три контракта на московские сутки, без дублей, ≤ MAX_ACTIVE;
 *   2) детерминизм: повторный init не меняет набор и прогресс;
 *   3) прогресс растёт только от соответствующего действия (тап / CPU Charge /
 *      закрытие контракта), без «универсального» счётчика;
 *   4) забор: неготовый контракт забрать нельзя, готовый выдаёт ровно ту награду,
 *      что в конфиге, повторный забор отклоняется;
 *   5) смена дня: набор сгорает без штрафа, прогресс и claimed обнуляются.
 *
 * Ожидаемые значения берутся из настоящего shared/contracts.config.ts через
 * esbuild-мост — в тесте нет второй копии конфига.
 *
 * Запуск: npm run qa:contracts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const CORE = path.join(REPO_ROOT, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-contracts-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);

// --- мост к настоящему конфигу ------------------------------------------------
const esbuild = require('esbuild');
const bundleFile = path.join(sandbox, 'contracts.config.mjs');
esbuild.buildSync({
  entryPoints: [path.join(REPO_ROOT, 'shared/contracts.config.ts')],
  outfile: bundleFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'error',
});
const CONFIG = await import(pathToFileURL(bundleFile).href);
const { CONTRACTS_PER_DAY, MAX_ACTIVE_CONTRACTS, getContractDefinition } = CONFIG;

const realNow = Date.now;
let fakeNow = Date.parse('2026-11-26T09:00:00Z');
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

async function api(route, body = {}, seed = 'contracts-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'ContractTester',
      'x-forwarded-for': '10.42.0.1',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = makeRes();
  await dispatchApiRequest(req, res);
  try {
    return { ...JSON.parse(res.payload), _status: res.statusCode };
  } catch {
    return { ok: false, error: String(res.payload), _status: res.statusCode };
  }
}

const contractState = (player) => player?.stats?.contracts;

/** Догоняем игровые сутки, пока в наборе не появятся нужные метрики. */
async function findDayWithMetrics(metrics, maxDays = 21) {
  for (let day = 0; day < maxDays; day += 1) {
    const result = await api('init');
    const state = contractState(result.player);
    const present = new Set((state?.ids ?? []).map((id) => getContractDefinition(id)?.metric));
    if (metrics.every((metric) => present.has(metric))) {
      return { player: result.player, state };
    }
    fakeNow += 86_400_000;
  }
  return null;
}

/** Запускает контракт и доводит его до конца без траты Crypto: ждём таймер. */
async function runMissionOnce(player) {
  const missionKey = player.availableMissionKeys?.[0];
  if (!missionKey) return null;
  let started = await api('missions', { action: 'start', missionKey });
  if (started.ok !== true) {
    // Энергия могла кончиться — даём ей восстановиться и пробуем ещё раз.
    fakeNow += 120_000;
    started = await api('missions', { action: 'start', missionKey });
  }
  const mission = started.player?.activeMissions?.[0];
  if (started.ok !== true || !mission?.id) return null;
  const finishMs = new Date(mission.finishAt).getTime();
  fakeNow = Math.max(fakeNow + 1_000, finishMs + 1_000);
  const claimed = await api('missions', { action: 'claim', missionId: mission.id });
  return claimed.ok === true ? claimed.player : null;
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v6.1: контракты ===\n');

  let result = await api('init');
  let player = result.player;
  let state = contractState(player);

  check('init выдаёт набор контрактов', result.ok === true && Boolean(state), result.error);
  check(
    `в наборе ровно ${CONTRACTS_PER_DAY} контракта`,
    state?.ids?.length === CONTRACTS_PER_DAY,
    state?.ids?.join(', ')
  );
  check('все id есть в конфиге', (state?.ids ?? []).every((id) => Boolean(getContractDefinition(id))));
  check('дублей в наборе нет', new Set(state?.ids ?? []).size === (state?.ids?.length ?? 0));
  check(
    `активных контрактов не больше ${MAX_ACTIVE_CONTRACTS}`,
    (state?.ids?.length ?? 0) <= MAX_ACTIVE_CONTRACTS
  );
  check('прогресс нового набора нулевой', Object.values(state?.progress ?? {}).every((value) => value === 0));
  check('claimed нового набора пуст', (state?.claimed?.length ?? 0) === 0);

  const stable = contractState((await api('init')).player);
  check(
    'повторный init не меняет набор',
    JSON.stringify(stable?.ids) === JSON.stringify(state?.ids) && stable?.dayKey === state?.dayKey,
    stable?.ids?.join(', ')
  );

  // --- прогресс от тапов -----------------------------------------------------
  const tapIds = state.ids.filter((id) => getContractDefinition(id)?.metric === 'tap');
  const otherIds = state.ids.filter((id) => getContractDefinition(id)?.metric !== 'tap');
  const afterClicks = await api('click', { clicks: 60 });
  player = afterClicks.player;
  state = contractState(player);
  check(
    'тапы двигают прогресс тап-контрактов',
    tapIds.length === 0 || tapIds.every((id) => (state?.progress?.[id] ?? 0) > 0),
    tapIds.map((id) => `${id}:${state?.progress?.[id] ?? 0}`).join(', ')
  );
  check(
    'тапы не двигают контракты других метрик',
    otherIds.every((id) => (state?.progress?.[id] ?? 0) === 0),
    otherIds.map((id) => `${id}:${state?.progress?.[id] ?? 0}`).join(', ')
  );

  const notReadyId = state.ids.find((id) => {
    const definition = getContractDefinition(id);
    return definition && (state.progress[id] ?? 0) < definition.target;
  });
  if (notReadyId) {
    const early = await api('contracts', { action: 'claim', contractId: notReadyId });
    check('неготовый контракт забрать нельзя', early.ok === false, early.error);
  }

  // --- прогресс от CPU Charge и закрытия контрактов ---------------------------
  const day = await findDayWithMetrics(['cpu', 'mission_complete']);
  check('нашлись сутки с контрактами на CPU Charge и закрытие', Boolean(day));
  if (day) {
    player = day.player;
    state = day.state;
    const cpuIds = state.ids.filter((id) => getContractDefinition(id)?.metric === 'cpu');
    const completeIds = state.ids.filter((id) => getContractDefinition(id)?.metric === 'mission_complete');

    let afterStart = await api('init');
    const missionKey = afterStart.player.availableMissionKeys?.[0];
    const started = await api('missions', { action: 'start', missionKey });
    check('контракт запускается для прогресса CPU', started.ok === true, started.error);
    player = started.player ?? player;
    state = contractState(player);
    check(
      'CPU Charge двигает cpu-контракты',
      cpuIds.length === 0 || cpuIds.every((id) => (state?.progress?.[id] ?? 0) > 0),
      cpuIds.map((id) => `${id}:${state?.progress?.[id] ?? 0}`).join(', ')
    );

    const active = player.activeMissions?.[0];
    if (active) {
      fakeNow = Math.max(fakeNow + 1_000, new Date(active.finishAt).getTime() + 1_000);
      const closed = await api('missions', { action: 'claim', missionId: active.id });
      player = closed.player ?? player;
      state = contractState(player);
      check(
        'закрытие контракта двигает mission_complete',
        completeIds.length === 0 ||
          completeIds.every((id) => (state?.progress?.[id] ?? 0) > 0),
        completeIds.map((id) => `${id}:${state?.progress?.[id] ?? 0}`).join(', ')
      );
    }

    // Добиваем до цели самый дешёвый mission_complete-контракт.
    const target = completeIds
      .map((id) => getContractDefinition(id))
      .filter(Boolean)
      .sort((a, b) => a.target - b.target)[0];
    if (target) {
      for (let guard = 0; guard < target.target + 2; guard += 1) {
        state = contractState(player);
        const progress = state?.progress?.[target.key] ?? 0;
        if (progress >= target.target) break;
        const next = await runMissionOnce(player);
        if (!next) break;
        player = next;
      }
      state = contractState(player);
      check(
        `контракт «${target.title}» добит до цели`,
        (state?.progress?.[target.key] ?? 0) >= target.target,
        `${state?.progress?.[target.key] ?? 0}/${target.target}`
      );

      const before = {
        data: player.data,
        crypto: player.crypto,
        chips: player.chips,
      };
      const claimed = await api('contracts', { action: 'claim', contractId: target.key });
      player = claimed.player;
      state = contractState(player);
      check('готовый контракт забирается', claimed.ok === true, claimed.error);
      check('контракт помечен полученным', (state?.claimed ?? []).includes(target.key));

      const reward = target.reward;
      const dataGain = Math.round((player.data - before.data) * 100) / 100;
      const cryptoGain = player.crypto - before.crypto;
      const chipsGain = player.chips - before.chips;
      check(
        'награда Data начислена ровно по конфигу',
        (reward.data ?? 0) === 0 ? dataGain === 0 : dataGain === reward.data,
        `${dataGain} vs ${reward.data ?? 0}`
      );
      check(
        'награда Crypto начислена ровно по конфигу',
        (reward.crypto ?? 0) === 0 ? cryptoGain === 0 : cryptoGain === reward.crypto,
        `${cryptoGain} vs ${reward.crypto ?? 0}`
      );
      check(
        'награда Chips начислена по конфигу',
        (reward.chips ?? 0) === 0 ? chipsGain === 0 : chipsGain > 0 && chipsGain <= reward.chips,
        `${chipsGain} vs ${reward.chips ?? 0}`
      );

      const again = await api('contracts', { action: 'claim', contractId: target.key });
      check('повторный забор того же контракта отклонён', again.ok === false, again.error);

      const balanceBeforeReset = {
        data: (again.player ?? player).data,
        crypto: (again.player ?? player).crypto,
        chips: (again.player ?? player).chips,
        xp: (again.player ?? player).xp,
      };

      // --- смена дня -------------------------------------------------------
      fakeNow += 86_400_000;
      const nextDay = await api('init');
      player = nextDay.player;
      state = contractState(player);
      check('новый день выдаёт новый набор', state?.dayKey !== day.state.dayKey, state?.dayKey);
      check(
        'прогресс и claimed нового дня чистые',
        Object.values(state?.progress ?? {}).every((value) => value === 0) &&
          (state?.claimed?.length ?? 0) === 0
      );
      check('незакрытые контракты сгорают без штрафа', player.data >= balanceBeforeReset.data - 1 &&
        player.xp >= balanceBeforeReset.xp, `data ${balanceBeforeReset.data} → ${player.data}`);
    }
  }

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
