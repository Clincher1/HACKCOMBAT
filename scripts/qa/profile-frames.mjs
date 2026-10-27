/**
 * HACKER KOMBAT — QA v3.11: магазин постоянных рамок профиля.
 *
 * Проверяет уровень 30, цену Crypto, покупку, повторный init, надевание/снятие,
 * защиту event-рамок от покупки и сохранность косметики в профиле.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-profile-frames-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const SEED = 'profile-frames-qa';
const LOW_LEVEL_SEED = 'profile-frames-low-level-qa';
const LOW_CRYPTO_SEED = 'profile-frames-low-crypto-qa';
const STALE_EQUIPPED_SEED = 'profile-frames-stale-equipped-qa';
const TEMPORARY_FRAME_SEED = 'profile-frames-temporary-qa';
const EXPIRED_FRAME_SEED = 'profile-frames-expired-qa';
function demoTgId(seed) {
  return -(100_000_000 + crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest().readUInt32BE(0) % 800_000_000);
}
const nowIso = '2026-10-26T12:00:00.000Z';

function makeRecord(tgId, { xp = 5_000_000, cryptoAmount = 5_000, username = 'FrameTester' } = {}) {
  return {
    id: `${tgId}-qa`,
    tgId,
    username,
    data: 10_000,
    crypto: cryptoAmount,
    chips: 0,
    xp,
    energy: 1_500,
    energyUpdated: nowIso,
    heat: 0,
    rep: 0,
    prestigeCount: 0,
    cardTier: 1,
    clickBlockedUntil: null,
    dailyStreak: 0,
    lastDailyClaim: null,
    equippedSkin: 'default',
    unlockedSkins: ['default'],
    totalClicks: 0,
    totalMissions: 0,
    lastPassiveClaim: nowIso,
    lastClickBatchAt: 0,
    cards: {},
    team: [],
    pets: [],
    baseUpgrades: {},
    stats: {},
    activeMissions: [],
    availableMissionKeys: [],
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

const tgId = demoTgId(SEED);
const lowLevelId = demoTgId(LOW_LEVEL_SEED);
const lowCryptoId = demoTgId(LOW_CRYPTO_SEED);
const staleEquippedId = demoTgId(STALE_EQUIPPED_SEED);
const temporaryFrameId = demoTgId(TEMPORARY_FRAME_SEED);
const expiredFrameId = demoTgId(EXPIRED_FRAME_SEED);
const staleEquippedRecord = makeRecord(staleEquippedId, { username: 'StaleFrameTester' });
const temporaryFrameRecord = makeRecord(temporaryFrameId, { username: 'TemporaryFrameTester' });
temporaryFrameRecord.stats = {
  unlockedProfileFrames: ['frame_rooster_red'],
  equippedProfileFrame: 'frame_rooster_red',
  equippedProfileFrameExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};
const expiredFrameRecord = makeRecord(expiredFrameId, { username: 'ExpiredFrameTester' });
expiredFrameRecord.stats = {
  unlockedProfileFrames: ['frame_rooster_red'],
  equippedProfileFrame: 'frame_rooster_red',
  equippedProfileFrameExpiresAt: new Date(Date.now() - 1000).toISOString(),
};
staleEquippedRecord.stats = {
  unlockedProfileFrames: ['frame_neon_relay_master'],
  equippedProfileFrame: 'frame_neon_relay_master',
  seasonEvent: {
    version: 2,
    eventKey: 'neon-relay',
    weekKey: '2026-10-27',
    currentDay: 1,
    days: {},
    completedDays: [],
    participationClaimed: false,
    masteryClaimed: true,
  },
};
fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({
    playersByTgId: {
      [String(tgId)]: makeRecord(tgId),
      [String(lowLevelId)]: makeRecord(lowLevelId, { xp: 0 }),
      [String(lowCryptoId)]: makeRecord(lowCryptoId, { cryptoAmount: 10 }),
      [String(staleEquippedId)]: staleEquippedRecord,
      [String(temporaryFrameId)]: temporaryFrameRecord,
      [String(expiredFrameId)]: expiredFrameRecord,
    },
  })
);

const { dispatchApiRequest } = require(CORE);
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

async function api(route, body = {}, seed = SEED, method = 'POST') {
  const req = {
    url: `/api/${route}`,
    method,
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'FrameTester',
      'x-forwarded-for': '10.41.0.1',
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

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.11: рамки профиля ===\n');

  let init = await api('init');
  let player = init.player;
  check('рамки профиля не меняют игровой баф', player.derived.clickPower >= 1);
  check('уровень QA выше 30', player.derived.level >= 30, `ур. ${player.derived.level}`);

  const before = player.crypto;
  const bought = await api('skin', { action: 'profile_frame', skinKey: 'frame_cyan_pulse' });
  player = bought.player;
  check('рамка Cyan покупается', bought.ok === true, bought.error);
  check('списана ровно цена Cyan Pulse', player.crypto === before - 480, `${before} → ${player.crypto}`);
  check('рамка куплена навсегда и надета',
    player.stats.unlockedProfileFrames.includes('frame_cyan_pulse') &&
      player.stats.equippedProfileFrame === 'frame_cyan_pulse');

  init = await api('init');
  player = init.player;
  check('рамка сохраняется после повторного init',
    player.stats.unlockedProfileFrames.includes('frame_cyan_pulse') &&
      player.stats.equippedProfileFrame === 'frame_cyan_pulse');

  const cryptoBeforeEquip = player.crypto;
  const equipped = await api('skin', { action: 'profile_frame', skinKey: 'frame_magenta_breach' });
  check('вторая рамка покупается', equipped.ok === true, equipped.error);
  check('вторая рамка надевается и Crypto списывается по цене',
    equipped.player.stats.equippedProfileFrame === 'frame_magenta_breach' &&
      equipped.player.crypto === cryptoBeforeEquip - 620);
  const cleared = await api('skin', { action: 'profile_frame', skinKey: 'default' });
  check('рамку можно снять без удаления покупки',
    cleared.ok === true && !cleared.player.stats.equippedProfileFrame &&
      cleared.player.stats.unlockedProfileFrames.includes('frame_cyan_pulse') &&
      cleared.player.stats.unlockedProfileFrames.includes('frame_magenta_breach'));

  const lowLevelBefore = (await api('init', {}, LOW_LEVEL_SEED)).player;
  const lowLevel = await api('skin', { action: 'profile_frame', skinKey: 'frame_cyan_pulse' }, LOW_LEVEL_SEED);
  check('рамка закрыта до 30 уровня', lowLevel.ok === false && /30 уровне/i.test(lowLevel.error ?? ''), lowLevel.error);
  const lowLevelReload = (await api('init', {}, LOW_LEVEL_SEED)).player;
  check('отказ по уровню ничего не списывает', lowLevelReload.crypto === lowLevelBefore.crypto && lowLevelReload.stats.unlockedProfileFrames.length === 0, `${lowLevelBefore.crypto} → ${lowLevelReload.crypto} Crypto, ${lowLevelReload.stats.unlockedProfileFrames.length} рамок`);

  const lowCryptoBefore = (await api('init', {}, LOW_CRYPTO_SEED)).player;
  const lowCrypto = await api('skin', { action: 'profile_frame', skinKey: 'frame_red_alert' }, LOW_CRYPTO_SEED);
  check('дорогая рамка без Crypto отклоняется', lowCrypto.ok === false && /Недостаточно Crypto/i.test(lowCrypto.error ?? ''), lowCrypto.error);
  const lowCryptoReload = (await api('init', {}, LOW_CRYPTO_SEED)).player;
  check('отказ по Crypto не меняет баланс', lowCryptoReload.crypto === lowCryptoBefore.crypto && lowCryptoReload.stats.unlockedProfileFrames.length === 0, `${lowCryptoBefore.crypto} → ${lowCryptoReload.crypto} Crypto, ${lowCryptoReload.stats.unlockedProfileFrames.length} рамок`);

  const eventFrame = await api('skin', { action: 'profile_frame', skinKey: 'frame_neon_relay' });
  check('event-рамку нельзя купить в магазине', eventFrame.ok === false && /событи/i.test(eventFrame.error ?? ''), eventFrame.error);

  const temporaryFrame = await api('init', {}, TEMPORARY_FRAME_SEED);
  check(
    'временная рамка активна до срока истечения',
    temporaryFrame.player?.stats?.equippedProfileFrame === 'frame_rooster_red' &&
      typeof temporaryFrame.player?.stats?.equippedProfileFrameExpiresAt === 'string'
  );
  const expiredFrame = await api('init', {}, EXPIRED_FRAME_SEED);
  check(
    'истёкшая временная рамка автоматически снимается',
    expiredFrame.player?.stats?.equippedProfileFrame === undefined &&
      !(expiredFrame.player?.stats?.unlockedProfileFrames ?? []).includes('frame_rooster_red')
  );

  const leaderboard = await api('leaderboard', {}, SEED, 'GET');
  check('рейтинговый endpoint остаётся доступен после покупки рамок',
    leaderboard.ok === true && Array.isArray(leaderboard.entries));
  const staleEntry = leaderboard.entries?.find((entry) => entry.username === 'StaleFrameTester');
  check('неоткрытая рамка не показывается в рейтинге', staleEntry?.profileFrameKey === undefined, staleEntry?.profileFrameKey);

  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})();
