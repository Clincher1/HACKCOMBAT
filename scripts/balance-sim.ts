/**
 * HACKER KOMBAT — симулятор баланса прогрессии.
 *
 * Запуск одного прогона:
 *   npx esbuild scripts/balance-sim.ts --bundle --platform=node --format=cjs --outfile=/tmp/hk-sim.cjs
 *   node /tmp/hk-sim.cjs
 *
 * Подбор констант (свип по сетке):
 *   SIM_SWEEP=1 node /tmp/hk-sim.cjs
 *
 * Симулятор использует ТЕ ЖЕ конфиги, что и игра (shared/*), поэтому цифры не расходятся с реальностью.
 * Бот играет «жадно по ROI»: покупает карточку с максимальным приростом дохода на потраченный Data.
 * Это верхняя граница эффективности — живой игрок обычно медленнее.
 */
import { CARDS_CONFIG, CARD_TIERS, getMaxCardLevel } from '../shared/cards.config';
import { computeDerivedStats } from '../shared/mechanics';
import { MISSIONS_CONFIG } from '../shared/missions.config';
import type { CardConfig } from '../shared/types';

interface SimParams {
  growth: number; // Множитель цены за уровень карточки
  indexDivisor: number; // Глобальный индекс: (1 + total/divisor)^power
  indexPower: number;
  dphScale: number; // Дополнительный множитель дохода (для тонкой настройки)
  priceScale: number; // Глобальный множитель цен (растягивает всю кривую прогресса)
}

interface SimResult {
  days: Record<number, number | null>;
  finalLevel: number;
  finalDph: number;
  spent: number;
  lastPrice: number;
  purchases: number;
}

const STEP_SEC = 15 * 60;
const TOTAL_STEPS = (400 * 24 * 60 * 60) / STEP_SEC; // максимум 400 игровых дней
const CLICKS_PER_DAY = Number(process.env.SIM_CLICKS ?? 400);
const MISSIONS_PER_DAY = Number(process.env.SIM_MISSIONS ?? 14);

const DEFAULT_PARAMS: SimParams = {
  growth: 1.42,
  indexDivisor: 35,
  indexPower: 2.2,
  dphScale: 1,
  priceScale: 6,
};

// Глобальный индекс бьёт сильнее всего по дешёвому стартовому железу и почти не трогает
// дорогие эндгейм-модули — иначе топовые карточки становятся недостижимыми навсегда.
function priceIndexOf(card: CardConfig, total: number, p: SimParams): number {
  const raw = Math.pow(1 + total / p.indexDivisor, p.indexPower);
  const weight = Math.max(
    0,
    Math.min(1, 1 - Math.log10(Math.max(1, card.basePrice) / 20) / 6)
  );
  return 1 + (raw - 1) * weight;
}

function priceOf(card: CardConfig, level: number, total: number, p: SimParams): number {
  const base = card.basePrice * Math.pow(p.growth, level) * p.priceScale;
  return Math.max(1, Math.floor(base * priceIndexOf(card, total, p)));
}

function chooseBestBuy(
  cards: Record<string, number>,
  data: number,
  level: number,
  maxLevel: number,
  total: number,
  p: SimParams
): CardConfig | null {
  let best: CardConfig | null = null;
  let bestScore = -Infinity;
  for (const card of CARDS_CONFIG) {
    const lvl = cards[card.key] ?? 0;
    if (lvl >= maxLevel) continue;
    if (card.minLevel && level < card.minLevel) continue;
    const price = priceOf(card, lvl, total, p);
    if (price > data) continue;
    const gain =
      card.dataPerHourPerLevel * p.dphScale + (card.clickBonusPerLevel ?? 0) * (CLICKS_PER_DAY / 24);
    const score = gain / price;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

function simulate(params: SimParams, verbose = false): SimResult {
  let data = 0;
  let chips = 0;
  let tier = 1;
  const cards: Record<string, number> = {};
  const days: Record<number, number | null> = {
    5: null,
    10: null,
    15: null,
    20: null,
    30: null,
    40: null,
    50: null,
  };
  const clicksPerStep = CLICKS_PER_DAY / (86_400 / STEP_SEC);
  const missionsPerStep = MISSIONS_PER_DAY / (86_400 / STEP_SEC);
  let bought = 0;
  let spent = 0;
  let lastPrice = 0;

  const derive = (t = tier) =>
    computeDerivedStats({
      cards,
      team: [],
      rep: 0,
      heat: 0,
      data,
      prestigeCount: 0,
      equippedSkin: 'default',
      cardTier: t,
    });

  let derived = derive();

  for (let step = 0; step < TOTAL_STEPS; step++) {
    const day = (step * STEP_SEC) / 86_400;

    data += (derived.dataPerHour / 3600) * STEP_SEC;
    data += clicksPerStep * derived.clickPower;

    const available = MISSIONS_CONFIG.filter((m) => (m.minLevel ?? 1) <= derived.level);
    const avgReward =
      available.reduce((acc, m) => acc + m.baseDataReward, 0) / Math.max(1, available.length);
    data += missionsPerStep * avgReward * (1 + (derived.level - 1) * 0.06);
    chips += missionsPerStep;

    for (const t of CARD_TIERS) {
      if (t.tier <= tier) continue;
      if (derived.level >= t.requiredPlayerLevel && chips >= t.chipCost && data >= t.dataCost) {
        chips -= t.chipCost;
        data -= t.dataCost;
        tier = t.tier;
      }
    }

    for (let guard = 0; guard < 5000; guard++) {
      const maxLevel = getMaxCardLevel(tier);
      const totalLevels = Object.values(cards).reduce((a, b) => a + b, 0);
      const candidate = chooseBestBuy(cards, data, derived.level, maxLevel, totalLevels, params);
      if (!candidate) break;
      const lvl = cards[candidate.key] ?? 0;
      const buyPrice = priceOf(candidate, lvl, totalLevels, params);
      data -= buyPrice;
      spent += buyPrice;
      lastPrice = buyPrice;
      cards[candidate.key] = lvl + 1;
      bought += 1;
      derived = derive();
    }

    derived = derive();

    for (const target of Object.keys(days).map(Number)) {
      if (days[target] === null && derived.level >= target) {
        days[target] = Math.round(day * 10) / 10;
      }
    }

    if (verbose && step % 192 === 0) {
      const totalLevels = Object.values(cards).reduce((a, b) => a + b, 0);
      console.log(
        `  day ${day.toFixed(1)} | lvl ${derived.level} | cards ${totalLevels} | DPH ${Math.round(
          derived.dataPerHour
        ).toLocaleString('en-US')} | data ${Math.round(data).toLocaleString('en-US')} | chips ${Math.round(
          chips
        )} | tier ${tier}`
      );
    }

    if (days[50] !== null) break;
  }

  return {
    days,
    finalLevel: derived.level,
    finalDph: derived.dataPerHour,
    spent,
    lastPrice,
    purchases: bought,
  };
}

function fmt(v: number | null): string {
  return v === null ? '—' : `${v}`;
}

if (process.env.SIM_SWEEP === '1') {
  const rows: string[] = [];
  for (const growth of (process.env.SWEEP_G ?? '1.42').split(',').map(Number)) {
    for (const indexDivisor of (process.env.SWEEP_D ?? '12,16,20,26').split(',').map(Number)) {
      for (const indexPower of (process.env.SWEEP_P ?? '2.0,2.2,2.4').split(',').map(Number)) {
        const r = simulate({
          growth,
          indexDivisor,
          indexPower,
          dphScale: 1,
          priceScale: Number(process.env.SWEEP_K ?? 1),
        });
        rows.push(
          `g=${growth.toFixed(2)} D=${String(indexDivisor).padStart(2)} P=${indexPower.toFixed(1)} K=${process.env.SWEEP_K ?? 1} | ` +
            `L10=${fmt(r.days[10]).padStart(6)} L20=${fmt(r.days[20]).padStart(6)} ` +
            `L30=${fmt(r.days[30]).padStart(6)} L50=${fmt(r.days[50]).padStart(6)} | DPH=${Math.round(
              r.finalDph
            ).toLocaleString('en-US')}`
        );
      }
    }
  }
  console.log(rows.join('\n'));
} else {
  const params = {
    ...DEFAULT_PARAMS,
    growth: Number(process.env.SIM_G ?? DEFAULT_PARAMS.growth),
    indexDivisor: Number(process.env.SIM_D ?? DEFAULT_PARAMS.indexDivisor),
    indexPower: Number(process.env.SIM_P ?? DEFAULT_PARAMS.indexPower),
    dphScale: Number(process.env.SIM_DPH ?? 1),
    priceScale: Number(process.env.SIM_K ?? DEFAULT_PARAMS.priceScale),
  };
  const result = simulate(params, process.env.SIM_DEBUG === '1');
  console.log('=== HACKER KOMBAT — balance simulation ===');
  console.log(
    `growth=${params.growth} indexDivisor=${params.indexDivisor} indexPower=${params.indexPower} dphScale=${params.dphScale}`
  );
  console.log(`Clicks/day: ${CLICKS_PER_DAY} | Missions/day: ${MISSIONS_PER_DAY}`);
  for (const [lvl, day] of Object.entries(result.days)) {
    console.log(`  lvl ${lvl.padStart(2)}: ${day === null ? '—' : `${day} дн.`}`);
  }
  console.log(
    `Final level ${result.finalLevel} | DPH ${Math.round(result.finalDph).toLocaleString('en-US')} | spent ${Math.round(
      result.spent
    ).toLocaleString('en-US')} | purchases ${result.purchases} | last ${Math.round(
      result.lastPrice
    ).toLocaleString('en-US')}`
  );
}
