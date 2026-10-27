/**
 * HACKER KOMBAT — QA v3.9: 7-дневная сезонная операция.
 *
 * Проверяет серверный прогресс, две косметические награды, отсутствие игровых
 * ресурсов в claim, строгое 7-дневное окно и закрытие после окончания без удаления коллекции рамок.
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

function sameEconomy(a, b) {
  return a.xp === b.xp && a.data === b.data && a.crypto === b.crypto && a.chips === b.chips;
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.9: сезонная операция ===\n');

  let result = await api('init');
  let player = result.player;
  let event = player?.stats?.seasonEvent;
  check('init выдаёт сезонную операцию', result.ok === true && event?.eventKey === 'neon-relay');
  check('операция начинается с нулевого прогресса', Object.values(event?.progress ?? {}).every((value) => value === 0));
  check('у операции ровно 7 дней', event?.weekKey === '2026-10-27');

  // Ускоряем восстановление Energy временем, но каждую пачку всё равно
  // проводим через реальный click endpoint с серверным античитом.
  for (let index = 0; index < 18; index += 1) {
    fakeNow += 3_000;
    const clicked = await api('click', { clicks: 60 });
    player = clicked.player;
  }
  event = player.stats.seasonEvent;
  const tapGoal = Object.entries(event.progress).find(([key]) => key.startsWith('event_taps_1000'));
  check('тапы двигают сезонную цель', Number(tapGoal?.[1] ?? 0) > 0, `${tapGoal?.[1] ?? 0}/1000`);
  check('тапы не двигают цели контрактов', event.progress.event_starts_3 === 0 && event.progress.event_completes_3 === 0);

  const earlyParticipation = await api('season-event', { action: 'claim_participation' });
  check('рамку участника нельзя получить после одной цели', earlyParticipation.ok === false, earlyParticipation.error);
  player = (await api('init')).player;
  check('до полного прохождения рамки не открыты',
    !player.stats.unlockedProfileFrames.includes('frame_neon_relay') &&
      !player.stats.unlockedProfileFrames.includes('frame_neon_relay_master'));

  // Три запуска и три закрытия используют существующую механику контрактов.
  for (let index = 0; index < 3; index += 1) {
    const started = await api('missions', { action: 'start', missionKey: player.availableMissionKeys[0] });
    const mission = started.player?.activeMissions?.[0];
    if (!mission) break;
    const closed = await api('missions', { action: 'skip', missionId: mission.id });
    player = closed.player;
  }
  event = player.stats.seasonEvent;
  check('запуски контрактов закрывают вторую цель', event.progress.event_starts_3 >= 3, String(event.progress.event_starts_3));
  check('закрытия контрактов закрывают третью цель', event.progress.event_completes_3 >= 3, String(event.progress.event_completes_3));

  // Если Energy у конкретного баланса меньше, чем нужно для 1000 тапов,
  // даём серверу ещё немного реального времени на восстановление.
  for (let index = 0; index < 12 && (player.stats.seasonEvent.progress.event_taps_1000 ?? 0) < 1000; index += 1) {
    fakeNow += 10_000;
    const clicked = await api('click', { clicks: 60 });
    player = clicked.player;
  }
  event = player.stats.seasonEvent;
  check('все три личные цели можно закрыть существующими действиями',
    event.progress.event_taps_1000 >= 1000 && event.progress.event_starts_3 >= 3 && event.progress.event_completes_3 >= 3,
    JSON.stringify(event.progress));

  const economyBeforeParticipation = { ...player };
  const participation = await api('season-event', { action: 'claim_participation' });
  player = participation.player;
  check('рамку участника можно получить после полного прохождения', participation.ok === true, participation.error);
  check('рамка участника открыта и включена',
    player.stats.unlockedProfileFrames.includes('frame_neon_relay') &&
      player.stats.equippedProfileFrame === 'frame_neon_relay');
  check('claim рамки участника не даёт игровые ресурсы', sameEconomy(participation.player, economyBeforeParticipation));

  const duplicateParticipation = await api('season-event', { action: 'claim_participation' });
  check('рамку участника нельзя получить повторно', duplicateParticipation.ok === false, duplicateParticipation.error);

  const economyBeforeMastery = { ...player };
  const mastery = await api('season-event', { action: 'claim_mastery' });
  player = mastery.player;
  check('редкую рамку можно получить за все цели', mastery.ok === true, mastery.error);
  check('редкая рамка открыта и включена',
    player.stats.unlockedProfileFrames.includes('frame_neon_relay_master') &&
      player.stats.equippedProfileFrame === 'frame_neon_relay_master');
  check('claim редкой рамки не даёт XP/Data/Crypto/Чипы', sameEconomy(mastery.player, economyBeforeMastery));

  const duplicateMastery = await api('season-event', { action: 'claim_mastery' });
  check('редкую рамку нельзя получить повторно', duplicateMastery.ok === false, duplicateMastery.error);

  // Ровно через 7 суток окно закрывается: прогресс и коллекция сохраняются,
  // но новые claim-запросы сервер больше не принимает.
  fakeNow = Date.parse('2026-11-03T06:00:01Z');
  delete process.env.SEASON_EVENT_TEST_MODE;
  const ended = await api('init');
  const blockedAfterEnd = await api('season-event', { action: 'claim_participation' });
  check('после 7 дней окно ивента закрывается', blockedAfterEnd.ok === false, blockedAfterEnd.error);
  check('прогресс после окончания не удаляется', ended.player.stats.seasonEvent.weekKey === '2026-10-27');
  check('полученные рамки остаются после окончания',
    ended.player.stats.unlockedProfileFrames.includes('frame_neon_relay') &&
      ended.player.stats.unlockedProfileFrames.includes('frame_neon_relay_master'));

  // Production guard до старта: новый игрок не получает state и claim закрыт.
  fakeNow = Date.parse('2026-10-27T05:59:59Z');
  const inactive = await api('init', {}, 'season-off-qa');
  const blocked = await api('season-event', { action: 'claim_participation' }, 'season-off-qa');
  check('до 09:00 MSK event не активируется', !inactive.player.stats.seasonEvent);
  check('до старта сервер блокирует claim', blocked.ok === false, blocked.error);

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
