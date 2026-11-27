import { BookOpen, ChevronRight, ClipboardList } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';

/**
 * HACKER KOMBAT — два входа на столе (v6.9): «Задания» и «История».
 *
 * Было: три полосы во всю ширину над контрактной доской (локации, история,
 * задания) — вместе с HUD это давало 9+ интерактивных элементов ДО первого
 * контента. Стало: две компактные плитки в одном ряду ПОСЛЕ доски, а полоса
 * локаций уехала ещё ниже — мир открывается, когда игрок уже увидел доход.
 *
 * Тексты сюжета сюда не тянутся: строка мира приходит готовым снимком из API.
 */
const Tile: React.FC<{
  to: string;
  qa: string;
  title: string;
  subtitle: string;
  progress?: string;
  icon: React.ReactNode;
  accent: string;
}> = ({ to, qa, title, subtitle, progress, icon, accent }) => (
  <Link
    to={to}
    data-qa={qa}
    className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl border border-slate-800 bg-[var(--ui-panel)]/85 px-2.5 py-2 transition hover:border-[var(--ui-primary)]/45"
  >
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
      style={{ background: `rgba(var(${accent}-rgb), 0.14)`, color: `var(${accent})` }}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-1">
        <span className="truncate text-[13px] font-bold text-white">{title}</span>
        {progress && (
          <span className="shrink-0 font-num text-[11px] font-bold" style={{ color: `var(${accent})` }}>
            {progress}
          </span>
        )}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-[var(--ui-text-muted)]">{subtitle}</span>
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
  </Link>
);

export const DeskQuickLinks: React.FC = () => {
  const { player, story } = useGame();
  if (!player) return null;

  const daily = player.stats.dailyTasks;
  const total = daily?.taskKeys.length ?? 0;
  const done = daily ? daily.claimed.filter((key) => daily.taskKeys.includes(key)).length : 0;

  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile
        to="/tasks"
        qa="tasks-teaser"
        title="Задания"
        subtitle={total > 0 ? `${done}/${total} сегодня` : 'поручения · события'}
        icon={<ClipboardList className="h-4 w-4" />}
        accent="--ui-primary"
      />
      <Tile
        to="/story"
        qa="story-strip"
        title="История"
        subtitle={story ? story.title : 'главы мира'}
        progress={story && story.claimable > 0 ? `${story.claimable}` : undefined}
        icon={<BookOpen className="h-4 w-4" />}
        accent="--ui-secondary"
      />
    </div>
  );
};
