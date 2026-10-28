import { CalendarDays, CheckCircle2, Gift, LockKeyhole, X } from 'lucide-react';
import React from 'react';
import { getDailyTaskDefinition } from '../../shared/dailyTasks.config';
import { getGameDayBoundsMs } from '../../shared/mechanics';
import type { DailyTaskState } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCountdown } from '../lib/format';

interface DailyTasksPanelProps {
  state?: DailyTaskState;
}

/** Небольшой ежедневный слой над главой: только текущие поручения и только XP. */
export const DailyTasksPanel: React.FC<DailyTasksPanelProps> = ({ state }) => {
  const { player, nowMs, busyKey, claimDailyTask } = useGame();
  const dismissStorageKey = player && state
    ? `hk:daily-tasks:dismissed:${player.tgId}:${state.dayKey}`
    : null;
  const [dismissedDayKey, setDismissedDayKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dismissStorageKey) {
      setDismissedDayKey(null);
      return;
    }
    try {
      setDismissedDayKey(
        window.localStorage.getItem(dismissStorageKey) === '1' ? state?.dayKey ?? null : null
      );
    } catch {
      // Если Telegram/WebView запретил localStorage, закрытие всё равно
      // работает до перерендера текущей сессии.
      setDismissedDayKey(null);
    }
  }, [dismissStorageKey, state?.dayKey]);

  if (!state) return null;

  const tasks = state.taskKeys
    .map((key) => getDailyTaskDefinition(key))
    .filter((task): task is NonNullable<typeof task> => Boolean(task));
  if (tasks.length === 0) return null;

  const resetAt = getGameDayBoundsMs(state.dayKey).end;
  const secondsToReset = Math.max(0, (resetAt - nowMs) / 1000);
  const completedCount = tasks.filter((task) => state.claimed.includes(task.key)).length;
  const allClaimed = completedCount === tasks.length;
  if (allClaimed && dismissedDayKey === state.dayKey) return null;

  const dismissCompletedTasks = () => {
    if (!allClaimed) return;
    setDismissedDayKey(state.dayKey);
    if (dismissStorageKey) {
      try {
        window.localStorage.setItem(dismissStorageKey, '1');
      } catch {
        // UI-only preference: server progress and XP are already saved.
      }
    }
  };

  return (
    <section
      aria-label="Ежедневные поручения"
      className="rounded-2xl bg-gradient-to-br from-cyan-950/35 via-[#111a31] to-[#10172e] border border-[#00f0ff]/35 p-3.5 shadow-[0_0_22px_rgba(0,240,255,0.08)]"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#00f0ff]/12 text-[#00f0ff]">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#00f0ff]">
              📅 Ежедневные поручения
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-md bg-[#00f0ff]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8ffaff]">
                {completedCount}/{tasks.length}
              </span>
              {allClaimed && (
                <button
                  type="button"
                  onClick={dismissCompletedTasks}
                  aria-label="Скрыть выполненные поручения до следующего дня"
                  title="Скрыть выполненные поручения до следующего дня"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-600/80 text-slate-400 transition hover:border-[#00f0ff]/55 hover:bg-[#00f0ff]/10 hover:text-[#8ffaff]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
            Три маленьких дела на сегодня. Награда — только опыт, без влияния на Data и баланс контрактов.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {tasks.map((task) => {
          const progress = Math.min(task.target, state.progress[task.key] ?? 0);
          const claimed = state.claimed.includes(task.key);
          const ready = progress >= task.target;
          const actionBusy = busyKey === `daily-task:claim:${task.key}`;
          const progressPercent = Math.round((progress / task.target) * 100);

          return (
            <div
              key={task.key}
              className={`rounded-xl border p-2.5 ${
                claimed
                  ? 'border-emerald-400/30 bg-emerald-950/20'
                  : ready
                    ? 'border-[#7dff00]/55 bg-[#7dff00]/8 shadow-[0_0_14px_rgba(125,255,0,0.08)]'
                    : 'border-slate-700/80 bg-[#0a0e1a]/45'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-base leading-none" aria-hidden="true">
                  {task.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-white">{task.title}</div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
                      <Gift className="h-3 w-3" />+{task.rewardXp} XP
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{task.description}</p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      claimed ? 'bg-emerald-400' : ready ? 'bg-[#7dff00]' : 'bg-[#00f0ff]'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-bold text-slate-300">
                  {progress.toLocaleString('ru-RU')}/{task.target.toLocaleString('ru-RU')}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-[10px] ${claimed ? 'text-emerald-300' : ready ? 'text-[#7dff00]' : 'text-slate-500'}`}>
                  {claimed ? (
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Получено</span>
                  ) : ready ? (
                    'Готово к получению'
                  ) : (
                    'Выполняется'
                  )}
                </span>
                <button
                  type="button"
                  disabled={!ready || claimed || actionBusy}
                  onClick={() => void claimDailyTask(task.key)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold transition ${
                    claimed
                      ? 'cursor-default bg-emerald-950/40 text-emerald-300'
                      : ready
                        ? 'cursor-pointer bg-[#7dff00] text-[#071005] hover:bg-[#a6ff66]'
                        : 'cursor-not-allowed bg-slate-800 text-slate-500'
                  }`}
                >
                  {claimed ? <CheckCircle2 className="h-3 w-3" /> : ready ? <Gift className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}
                  {claimed ? 'Получено' : ready ? 'Забрать' : 'Не готово'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-500">
        <span>Новый набор через</span>
        <span className="font-bold text-slate-300">{formatCountdown(secondsToReset)}</span>
        <span>· Москва</span>
      </div>
    </section>
  );
};
