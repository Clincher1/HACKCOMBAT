import { PROLOGUE_SCENES } from './story.prologue';
import type { PlayerState } from './types';

/**
 * Первая сюжетная глава — тонкая оболочка над уже существующей прогрессией.
 *
 * Важно: шаги не являются отдельной серверной валютой или новым сохранением.
 * Их состояние выводится из фактов PlayerState, поэтому старые игроки получают
 * корректный прогресс сразу, а экономика и API остаются без изменений.
 */
export interface ChapterStepConfig {
  id: 'terminal' | 'first-trace' | 'network-noise';
  title: string;
  deskBrief: string;
  missionBrief: string;
  href: '/upgrades' | '/hacks';
  actionLabel: string;
  /** Подсказочные цели главы; запуск по-прежнему разрешает только серверный скан. */
  missionKeys: readonly string[];
}

export interface ChapterStepState extends ChapterStepConfig {
  complete: boolean;
  active: boolean;
}

export interface FirstChapterState {
  complete: boolean;
  completedCount: number;
  activeStep: ChapterStepState | null;
  steps: ChapterStepState[];
}

export const FIRST_CHAPTER_STEPS: readonly ChapterStepConfig[] = [
  {
    id: 'terminal',
    title: 'Собери терминал',
    // v6.11: своих текстов у пролога больше нет — ровно та же сцена, что в сюжете.
    deskBrief: PROLOGUE_SCENES.terminal,
    missionBrief: PROLOGUE_SCENES.terminal,
    href: '/upgrades',
    actionLabel: 'Открыть апгрейды',
    missionKeys: [],
  },
  {
    id: 'first-trace',
    title: 'Оставь первый след',
    deskBrief: PROLOGUE_SCENES.firstTrace,
    missionBrief: PROLOGUE_SCENES.firstTrace,
    href: '/hacks',
    actionLabel: 'Открыть скан сети',
    missionKeys: ['scam_shop', 'fake_lottery', 'retro_blog', 'pixel_arcade', 'dev_forum'],
  },
  {
    id: 'network-noise',
    title: 'Услышь шум в сети',
    deskBrief: PROLOGUE_SCENES.networkNoise,
    missionBrief: PROLOGUE_SCENES.networkNoise,
    href: '/hacks',
    actionLabel: 'Проверить T2-цели',
    missionKeys: ['phishing_bank', 'bot_spam_net'],
  },
] as const;

function hasAchievement(player: PlayerState, key: string): boolean {
  return player.achievements.includes(key);
}

/**
 * Состояние главы вычисляется только из серверного PlayerState.
 * Это намеренно не требует новой записи в БД и не может выдать награду само по себе.
 */
export function getFirstChapterState(player: PlayerState): FirstChapterState {
  const completed = [
    hasAchievement(player, 'first_upgrade') || player.derived.totalCardLevels >= 1,
    hasAchievement(player, 'first_mission') || player.totalMissions >= 1,
    player.derived.level >= 3 && player.totalMissions >= 2,
  ];
  const activeIndex = completed.findIndex((done) => !done);
  const steps = FIRST_CHAPTER_STEPS.map((step, index) => ({
    ...step,
    complete: completed[index],
    active: index === activeIndex,
  }));

  return {
    complete: activeIndex === -1,
    completedCount: completed.filter(Boolean).length,
    activeStep: activeIndex === -1 ? null : steps[activeIndex],
    steps,
  };
}
