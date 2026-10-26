import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Crosshair,
  Flame,
  Gift,
  Radar,
  TimerReset,
  Zap,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CARD_LEVEL_INCOME_GROWTH,
  CARDS_CONFIG,
  getCardPrice,
  getMaxCardLevel,
} from '../../shared/cards.config';
import { getFirstChapterState, type FirstChapterState } from '../../shared/chapter.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import type { PlayerState } from '../../shared/types';
import { DailyTasksPanel } from '../components/DailyTasksPanel';
import { DeskScene, OfflineBankNote } from '../components/DeskScene';
import { SeasonEventPanel } from '../components/SeasonEventPanel';
import { useGame } from '../context/GameContext';
import { formatCompact, formatCountdown } from '../lib/format';

interface NextAction {
  eyebrow: string;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  icon: React.ReactNode;
  tone: 'cyan' | 'green' | 'amber' | 'purple' | 'pink';
  onClick?: () => void;
}

const ACTION_TONE: Record<NextAction['tone'], { panel: string; border: string; icon: string; button: string }> = {
  cyan: {
    panel: 'from-cyan-950/45 to-[#10172e]',
    border: 'border-[#00f0ff]/45',
    icon: 'text-[#00f0ff]',
    button: 'bg-[#00f0ff] text-[#061018] hover:bg-[#66f7ff]',
  },
  green: {
    panel: 'from-emerald-950/45 to-[#10172e]',
    border: 'border-[#7dff00]/45',
    icon: 'text-[#7dff00]',
    button: 'bg-[#7dff00] text-[#071005] hover:bg-[#a6ff66]',
  },
  amber: {
    panel: 'from-amber-950/45 to-[#10172e]',
    border: 'border-amber-400/45',
    icon: 'text-amber-300',
    button: 'bg-amber-300 text-[#171005] hover:bg-amber-200',
  },
  purple: {
    panel: 'from-purple-950/45 to-[#10172e]',
    border: 'border-purple-400/45',
    icon: 'text-purple-300',
    button: 'bg-purple-300 text-[#13091d] hover:bg-purple-200',
  },
  pink: {
    panel: 'from-pink-950/45 to-[#10172e]',
    border: 'border-pink-400/45',
    icon: 'text-pink-300',
    button: 'bg-pink-300 text-[#1d0814] hover:bg-pink-200',
  },
};

/**
 * Главный экран — рабочий стол плюс одно понятное «следующее действие».
 *
 * Важно: это только навигационный слой. Он не меняет награды, не создаёт
 * локальную экономику и не обещает действие, которого сервер не разрешает.
 */
export const DeskPage: React.FC = () => {
  const { player, nowMs, setDailyModalOpen } = useGame();
  if (!player) return null;

  const nextAction = getNextAction(player, nowMs, setDailyModalOpen);
  const tone = ACTION_TONE[nextAction.tone];
  const chapter = getFirstChapterState(player);

  return (
    <div className="space-y-3.5 pb-4">
      <DeskScene />

      {/* Сюжет, затем ежедневная активность, и только потом объяснение пассива. */}
      <ChapterBrief chapter={chapter} />
      <DailyTasksPanel state={player.stats.dailyTasks} />
      <SeasonEventPanel state={player.stats.seasonEvent} />
      <OfflineBankNote derived={player.derived} stats={player.stats} />

      {nextAction.eyebrow !== 'Свободный слот' && (
        <section
        aria-label="Следующее действие"
        className={`rounded-2xl border bg-gradient-to-br ${tone.panel} ${tone.border} p-3.5 shadow-[0_0_22px_rgba(var(--ui-primary-rgb),0.08)]`}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${tone.icon}`}>{nextAction.icon}</div>
          <div className="min-w-0 flex-1">
            <div className={`text-[10px] font-bold uppercase tracking-[0.12em] ${tone.icon}`}>
              {nextAction.eyebrow}
            </div>
            <h2 className="font-display text-sm font-extrabold text-white mt-0.5">
              {nextAction.title}
            </h2>
            <p className="text-[11px] leading-relaxed text-slate-300 mt-1">
              {nextAction.description}
            </p>
          </div>
        </div>

        {nextAction.href && nextAction.actionLabel && (
          <Link
            to={nextAction.href}
            className={`mt-3 w-full rounded-xl px-3 py-2.5 flex items-center justify-center gap-1.5 text-xs font-extrabold transition ${tone.button}`}
          >
            <span>{nextAction.actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
        {nextAction.onClick && nextAction.actionLabel && (
          <button
            type="button"
            onClick={nextAction.onClick}
            className={`mt-3 w-full rounded-xl px-3 py-2.5 flex items-center justify-center gap-1.5 text-xs font-extrabold transition cursor-pointer ${tone.button}`}
          >
            <span>{nextAction.actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        </section>
      )}

      {/* Индикатор риска при высоком Heat */}
      {player.heat >= 70 && (
        <Link
          to="/hacks"
          className="rounded-xl bg-rose-950/60 border border-rose-500/50 p-3 flex items-center gap-2.5 text-xs text-rose-200 hover:bg-rose-950/80 transition"
        >
          <Flame className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="flex-1">
            <strong>Внимание: Розыск {player.heat}/100!</strong> При превышении 100 сработает штраф
            (-10% Data и блок кликов на 60 сек). Выполняйте белые миссии или наймите Fence.
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-rose-300" />
        </Link>
      )}
    </div>
  );
};

const ChapterBrief: React.FC<{ chapter: FirstChapterState }> = ({ chapter }) => {
  const activeIndex = chapter.steps.findIndex((step) => step.active);
  const defaultIndex = activeIndex >= 0 ? activeIndex : Math.max(0, chapter.steps.length - 1);
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const touchStartX = useRef<number | null>(null);
  const selectedStep = chapter.steps[selectedIndex] ?? chapter.steps[defaultIndex];

  useEffect(() => {
    setSelectedIndex(defaultIndex);
  }, [defaultIndex]);

  const goToStep = (index: number) => {
    setSelectedIndex(Math.max(0, Math.min(chapter.steps.length - 1, index)));
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;
    const delta = endX - startX;
    if (Math.abs(delta) < 42) return;
    goToStep(selectedIndex + (delta < 0 ? 1 : -1));
  };

  if (!selectedStep) return null;
  const selectedIsComplete = selectedStep.complete;
  const selectedIsActive = selectedStep.active;

  return (
    <section
      aria-label="Задания оператора"
      className="rounded-2xl bg-gradient-to-br from-purple-950/55 via-[#141634] to-[#10172e] border border-[rgba(var(--ui-secondary-rgb),0.68)] p-3.5 shadow-[0_0_28px_rgba(var(--ui-secondary-rgb),0.16)]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--ui-secondary-rgb),0.16)] text-[var(--ui-secondary)]">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ui-secondary)]">
              🎯 Задания оператора · Глава 1
            </div>
            <span className="shrink-0 rounded-md bg-[rgba(var(--ui-secondary-rgb),0.14)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ui-secondary)]">
              {chapter.completedCount}/{chapter.steps.length} готово
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold">
            <span className={selectedIsComplete ? 'text-[#7dff00]' : selectedIsActive ? 'text-[var(--ui-secondary)]' : 'text-slate-500'}>
              {selectedIsComplete ? '✓ Выполнено' : selectedIsActive ? '● Текущее задание' : '🔒 Откроется дальше'}
            </span>
            <span className="text-slate-600">· шаг {selectedIndex + 1}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[rgba(var(--ui-secondary-rgb),0.30)] bg-[#0a0e1a]/45 p-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label="Предыдущее задание главы"
            disabled={selectedIndex === 0}
            onClick={() => goToStep(selectedIndex - 1)}
            className="mt-0.5 shrink-0 rounded-lg border border-slate-700 bg-[#10172e] p-1.5 text-slate-300 transition hover:border-[var(--ui-secondary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="font-display text-sm font-extrabold text-white">{selectedStep.title}</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{selectedStep.deskBrief}</p>
          </div>
          <button
            type="button"
            aria-label="Следующее задание главы"
            disabled={selectedIndex === chapter.steps.length - 1}
            onClick={() => goToStep(selectedIndex + 1)}
            className="mt-0.5 shrink-0 rounded-lg border border-slate-700 bg-[#10172e] p-1.5 text-slate-300 transition hover:border-[var(--ui-secondary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {selectedIsActive && (
          <Link
            to={selectedStep.href}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--ui-secondary)] px-3 py-2.5 text-xs font-extrabold text-[#0b0710] shadow-[0_0_16px_rgba(var(--ui-secondary-rgb),0.28)] transition hover:brightness-110"
          >
            <span>{selectedStep.actionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {selectedIsComplete && (
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-[#7dff00]/25 bg-[#7dff00]/8 px-3 py-2.5 text-xs font-bold text-[#7dff00]">
            <CheckCircle2 className="h-4 w-4" /> Выполнено — можно листать дальше
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5" aria-label="Прогресс главы">
        {chapter.steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            aria-label={`${index + 1}. ${step.title}`}
            aria-current={index === selectedIndex ? 'step' : undefined}
            onClick={() => goToStep(index)}
            className={`h-2 rounded-full transition-all ${
              index === selectedIndex
                ? 'w-7 bg-[var(--ui-secondary)] shadow-[0_0_10px_rgba(var(--ui-secondary-rgb),0.55)]'
                : step.complete
                  ? 'w-2 bg-[#7dff00]'
                  : step.active
                    ? 'w-2 bg-purple-300'
                    : 'w-2 bg-slate-700'
            }`}
          />
        ))}
      </div>
      <div className="mt-1 text-center text-[10px] text-slate-500">
        Свайпай карточку, чтобы посмотреть завершённые шаги
      </div>
    </section>
  );
};

function getNextAction(
  player: PlayerState,
  nowMs: number,
  setDailyModalOpen: (open: boolean) => void
): NextAction {
  const readyMissions = player.activeMissions.filter(
    (mission) => new Date(mission.finishAt).getTime() <= nowMs
  );
  if (readyMissions.length > 0) {
    return {
      eyebrow: 'Награда готова',
      title: readyMissions.length === 1 ? 'Забери результат операции' : `Готовы ${readyMissions.length} операции`,
      description: 'Контракт завершён. Забери XP и награду, чтобы освободить слот для следующего взлома.',
      href: '/hacks',
      actionLabel: 'Открыть операции',
      icon: <CheckCircle2 className="w-6 h-6" />,
      tone: 'green',
    };
  }

  const freeSlot = player.activeMissions.length < player.derived.missionSlots;
  const currentScanHasMission = player.availableMissionKeys.some((key) => {
    const mission = MISSIONS_CONFIG.find((item) => item.key === key);
    return Boolean(
      mission &&
        (mission.minLevel ?? 1) <= player.derived.level &&
        (mission.targetType !== 'grey' || player.derived.unlockedGreyMissions)
    );
  });
  if (freeSlot && currentScanHasMission) {
    return {
      eyebrow: 'Свободный слот',
      title: 'Запусти следующую операцию',
      description: `Занято ${player.activeMissions.length} из ${player.derived.missionSlots} слотов. Выбери контракт по шансу, награде и Heat.`,
      href: '/hacks',
      actionLabel: 'Открыть скан сети',
      icon: <Radar className="w-6 h-6" />,
      tone: 'cyan',
    };
  }

  const affordableCard = findAffordableCard(player);
  if (affordableCard) {
    return {
      eyebrow: 'Есть улучшение',
      title: `Готов модуль «${affordableCard.name}»`,
      description: `Цена ${formatCompact(affordableCard.price)} Data. Улучшение усилит базу и приблизит следующий безопасный тир миссий.`,
      href: '/upgrades',
      actionLabel: 'Открыть улучшения',
      icon: <Cpu className="w-6 h-6" />,
      tone: 'purple',
    };
  }

  const dailyAvailable =
    !player.lastDailyClaim ||
    (nowMs - new Date(player.lastDailyClaim).getTime()) / 3_600_000 >= 20;
  if (dailyAvailable) {
    return {
      eyebrow: 'Ежедневная награда',
      title: 'Забери сегодняшний Crypto-дроп',
      description: 'Бонус бесплатный и не влияет на силу доната. Забери его перед выходом из игры.',
      actionLabel: 'Открыть бонус',
      icon: <Gift className="w-6 h-6" />,
      tone: 'pink',
      onClick: () => setDailyModalOpen(true),
    };
  }

  const activeMission = player.activeMissions[0];
  if (activeMission) {
    const remaining = Math.max(0, Math.ceil((new Date(activeMission.finishAt).getTime() - nowMs) / 1000));
    return {
      eyebrow: 'Операция выполняется',
      title: activeMission.targetName,
      description: remaining > 0
        ? `До результата ${formatCountdown(remaining)}. Пока ждёшь, можно проверить улучшения и подготовить следующий выбор.`
        : 'Операция готова к сбору — открой вкладку «Взломы».',
      href: '/hacks',
      actionLabel: remaining > 0 ? 'Проверить операции' : 'Забрать результат',
      icon: remaining > 0 ? <TimerReset className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />,
      tone: remaining > 0 ? 'amber' : 'green',
    };
  }

  if (player.energy <= 0) {
    return {
      eyebrow: 'Терминал перезаряжается',
      title: 'Энергия CPU закончилась',
      description: 'Энергия восстановится автоматически. Пока ждёшь, открой улучшения или настрой следующую операцию.',
      href: '/upgrades',
      actionLabel: 'Проверить улучшения',
      icon: <Zap className="w-6 h-6" />,
      tone: 'amber',
    };
  }

  return {
    eyebrow: 'Терминал готов',
    title: 'Набери стартовый Data',
    description: 'Несколько тапов запустят экономику. Затем купи первый модуль и отправь оператора в сеть.',
    href: '/hacks',
    actionLabel: 'Открыть операции',
    icon: <Crosshair className="w-6 h-6" />,
    tone: 'cyan',
  };
}

function findAffordableCard(player: PlayerState): {
  name: string;
  price: number;
} | null {
  const maxLevel = getMaxCardLevel(player.cardTier);
  const totalLevels = player.derived.totalCardLevels;
  let best: { name: string; price: number; score: number } | null = null;

  for (const card of CARDS_CONFIG) {
    const level = player.cards[card.key] ?? 0;
    if (level >= maxLevel || (card.minLevel ?? 1) > player.derived.level) continue;
    const price = getCardPrice(card, level, totalLevels, player.derived.cardPriceDiscountPct);
    if (price > player.data) continue;
    const score =
      (card.dataPerHourPerLevel * Math.pow(CARD_LEVEL_INCOME_GROWTH, level)) /
      Math.max(1, price);
    if (!best || score > best.score) {
      best = { name: card.name, price, score };
    }
  }

  return best ? { name: best.name, price: best.price } : null;
}
