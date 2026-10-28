import { readFileSync } from 'node:fs';
import {
  getLevelProgress,
  getMissionRewardScale,
  getMissionXpAward,
  getTotalXpForLevel,
  getXpToNext,
} from '../../shared/hack.config';
import {
  getGameDayKey,
  getPrestigeMultiplier,
  getPrestigeRequiredLevel,
  getRankForLevel,
  getSafePrestigeCount,
} from '../../shared/mechanics';
import {
  getInviteeXpReward,
  getReferrerXpReward,
} from '../../shared/referral.config';
import { PROFILE_FRAMES } from '../../shared/profileFrames.config';
import {
  FIRST_DONUT_ITEM_KEY,
  GIFT_COLA_ITEM_KEY,
  GIFT_SNUS_ITEM_KEY,
  GIFT_WHISKEY_ITEM_KEY,
  getInventoryItemDefinition,
} from '../../shared/inventory.config';
import { SKINS_CONFIG } from '../../shared/skins.config';

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

const xpAt200 = getTotalXpForLevel(200);
const xpAt201 = getTotalXpForLevel(201);
check('XP progression continues after L200', getXpToNext(200) > 0 && getXpToNext(201) > 0);
check('mission XP continues after L200', getMissionXpAward(10_000, 6, 200) > 0 && getMissionXpAward(10_000, 6, 201) > 0);
check('referral XP continues after L200', getReferrerXpReward(200) > 0 && getInviteeXpReward(200) > 0);
check(
  'open-ended level formula agrees with milestones',
  getLevelProgress(xpAt200).level === 200 && getLevelProgress(xpAt201).level === 201,
  `${xpAt200} / ${xpAt201}`
);
check('reward scale remains finite beyond L200', Number.isFinite(getMissionRewardScale(200_000)));
check('reward scale soft-caps without stopping levels', getMissionRewardScale(200) > getMissionRewardScale(90));

check('prestige clamps invalid negative input', getSafePrestigeCount(-10) === 0);
check('prestige continues after the first five cycles', getSafePrestigeCount(99) === 99);
check(
  'prestige multiplier remains finite and grows after cycle five',
  Number.isFinite(getPrestigeMultiplier(99)) && getPrestigeMultiplier(99) > getPrestigeMultiplier(5)
);
check('prestige thresholds continue past L90', getPrestigeRequiredLevel(99) === 1040);
check('canonical rank remains stable', getRankForLevel(155).rankIndex === 12);
check('endless rank branch keeps growing', getRankForLevel(180).rankIndex > 12);

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
const migration015 = readFileSync('supabase/migrations/015_open_ended_progression.sql', 'utf8');
const migration016 = readFileSync('supabase/migrations/016_player_inventory_showcase.sql', 'utf8');
const migration017 = readFileSync('supabase/migrations/017_personal_inventory_gifts.sql', 'utf8');
const migration018 = readFileSync('supabase/migrations/018_personal_inventory_gift_useryou2202.sql', 'utf8');
check('integrity migration is non-destructive', !/TRUNCATE|DELETE\s+FROM\s+public\.players/i.test(migration010));
check('mission claim RPC is present', /claim_mission_atomic/.test(migration010));
check('purchase RPC is present', /commit_purchase_atomic/.test(migration011));
check('legacy passive is disabled', /RETURN\s+0;/.test(migration010));
check('Data finite cap is enforced in SQL', /9007199254740991/.test(migration012) && /CHECK/.test(migration012));
check('prestige reset RPC is present', /global_prestige_atomic/.test(migration013));
check('atomic card cap matches Tier IV', /p_item_level > 60/.test(migration014));
check(
  'open progression migration removes finite prestige guard',
  /ALTER COLUMN prestige_count TYPE bigint/.test(migration015) &&
    !/LEAST\(5|<= 5/.test(migration015) &&
    /p_expected_prestige bigint/.test(migration015)
);
check(
  'первый пончик — постоянный неприменимый приз',
  getInventoryItemDefinition(FIRST_DONUT_ITEM_KEY)?.usable === false &&
    getInventoryItemDefinition(FIRST_DONUT_ITEM_KEY)?.equipAction === null
);
check(
  'inventory migration дарит пончик без вайпа и закрывает витрину',
  /reward:first_donut/.test(migration016) &&
    /inventoryShowcase/.test(migration016) &&
    !/TRUNCATE|DELETE\s+FROM\s+public\.players/i.test(migration016)
);
check(
  'персональные подарки — только публичные неприменимые предметы',
  [GIFT_COLA_ITEM_KEY, GIFT_WHISKEY_ITEM_KEY, GIFT_SNUS_ITEM_KEY].every((key) => {
    const item = getInventoryItemDefinition(key);
    return item?.usable === false && item?.equipAction === null;
  })
);
check(
  'migration 017 назначает три подарка двум стабильным Telegram ID без вайпа',
  /296857803/.test(migration017) &&
    /495832433/.test(migration017) &&
    [GIFT_COLA_ITEM_KEY, GIFT_WHISKEY_ITEM_KEY, GIFT_SNUS_ITEM_KEY].every((key) => migration017.includes(key)) &&
    !/TRUNCATE|DELETE\s+FROM\s+public\.players/i.test(migration017)
);
check(
  'migration 018 назначает подарки useryou2202 по стабильному Telegram ID без вайпа',
  /6623819182/.test(migration018) &&
    [GIFT_COLA_ITEM_KEY, GIFT_WHISKEY_ITEM_KEY, GIFT_SNUS_ITEM_KEY].every((key) => migration018.includes(key)) &&
    !/TRUNCATE|DELETE\s+FROM\s+public\.players/i.test(migration018)
);

const eliteFrames = PROFILE_FRAMES.filter((frame) => frame.source.includes('элитный сектор'));
const newShopSkins = SKINS_CONFIG.filter((skin) =>
  ['aurora_grid', 'black_ice', 'singularity_crown', 'ui_hologram', 'ui_obsidian', 'ui_aurora', 'avatar_cyber_fox', 'avatar_wyrm', 'avatar_starborn'].includes(skin.key)
);
check(
  'элитные рамки не покупаются на старте',
  eliteFrames.length === 6 && eliteFrames.every((frame) => (frame.cryptoCost ?? 0) >= 2_500 && (frame.requiredLevel ?? 0) >= 45)
);
check(
  'новые скины имеют дорогой вход и уникальные ключи',
  newShopSkins.length === 9 &&
    new Set(newShopSkins.map((skin) => skin.key)).size === newShopSkins.length &&
    newShopSkins.every((skin) => skin.cryptoCost >= 160 && Number.isFinite(skin.clickBonusPct))
);

const deskSource = readFileSync('src/components/DeskScene.tsx', 'utf8');
check('XP UI has no final MAX state', !/: 'MAX'\}\s*XP/.test(deskSource));

console.log(`\nИтого: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error(`FAILURES: ${failures.join(', ')}`);
  process.exit(1);
}
