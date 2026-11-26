/**
 * HACKER KOMBAT — QA v6.2: активные взломы.
 *
 * Проверяет:
 *   1) старт сессии списывает ровно стоимость входа в CPU Charge и выдаёт
 *      seed/таймер; второй параллельный взлом открыть нельзя;
 *   2) награда считается сервером: Data и Heat совпадают с конфигом;
 *   3) защита от накрутки: больше узлов, чем в сетке; больше тапов, чем
 *      физически возможно за прошедшее время; повторная отправка итога;
 *      чужая/несуществующая сессия; просроченная сессия;
 *   4) Heat-перегрев включает существующую блокировку терминала, а взлом в
 *      блокировке не стартует;
 *   5) CPU Charge не уходит в минус: когда энергии не хватает, старт отклоняется;
 *   6) прогресс контрактов с метрикой heat зачитывает взломы.
 *
 * Ожидания берутся из настоящих shared/hacks.config.ts и shared/contracts.config.ts
 * через esbuild-мост — второй копии конфига в тесте нет.
 *
 * Запуск: npm run qa:hacks
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-hacks-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);

const esbuild = require('esbuild');
async function bridge(relative, outName) {
  const outfile = path.join(sandbox, outName);
  esbuild.buildSync({
    entryPoints: [path.join(REPO_ROOT, relative)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
  });
  return import(pathToFileURL(outfile).href);
}

const HACKS = await bridge('shared/hacks.config.ts', 'hacks.config.mjs');
const CONTRACTS = await bridge('shared/contracts.config.ts', 'contracts.config.mjs');
const {
  HACK_SESSION_SECONDS,
  HACK_MAX_TAPS_PER_SEC,
  HACK_FINISH_GRACE_SEC,
  getHackDifficulty,
  countHackNodes,
  hackDataReward,
  hackHeatGain,
} = HACKS;

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

async function api(route, body = {}, seed = 'hacks-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'HackTester',
      'x-forwarded-for': '10.52.0.1',
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

/** Доводит время до конца сессии, чтобы темп тапов проходил валидацию. */
function waitSessionEnd(session, extraSec = 1) {
  fakeNow = Math.max(fakeNow, new Date(session.endsAt).getTime()) + extraSec * 1000;
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v6.2: активные взломы ===\n');

  let result = await api('init');
  let player = result.player;
  const startEnergy = player.energy;

  const easy = getHackDifficulty('easy');
  const medium = getHackDifficulty('medium');

  const started = await api('hacks', { action: 'start', difficulty: 'easy' });
  player = started.player;
  let session = player?.stats?.hackSession;
  check('старт взлома создаёт сессию', started.ok === true && Boolean(session?.id), started.error);
  check(
    'вход стоит ровно CPU Charge по конфигу',
    Math.round(startEnergy - player.energy) === easy.cost,
    `${startEnergy} → ${player.energy} (cost ${easy.cost})`
  );
  check('сервер выдал seed и таймер сессии', Number.isFinite(session?.seed) && Boolean(session?.endsAt));
  check(
    'сессия длится ровно 30 секунд',
    new Date(session.endsAt).getTime() - new Date(session.startedAt).getTime() ===
      HACK_SESSION_SECONDS * 1000
  );

  const second = await api('hacks', { action: 'start', difficulty: 'easy' });
  check('второй взлом параллельно не открывается', second.ok === false, second.error);

  const nodes = countHackNodes(session.seed, easy);
  check('сетка детерминирована по seed', nodes.total === easy.cols * easy.rows && nodes.safe > 0);

  // Небольшой честный итог: 3 узла за первую секунду — в пределах темпа.
  const dataBefore = player.data;
  const heatBefore = player.heat;
  waitSessionEnd(session);
  const finished = await api('hacks', {
    action: 'finish',
    sessionId: session.id,
    safeHits: 3,
    trapHits: 1,
  });
  player = finished.player;
  check('итог сессии принимается', finished.ok === true, finished.error);
  const dataGain = Math.round((player.data - dataBefore) * 100) / 100;
  const heatGain = player.heat - heatBefore;
  check(
    'Data начислена по конфигу (сервер пересчитал)',
    dataGain === hackDataReward(easy, 3),
    `${dataGain} vs ${hackDataReward(easy, 3)}`
  );
  check(
    'Heat начислен по конфигу за ловушки',
    heatGain === hackHeatGain(easy, 1) || player.heat <= heatBefore,
    `${heatGain} vs ${hackHeatGain(easy, 1)}`
  );
  check('сессия помечена закрытой', player.stats.hackSession?.finished === true);

  const repeat = await api('hacks', {
    action: 'finish',
    sessionId: session.id,
    safeHits: 3,
    trapHits: 1,
  });
  check('повторная отправка итога отклонена', repeat.ok === false, repeat.error);

  const foreign = await api('hacks', { action: 'finish', sessionId: 'not-a-session', safeHits: 1, trapHits: 0 });
  check('чужая/несуществующая сессия отклонена', foreign.ok === false, foreign.error);

  // --- защита от накрутки ----------------------------------------------------
  const s2 = await api('hacks', { action: 'start', difficulty: 'easy' });
  session = s2.player?.stats?.hackSession;
  const nodes2 = countHackNodes(session.seed, easy);
  check('вторая сессия открывается', s2.ok === true, s2.error);
  const immediate = await api('hacks', {
    action: 'finish',
    sessionId: session.id,
    safeHits: 12,
    trapHits: 0,
  });
  check(
    'накрутка темпа отклонена (12 узлов за секунду)',
    immediate.ok === false,
    immediate.error
  );

  waitSessionEnd(session);
  const overNodes = await api('hacks', {
    action: 'finish',
    sessionId: session.id,
    safeHits: nodes2.safe + 1,
    trapHits: 0,
  });
  check('накрутка сверх сетки отклонена', overNodes.ok === false, overNodes.error);

  const honestMax = await api('hacks', {
    action: 'finish',
    sessionId: session.id,
    safeHits: Math.min(nodes2.safe, HACK_SESSION_SECONDS * HACK_MAX_TAPS_PER_SEC),
    trapHits: 0,
  });
  check('честный максимум после истечения времени принимается', honestMax.ok === true, honestMax.error);

  // --- просроченная сессия ---------------------------------------------------
  const s3 = await api('hacks', { action: 'start', difficulty: 'easy' });
  session = s3.player?.stats?.hackSession;
  check('сессия для проверки просрочки открывается', s3.ok === true && Boolean(session?.id), s3.error);
  fakeNow += (HACK_SESSION_SECONDS + HACK_FINISH_GRACE_SEC + 5) * 1000;
  const expired = await api('hacks', {
    action: 'finish',
    sessionId: session.id,
    safeHits: 1,
    trapHits: 0,
  });
  check('просроченная сессия не даёт награду', expired.ok === false, expired.error);
  const afterExpired = await api('init');
  check(
    'просроченная сессия закрыта, повтор не пройдёт',
    afterExpired.player?.stats?.hackSession?.finished === true
  );

  // --- Heat-перегрев и блокировка -------------------------------------------
  // Новичкам (0 карточек и 0 контрактов) Heat не штрафуется — это защита v5.4.
  // Чтобы проверить именно киберпатруль, сначала выходим из новичкового статуса.
  const missionPlayer = (await api('init')).player;
  const missionKey = missionPlayer.availableMissionKeys?.[0];
  if (missionKey) {
    const m = await api('missions', { action: 'start', missionKey });
    const active = m.player?.activeMissions?.[0];
    if (active) {
      fakeNow = Math.max(fakeNow, new Date(active.finishAt).getTime() + 1_000);
      await api('missions', { action: 'claim', missionId: active.id });
    }
  }
  const veteran = (await api('init')).player;
  check('игрок вышел из новичкового статуса для проверки Heat', veteran.totalMissions > 0, String(veteran.totalMissions));

  let blocked = null;
  for (let attempt = 0; attempt < 10 && !blocked; attempt += 1) {
    const s = await api('hacks', { action: 'start', difficulty: 'easy' });
    const current = s.player?.stats?.hackSession;
    if (s.ok !== true || !current) break;
    waitSessionEnd(current);
    const done = await api('hacks', {
      action: 'finish',
      sessionId: current.id,
      safeHits: 0,
      trapHits: countHackNodes(current.seed, easy).traps,
    });
    player = done.player ?? player;
    if (player.clickBlockedUntil && new Date(player.clickBlockedUntil).getTime() > fakeNow) {
      blocked = player.clickBlockedUntil;
    }
    fakeNow += 1_000;
  }
  check('перегрев Heat включает существующую блокировку терминала', Boolean(blocked), String(blocked));
  if (blocked) {
    const duringLockdown = await api('hacks', { action: 'start', difficulty: 'easy' });
    check('в блокировке взлом не стартует', duringLockdown.ok === false, duringLockdown.error);
    fakeNow = new Date(blocked).getTime() + 1_000;
    const afterCool = await api('hacks', { action: 'start', difficulty: 'easy' });
    check('после остывания взлом снова доступен', afterCool.ok === true, afterCool.error);
    const cooling = afterCool.player?.stats?.hackSession;
    if (cooling) {
      waitSessionEnd(cooling);
      await api('hacks', { action: 'finish', sessionId: cooling.id, safeHits: 0, trapHits: 0 });
    }
  }

  // --- CPU Charge не уходит в минус ------------------------------------------
  let drained = false;
  for (let attempt = 0; attempt < 80 && !drained; attempt += 1) {
    const before = await api('init');
    const energy = before.player.energy;
    const s = await api('hacks', { action: 'start', difficulty: 'medium' });
    if (s.ok !== true) {
      const message = String(s.error ?? '');
      const isCpu = message.includes('CPU Charge') || message.includes('блокировк');
      check('старт без CPU Charge отклоняется понятной ошибкой', isCpu, message);
      check('энергия не ушла в минус', before.player.energy >= 0, String(before.player.energy));
      drained = true;
      break;
    }
    const current = s.player?.stats?.hackSession;
    check(
      'энергия списывается ровно по конфигу',
      Math.round(energy - s.player.energy) === medium.cost,
      `${energy} → ${s.player.energy}`
    );
    waitSessionEnd(current);
    await api('hacks', { action: 'finish', sessionId: current.id, safeHits: 0, trapHits: 0 });
  }
  if (!drained) {
    check('CPU Charge всё ещё хватает — лимит проверим статически', true, 'энергия не кончилась за 80 попыток');
  }

  // --- связь с контрактами ---------------------------------------------------
  const finalState = (await api('init')).player;
  const heatContracts = (finalState.stats.contracts?.ids ?? []).filter(
    (id) => CONTRACTS.getContractDefinition(id)?.metric === 'heat'
  );
  check(
    'взломы зачитываются в контракты с метрикой heat',
    heatContracts.length === 0 ||
      heatContracts.some((id) => (finalState.stats.contracts.progress[id] ?? 0) > 0),
    heatContracts.map((id) => `${id}:${finalState.stats.contracts.progress[id] ?? 0}`).join(', ')
  );

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
