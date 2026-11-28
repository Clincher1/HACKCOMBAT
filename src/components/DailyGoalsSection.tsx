import { Crosshair, Database, FileText, Flame, Package, Target, Zap } from 'lucide-react';
import React from 'react';
import {
  describeDailyGoal,
  getDailyGoalChips,
  getDailyGoalDefinition,
  DAILY_GOAL_CRYPTO_REWARD,
  DAILY_GOALS_PER_DAY,
  type DailyGoalKind,
} from '../../shared/dailyGoals.config';
import type { DailyGoalState, DailyGoalsState } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCountdown } from '../lib/format';

/**
 * «Цели дня» (v1.6) на экране «Задания».
 *
 * Три карточки, один визуальный язык с остальными заданиями, но своя петля:
 *   • прогресс и таргет приходят ГОТОВЫМИ с сервера — компонент ничего не
 *     досчитывает, поэтому «оптимистичного» прогресса здесь нет by design;
 *   • кнопка «Забрать» активна только при 100% и только пока цель не забрана;
 *   • награда за полный сбор (предмет) не анонсируется заранее: сервер решает
 *     редкость и ключ в момент третьего сбора, клиент показывает уже факт.
 *
 * Экран заданий — ленивый чанк, поэтому этот файл не влияет на стартовый
 * payload, но цвета берём только из токенов темы (index.css).
 */

const GOAL_ICONS: Record<DailyGoalKind, React.ComponentType<{ className?: string }>> = {
  taps: Flame,
  hacks: Crosshair,
  contracts: FileText,
  cpu: Zap,
  data: Database,
  item_use: Package,
};

/** Тикает раз в секунду, но перерисовывает только себя — секция мемоизирована. */
const GoalsResetNote: React.FC = () => {
  const { nowMs } = useGame();
  const nextUtcMidnight = Math.floor(nowMs / 86_400_000) * 86_400_000 + 86_400_000;
  const seconds = Math.max(0, (nextUtcMidnight - nowMs) / 1000);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ui-text-muted)]">
      Новая тройка через{' '}
      <strong className="font-num font-bold text-slate-300">{formatCountdown(seconds)}</strong>
    </span>
  );
};

const GoalCard = React.memo(function GoalCard({
  goal,
  index,
  pending,
  onClaim,
}: {
  goal: DailyGoalState;
  index: number;
  pending: boolean;
  onClaim: (index: number) => void;
}) {
  const definition = getDailyGoalDefinition(goal.key);
  const Icon = GOAL_ICONS[goal.key] ?? Target;
  const ready = goal.progress >= goal.target;
  const claimed = goal.claimed;
  const ratio = goal.target > 0 ? Math.min(1, Math.max(0, goal.progress / goal.target)) : 0;
  const chips = getDailyGoalChips(goal.key);

  const cardTone = claimed
    ? 'border-emerald-400/25 bg-emerald-950/15'
    : ready
      ? 'border-[rgba(var(--ui-success-rgb),0.6)] bg-[rgba(var(--ui-success-rgb),0.08)]'
      : goal.progress > 0
        ? 'border-[rgba(var(--ui-primary-rgb),0.4)] bg-[var(--ui-panel-deep)]/55'
        : 'border-slate-700/70 bg-[var(--ui-panel-deep)]/45';

  return (
    <article
      data-qa={`daily-goal-${goal.key}`}
      data-status={claimed ? 'closed' : ready ? 'ready' : goal.progress > 0 ? 'active' : 'available'}
      className={`rounded-xl border p-3 transition-[border-color,background-color] duration-150 ${cardTone}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[rgba(var(--ui-primary-rgb),0.14)] text-[var(--ui-primary)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13px] font-bold leading-snug text-white">
              {definition?.title ?? goal.key}
            </h3>
            <span className="shrink-0 rounded-md bg-[rgba(var(--ui-secondary-rgb),0.14)] px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-[var(--ui-secondary)]">
              +{chips} Чип · +{DAILY_GOAL_CRYPTO_REWARD} Cr
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
            {describeDailyGoal(goal.key, goal.target)}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--ui-track)]">
          <div
            className={`h-full w-full origin-left rounded-full ${
              claimed || ready ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-primary)]'
            }`}
            style={{ transform: `scaleX(${claimed ? 1 : ratio})`, transition: 'transform 200ms ease-out' }}
          />
        </div>
        <span className="shrink-0 font-num text-[11px] font-bold text-slate-300">
          {goal.progress.toLocaleString('ru-RU')}/{goal.target.toLocaleString('ru-RU')}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
            claimed
              ? 'bg-emerald-500/12 text-emerald-300'
              : ready
                ? 'bg-[rgba(var(--ui-success-rgb),0.18)] text-[var(--ui-success)]'
                : 'bg-slate-800/70 text-slate-400'
          }`}
        >
          <span className="truncate">
            {claimed ? 'Получено' : pending ? 'Забираем…' : ready ? 'Готово к сбору' : 'В процессе'}
          </span>
        </span>

        <button
          type="button"
          data-qa={`daily-claim-${goal.key}`}
          disabled={!ready || claimed || pending}
          aria-disabled={!ready || claimed || pending}
          onClick={() => onClaim(index)}
          className={`inline-flex min-h-[44px] min-w-[92px] items-center justify-center gap-1 rounded-lg px-3 text-[11px] font-extrabold transition-transform duration-150 ${
            ready && !claimed && !pending
              ? 'bg-[var(--ui-success)] text-[var(--ui-on-primary)] active:scale-[0.97] cursor-pointer'
              : claimed
                ? 'bg-emerald-950/40 text-emerald-300'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {claimed ? 'Получено' : ready ? 'Забрать' : `${Math.round(ratio * 100)}%`}
        </button>
      </div>
    </article>
  );
});

interface DailyGoalsSectionProps {
  state: DailyGoalsState | undefined;
  pendingClaims: ReadonlySet<string>;
  onClaim: (goalIndex: number) => void;
}

const DailyGoalsSectionBase: React.FC<DailyGoalsSectionProps> = ({
  state,
  pendingClaims,
  onClaim,
}) => {
  const goals = state?.goals ?? [];
  const claimed = goals.filter((goal) => goal.claimed).length;

  return (
    <section aria-label="Цели дня" data-qa="daily-goals" className="space-y-2">
      <header className="flex items-start gap-2.5 px-0.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--ui-secondary-rgb),0.14)] text-[var(--ui-secondary)]">
          <Target className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-[16px] font-extrabold text-white">Цели дня</h2>
            {goals.length > 0 && (
              <span className="shrink-0 rounded-md bg-[var(--ui-panel-deep)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-300">
                {claimed}/{DAILY_GOALS_PER_DAY}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ui-text-muted)]">
            Три цели на сутки. За каждую — Чипы и Crypto, за все три — гарантированный предмет.
          </p>
        </div>
      </header>

      {goals.length === 0 ? (
        <div className="rounded-xl border border-slate-700/60 bg-[var(--ui-panel-deep)]/40 px-3 py-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Доска целей ещё не пришла с сервера — она появится при следующей синхронизации.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((goal, index) => (
            <GoalCard
              key={goal.key}
              goal={goal}
              index={index}
              pending={pendingClaims.has(`daily-goal:${index}`)}
              onClaim={onClaim}
            />
          ))}
        </div>
      )}

      {goals.length > 0 && (
        <div className="flex justify-end pr-0.5">
          <GoalsResetNote />
        </div>
      )}
    </section>
  );
};

export const DailyGoalsSection = React.memo(DailyGoalsSectionBase);
DailyGoalsSection.displayName = 'DailyGoalsSection';
