import { CARDS_CONFIG } from './cards.config';
import { SKINS_CONFIG } from './skins.config';
import { TEAM_CONFIG } from './team.config';
import type { AlignmentBranch, DerivedStats } from './types';

export const BASE_MAX_ENERGY = 1000;
export const MAX_ENERGY_CAP = 5000;
export const ENERGY_REGEN_SECONDS = 3; // 1 Energy / 3 сек (раздел 5.1 ТЗ)
export const HEAT_PENALTY_THRESHOLD = 100; // Heat > 100 -> штраф (раздел 2 и 5.4 ТЗ)
export const HEAT_RESET_AFTER_PENALTY = 50;
export const HEAT_PENALTY_DATA_LOSS_PCT = 0.1; // Потеря 10% Data
export const HEAT_LOCKDOWN_SECONDS = 60; // Блок кликов на 60 сек
export const PRESTIGE_REQUIRED_LEVEL = 50; // Global Hack на 50 уровне (раздел 5.5 ТЗ)

export const RANK_TITLES: { minLevel: number; minData: number; title: string }[] = [
  { minLevel: 1, minData: 0, title: 'Script Kiddie' },
  { minLevel: 5, minData: 1500, title: 'Hacker' },
  { minLevel: 15, minData: 25000, title: 'Cybercriminal' },
  { minLevel: 30, minData: 150000, title: 'Darknet Legend' },
];

export function computeAlignment(rep: number, heat: number): AlignmentBranch {
  // Раздел 5.4 ТЗ:
  // Если Rep > Heat * 2 -> White Hat (+20% Data/hour, легальные/Bad миссии x2)
  // Если Heat > Rep * 2 -> Black Hat (+50% Data за клик, но Heat растёт быстрее)
  if (rep >= 10 && rep > heat * 2) {
    return 'white_hat';
  }
  if (heat >= 10 && heat > rep * 2) {
    return 'black_hat';
  }
  return 'neutral';
}

export function computeDeskStage(level: number): 1 | 5 | 10 | 15 | 20 | 25 | 30 {
  if (level >= 30) return 30;
  if (level >= 25) return 25;
  if (level >= 20) return 20;
  if (level >= 15) return 15;
  if (level >= 10) return 10;
  if (level >= 5) return 5;
  return 1;
}

export function getDeskStageInfo(stage: 1 | 5 | 10 | 15 | 20 | 25 | 30): {
  title: string;
  subtitle: string;
  sceneUrl: string;
  nextLevel: number | null;
} {
  switch (stage) {
    case 1:
      return {
        title: 'Ур. 1 — Подпольный Старт',
        subtitle: 'Один монитор, верная механика и ночной кофе',
        sceneUrl: '/assets/scenes/stage-01.webp',
        nextLevel: 5,
      };
    case 5:
      return {
        title: 'Ур. 5 — Двойной Неон',
        subtitle: 'Второй монитор + RGB неоновая подсветка стола',
        sceneUrl: '/assets/scenes/stage-05.webp',
        nextLevel: 10,
      };
    case 10:
      return {
        title: 'Ур. 10 — Локальный Кластер',
        subtitle: 'Собственная серверная стойка рядом со столом',
        sceneUrl: '/assets/scenes/stage-10.webp',
        nextLevel: 15,
      };
    case 15:
      return {
        title: 'Ур. 15 — Воздушный Перехват',
        subtitle: 'Дрон-разведчик с активным оптическим сканером',
        sceneUrl: '/assets/scenes/stage-15.webp',
        nextLevel: 20,
      };
    case 20:
      return {
        title: 'Ур. 20 — Кибер-Станция',
        subtitle: 'Три монитора + кресло геймера + 3 слота миссий',
        sceneUrl: '/assets/scenes/stage-20.webp',
        nextLevel: 25,
      };
    case 25:
      return {
        title: 'Ур. 25 — Серверный Бункер',
        subtitle: 'Полный переезд в подземный дата-центр',
        sceneUrl: '/assets/scenes/stage-25.webp',
        nextLevel: 30,
      };
    case 30:
      return {
        title: 'Ур. 30+ — Ядро Матрицы',
        subtitle: 'Летающие голограммы, дрон и цифровой дождь',
        sceneUrl: '/assets/scenes/stage-30.webp',
        nextLevel: 50,
      };
  }
}

export function computeDerivedStats(params: {
  cards: Record<string, number>;
  team: string[];
  rep: number;
  heat: number;
  data: number;
  prestigeCount: number;
  equippedSkin: string;
}): DerivedStats {
  const { cards, team, rep, heat, data, prestigeCount, equippedSkin } = params;

  let totalCardLevels = 0;
  let baseDataPerHour = 0;
  let cardClickBonus = 0;
  let extraMaxEnergy = 0;

  for (const card of CARDS_CONFIG) {
    const lvl = cards[card.key] ?? 0;
    if (lvl <= 0) continue;
    totalCardLevels += lvl;
    baseDataPerHour += card.dataPerHourPerLevel * lvl;
    cardClickBonus += (card.clickBonusPerLevel ?? 0) * lvl;
    extraMaxEnergy += (card.energyMaxPerLevel ?? 0) * lvl;
  }

  // DEFAULT: 1 + floor(sumCardLevels / 5) — старт с 1 уровня, каждые 5 апгрейдов повышают уровень игрока
  const level = 1 + Math.floor(totalCardLevels / 5);
  const nextLevelProgress = totalCardLevels % 5;

  let teamPassiveBonusPct = 0;
  let teamClickBonusPct = 0;
  let autoClickPerSec = 0;
  let heatReductionPct = 0;
  let unlockedGreyMissions = false;

  for (const npcKey of team) {
    const npc = TEAM_CONFIG.find((n) => n.key === npcKey);
    if (!npc) continue;
    teamPassiveBonusPct += npc.passiveBonusPct;
    teamClickBonusPct += npc.clickBonusPct;
    autoClickPerSec += npc.autoClickPerSec;
    heatReductionPct += npc.heatReductionPct;
    if (npc.unlocksGreyMissions) unlockedGreyMissions = true;
  }

  const alignment = computeAlignment(rep, heat);
  const whiteHatPassiveBonus = alignment === 'white_hat' ? 0.2 : 0; // +20% Data/hour (п. 5.4)
  const blackHatClickBonus = alignment === 'black_hat' ? 0.5 : 0; // +50% к клику (п. 5.4)

  const skin = SKINS_CONFIG.find((s) => s.key === equippedSkin) ?? SKINS_CONFIG[0];

  // Global Hack Престиж: каждый престиж даёт +100% к доходу (1 -> x2 -> x3 ... или 2^n; п. 3: ×2, п. 5.5: +100%)
  // DEFAULT: 2^prestigeCount (1-й престиж = ровно ×2 = +100%, 2-й = ×4)
  const prestigeMultiplier = Math.pow(2, prestigeCount);

  const clickMultiplier =
    (1 + cardClickBonus) *
    (1 + teamClickBonusPct + blackHatClickBonus + skin.clickBonusPct) *
    prestigeMultiplier;

  const clickPower = Math.max(1, Math.round(clickMultiplier * 10) / 10);

  // Botmaster (автоклик 1/сек) также учитывается в серверном часовом доходе, когда игрок оффлайн
  const botmasterHourlyContribution = autoClickPerSec * clickPower * 3600;
  const dataPerHour = Math.round(
    (baseDataPerHour * (1 + teamPassiveBonusPct + whiteHatPassiveBonus) * prestigeMultiplier +
      botmasterHourlyContribution)
  );

  const maxEnergy = Math.min(MAX_ENERGY_CAP, BASE_MAX_ENERGY + extraMaxEnergy);
  const energyRegenPerSec = 1 / ENERGY_REGEN_SECONDS;

  // В Black Hat ветке Heat растёт быстрее (+30% DEFAULT), а Fence снижает прирост на 20%
  const baseHeatMult = alignment === 'black_hat' ? 1.3 : 1.0;
  const heatMultiplier = Math.max(0.2, baseHeatMult * (1 - heatReductionPct));

  let rankIndex = 1;
  let rankTitle = RANK_TITLES[0].title;
  RANK_TITLES.forEach((r, idx) => {
    if (level >= r.minLevel || data >= r.minData) {
      rankIndex = idx + 1;
      rankTitle = r.title;
    }
  });

  const missionSlots = level >= 20 ? 3 : 1; // Пункт 4.3: 1 слот на старте, 3 слота на 20 уровне

  return {
    level,
    totalCardLevels,
    nextLevelProgress,
    rankIndex,
    rankTitle,
    alignment,
    maxEnergy,
    energyRegenPerSec,
    clickPower,
    dataPerHour,
    autoClickPerSec,
    heatMultiplier,
    missionSlots,
    unlockedGreyMissions,
    deskStage: computeDeskStage(level),
    prestigeMultiplier,
  };
}

export function syncEnergy(
  storedEnergy: number,
  energyUpdatedIso: string,
  maxEnergy: number,
  nowMs: number = Date.now()
): { energy: number; updatedAtIso: string } {
  const lastMs = new Date(energyUpdatedIso).getTime();
  if (Number.isNaN(lastMs) || nowMs <= lastMs) {
    return {
      energy: Math.min(maxEnergy, Math.max(0, storedEnergy)),
      updatedAtIso: new Date(nowMs).toISOString(),
    };
  }
  const elapsedSec = (nowMs - lastMs) / 1000;
  const gained = Math.floor(elapsedSec / ENERGY_REGEN_SECONDS);
  if (gained <= 0) {
    return {
      energy: Math.min(maxEnergy, Math.max(0, storedEnergy)),
      updatedAtIso: energyUpdatedIso,
    };
  }
  const nextEnergy = Math.min(maxEnergy, Math.max(0, storedEnergy + gained));
  const remainderMs = (nowMs - lastMs) % (ENERGY_REGEN_SECONDS * 1000);
  const newUpdatedMs = nextEnergy >= maxEnergy ? nowMs : nowMs - remainderMs;
  return {
    energy: nextEnergy,
    updatedAtIso: new Date(newUpdatedMs).toISOString(),
  };
}
