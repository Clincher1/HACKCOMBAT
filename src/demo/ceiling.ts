// ============================================================================
// ПОТОЛОК ПРОФИЛЯ (демо, v4.3)
// ----------------------------------------------------------------------------
// «Что будет, если прокачать вообще всё»: 60 уровней каждого модуля, вся команда,
// вся База на максимуме и 50-й уровень игрока. Цифры считает тот же
// computeDerivedStats, что и сервер, поэтому демо не обещает несуществующих бонусов.
// ============================================================================

import { BASE_UPGRADES_CONFIG } from '../../shared/base.config';
import { CARDS_CONFIG, CARD_TIERS } from '../../shared/cards.config';
import { getTotalXpForLevel } from '../../shared/hack.config';
import { computeDerivedStats, getRankForLevel } from '../../shared/mechanics';
import { TEAM_CONFIG } from '../../shared/team.config';
import { formatCompact } from '../lib/format';

export const MAX_CEILING_LEVEL = 50;

const maxTier = CARD_TIERS[CARD_TIERS.length - 1];

const cards = Object.fromEntries(CARDS_CONFIG.map((card) => [card.key, maxTier.maxLevel]));
const team = TEAM_CONFIG.map((npc) => npc.key);
const baseUpgrades = Object.fromEntries(
  BASE_UPGRADES_CONFIG.map((upgrade) => [upgrade.key, upgrade.maxLevel])
);

const ceiling = computeDerivedStats({
  cards,
  team,
  baseUpgrades,
  rep: 0,
  heat: 0,
  data: 0,
  xp: getTotalXpForLevel(MAX_CEILING_LEVEL),
  prestigeCount: 0,
  equippedSkin: 'default',
  cardTier: maxTier.tier,
  nowMs: Date.now(),
});

export const DEMO_CEILING = {
  level: ceiling.level,
  rank: getRankForLevel(ceiling.level).rankTitle,
  dataPerHour: formatCompact(ceiling.dataPerHour),
  clickPower: formatCompact(ceiling.clickPower),
  hackPower: formatCompact(ceiling.hackPower),
  maxEnergy: formatCompact(ceiling.maxEnergy),
  cardLevels: ceiling.totalCardLevels,
  moduleTier: maxTier.title,
};
