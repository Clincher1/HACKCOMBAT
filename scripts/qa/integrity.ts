import { readFileSync } from 'node:fs';
import {
  getLevelProgress,
  getMissionRewardScale,
  getMissionXpAward,
  getXpToNext,
  MAX_PLAYER_LEVEL,
} from '../../shared/hack.config';
import {
  getGameDayKey,
  getPrestigeMultiplier,
  getPrestigeRequiredLevel,
  getRankForLevel,
  getSafePrestigeCount,
  MAX_PRESTIGE_COUNT,
} from '../../shared/mechanics';
import {
  getInviteeXpReward,
  getReferrerXpReward,
} from '../../shared/referral.config';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${detail ? ` :: ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

console.log('=== HACKER KOMBAT — integrity QA ===\n');

const capXp = getLevelProgress(Number.MAX_SAFE_INTEGER);
check('XP cap is finite', getXpToNext(MAX_PLAYER_LEVEL) === 0 && Number.isFinite(capXp.xpToNext), String(capXp.xpToNext));
check('mission XP is zero at L200', getMissionXpAward(10_000, 6, MAX_PLAYER_LEVEL) === 0);
check('referral XP is zero at L200', getReferrerXpReward(MAX_PLAYER_LEVEL) === 0 && getInviteeXpReward(MAX_PLAYER_LEVEL) === 0);
check('reward scale remains finite at L200', Number.isFinite(getMissionRewardScale(MAX_PLAYER_LEVEL)));
check('reward scale soft-caps after L90', getMissionRewardScale(200) < 10_000_000, String(getMissionRewardScale(200)));
check('level migration agrees with runtime formula', getLevelProgress(370_538_000).level === 200);

check('prestige clamps below zero', getSafePrestigeCount(-10) === 0);
check('prestige clamps above five', getSafePrestigeCount(99) === MAX_PRESTIGE_COUNT);
check('prestige multiplier is finite and shared', getPrestigeMultiplier(99) === 32);
check('prestige thresholds end at L90', getPrestigeRequiredLevel(99) === 90);
check('rank is level-based after prestige', getRankForLevel(200).rankIndex === 12);

check(
  'game day uses the same Moscow boundary',
  getGameDayKey(Date.parse('2026-10-27T20:59:59.999Z')) === '2026-10-27' &&
    getGameDayKey(Date.parse('2026-10-27T21:00:00.000Z')) === '2026-10-28'
);

const migration010 = readFileSync('supabase/migrations/010_progression_integrity.sql', 'utf8');
const migration011 = readFileSync('supabase/migrations/011_atomic_purchases.sql', 'utf8');
const migration012 = readFileSync('supabase/migrations/012_data_finite_cap.sql', 'utf8');
const migration013 = readFileSync('supabase/migrations/013_atomic_prestige.sql', 'utf8');
const migration014 = readFileSync('supabase/migrations/014_purchase_card_cap.sql', 'utf8');
check('integrity migration is non-destructive', !/TRUNCATE|DELETE\s+FROM\s+public\.players/i.test(migration010));
check('mission claim RPC is present', /claim_mission_atomic/.test(migration010));
check('purchase RPC is present', /commit_purchase_atomic/.test(migration011));
check('legacy passive is disabled', /RETURN\s+0;/.test(migration010));
check('Data finite cap is enforced in SQL', /9007199254740991/.test(migration012) && /CHECK/.test(migration012));
check('prestige reset RPC is present', /global_prestige_atomic/.test(migration013));
check('atomic card cap matches Tier IV', /p_item_level > 60/.test(migration014));

const deskSource = readFileSync('src/components/DeskScene.tsx', 'utf8');
check('max XP UI says MAX, not infinity', /: 'MAX'\}\s*XP/.test(deskSource) && !/: '∞'\}\s*XP/.test(deskSource));

console.log(`\nИтого: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error(`FAILURES: ${failures.join(', ')}`);
  process.exit(1);
}
