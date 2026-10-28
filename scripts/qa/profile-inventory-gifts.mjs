/**
 * HACKER KOMBAT — QA: постоянные персональные подарки инвентаря.
 *
 * Проверяет назначение по стабильному Telegram ID, идемпотентность и то, что
 * подарок не становится автоматически публичным или экипируемым.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const bundle = '/tmp/hk-profile-inventory-gifts.cjs';
execFileSync('npx', [
  'esbuild',
  path.join(root, 'api/_lib/profileInventoryGifts.ts'),
  '--bundle',
  '--platform=node',
  '--format=cjs',
  `--outfile=${bundle}`,
  '--log-level=warning',
], { stdio: 'inherit' });

const require = createRequire(import.meta.url);
const {
  ensurePermanentProfileInventoryGifts,
  PERSONAL_PROFILE_INVENTORY_GIFT_ASSIGNMENTS,
} = require(bundle);

let pass = 0;
let fail = 0;
function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${extra ? ` :: ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL — ${name}${extra ? ` :: ${extra}` : ''}`);
  }
}

const expectedKeys = ['reward:gift_cola', 'reward:gift_whiskey', 'reward:gift_snus'];
const assignments = [296_857_803, 495_832_433];

for (const tgId of assignments) {
  const stats = { inventoryOwned: ['reward:first_donut'], inventoryShowcase: [] };
  const changed = ensurePermanentProfileInventoryGifts(stats, tgId);
  const secondPass = ensurePermanentProfileInventoryGifts(stats, tgId);
  check(`${tgId} получает весь набор подарков`,
    changed && expectedKeys.every((key) => stats.inventoryOwned.includes(key)));
  check(`${tgId} не получает дубликаты при повторном sync`,
    secondPass === false && expectedKeys.every((key) => stats.inventoryOwned.filter((owned) => owned === key).length === 1));
  check(`${tgId} подарки не выставляются автоматически`, stats.inventoryShowcase.length === 0);
}

const unknown = { inventoryOwned: ['reward:first_donut'], inventoryShowcase: [] };
check('неназначенный Telegram ID не получает персональные подарки',
  ensurePermanentProfileInventoryGifts(unknown, 123456789) === false &&
    unknown.inventoryOwned.length === 1);

check('реестр содержит ровно двух согласованных получателей',
  Object.keys(PERSONAL_PROFILE_INVENTORY_GIFT_ASSIGNMENTS).length === 2);

console.log(`\nИтог: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exitCode = 1;
