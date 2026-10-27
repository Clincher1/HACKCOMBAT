import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Crown,
  Globe2,
  LockKeyhole,
  Radio,
} from 'lucide-react';
import React from 'react';
import { getProfileFrame } from '../../shared/profileFrames.config';
import {
  ACTIVE_SEASON_EVENT,
  SEASON_EVENT_DAY_COUNT,
  SEASON_EVENT_LAUNCH_AT_ISO,
  SEASON_EVENT_TASKS_PER_DAY,
  getSeasonEventDayNumber,
  getSeasonEventWindow,
  isSeasonEventLive,
} from '../../shared/seasonalEvent.config';
import type { SeasonEventState } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCountdown } from '../lib/format';

interface SeasonEventPanelProps {
  state?: SeasonEventState;
}

const EMPTY_EVENT_STATE = (weekKey: string): SeasonEventState => ({
  version: 2,
  eventKey: ACTIVE_SEASON_EVENT.key,
  weekKey,
  currentDay: 1,
  days: {},
  completedDays: [],
  participationClaimed: false,
  masteryClaimed: false,
});

/** Семь календарных дней Neon Relay: серверный набор из трёх задач на день. */
export const SeasonEventPanel: React.FC<SeasonEventPanelProps> = ({ state }) => {
  const { nowMs } = useGame();
  const live = isSeasonEventLive(nowMs);
  const launchMs = Date.parse(SEASON_EVENT_LAUNCH_AT_ISO);
  const window = getSeasonEventWindow(nowMs);
  const upcoming = !live && !state && Number.isFinite(launchMs) && nowMs < launchMs;
  const ended = !live && Boolean(state) && nowMs >= window.endMs;
  if (!live && !upcoming && !ended) return null;

  const eventState = state ?? EMPTY_EVENT_STATE(window.weekKey);
  const calendarDay = live ? getSeasonEventDayNumber(nowMs) : eventState.currentDay;
  const currentDay = Math.max(1, Math.min(SEASON_EVENT_DAY_COUNT, calendarDay || 1));
  const dayState = eventState.days[String(currentDay)];
  const secondsToWindow = Math.max(0, ((live ? window.endMs : launchMs) - nowMs) / 1000);
  const participationFrame = getProfileFrame(ACTIVE_SEASON_EVENT.participationFrameKey);
  const masteryFrame = getProfileFrame(ACTIVE_SEASON_EVENT.masteryFrameKey);
  const completedDays = new Set(eventState.completedDays);

  return (
    <section
      aria-label="Игровой ивент Neon Relay"
      className="rounded-2xl border border-indigo-300/60 bg-gradient-to-br from-indigo-950/65 via-[#171535] to-[#10172e] p-3.5 shadow-[0_0_28px_rgba(99,102,241,0.24)] ring-1 ring-amber-300/20"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-400/20 text-indigo-200 ring-1 ring-indigo-200/25">
          <Globe2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">
              <Radio className={`h-3 w-3 ${live ? 'animate-pulse text-[#7dff00]' : 'text-amber-300'}`} />
              <span>{live ? 'ИВЕНТ В ИГРЕ' : upcoming ? 'СКОРО В ИГРЕ' : 'ИВЕНТ ЗАВЕРШЁН'}</span>
            </div>
            <span className="shrink-0 rounded-md bg-amber-300/15 px-1.5 py-0.5 text-[10px] font-black text-amber-100 ring-1 ring-amber-200/25">
              7 ДНЕЙ · 3 ЗАДАНИЯ В ДЕНЬ
            </span>
          </div>
          <h2 className="mt-1 font-display text-sm font-extrabold text-white">
            {ACTIVE_SEASON_EVENT.title}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
            {ACTIVE_SEASON_EVENT.subtitle} Сложность тройки фиксируется по уровню игрока в момент выдачи дня.
          </p>
          {upcoming && (
            <p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/8 px-2 py-1.5 text-[10px] font-semibold leading-relaxed text-amber-100">
              Старт 27 октября в 09:00 по Москве. До старта дневные задания не создаются.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-indigo-300/20 bg-[#0a0e1a]/45 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-200">Недельный маршрут</div>
            <div className="mt-0.5 text-xs font-bold text-white">
              Пройдено дней: {eventState.completedDays.length}/{SEASON_EVENT_DAY_COUNT}
            </div>
          </div>
          <span className="text-[10px] font-semibold text-slate-400">
            {live ? `Сегодня день ${currentDay}` : ended ? 'Награды сохранены навсегда' : 'Дни появятся после старта'}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5" aria-label="Прогресс семи календарных дней">
          {Array.from({ length: SEASON_EVENT_DAY_COUNT }, (_, index) => {
            const day = index + 1;
            const complete = completedDays.has(day);
            const active = live && day === currentDay;
            const missed = live && day < currentDay && !complete;
            return (
              <div
                key={day}
                title={`День ${day}`}
                className={`rounded-lg border px-1 py-1.5 text-center ${
                  complete
                    ? 'border-[#7dff00]/45 bg-[#7dff00]/10 text-[#b8ff7a]'
                    : active
                      ? 'border-cyan-300/55 bg-cyan-300/10 text-cyan-100'
                      : missed
                        ? 'border-rose-300/25 bg-rose-400/5 text-rose-200'
                        : 'border-slate-700/80 bg-slate-900/45 text-slate-500'
                }`}
              >
                <div className="text-[9px] font-black">Д{day}</div>
                <div className="mt-0.5 flex justify-center">
                  {complete ? <Check className="h-3 w-3" /> : active ? <Clock3 className="h-3 w-3" /> : missed ? <Circle className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}
                </div>
              </div>
            );
          })}
        </div>
        {live && dayState && (
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            День {currentDay} выдан на уровне {dayState.levelAtGeneration}. Перезагрузка не меняет этот набор.
          </p>
        )}
        {live && !dayState && (
          <p className="mt-2 text-[10px] leading-relaxed text-amber-200">Синхронизируем сегодняшнюю тройку с сервером…</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{dayState ? `Задания дня ${currentDay}` : 'Дневные задания'}</span>
        </div>
        <span className="text-[10px] font-bold text-slate-500">ровно {SEASON_EVENT_TASKS_PER_DAY} новых</span>
      </div>

      <div className="mt-2 space-y-2">
        {dayState ? (
          dayState.tasks.map((task) => {
            const progress = Math.min(task.target, dayState.progress[task.key] ?? 0);
            const done = progress >= task.target;
            return (
              <div
                key={task.key}
                className={`rounded-xl border p-2.5 ${done ? 'border-[#7dff00]/40 bg-[#7dff00]/7' : 'border-slate-700/80 bg-[#0a0e1a]/45'}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none" aria-hidden="true">{task.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-white">{task.title}</span>
                      <span className={`shrink-0 text-[10px] font-bold ${done ? 'text-[#7dff00]' : 'text-slate-400'}`}>
                        {progress.toLocaleString('ru-RU')}/{task.target.toLocaleString('ru-RU')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{task.description}</p>
                  </div>
                  {done && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7dff00]" />}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${done ? 'bg-[#7dff00]' : 'bg-cyan-400'}`}
                    style={{ width: `${Math.round((progress / task.target) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-slate-800 bg-[#0a0e1a]/35 px-3 py-3 text-[11px] leading-relaxed text-slate-400">
            После старта сервер выдаст ровно три задания. Они будут обновлены только при переходе на новый календарный день.
          </div>
        )}
      </div>

      {dayState?.completed && (
        <div className="mt-2 rounded-lg border border-[#7dff00]/25 bg-[#7dff00]/8 px-2.5 py-2 text-[10px] font-semibold text-[#d7ffc0]">
          Все 3 задания дня закрыты. День засчитан, а голубая рамка уже сохранена в коллекции.
        </div>
      )}

      <details className="group mt-3 rounded-xl border border-indigo-300/20 bg-[#0a0e1a]/35" open={upcoming}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-indigo-200">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          Сценарий · 7 календарных дней
        </summary>
        <div className="grid gap-1.5 border-t border-indigo-300/15 p-2 sm:grid-cols-2">
          {ACTIVE_SEASON_EVENT.scenarios.map((scenario) => (
            <div key={scenario.day} className="rounded-lg bg-[#10172e]/80 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black text-amber-300">ДЕНЬ {scenario.day}</span>
                <span className="truncate text-[10px] font-bold text-white">{scenario.title}</span>
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{scenario.description}</p>
              <span className="text-[9px] font-semibold text-indigo-300">{scenario.system}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <RewardCard
          frame={participationFrame}
          unlocked={eventState.participationClaimed}
          label="После первого дня"
          lockedLabel="Закрой все 3 задания любого дня"
        />
        <RewardCard
          frame={masteryFrame}
          unlocked={eventState.masteryClaimed}
          label="За полный Neon Relay"
          lockedLabel="Закрой все 7 дней целиком"
          master
        />
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-500">
        <CalendarDays className="h-3 w-3" />
        <span>{live ? 'До конца ивента' : upcoming ? 'До старта' : 'Коллекция сохранена'}</span>
        {live || upcoming ? <span className="font-bold text-slate-300">{formatCountdown(secondsToWindow)}</span> : null}
        <span>· Москва</span>
      </div>
    </section>
  );
};

const RewardCard: React.FC<{
  frame: ReturnType<typeof getProfileFrame>;
  unlocked: boolean;
  label: string;
  lockedLabel: string;
  master?: boolean;
}> = ({ frame, unlocked, label, lockedLabel, master = false }) => (
  <div
    className={`rounded-xl border p-2.5 ${
      unlocked ? 'border-emerald-400/35 bg-emerald-950/20' : 'border-slate-800 bg-[#0a0e1a]/35 opacity-80'
    }`}
  >
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 text-xs font-black"
        style={{ borderColor: frame.accent, background: frame.background, boxShadow: frame.glow }}
      >
        {master ? <Crown className="h-4 w-4" /> : '✦'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
        <span className="block truncate text-xs font-bold text-white">{frame.name}</span>
      </span>
      {unlocked ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> : <LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" />}
    </div>
    <div className={`mt-1 text-[10px] ${unlocked ? 'text-emerald-300' : 'text-slate-500'}`}>
      {unlocked ? 'Получено навсегда · применить можно в Профиле' : lockedLabel}
    </div>
  </div>
);
