// ============================================================================
// ДЕМО-ВИТРИНА: каталог всех открытий игры (v4.3)
// ----------------------------------------------------------------------------
// Единственный источник — shared/*.config.ts. Здесь нет ни одного «придуманного»
// предмета: если контент добавили в конфиг, он автоматически появляется в демо,
// а если удалили — исчезает. Поэтому витрину нельзя «рассинхронизировать» с игрой.
//
// Слой полностью клиентский (никаких запросов к API): демо открывается даже без
// Telegram-сессии и не трогает прогресс живого аккаунта.
// ============================================================================

import { ACHIEVEMENTS_CONFIG } from '../../shared/achievements.config';
import { BACKDROPS_CONFIG } from '../../shared/backdrops.config';
import { BASE_UPGRADES_CONFIG } from '../../shared/base.config';
import { CARDS_CONFIG, CARD_TIERS, CARD_CATEGORIES } from '../../shared/cards.config';
import { FIRST_CHAPTER_STEPS } from '../../shared/chapter.config';
import { DAILY_TASK_POOLS } from '../../shared/dailyTasks.config';
import { DAILY_INCIDENTS } from '../../shared/incidents.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { PETS_CONFIG } from '../../shared/pets.config';
import { PROFILE_FRAMES } from '../../shared/profileFrames.config';
import { ACTIVE_SEASON_EVENT } from '../../shared/seasonalEvent.config';
import { SKINS_CONFIG } from '../../shared/skins.config';
import { TEAM_CONFIG } from '../../shared/team.config';
import { BASE_THEMES } from '../../shared/themes.config';
import {
  computeDeskStage,
  getDeskStageInfo,
  RANK_TITLES,
} from '../../shared/mechanics';
import { formatCompact } from '../lib/format';

/** Одно открытие в каталоге. */
export interface DemoItem {
  key: string;
  title: string;
  subtitle?: string;
  glyph?: string;
  image?: string;
  /** Минимальный уровень игрока (1 — доступно сразу). */
  level: number;
  /** Цена / награда одной строкой. */
  cost?: string;
  /** Короткий бейдж: тир, ред-кость, категория. */
  tag?: string;
  accent?: string;
  /** Секретное достижение: в демо тоже скрыто, пока не включён «режим спойлера». */
  secret?: boolean;
}

export interface DemoSection {
  id: string;
  title: string;
  subtitle: string;
  glyph: string;
  accent: string;
  items: DemoItem[];
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;

// ---------------------------------------------------------------- рабочий стол

const STAGE_LEVELS = [1, 5, 10, 15, 20, 25, 30] as const;

const deskSection: DemoSection = {
  id: 'desk',
  title: 'Рабочий стол',
  subtitle: 'Сцена меняется сама с уровнем + 6 локаций, куда можно выйти',
  glyph: '🖥️',
  accent: '#2ee6d6',
  items: [
    ...STAGE_LEVELS.map((stage) => {
      const info = getDeskStageInfo(stage);
      return {
        key: `stage-${stage}`,
        title: info.title,
        subtitle: info.subtitle,
        image: info.sceneUrl,
        level: stage,
        tag: 'сцена',
        accent: '#2ee6d6',
      } satisfies DemoItem;
    }),
    ...BACKDROPS_CONFIG.map(
      (bd): DemoItem => ({
        key: `backdrop-${bd.key}`,
        title: bd.name,
        subtitle: bd.tagline,
        image: bd.url,
        glyph: bd.glyph,
        level: bd.requiredLevel,
        cost: bd.device === 'phone' ? 'с телефона' : 'с ноутбука',
        tag: `${bd.place} · ${bd.weatherLabel}`,
        accent: bd.accent,
      })
    ),
    ...BASE_THEMES.map(
      (theme): DemoItem => ({
        key: `theme-${theme.key}`,
        title: theme.name,
        subtitle: theme.tagline,
        glyph: theme.glyph,
        level: 1,
        cost: 'бесплатно',
        tag: 'тема интерфейса',
        accent: theme.palette.cyan,
      })
    ),
  ],
};

// ---------------------------------------------------------------- апгрейды

const cardSection: DemoSection = {
  id: 'upgrades',
  title: 'Апгрейды',
  subtitle: `Тиры открывают потолок уровня модулей, карточки качаются до ${CARD_TIERS[CARD_TIERS.length - 1].maxLevel}`,
  glyph: '🛠️',
  accent: '#ffb45c',
  items: [
    ...CARD_TIERS.map(
      (tier): DemoItem => ({
        key: `tier-${tier.tier}`,
        title: tier.title,
        subtitle: tier.description,
        glyph: '🎚️',
        level: tier.requiredPlayerLevel,
        cost:
          tier.chipCost > 0
            ? `${tier.chipCost} чипов + ${formatCompact(tier.dataCost)} Data`
            : 'бесплатно',
        tag: `потолок ${tier.maxLevel} ур.`,
        accent: '#ffb45c',
      })
    ),
    ...CARD_CATEGORIES.flatMap((category) =>
      CARDS_CONFIG.filter((card) => card.category === category.id).map(
        (card): DemoItem => ({
          key: `card-${card.key}`,
          title: card.name,
          subtitle: card.description,
          glyph: card.iconGlyph,
          level: card.minLevel ?? 1,
          cost: `${formatCompact(card.basePrice)} Data · ур. 1`,
          tag: category.label,
          accent: category.accentColor,
        })
      )
    ),
  ],
};

// ---------------------------------------------------------------- контракты

const missionSection: DemoSection = {
  id: 'contracts',
  title: 'Контракты',
  subtitle: `${MISSIONS_CONFIG.length} вымышленных целей в 6 тирах сложности`,
  glyph: '🎯',
  accent: '#7dff00',
  items: MISSIONS_CONFIG.map((mission): DemoItem => {
    const targetLabel: Record<string, string> = {
      bad: 'злая цель',
      good: 'белая цель',
      neutral: 'нейтральная',
      grey: 'серая',
    };
    return {
      key: `mission-${mission.key}`,
      title: mission.targetName,
      subtitle: mission.description,
      glyph: '🛰️',
      level: mission.minLevel ?? 1,
      cost: `${formatCompact(mission.baseDataReward)} Data · ${mission.xpReward} XP`,
      tag: `T${mission.tier} · ${mission.durationSec} с · ${targetLabel[mission.targetType] ?? mission.targetType}`,
      accent: mission.targetType === 'grey' ? '#a78bfa' : '#7dff00',
    };
  }),
};

// ---------------------------------------------------------------- команда

const teamSection: DemoSection = {
  id: 'team',
  title: 'Синдикат',
  subtitle: 'Специалисты и питомцы: дорогие, но навсегда меняют темп игры',
  glyph: '🕶️',
  accent: '#ff6b6b',
  items: [
    ...TEAM_CONFIG.map(
      (npc): DemoItem => ({
        key: `npc-${npc.key}`,
        title: npc.callsign,
        subtitle: `${npc.roleTitle} · ${npc.effectLabel}`,
        glyph: '🧑‍💻',
        image: npc.avatarUrl,
        level: npc.requiredLevel,
        cost: `${formatCompact(npc.costAmount)} ${npc.costCurrency === 'data' ? 'Data' : 'Rep'}`,
        tag: `${npc.requiredMissions} контрактов · +${npc.hackPower} силы`,
        accent: '#ff6b6b',
      })
    ),
    ...PETS_CONFIG.map(
      (pet): DemoItem => ({
        key: `pet-${pet.key}`,
        title: pet.name,
        subtitle: `${pet.description} ${pet.buffLabel}`,
        glyph: pet.emoji,
        level: pet.requiredLevel,
        cost: `${formatCompact(pet.costAmount)} ${pet.costCurrency === 'crypto' ? 'Crypto' : pet.costCurrency === 'rep' ? 'Rep' : 'Data'}`,
        tag: `питомец · корм ${formatCompact(pet.feedBaseCost)} Data`,
        accent: '#facc15',
      })
    ),
  ],
};

// ---------------------------------------------------------------- база

const baseSection: DemoSection = {
  id: 'base',
  title: 'База',
  subtitle: '10 пассивных улучшений, которые не сбрасываются Престижем',
  glyph: '🏢',
  accent: '#60a5fa',
  items: BASE_UPGRADES_CONFIG.map(
    (upgrade): DemoItem => ({
      key: `base-${upgrade.key}`,
      title: `${upgrade.icon} ${upgrade.name}`,
      subtitle: `${upgrade.description} ${upgrade.effectLabel}`,
      glyph: upgrade.icon,
      level: upgrade.requiredLevel ?? 1,
      cost: `от ${formatCompact(upgrade.basePrice)} Data · ${upgrade.baseChipCost} чип`,
      tag: `макс. ${upgrade.maxLevel} ур.`,
      accent: '#60a5fa',
    })
  ),
};

// ---------------------------------------------------------------- косметика

const skinSection: DemoSection = {
  id: 'skins',
  title: 'Скины',
  subtitle: `${SKINS_CONFIG.length} косметики в трёх слотах: стол, интерфейс, аватар`,
  glyph: '🎨',
  accent: '#c084fc',
  items: SKINS_CONFIG.map((skin): DemoItem => {
    const categoryLabel: Record<string, string> = {
      desk: 'стол',
      ui: 'интерфейс',
      avatar: 'аватар',
    };
    const costPart = skin.cryptoCost > 0 ? `${skin.cryptoCost} Crypto` : 'бесплатно';
    const bonusPart = skin.clickBonusPct > 0 ? ` · ${pct(skin.clickBonusPct)} к тапу` : '';
    return {
      key: `skin-${skin.key}`,
      title: skin.name,
      subtitle: skin.description,
      glyph: skin.category === 'avatar' ? skin.avatarGlyph || '🙂' : '◈',
      level: skin.prestigeRequired ? 50 : skin.requiredLevel ?? 1,
      cost: `${costPart}${bonusPart}`,
      tag: `${categoryLabel[skin.category] ?? skin.category}${skin.prestigeRequired ? ' · после Престижа' : ''}`,
      accent: skin.primaryHex,
    };
  }),
};

const frameSection: DemoSection = {
  id: 'frames',
  title: 'Рамки профиля',
  subtitle: `${PROFILE_FRAMES.length} рамок, включая награды событий`,
  glyph: '🖼️',
  accent: '#f472b6',
  items: PROFILE_FRAMES.map(
    (frame): DemoItem => ({
      key: `frame-${frame.key}`,
      title: frame.name,
      subtitle: frame.description,
      glyph: '❖',
      level: frame.requiredLevel ?? 1,
      cost: frame.cryptoCost ? `${frame.cryptoCost} Crypto` : 'награда',
      tag: frame.source,
      accent: frame.accent,
    })
  ),
};

// ---------------------------------------------------------------- достижения

const RARITY_LABEL: Record<string, string> = {
  common: 'обычное',
  rare: 'редкое',
  epic: 'эпическое',
  legendary: 'легендарное',
  secret: 'секрет',
};

const achievementSection: DemoSection = {
  id: 'achievements',
  title: 'Достижения',
  subtitle: `${ACHIEVEMENTS_CONFIG.length} ачивок, из них ${ACHIEVEMENTS_CONFIG.filter((a) => a.secret).length} секретных`,
  glyph: '🏆',
  accent: '#facc15',
  items: ACHIEVEMENTS_CONFIG.map(
    (achievement): DemoItem => ({
      key: `ach-${achievement.key}`,
      title: achievement.title,
      subtitle: achievement.description,
      glyph: achievement.icon,
      level: 1,
      cost:
        achievement.cryptoReward > 0
          ? `${achievement.cryptoReward} Crypto`
          : achievement.dataReward
            ? `${formatCompact(achievement.dataReward)} Data`
            : achievement.chipReward
              ? `${achievement.chipReward} чипов`
              : undefined,
      tag: RARITY_LABEL[achievement.rarity] ?? achievement.rarity,
      accent: achievement.rarity === 'legendary' ? '#fbbf24' : '#94a3b8',
      secret: achievement.secret,
    })
  ),
};

// ---------------------------------------------------------------- события

const eventSection: DemoSection = {
  id: 'events',
  title: 'События',
  subtitle: 'Ежедневные поручения, инциденты, сюжетная глава и недельный ивент',
  glyph: '📅',
  accent: '#38bdf8',
  items: [
    ...ACTIVE_SEASON_EVENT.scenarios.map(
      (day): DemoItem => ({
        key: `season-day-${day.day}`,
        title: `День ${day.day} · ${day.title}`,
        subtitle: day.description,
        glyph: '🌟',
        level: 1,
        cost: `+${ACTIVE_SEASON_EVENT.dailyTasksPerDay} задания`,
        tag: day.system,
        accent: '#fbbf24',
      })
    ),
    ...Object.values(DAILY_TASK_POOLS)
      .flat()
      .map(
        (task): DemoItem => ({
          key: `daily-${task.key}`,
          title: task.title,
          subtitle: task.description,
          glyph: task.icon,
          level: 1,
          cost: `${task.rewardXp} XP`,
          tag: 'ежедневное',
          accent: '#38bdf8',
        })
      ),
    ...DAILY_INCIDENTS.map(
      (incident): DemoItem => ({
        key: `incident-${incident.key}`,
        title: incident.title,
        subtitle: `${incident.brief} Выбор: ${incident.choices.map((c) => c.title).join(' / ')}`,
        glyph: '⚡',
        level: 1,
        cost: '3 варианта',
        tag: 'инцидент дня',
        accent: '#fb7185',
      })
    ),
    ...FIRST_CHAPTER_STEPS.map(
      (step): DemoItem => ({
        key: `chapter-${step.id}`,
        title: step.title,
        subtitle: step.deskBrief,
        glyph: '📖',
        level: 1,
        cost: step.actionLabel,
        tag: 'первая глава',
        accent: '#a3e635',
      })
    ),
  ],
};

export const DEMO_SECTIONS: DemoSection[] = [
  deskSection,
  cardSection,
  missionSection,
  teamSection,
  baseSection,
  skinSection,
  frameSection,
  achievementSection,
  eventSection,
];

export const DEMO_TOTAL_UNLOCKS = DEMO_SECTIONS.reduce(
  (total, section) => total + section.items.length,
  0
);

// ---------------------------------------------------------------- лестница

export interface LadderLine {
  title: string;
  section: string;
}

export interface LadderRow {
  level: number;
  /** Что именно открывается на этом уровне (до 6 строк, остальное — счётчиком). */
  lines: LadderLine[];
  more: number;
  /** Служебные пометки: ранги, слоты контрактов, Престиж. */
  notes: string[];
  /** Сцена рабочего стола, которая включается на этом уровне. */
  stage: number;
}

const EXTRA_NOTES: Record<number, string[]> = {
  10: ['2-й слот контрактов'],
  20: ['3-й слот контрактов'],
  50: ['Global Hack Престиж: сброс и ×2 к доходу'],
};

/** Уровни, на которых что-то меняется: предметы, ранги, слоты, Престиж. */
export function buildLadder(): LadderRow[] {
  const byLevel = new Map<number, LadderLine[]>();

  const push = (level: number, line: LadderLine) => {
    const safeLevel = Math.max(1, Math.floor(level));
    const list = byLevel.get(safeLevel) ?? [];
    list.push(line);
    byLevel.set(safeLevel, list);
  };

  for (const section of DEMO_SECTIONS) {
    for (const item of section.items) {
      if (item.level <= 1) continue;
      push(item.level, { title: item.title, section: section.title });
    }
  }

  for (const rank of RANK_TITLES) {
    if (rank.minLevel <= 1) continue;
    push(rank.minLevel, { title: `Ранг: ${rank.title}`, section: 'Ранг' });
  }

  for (const [levelRaw, notes] of Object.entries(EXTRA_NOTES)) {
    for (const note of notes) {
      push(Number(levelRaw), { title: note, section: 'Механика' });
    }
  }

  // Престиж открывается на 50 уровне, дальше — каждые 10 уровней.
  for (let level = 50; level <= 120; level += 10) {
    push(level, {
      title: level === 50 ? 'Открывается Global Hack' : `Global Hack №${(level - 50) / 10 + 1}`,
      section: 'Престиж',
    });
  }

  // Сначала — то, что меняет правила (Престиж, слоты, ранги), потом предметы:
  // иначе на «густых» уровнях строки обрезаются и механика пропадает из виду.
  const priority = (line: LadderLine): number => {
    if (line.section === 'Престиж') return 0;
    if (line.section === 'Механика') return 1;
    if (line.section === 'Ранг') return 2;
    return 3;
  };

  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, lines]) => {
      const ordered = [...lines].sort((a, b) => priority(a) - priority(b));
      return {
        level,
        lines: ordered.slice(0, 6),
        more: Math.max(0, ordered.length - 6),
        notes: EXTRA_NOTES[level] ?? [],
        stage: computeDeskStage(level),
      };
    });
}

export const DEMO_LADDER = buildLadder();

/**
 * Верхняя граница ползунка: самый глубокий порог в конфигах, округлённый вверх
 * до 50. Сейчас это рамка `endless_operator` на 180 уровне → 200. Так витрина
 * не «прячет» дальний эндгейм, если контент добавят выше.
 */
export const DEMO_MAX_LEVEL = Math.max(
  60,
  Math.ceil(Math.max(...DEMO_SECTIONS.flatMap((s) => s.items.map((i) => i.level))) / 50) * 50
);

export type { DemoSection as DemoSectionType };
