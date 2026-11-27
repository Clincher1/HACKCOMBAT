import { BookOpen, ChevronRight } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';

/**
 * HACKER KOMBAT — строка «состояние мира» на столе (v6.8).
 *
 * Зачем отдельный компонент: он живёт в главном бандле, поэтому НЕ импортирует
 * shared/story.config.ts. Всё, что нужно, приходит снимком из API (`story`):
 * флавор последней закрытой главы, текущая глава и счётчик «что можно забрать».
 *
 * Мемоизация не нужна: компонент читает три поля и перерисовывается только
 * вместе с контекстом (а он меняется по действиям, а не на каждом тапе).
 */
export const StoryStrip: React.FC = () => {
  const { story } = useGame();
  if (!story) return null;

  return (
    <Link
      to="/story"
      data-qa="story-strip"
      data-story-arc={story.arcId}
      className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-[var(--ui-panel)]/85 px-3 py-2 transition hover:border-[rgba(var(--ui-primary-rgb),0.45)]"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--ui-primary-rgb),0.14)] text-[var(--ui-primary)]">
        <BookOpen className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-bold text-slate-200" data-qa="story-world-line">
            {story.flavor}
          </span>
          {story.claimable > 0 && (
            <span className="shrink-0 rounded-full bg-[var(--ui-primary)] px-1.5 text-[10px] font-extrabold text-[var(--ui-panel-deep)]">
              {story.claimable}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--ui-text-muted)]">
          {story.open
            ? `${story.cover} ${story.title} · ${story.done}/${story.total}`
            : `${story.cover} ${story.title} · откроется на ${story.requiredLevel} уровне`}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
    </Link>
  );
};
