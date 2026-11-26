import { ChevronRight, ClipboardList } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';

/**
 * Компактный вход в раздел «Задания» на рабочем столе (v6.0).
 *
 * Заменяет собой три прежних блока (ивент, ежедневки, главу): на столе остаётся
 * одна строка с прогрессом дня, а вся детализация живёт на экране /tasks.
 */
const TasksTeaserBase: React.FC = () => {
  const { player } = useGame();
  if (!player) return null;

  const daily = player.stats.dailyTasks;
  const total = daily?.taskKeys.length ?? 0;
  const done = daily ? daily.claimed.filter((key) => daily.taskKeys.includes(key)).length : 0;
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const allDone = total > 0 && done === total;

  return (
    <Link
      to="/tasks"
      data-qa="tasks-teaser"
      className="flex items-center gap-2.5 rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.4)] bg-[var(--ui-panel)] px-3 py-2.5 transition-colors duration-150 hover:border-[var(--ui-primary)]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgba(var(--ui-primary-rgb),0.16)] text-[var(--ui-primary)]">
        <ClipboardList className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-bold text-white">Задания</span>
          <span className="shrink-0 text-[10px] font-extrabold tabular-nums text-[var(--ui-primary)]">
            {total > 0 ? `${done}/${total} сегодня` : 'смотреть'}
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
            <span
              className={`block h-full w-full origin-left rounded-full ${allDone ? 'bg-emerald-400' : 'bg-[var(--ui-primary)]'}`}
              style={{ transform: `scaleX(${allDone ? 1 : ratio})`, transition: 'transform 200ms ease-out' }}
            />
          </span>
          <span className="shrink-0 text-[10px] text-[var(--ui-text-muted)]">
            {allDone ? 'день закрыт' : 'поручения · цели · события'}
          </span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  );
};

export const TasksTeaser = React.memo(TasksTeaserBase);
TasksTeaser.displayName = 'TasksTeaser';
