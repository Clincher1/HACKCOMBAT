/**
 * HACKER KOMBAT — QA: серверный реестр постоянных подарочных рамок.
 *
 * Проверяет, что назначение привязано к Telegram ID, добавляется в коллекцию
 * один раз и не переэкипирует рамку после того, как игрок её снял.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const bundle = '/tmp/hk-profile-frame-gifts.cjs';
execFileSync('npx', [
  'esbuild',
  path.join(root, 'api/_lib/profileFrameGifts.ts'),
  '--bundle',
  '--platform=node',
  '--format=cjs',
  `--outfile=${bundle}`,
  '--log-level=warning',
], { stdio: 'inherit' });
const require = createRequire(import.meta.url);
const { ensurePermanentProfileFrameGifts } = require(bundle);

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

const assignments = [
  [296_857_803, 'frame_rainbow_fish'],
  [495_832_433, 'frame_rooster_red'],
  [6_623_819_182, 'frame_matrix_rain'],
];

for (const [tgId, frameKey] of assignments) {
  const stats = { unlockedProfileFrames: [] };
  const changed = ensurePermanentProfileFrameGifts(stats, tgId);
  const secondPass = ensurePermanentProfileFrameGifts(stats, tgId);
  check(`${tgId} получает назначенную рамку`, changed && stats.unlockedProfileFrames.includes(frameKey));
  check(`${tgId} не получает дубликат при повторном sync`, secondPass === false && stats.unlockedProfileFrames.filter((key) => key === frameKey).length === 1);
}

const removed = {
  unlockedProfileFrames: ['frame_rooster_red'],
  equippedProfileFrame: undefined,
};
ensurePermanentProfileFrameGifts(removed, 495_832_433);
check('снятая рамка остаётся в коллекции, но не надевается заново',
  removed.equippedProfileFrame === undefined && removed.unlockedProfileFrames.includes('frame_rooster_red'));

const unknown = { unlockedProfileFrames: [] };
check('неназначенный Telegram ID не получает подарок',
  ensurePermanentProfileFrameGifts(unknown, 123456789) === false && unknown.unlockedProfileFrames.length === 0);

console.log(`\nИтог: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exitCode = 1;
