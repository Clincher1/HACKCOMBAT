/**
 * Единый источник данных экрана «Задания» (v6.0).
 *
 * Зачем: до этого раздел собирался из четырёх независимых компонентов разных
 * эпох (Neon Relay, ежедневки, сюжетная глава, коллекционные рамки), и каждый
 * сам решал, как выглядит задание и что значит «готово». Теперь:
 *
 *   • сырые состояния берутся из PlayerState (никаких новых полей и API);
 *   • нормализация в один тип Quest живёт ТОЛЬКО здесь;
 *   • UI-компоненты ничего не считают — они рендерят готовый Quest.
 *
 * Функция чистая и не зависит от React: её же проверяет QA-мост.
 */
import {
  FIRST_CHAPTER_STEPS,
  getFirstChapterState,
} from '../../shared/chapter.config';
import { getDailyTaskDefinition } from '../../shared/dailyTasks.config';
import {
  ACTIVE_SEASON_EVENT,
  SEASON_EVENT_DAY_COUNT,
  getSeasonEventDayNumber,
  isSeasonEventLive,
} from '../../shared/seasonalEvent.config';
import type { PlayerState } from '../../shared/types';

export type QuestKind = 'daily' | 'progress' | 'event';

/** Четыре состояния карточки — больше в разделе не бывает. */
export type QuestStatus = 'available' | 'active' | 'ready' | 'closed';

export interface Quest {
  /** Стабильный ключ: по нему работает memo и анимация смены состояния. */
  id: string;
  kind: QuestKind;
  icon: string;
  title: string;
  description: string;
  /** Человеческая подпись награды: «+20 XP», «Рамка · Участник». */
  rewardLabel: string;
  current: number;
  target: number;
  status: QuestStatus;
  /** Ключ ежедневного поручения — только у заданий, которые забираются тапом. */
  claimKey?: string;
  /** Куда ведёт действие, если награды не забирают (сюжетные цели). */
  href?: string;
  /** Служебная подпись состояния: «до сброса», «выдаётся автоматически». */
  hint?: string;
}

export interface QuestSection {
  id: QuestKind;
  title: string;
  subtitle: string;
  empty: string;
  quests: Quest[];
}

export const QUEST_SECTION_TITLES = {
  daily: 'Ежедневные поручения',
  progress: 'Прогресс',
  event: 'События',
} as const;

/** Награда сюжетной цели — не валюта, а то, что она открывает. */
const CHAPTER_REWARDS: Record<string, string> = {
  terminal: 'Контракты T1',
  'first-trace': 'Первый результат',
  'network-noise': 'Цели T2',
};

function clampRatio(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(current, target));
}

/** Ежедневные поручения: ровно три задания дня, награда — XP. */
function buildDailySection(player: PlayerState): QuestSection {
  const state = player.stats.dailyTasks;
  const quests: Quest[] = [];

  if (state) {
    for (const key of state.taskKeys) {
      const definition = getDailyTaskDefinition(key);
      if (!definition) continue;
      const current = clampRatio(state.progress[key] ?? 0, definition.target);
      const claimed = state.claimed.includes(key);
      const ready = current >= definition.target;
      quests.push({
        id: `daily:${definition.key}`,
        kind: 'daily',
        icon: definition.icon,
        title: definition.title,
        description: definition.description,
        rewardLabel: `+${definition.rewardXp} XP`,
        current,
        target: definition.target,
        status: claimed ? 'closed' : ready ? 'ready' : current > 0 ? 'active' : 'available',
        claimKey: definition.key,
        hint: claimed ? 'Получено' : ready ? 'Готово к забору' : 'В процессе',
      });
    }
  }

  return {
    id: 'daily',
    title: QUEST_SECTION_TITLES.daily,
    subtitle: 'Три дела на сегодня. Награда — опыт, экономику не трогает.',
    empty: 'Сегодняшняя тройка ещё не пришла с сервера — обнови экран через минуту.',
    quests,
  };
}

/** Сюжетные цели: состояние выводится из PlayerState, забрать нечего — они открывают доступы. */
function buildProgressSection(player: PlayerState): QuestSection {
  const chapter = getFirstChapterState(player);
  const quests: Quest[] = chapter.steps.map((step) => {
    const index = FIRST_CHAPTER_STEPS.findIndex((item) => item.id === step.id);
    return {
      id: `chapter:${step.id}`,
      kind: 'progress',
      icon: step.complete ? '✅' : step.active ? '🎯' : '🔒',
      title: step.title,
      description: step.deskBrief,
      rewardLabel: CHAPTER_REWARDS[step.id] ?? 'Прогресс главы',
      current: step.complete ? 1 : 0,
      target: 1,
      status: step.complete ? 'closed' : step.active ? 'active' : 'available',
      href: step.href,
      hint: step.complete
        ? 'Пройдено'
        : step.active
          ? `Шаг ${index + 1} из ${chapter.steps.length}`
          : 'Откроется по ходу главы',
    } satisfies Quest;
  });

  return {
    id: 'progress',
    title: QUEST_SECTION_TITLES.progress,
    subtitle: 'Сюжетные цели уровня — что открывается дальше.',
    empty: 'Цели главы появятся после первого контракта.',
    quests,
  };
}

/**
 * События: один активный ивент. Пока окно ивента закрыто, секция честно пустая —
 * никаких «завершённых» панелей прошлой эпохи в интерфейсе не остаётся.
 */
function buildEventSection(player: PlayerState): QuestSection {
  const live = isSeasonEventLive();
  const state = player.stats.seasonEvent;
  const quests: Quest[] = [];

  if (live) {
    const day = Math.max(1, Math.min(SEASON_EVENT_DAY_COUNT, getSeasonEventDayNumber() || 1));
    const dayState = state?.days[String(day)];

    for (const task of dayState?.tasks ?? []) {
      const current = clampRatio(dayState?.progress[task.key] ?? 0, task.target);
      const done = current >= task.target;
      quests.push({
        id: `event:${task.key}`,
        kind: 'event',
        icon: task.icon,
        title: task.title,
        description: task.description,
        rewardLabel: `День ${day} · зачёт`,
        current,
        target: task.target,
        status: done ? 'closed' : current > 0 ? 'active' : 'available',
        hint: done ? 'Засчитано' : `День ${day} из ${SEASON_EVENT_DAY_COUNT}`,
      });
    }

    const completedDays = state?.completedDays.length ?? 0;
    const frames: Array<{ id: string; title: string; label: string; need: number; claimed: boolean }> = [
      {
        id: 'participation',
        title: 'Рамка участника',
        label: 'Рамка · Участник',
        need: 1,
        claimed: state?.participationClaimed === true,
      },
      {
        id: 'mastery',
        title: 'Рамка мастера',
        label: 'Рамка · Мастер',
        need: SEASON_EVENT_DAY_COUNT,
        claimed: state?.masteryClaimed === true,
      },
    ];
    for (const frame of frames) {
      const current = Math.min(completedDays, frame.need);
      const done = current >= frame.need;
      quests.push({
        id: `event:frame:${frame.id}`,
        kind: 'event',
        icon: frame.claimed || done ? '🖼️' : '🔒',
        title: frame.title,
        description: `Закрой ${frame.need === 1 ? 'любой полный день' : `все ${frame.need} дня`} ивента.`,
        rewardLabel: frame.label,
        current,
        target: frame.need,
        status: frame.claimed ? 'closed' : done ? 'ready' : 'active',
        hint: frame.claimed ? 'В коллекции' : 'Выдаётся автоматически',
      });
    }
  }

  return {
    id: 'event',
    title: QUEST_SECTION_TITLES.event,
    subtitle: live ? ACTIVE_SEASON_EVENT.title : 'Активных ивентов сейчас нет.',
    empty: 'Активных ивентов сейчас нет. Следующий анонс появится здесь же.',
    quests,
  };
}

/** Все секции экрана «Задания» в порядке отображения. */
export function buildQuestSections(player: PlayerState): QuestSection[] {
  return [buildDailySection(player), buildProgressSection(player), buildEventSection(player)];
}
