import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFirstChapterState, type FirstChapterState } from '../../shared/chapter.config';
import { DailyTasksPanel } from '../components/DailyTasksPanel';
import { DeskScene, OfflineBankNote } from '../components/DeskScene';
import { SeasonEventPanel } from '../components/SeasonEventPanel';
import { useGame } from '../context/GameContext';

/**
 * Главный экран рабочего стола.
 *
 * Навигация к улучшениям и операциям остаётся в нижней панели, поэтому
 * рабочий стол не дублирует её дополнительной промо-карточкой.
 */
export const DeskPage: React.FC = () => {
  const { player } = useGame();
  if (!player) return null;

  const chapter = getFirstChapterState(player);

  return (
    <div className="space-y-3.5 pb-4">
      <DeskScene />

      {/* Главные активности Desk: ивент и задания оператора видны сразу после сцены. */}
      <SeasonEventPanel state={player.stats.seasonEvent} />
      <DailyTasksPanel state={player.stats.dailyTasks} />
      <ChapterBrief chapter={chapter} />
      <OfflineBankNote derived={player.derived} stats={player.stats} />

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
