/**
 * HACKER KOMBAT — QA: Neon Relay, 7 календарных дней × 3 задания.
 *
 * Проверяет новую модель сезонного события, а не старые глобальные goals:
 * серверную генерацию, level scaling, стабильность набора после reload,
 * переход календарного дня, закрытие дня, автоматическую выдачу двух рамок,
 * duplicate claim и сохранение коллекции после окончания окна.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-season-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SEASON_EVENT_TEST_MODE = 'true';

const { dispatchApiRequest } = require(CORE);
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

async function api(route, body = {}, seed = 'season-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'SeasonTester',
      'x-forwarded-for': '10.39.0.1',
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

function dayTimestamp(day) {
  const isoDay = day <= 5 ? `2026-10-${String(27 + day - 1).padStart(2, '0')}` : `2026-11-0${day - 5}`;
  return Date.parse(`${isoDay}T00:00:00+03:00`);
}

function currentDayState(player) {
  const event = player?.stats?.seasonEvent;
  return event?.days?.[String(event.currentDay)] ?? null;
}

function taskProgress(day, task) {
  return Number(day?.progress?.[task.key] ?? 0);
}

async function closeTapTask(player, day) {
  const tapTask = day.tasks.find((task) => task.kind === 'tap');
  for (let attempt = 0; attempt < 30 && taskProgress(day, tapTask) < tapTask.target; attempt += 1) {
    fakeNow += 3_000;
    const result = await api('click', { clicks: 60 });
    player = result.player;
    day = currentDayState(player);
  }
  return { player, day, task: tapTask };
}

async function closeContractTasks(player, day) {
  const startTask = day.tasks.find((task) => task.kind === 'mission_start');
  const completeTask = day.tasks.find((task) => task.kind === 'mission_complete');
  const required = Math.max(startTask.target, completeTask.target);

  for (let index = 0; index < required; index += 1) {
    const missionKey = player.availableMissionKeys?.[0];
    const started = await api('missions', { action: 'start', missionKey });
    const mission = started.player?.activeMissions?.[0];
    if (!mission) return { player: started.player, startTask, completeTask, ok: false };
    player = started.player;
    // Claim uses the existing contract timer and reward path; no event-only
    // shortcut is used, so ordinary contract economy remains under test.
    fakeNow += 900_000;
    const claimed = await api('missions', { action: 'claim', missionId: mission.id });
    player = claimed.player;
  }
  return {
    player,
    startTask,
    completeTask,
    ok:
      taskProgress(currentDayState(player), startTask) >= startTask.target &&
      taskProgress(currentDayState(player), completeTask) >= completeTask.target,
  };
}

(async () => {
  console.log('=== HACKER KOMBAT — QA: Neon Relay 7×3 ===\n');

  let result = await api('init');
  let player = result.player;
  let event = player?.stats?.seasonEvent;
  let day = currentDayState(player);

  check('init выдаёт новую per-day модель', result.ok === true && event?.eventKey === 'neon-relay' && event?.version === 2);
  check('ивент хранит ровно 7 дней и 3 задания в текущем дне',
    event?.currentDay === 1 && day?.tasks?.length === 3,
    JSON.stringify(day?.tasks?.map((task) => task.kind)));
  check('первый набор содержит tap/start/complete',
    new Set(day?.tasks?.map((task) => task.kind)).size === 3);
  check('умеренная сложность зафиксирована уровнем генерации',
    day?.levelAtGeneration === player.derived.level &&
      day.tasks.every((task) => task.target > 0 && task.target <= 1200));

  const firstTasksSnapshot = JSON.stringify(day.tasks);
  const reloaded = await api('init');
  const reloadedDay = currentDayState(reloaded.player);
  check('reload не reroll’ит дневной набор', JSON.stringify(reloadedDay.tasks) === firstTasksSnapshot);
  player = reloaded.player;
  day = reloadedDay;

  const tapped = await closeTapTask(player, day);
  player = tapped.player;
  day = tapped.day;
  check('тапы двигают только tap-задачу текущего дня',
    taskProgress(day, tapped.task) >= tapped.task.target &&
      day.tasks.filter((task) => task.kind !== 'tap').every((task) => taskProgress(day, task) === 0));

  const contracted = await closeContractTasks(player, day);
  player = contracted.player;
  day = currentDayState(player);
  check('обычные контракты закрывают start/complete задачи дня', contracted.ok, JSON.stringify(day?.progress));
  check('полное закрытие тройки помечает день завершённым',
    day?.completed === true && player.stats.seasonEvent.completedDays.includes(1));
  check('первый полный день автоматически выдаёт голубую рамку навсегда',
    player.stats.seasonEvent.participationClaimed === true &&
      player.stats.unlockedProfileFrames.includes('frame_neon_relay'));

  const economyBeforeDuplicate = {
    xp: player.xp,
    data: player.data,
    crypto: player.crypto,
    chips: player.chips,
  };
  const duplicateParticipation = await api('season-event', { action: 'claim_participation' });
  check('повторный claim голубой награды блокируется', duplicateParticipation.ok === false, duplicateParticipation.error);
  const duplicateParticipationReload = await api('init');
  check('заблокированный duplicate claim не меняет экономику',
    duplicateParticipationReload.player.xp === economyBeforeDuplicate.xp &&
      duplicateParticipationReload.player.data === economyBeforeDuplicate.data &&
      duplicateParticipationReload.player.crypto === economyBeforeDuplicate.crypto &&
      duplicateParticipationReload.player.chips === economyBeforeDuplicate.chips);

  const removedBlue = await api('skin', { action: 'profile_frame', skinKey: 'default' });
  const reappliedBlue = await api('skin', { action: 'profile_frame', skinKey: 'frame_neon_relay' });
  check('голубую рамку можно снять и повторно применить через профиль',
    removedBlue.ok === true && reappliedBlue.ok === true &&
      reappliedBlue.player.stats.equippedProfileFrame === 'frame_neon_relay',
    reappliedBlue.error);

  let previousDayKeys = new Set(day.tasks.map((task) => task.key));
  for (let calendarDay = 2; calendarDay <= 7; calendarDay += 1) {
    fakeNow = dayTimestamp(calendarDay);
    const entered = await api('init');
    player = entered.player;
    event = player.stats.seasonEvent;
    day = currentDayState(player);
    const freshKeys = new Set(day.tasks.map((task) => task.key));
    check(`календарный день ${calendarDay} выдаёт ровно 3 новых задания`,
      event.currentDay === calendarDay && day.tasks.length === 3 &&
        [...freshKeys].every((key) => !previousDayKeys.has(key)));
    check(`день ${calendarDay} фиксирует level scaling`,
      day.levelAtGeneration === player.derived.level && day.tasks.every((task) => task.target > 0));

    if (calendarDay === 4) {
      const beforeReload = JSON.stringify(day.tasks);
      const afterReload = await api('init');
      player = afterReload.player;
      day = currentDayState(player);
      check('reload в середине недели сохраняет именно текущую тройку', JSON.stringify(day.tasks) === beforeReload);
    }

    const tappedDay = await closeTapTask(player, day);
    player = tappedDay.player;
    day = tappedDay.day;
    const contractDay = await closeContractTasks(player, day);
    player = contractDay.player;
    day = currentDayState(player);
    check(`все 3 задачи дня ${calendarDay} закрываются обычными действиями`,
      contractDay.ok && day.completed === true,
      JSON.stringify(day.progress));
    previousDayKeys = freshKeys;
  }

  event = player.stats.seasonEvent;
  check('полное прохождение содержит все 7 completedDays',
    JSON.stringify(event.completedDays) === JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
  check('седьмой день автоматически выдаёт золотую рамку навсегда',
    event.masteryClaimed === true &&
      player.stats.unlockedProfileFrames.includes('frame_neon_relay_master'));

  const duplicateMastery = await api('season-event', { action: 'claim_mastery' });
  check('повторный claim золотой награды блокируется', duplicateMastery.ok === false, duplicateMastery.error);

  const removedMastery = await api('skin', { action: 'profile_frame', skinKey: 'default' });
  const reappliedMastery = await api('skin', { action: 'profile_frame', skinKey: 'frame_neon_relay_master' });
  check('золотую рамку можно снять и повторно применить через профиль',
    removedMastery.ok === true && reappliedMastery.ok === true &&
      reappliedMastery.player.stats.equippedProfileFrame === 'frame_neon_relay_master');

  const persistedBeforeEnd = await api('init');
  fakeNow = Date.parse('2026-11-03T09:00:01+03:00');
  delete process.env.SEASON_EVENT_TEST_MODE;
  const ended = await api('init');
  const blockedAfterEnd = await api('season-event', { action: 'claim_mastery' });
  check('после ровно 7 суток новые event actions закрыты', blockedAfterEnd.ok === false, blockedAfterEnd.error);
  check('reload после окончания сохраняет 7 дней и обе рамки',
    ended.player.stats.seasonEvent.completedDays.length === 7 &&
      ended.player.stats.unlockedProfileFrames.includes('frame_neon_relay') &&
      ended.player.stats.unlockedProfileFrames.includes('frame_neon_relay_master') &&
      persistedBeforeEnd.player.stats.seasonEvent.days['4'].tasks.length === 3);

  // Guard до даты старта для нового пользователя: отсутствие state не должно
  // превращаться в пустой «седьмой день» или разрешённый claim.
  fakeNow = Date.parse('2026-10-27T08:59:59+03:00');
  const inactive = await api('init', {}, 'season-off-qa');
  const blocked = await api('season-event', { action: 'claim_participation' }, 'season-off-qa');
  check('до 09:00 MSK ивент не создаёт state', !inactive.player.stats.seasonEvent);
  check('до старта сервер блокирует награды', blocked.ok === false, blocked.error);

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
