/**
 * HACKER KOMBAT — QA v3.10: кормление всех питомцев.
 *
 * Проверяет, что кормление каждого питомца одновременно:
 *   1) поднимает hunger/effectiveHunger и feedCount;
 *   2) сохраняется после следующего init;
 *   3) списывает Data только один раз;
 *   4) не позволяет повторное кормление до cooldown.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-pets-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_SEED = 'pets-qa';
const LOW_FUNDS_SEED = 'pets-low-funds-qa';
function demoTgId(seed) {
  return -(100_000_000 + crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest().readUInt32BE(0) % 800_000_000);
}
const DEMO_TG_ID = demoTgId(DEMO_SEED);
const LOW_FUNDS_TG_ID = demoTgId(LOW_FUNDS_SEED);
const realNow = Date.now;
let fakeNow = Date.parse('2026-10-26T12:00:00Z');
Date.now = () => fakeNow;

function makeRecord(tgId, data = 50_000) {
  const nowIso = new Date(fakeNow - 6 * 3_600_000).toISOString();
  return {
    id: 'pets-qa-id',
    tgId,
    username: 'PetsTester',
    data,
    crypto: 5_000,
    chips: 0,
    xp: 5_000_000,
    energy: 1_500,
    energyUpdated: nowIso,
    heat: 0,
    rep: 5_000,
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
    pets: [
      { key: 'hamster_byte', hunger: 10, lastFedAt: nowIso, feedCount: 0 },
      { key: 'rat_glitch', hunger: 10, lastFedAt: nowIso, feedCount: 0 },
      { key: 'guinea_pixel', hunger: 10, lastFedAt: nowIso, feedCount: 0 },
    ],
    baseUpgrades: {},
    stats: {},
    activeMissions: [],
    availableMissionKeys: [],
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({
    playersByTgId: {
      [String(DEMO_TG_ID)]: makeRecord(DEMO_TG_ID),
      [String(LOW_FUNDS_TG_ID)]: makeRecord(LOW_FUNDS_TG_ID, 0),
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

async function api(route, body = {}, seed = DEMO_SEED) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'PetsTester',
      'x-forwarded-for': '10.40.0.1',
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
  console.log('=== HACKER KOMBAT — QA v3.10: питомцы ===\n');

  let init = await api('init');
  let player = init.player;
  check('все три питомца загружены', player.pets.length === 3, player.pets.map((p) => p.key).join(', '));

  const petKeys = ['hamster_byte', 'rat_glitch', 'guinea_pixel'];
  for (const petKey of petKeys) {
    const before = player.pets.find((pet) => pet.key === petKey);
    const dataBefore = player.data;
    fakeNow += 1_000;
    const fed = await api('pets', { action: 'feed', petKey });
    player = fed.player;
    const after = player?.pets?.find((pet) => pet.key === petKey);
    check(`${petKey}: кормление прошло`, fed.ok === true, fed.error);
    check(`${petKey}: hunger вырос`, (after?.effectiveHunger ?? 0) > (before?.effectiveHunger ?? 0), `${before?.effectiveHunger} → ${after?.effectiveHunger}`);
    check(`${petKey}: сохранён hunger на момент кормления`, (after?.hunger ?? 0) > (before?.hunger ?? 0), `${before?.hunger} → ${after?.hunger}`);
    check(`${petKey}: увеличен feedCount`, after?.feedCount === (before?.feedCount ?? 0) + 1);
    check(`${petKey}: обновлён lastFedAt`, new Date(after?.lastFedAt ?? 0).getTime() > new Date(before?.lastFedAt ?? 0).getTime());
    check(`${petKey}: Data списан один раз`, player.data < dataBefore && player.data > dataBefore - 1_000, `${dataBefore} → ${player.data}`);

    init = await api('init');
    player = init.player;
    const reloaded = player.pets.find((pet) => pet.key === petKey);
    check(`${petKey}: hunger не откатывается после init`, reloaded?.feedCount === after?.feedCount && (reloaded?.hunger ?? 0) >= (after?.hunger ?? 0));
    check(`${petKey}: lastFedAt не откатывается после init`, reloaded?.lastFedAt === after?.lastFedAt);
  }

  const dataBeforeCooldown = player.data;
  const rejected = await api('pets', { action: 'feed', petKey: 'hamster_byte' });
  check('повторное кормление до cooldown отклоняется', rejected.ok === false && /перезаряжается/i.test(rejected.error ?? ''), rejected.error);
  player = (await api('init')).player;
  check('отклонённое кормление не списывает Data', player.data === dataBeforeCooldown, `${dataBeforeCooldown} → ${player.data}`);

  const lowFundsBefore = (await api('init', {}, LOW_FUNDS_SEED)).player;
  const lowFundsFeed = await api('pets', { action: 'feed', petKey: 'hamster_byte' }, LOW_FUNDS_SEED);
  check('кормление без средств отклоняется', lowFundsFeed.ok === false && /Недостаточно Data/i.test(lowFundsFeed.error ?? ''), lowFundsFeed.error);
  const lowFundsAfter = (await api('init', {}, LOW_FUNDS_SEED)).player;
  const lowFundsPet = lowFundsAfter.pets.find((pet) => pet.key === 'hamster_byte');
  const lowFundsPetBefore = lowFundsBefore.pets.find((pet) => pet.key === 'hamster_byte');
  check('без средств hunger и feedCount не меняются', lowFundsPet?.hunger === lowFundsPetBefore?.hunger && lowFundsPet?.feedCount === lowFundsPetBefore?.feedCount);
  check('без средств баланс не меняется', lowFundsAfter.data === lowFundsBefore.data, `${lowFundsBefore.data} → ${lowFundsAfter.data}`);

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
