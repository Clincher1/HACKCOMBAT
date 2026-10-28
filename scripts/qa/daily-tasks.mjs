/**
 * HACKER KOMBAT — QA v3.8: ежедневные поручения.
 *
 * Проверяет:
 *   1) сервер выдаёт ровно три стабильных поручения на московские сутки;
 *   2) в наборе есть тап, запуск и закрытие контрактов;
 *   3) прогресс растёт только от соответствующих серверных действий;
 *   4) награда — только XP и повторный claim невозможен;
 *   5) новый игровой день сбрасывает прогресс и выдаёт новый серверный набор.
 *
 * Запуск: npm run qa:daily
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const CORE = path.join(REPO_ROOT, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-daily-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);
const realNow = Date.now;
let fakeNow = Date.parse('2026-10-26T09:00:00Z');
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

async function api(route, body = {}, seed = 'daily-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'DailyTester',
      'x-forwarded-for': '10.38.0.1',
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

function taskByPrefix(state, prefix) {
  return state.taskKeys.find((key) => key.startsWith(prefix));
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.8: ежедневные поручения ===\n');

  let result = await api('init');
  let player = result.player;
  const state = player?.stats?.dailyTasks;
  check('init выдаёт ежедневные поручения', result.ok === true && state?.taskKeys?.length === 3);
  check('набор содержит тап, запуск и закрытие контракта', Boolean(
    taskByPrefix(state, 'tap_') &&
      taskByPrefix(state, 'mission_start_') &&
      taskByPrefix(state, 'mission_complete_')
  ), state?.taskKeys?.join(', '));
  check('прогресс нового дня нулевой', Object.values(state?.progress ?? {}).every((value) => value === 0));

  const stable = (await api('init')).player.stats.dailyTasks;
  check(
    'повторный init сохраняет ту же тройку',
    JSON.stringify(stable.taskKeys) === JSON.stringify(state.taskKeys) && stable.dayKey === state.dayKey,
    stable.taskKeys.join(', ')
  );

  const tapKey = taskByPrefix(state, 'tap_');
  const startKey = taskByPrefix(state, 'mission_start_');
  const completeKey = taskByPrefix(state, 'mission_complete_');
  const startTarget = Number(startKey.match(/_(\d+)$/)?.[1] ?? 0);
  const completeTarget = Number(completeKey.match(/_(\d+)$/)?.[1] ?? 0);

  // Один запрос с «живым» хвостом кликов всё равно проходит серверный античит,
  // поэтому проверяем сам факт прогресса, а не конкретное число кликов.
  const afterClicks = await api('click', { clicks: 60 });
  player = afterClicks.player;
  const tapProgress = player.stats.dailyTasks.progress[tapKey] ?? 0;
  check('тапы двигают только тап-поручение', tapProgress > 0, `${tapProgress}/${player.stats.dailyTasks.progress[tapKey]}`);
  check(
    'запуск/закрытие пока не засчитаны от тапов',
    (player.stats.dailyTasks.progress[startKey] ?? 0) === 0 &&
      (player.stats.dailyTasks.progress[completeKey] ?? 0) === 0
  );

  const incompleteClaim = await api('daily-tasks', { action: 'claim', taskKey: tapKey });
  check('неготовое поручение нельзя забрать', incompleteClaim.ok === false, incompleteClaim.error);

  // Skip — уже существующее действие контракта; он мгновенно закрывает таймер
  // частичным результатом, а daily progress всё равно считает закрытие.
  for (let index = 0; index < Math.max(startTarget, completeTarget); index += 1) {
    const started = await api('missions', { action: 'start', missionKey: player.availableMissionKeys[0] });
    const mission = started.player?.activeMissions?.[0];
    check(`контракт ${index + 1} запускается для QA`, started.ok === true && Boolean(mission?.id));
    if (!mission) break;
    const skipped = await api('missions', { action: 'skip', missionId: mission.id });
    check(`контракт ${index + 1} закрывается для QA`, skipped.ok === true, skipped.error);
    player = skipped.player;
  }

  const readyState = player.stats.dailyTasks;
  check('запуски достигли цели', (readyState.progress[startKey] ?? 0) >= startTarget);
  check('закрытия достигли цели', (readyState.progress[completeKey] ?? 0) >= completeTarget);

  const xpBefore = player.xp;
  const startReward = Number(startKey.match(/_(\d+)$/)?.[1] ?? 1) * 10;
  const completeReward = Number(completeKey.match(/_(\d+)$/)?.[1] ?? 1) * 10;
  const claimStart = await api('daily-tasks', { action: 'claim', taskKey: startKey });
  const claimComplete = await api('daily-tasks', { action: 'claim', taskKey: completeKey });
  player = claimComplete.player;
  check('готовое поручение можно забрать', claimStart.ok === true && claimComplete.ok === true);
  check(
    'награда ежедневных поручений — только XP',
    player.xp === xpBefore + startReward + completeReward,
    `${xpBefore} → ${player.xp}`
  );
  check('после claim поручения помечены полученными',
    player.stats.dailyTasks.claimed.includes(startKey) && player.stats.dailyTasks.claimed.includes(completeKey));

  const duplicate = await api('daily-tasks', { action: 'claim', taskKey: startKey });
  check('повторный claim той же награды заблокирован', duplicate.ok === false, duplicate.error);

  fakeNow += 86_400_000;
  const nextDay = await api('init');
  const nextState = nextDay.player?.stats?.dailyTasks;
  check('новые московские сутки создают новый state', nextState.dayKey !== state.dayKey);
  check('прогресс и claims сбрасываются в новом дне',
    Object.values(nextState.progress).every((value) => value === 0) && nextState.claimed.length === 0);

  const dailyTasksPanelSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/DailyTasksPanel.tsx'), 'utf8');
  check('выполненные ежедневные поручения можно скрыть крестиком',
    dailyTasksPanelSource.includes('<X className="h-3.5 w-3.5" />') &&
      dailyTasksPanelSource.includes('Скрыть выполненные поручения до следующего дня') &&
      dailyTasksPanelSource.includes('localStorage.setItem(dismissStorageKey, \'1\')'));

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
