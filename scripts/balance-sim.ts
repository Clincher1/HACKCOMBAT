/**
 * HACKER KOMBAT — симулятор баланса v3 (XP-прогрессия + шанс успеха взлома).
 *
 * Запуск:
 *   npx esbuild scripts/balance-sim.ts --bundle --platform=node --format=cjs --outfile=/tmp/hk-sim.cjs
 *   node /tmp/hk-sim.cjs
 *
 * Бот играет «идеально»: держит все слоты занятыми лучшей по опыту целью,
 * мгновенно забирает награды и покупает карточки по максимальному приросту
 * дохода на потраченный Data. Это ВЕРХНЯЯ граница темпа: живой игрок медленнее.
 * Цифры берутся из тех же конфигов, что и в игре (shared/*).
 */
import {
  CARD_LEVEL_INCOME_GROWTH,
  CARD_TIERS,
  getCardPrice,
  getMaxCardLevel,
  MAX_CARD_LEVEL,
} from '../shared/cards.config';
import { getBaseUpgradePrice, BASE_UPGRADES_CONFIG } from '../shared/base.config';
import { getHackOdds, getMissionXpAward, rollHackOutcome } from '../shared/hack.config';
import { computeDerivedStats } from '../shared/mechanics';
import { MISSIONS_CONFIG } from '../shared/missions.config';
import type { MissionConfig } from '../shared/types';

const STEP_SEC = 30;
const SIM_DAYS = Number(process.env.SIM_DAYS ?? 60);
const TOTAL_STEPS = Math.floor((SIM_DAYS * 86_400) / STEP_SEC);

interface Slot {
  mission: MissionConfig;
  endAt: number;
  chance: number;
  xpReward: number;
  dataReward: number;
}

const state = {
  xp: 0,
  data: 250,
  chips: 0,
  rep: 0,
  heat: 0,
  cards: {} as Record<string, number>,
  base: {} as Record<string, number>,
  tier: 1,
};

let nowSec = 0;

function derive() {
  return computeDerivedStats({
    cards: state.cards,
    team: [],
    rep: state.rep,
    heat: state.heat,
    data: state.data,
    xp: state.xp,
    prestigeCount: 0,
    equippedSkin: 'default',
    baseUpgrades: state.base,
    cardTier: state.tier,
  });
}

/** Математическое ожидание исхода: шанс успеха / частичного / провала. */
function outcomeEv(chance: number): { data: number; xp: number; success: number } {
  const partial = (1 - chance) * 0.45;
  const fail = (1 - chance) * 0.55;
  return {
    data: chance * 1 + partial * 0.45,
    xp: chance * 1 + partial * 0.55 + fail * 0.15,
    success: chance,
  };
}

const milestones: Record<number, number | null> = {
  2: null, 5: null, 10: null, 12: null, 15: null, 20: null, 26: null, 30: null, 40: null,
};

const cardMilestones: Record<number, number | null> = { 25: null, 50: null, 75: null, 100: null, 150: null };

const slots: Slot[] = [];
const derivedFirst = derive();

function startBestMission() {
  const d = derive();
  const available = MISSIONS_CONFIG.filter((m) => (m.minLevel ?? 1) <= d.level);
  if (available.length === 0) return;

  let best: MissionConfig | null = null;
  let bestRate = -1;
  for (const m of available) {
    const odds = getHackOdds({
      mission: m,
      level: d.level,
      hackPower: d.hackPower,
      heat: state.heat,
      tierSuccesses: 0,
      tierFails: 0,
    });
    const xp = getMissionXpAward(m.xpReward ?? 10, m.tier ?? 1, d.level);
    const ev = outcomeEv(odds.chance);
    const rate = (xp * ev.xp) / Math.max(1, m.durationSec);
    if (rate > bestRate) {
      bestRate = rate;
      best = m;
    }
  }
  if (!best) return;

  const odds = getHackOdds({
    mission: best,
    level: d.level,
    hackPower: d.hackPower,
    heat: state.heat,
    tierSuccesses: 0,
    tierFails: 0,
  });
  slots.push({
    mission: best,
    endAt: nowSec + best.durationSec,
    chance: odds.chance,
    xpReward: getMissionXpAward(best.xpReward ?? 10, best.tier ?? 1, d.level),
    dataReward: Math.round(best.baseDataReward),
  });
}

function claimReady() {
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i];
    if (slot.endAt > nowSec) continue;
    const outcome = rollHackOutcome(slot.chance);
    const mult = outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0.15;
    state.xp += Math.max(1, Math.round(slot.xpReward * (outcome === 'fail' ? 0.15 : mult)));
    state.data += Math.round(slot.dataReward * (outcome === 'success' ? 1 : outcome === 'partial' ? 0.45 : 0));
    if (outcome === 'success') {
      state.chips += 1;
      state.rep += Math.max(0, slot.mission.repDelta);
    }
    state.heat = Math.max(0, state.heat + slot.mission.heatDelta);
    slots.splice(i, 1);
  }
}

function buyCards() {
  for (let guard = 0; guard < 200; guard++) {
    const d = derive();
    const maxLevel = getMaxCardLevel(state.tier);
    const total = Object.values(state.cards).reduce((a, b) => a + b, 0);
    let bestKey: string | null = null;
    let bestScore = -Infinity;
    let bestPrice = 0;

    for (const card of MISSIONS_CARD_CACHE) {
      const lvl = state.cards[card.key] ?? 0;
      if (lvl >= maxLevel || lvl >= MAX_CARD_LEVEL) continue;
      if (card.minLevel && d.level < card.minLevel) continue;
      const price = getCardPrice(card, lvl, total, d.cardPriceDiscountPct);
      if (price > state.data) continue;
      const gain = card.dataPerHourPerLevel * Math.pow(CARD_LEVEL_INCOME_GROWTH, lvl);
      const score = gain / price;
      if (score > bestScore) {
        bestScore = score;
        bestKey = card.key;
        bestPrice = price;
      }
    }
    if (!bestKey) return;
    state.data -= bestPrice;
    state.cards[bestKey] = (state.cards[bestKey] ?? 0) + 1;
  }
}

function buyTierAndBase() {
  const d = derive();
  if (state.tier < CARD_TIERS.length) {
    const tierCfg = CARD_TIERS[state.tier];
    if (
      d.level >= tierCfg.requiredPlayerLevel &&
      state.chips >= tierCfg.chipCost &&
      state.data >= tierCfg.dataCost
    ) {
      state.chips -= tierCfg.chipCost;
      state.data -= tierCfg.dataCost;
      state.tier += 1;
    }
  }

  for (const cfg of BASE_UPGRADES_CONFIG) {
    const lvl = state.base[cfg.key] ?? 0;
    if (lvl >= cfg.maxLevel) continue;
    if ((cfg.requiredLevel ?? 1) > d.level) continue;
    const price = getBaseUpgradePrice(cfg, lvl);
    if (state.data < price) continue;
    state.data -= price;
    state.base[cfg.key] = lvl + 1;
  }
}

// Кэшируем список карточек один раз (импорт внутри функции не нужен)
import { CARDS_CONFIG } from '../shared/cards.config';
const MISSIONS_CARD_CACHE = CARDS_CONFIG;

const fmtDay = (sec: number) => (sec / 86_400).toFixed(2);

for (let step = 0; step < TOTAL_STEPS; step++) {
  nowSec += STEP_SEC;
  claimReady();

  const d = derive();
  while (slots.length < d.missionSlots && slots.length < 3) startBestMission();

  buyCards();
  buyTierAndBase();

  const dd = derive();
  for (const target of Object.keys(milestones).map(Number)) {
    if (milestones[target] === null && dd.level >= target) milestones[target] = nowSec;
  }
  const totalCardLevels = Object.values(state.cards).reduce((a, b) => a + b, 0);
  for (const target of Object.keys(cardMilestones).map(Number)) {
    if (cardMilestones[target] === null && totalCardLevels >= target) cardMilestones[target] = nowSec;
  }

  if (milestones[40] !== null) break;
}

const dEnd = derive();
console.log('=== HACKER KOMBAT — balance simulation v3 ===');
console.log(`Модель: бот держит слоты занятыми, берёт лучшую по XP/сек цель, покупает по ROI.`);
console.log(`Стартовые условия: 1 уровень, ${derivedFirst.xpToNext} XP до 2 уровня.\n`);
console.log('Уровень игрока (чистые часы игры):');
for (const [lvl, sec] of Object.entries(milestones)) {
  console.log(`  Ур. ${lvl.padStart(2)}: ${sec === null ? '—' : `${fmtDay(sec)} дн. (${(sec / 3600).toFixed(1)} ч)`}`);
}
console.log('\nСуммарные уровни карточек:');
for (const [lvl, sec] of Object.entries(cardMilestones)) {
  console.log(`  ${lvl.padStart(3)} lvl: ${sec === null ? '—' : `${fmtDay(sec)} дн.`}`);
}
console.log(
  `\nИтог: ур. ${dEnd.level}, карточек ${Object.values(state.cards).reduce((a, b) => a + b, 0)}, ` +
    `Data/час ${Math.round(dEnd.dataPerHour).toLocaleString('ru-RU')}, ` +
    `Tier ${state.tier}, сила железа ${Math.round(dEnd.hackPower)}`
);
