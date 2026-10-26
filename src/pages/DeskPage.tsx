import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Crosshair,
  Flame,
  Gift,
  Radar,
  TimerReset,
  Zap,
} from 'lucide-react';
import React from 'react';
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
import { DeskScene } from '../components/DeskScene';
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

      <ChapterBrief chapter={chapter} />

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
  const activeStep = chapter.activeStep;

  return (
    <section
      aria-label="Сюжетная глава"
      className="rounded-2xl bg-gradient-to-br from-purple-950/35 to-[#10172e] border border-purple-400/30 p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-400/10 text-purple-300">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-300">
              Глава 1 · Первый выход
            </div>
            <span className="shrink-0 text-[10px] text-slate-500">
              {chapter.completedCount}/{chapter.steps.length}
            </span>
          </div>
          <h2 className="mt-0.5 font-display text-sm font-extrabold text-white">
            {activeStep ? activeStep.title : 'Глава завершена'}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
            {activeStep
              ? activeStep.deskBrief
              : 'Ты прошёл первый маршрут оператора. Дальше сеть будет открываться через обычные контракты, сборку и собственные решения.'}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Прогресс главы">
        {chapter.steps.map((step, index) => (
          <div
            key={step.id}
            className={`rounded-lg border px-2 py-1.5 ${
              step.complete
                ? 'border-[#7dff00]/35 bg-[#7dff00]/10'
                : step.active
                  ? 'border-purple-300/50 bg-purple-400/10'
                  : 'border-slate-800 bg-[#0a0e1a]/45'
            }`}
          >
            <div className={`text-[10px] font-bold ${step.complete ? 'text-[#7dff00]' : step.active ? 'text-purple-200' : 'text-slate-600'}`}>
              {step.complete ? '✓' : `${index + 1}`}
            </div>
            <div className={`mt-0.5 text-[10px] leading-tight ${step.complete ? 'text-slate-300' : step.active ? 'text-white' : 'text-slate-600'}`}>
              {step.title}
            </div>
          </div>
        ))}
      </div>

      {activeStep && (
        <Link
          to={activeStep.href}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-purple-300 px-3 py-2.5 text-xs font-extrabold text-[#13091d] transition hover:bg-purple-200"
        >
          <span>{activeStep.actionLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
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
