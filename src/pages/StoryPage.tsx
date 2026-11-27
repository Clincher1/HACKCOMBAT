import { ChevronDown, Clock3, Gem, Lock, ScrollText, Sparkles, Trophy } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  buildStoryViews,
  describeStoryReward,
  getStoryWorldLine,
  STORY_ARCS,
  storyDataReward,
  storyFactsFromPlayer,
  type StoryArcView,
  type StoryStepView,
} from '../../shared/story.config';
import {
  describeEventModifiers,
  formatEventEnd,
  getUpcomingWeeklyEvent,
  getWeeklySlot,
} from '../../shared/events.config';
import { useGame } from '../context/GameContext';

/**
 * Экран «История» (v6.8).
 *
 * Производительность:
 *   • страница — отдельный ленивый чанк (src/pages/StoryPage.tsx в App.tsx), тексты
 *     глав не попадают в главный бандл;
 *   • вьюхи глав считаются один раз через `useMemo` от уровня, фактов и списка
 *     забранных шагов — таймеров и пересчётов на каждый тик здесь нет;
 *   • каждая глава — `React.memo`, поэтому «Забрать» в одном шаге не перерисовывает
 *     остальные восемь карточек.
 */

const fmt = (value: number): string => value.toLocaleString('ru-RU');

const StepRow: React.FC<{
  step: StoryStepView;
  arc: StoryArcView;
  busy: boolean;
  onClaim: (stepId: string) => void;
}> = React.memo(({ step, arc, busy, onClaim }) => {
  const pct = Math.min(100, Math.round((step.progress / step.requirement.value) * 100));
  const claimable = step.met && !step.claimed;
  return (
    <li
      data-qa={`story-step-${step.id}`}
      data-step-state={step.claimed ? 'claimed' : claimable ? 'claimable' : 'open'}
      className="rounded-xl border border-slate-800/80 bg-[var(--ui-panel-deep)]/60 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-100">
            {step.claimed ? '✅ ' : claimable ? '🎯 ' : '• '}
            {step.title}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{step.scene}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-[rgba(var(--ui-primary-rgb),0.14)] px-2 py-1 text-[10px] font-bold text-[var(--ui-primary)]">
          {describeStoryReward(step.reward, arc.requiredLevel) || 'награда'}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${step.claimed ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-primary)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-[104px] shrink-0 text-right text-[10px] font-semibold text-slate-400">
          {step.requirement.label} · {fmt(step.progress)}/{fmt(step.requirement.value)}
        </span>
      </div>

      {claimable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onClaim(step.id)}
          data-qa="story-claim"
          className="mt-2 w-full rounded-lg border border-[rgba(var(--ui-primary-rgb),0.45)] bg-[rgba(var(--ui-primary-rgb),0.16)] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--ui-primary)] transition hover:bg-[rgba(var(--ui-primary-rgb),0.26)] disabled:opacity-50"
        >
          Забрать награду
        </button>
      )}
    </li>
  );
});
StepRow.displayName = 'StepRow';

const ArcCard: React.FC<{
  arc: StoryArcView;
  level: number;
  busyKey: string | null;
  onClaim: (stepId: string) => void;
}> = React.memo(({ arc, level, busyKey, onClaim }) => {
  const [open, setOpen] = useState(arc.open && !arc.complete);
  const claimable = arc.open ? arc.claimableIds.length : 0;

  return (
    <section
      data-qa={`story-arc-${arc.id}`}
      data-arc-state={!arc.open ? 'locked' : arc.complete ? 'done' : 'active'}
      className={`rounded-2xl border p-3 transition ${
        arc.complete
          ? 'border-[var(--ui-success)]/40 bg-[var(--ui-success)]/5'
          : arc.open
            ? 'border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel)]/80'
            : 'border-slate-800 bg-[var(--ui-panel-deep)]/60 opacity-80'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-panel-deep)] text-lg">
          {arc.cover}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-extrabold text-slate-100">{arc.title}</span>
            {!arc.open && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            {claimable > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--ui-primary)] px-1.5 text-[10px] font-extrabold text-[var(--ui-panel-deep)]">
                {claimable}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-400">
            {arc.open ? arc.subtitle : `Откроется на ${arc.requiredLevel} уровне · сейчас ${level}`}
          </span>
        </span>
        <span className="shrink-0 text-[10px] font-bold text-slate-400">
          {arc.doneCount}/{arc.steps.length}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && arc.open && (
        <>
          <ul className="mt-2 space-y-2">
            {arc.steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                arc={arc}
                busy={busyKey === `story:${step.id}`}
                onClaim={onClaim}
              />
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
            <Trophy className="h-3 w-3 text-[var(--ui-primary)]" />
            За всю главу:{' '}
            <strong className="font-bold text-slate-200">
              {describeStoryReward(arc.reward, arc.requiredLevel)}
            </strong>
            {arc.bonusPaid && <span className="text-[var(--ui-success)]">· получено</span>}
          </p>
        </>
      )}
    </section>
  );
});
ArcCard.displayName = 'ArcCard';

export const StoryPage: React.FC = () => {
  const { player, story, claimStoryStep, busyKey } = useGame();
  if (!player) return null;

  // Сюжетные вьюхи считаются из серверных фактов и списка забранных шагов.
  const views = useMemo(
    () =>
      buildStoryViews(
        storyFactsFromPlayer(player),
        player.stats.storyClaimed ?? [],
        player.stats.storyChaptersPaid ?? []
      ),
    [player]
  );
  const worldLine = useMemo(() => getStoryWorldLine(views), [views]);
  const closed = views.filter((arc) => arc.complete).length;
  const weekly = getWeeklySlot();
  const upcoming = getUpcomingWeeklyEvent();

  return (
    <div className="space-y-3 pb-4" data-qa="story-page">
      <header className="rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.30)] bg-[var(--ui-panel)]/85 p-3.5">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-[var(--ui-primary)]" />
          <h1 className="font-display text-sm font-extrabold tracking-wide text-slate-100">История</h1>
          <span className="ml-auto text-[10px] font-bold text-slate-400">
            Главы {closed}/{views.length}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300" data-qa="story-world-line">
          {worldLine}
        </p>
        {story && (
          <p className="mt-1 text-[10px] text-[var(--ui-text-muted)]">
            Активная глава: {story.title} · {story.done}/{story.total} шагов
          </p>
        )}
      </header>

      {/* Мир вокруг: что играет в ротации прямо сейчас и что будет дальше. */}
      <section
        className="rounded-2xl border border-slate-800 bg-[var(--ui-panel-deep)]/70 p-3"
        data-qa="story-events"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-200">
          <Sparkles className="h-3.5 w-3.5 text-[var(--ui-primary)]" />
          {weekly.event.emoji} {weekly.event.title}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{weekly.event.showcase}</p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--ui-text-muted)]">
          <Clock3 className="h-3 w-3" /> сейчас · до {formatEventEnd(weekly.endMs)} ·{' '}
          {describeEventModifiers(weekly.event.modifiers) || 'без модификаторов'}
        </p>
        <p className="mt-1.5 border-t border-slate-800 pt-1.5 text-[10px] text-slate-400">
          Дальше ({Math.max(1, Math.round(upcoming.hoursLeft / 24))} дн.): {upcoming.event.emoji}{' '}
          <strong className="font-bold text-slate-200">{upcoming.event.title}</strong> —{' '}
          {describeEventModifiers(upcoming.event.modifiers) || 'без модификаторов'}
        </p>
      </section>

      {views.map((arc) => (
        <ArcCard
          key={arc.id}
          arc={arc}
          level={player.derived.level}
          busyKey={busyKey}
          onClaim={(stepId) => void claimStoryStep(stepId)}
        />
      ))}

      <p className="px-1 text-[10px] leading-relaxed text-[var(--ui-text-muted)]">
        Главы открываются по уровню и не требуют новых механик: шаг закрывает то, что ты и так
        делаешь — контракты, взломы, апгрейды, команду. Награды выдаёт сервер, один раз за шаг.
      </p>
    </div>
  );
};
