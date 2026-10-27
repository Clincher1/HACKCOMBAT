import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Gift,
  Globe2,
  LockKeyhole,
  Radio,
} from 'lucide-react';
import React from 'react';
import { getProfileFrame } from '../../shared/profileFrames.config';
import {
  ACTIVE_SEASON_EVENT,
  SEASON_EVENT_LAUNCH_AT_ISO,
  getSeasonEventWindow,
  isSeasonEventLive,
} from '../../shared/seasonalEvent.config';
import type { SeasonEventState } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCountdown } from '../lib/format';

interface SeasonEventPanelProps {
  state?: SeasonEventState;
}

/** Семидневный игровой ивент: личные цели, сценарий и только косметические награды. */
export const SeasonEventPanel: React.FC<SeasonEventPanelProps> = ({ state }) => {
  const { nowMs, busyKey, claimSeasonEvent } = useGame();
  const live = isSeasonEventLive(nowMs);
  const launchMs = Date.parse(SEASON_EVENT_LAUNCH_AT_ISO);
  const upcoming = !live && !state && Number.isFinite(launchMs) && nowMs < launchMs;
  if (!live && !upcoming) return null;

  const window = getSeasonEventWindow(nowMs);
  const eventState: SeasonEventState = state ?? {
    eventKey: ACTIVE_SEASON_EVENT.key,
    weekKey: window.weekKey,
    progress: Object.fromEntries(ACTIVE_SEASON_EVENT.goals.map((goal) => [goal.key, 0])),
    participationClaimed: false,
    masteryClaimed: false,
  };
  const secondsToWindow = Math.max(0, ((live ? window.endMs : launchMs) - nowMs) / 1000);
  const participationFrame = getProfileFrame(ACTIVE_SEASON_EVENT.participationFrameKey);
  const masteryFrame = getProfileFrame(ACTIVE_SEASON_EVENT.masteryFrameKey);
  const allComplete = ACTIVE_SEASON_EVENT.goals.every(
    (goal) => (eventState.progress[goal.key] ?? 0) >= goal.target
  );
  // Обе рамки выдаются только после полного закрытия всех трёх целей.
  const eventCompleted = allComplete;

  return (
    <section
      aria-label="Игровой ивент"
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
              <span>{live ? 'ИВЕНТ В ИГРЕ' : 'СКОРО В ИГРЕ'}</span>
            </div>
            <span className="shrink-0 rounded-md bg-amber-300/15 px-1.5 py-0.5 text-[10px] font-black text-amber-100 ring-1 ring-amber-200/25">
              7 ДНЕЙ
            </span>
          </div>
          <h2 className="mt-1 font-display text-sm font-extrabold text-white">
            {ACTIVE_SEASON_EVENT.title}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
            {ACTIVE_SEASON_EVENT.subtitle} Все награды — только оформление профиля.
          </p>
          {upcoming && (
            <p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/8 px-2 py-1.5 text-[10px] font-semibold leading-relaxed text-amber-100">
              Старт 27 октября в 09:00 по Москве. Сейчас это анонс: прогресс начнёт считаться после старта ивента.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {ACTIVE_SEASON_EVENT.goals.map((goal) => {
          const progress = Math.min(goal.target, eventState.progress[goal.key] ?? 0);
          const done = progress >= goal.target;
          return (
            <div
              key={goal.key}
              className={`rounded-xl border p-2.5 ${done ? 'border-[#7dff00]/40 bg-[#7dff00]/7' : 'border-slate-700/80 bg-[#0a0e1a]/45'}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base leading-none" aria-hidden="true">{goal.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{goal.title}</span>
                    <span className={`text-[10px] font-bold ${done ? 'text-[#7dff00]' : 'text-slate-400'}`}>
                      {progress.toLocaleString('ru-RU')}/{goal.target.toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{goal.description}</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${done ? 'bg-[#7dff00]' : 'bg-indigo-400'}`}
                  style={{ width: `${Math.round((progress / goal.target) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <details className="group mt-3 rounded-xl border border-indigo-300/20 bg-[#0a0e1a]/35" open={upcoming}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-indigo-200">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          Сценарий операции · 7 шагов
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
        <RewardButton
          frame={participationFrame}
          ready={live && eventCompleted}
          claimed={eventState.participationClaimed}
          busy={busyKey === 'season-event:claim_participation'}
          label="Рамка участника"
          lockedLabel={upcoming ? 'Откроется после старта ивента' : 'Закрой все три цели операции'}
          onClick={() => void claimSeasonEvent('claim_participation')}
        />
        <RewardButton
          frame={masteryFrame}
          ready={live && eventCompleted}
          claimed={eventState.masteryClaimed}
          busy={busyKey === 'season-event:claim_mastery'}
          label="Рамка мастера"
          lockedLabel={upcoming ? 'Станет доступна после закрытия всех целей' : 'Закрой все три цели операции'}
          onClick={() => void claimSeasonEvent('claim_mastery')}
        />
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-500">
        <CalendarDays className="h-3 w-3" />
        <span>{live ? 'До конца ивента' : 'До старта'}</span>
        <span className="font-bold text-slate-300">{formatCountdown(secondsToWindow)}</span>
        <span>· Москва</span>
      </div>
    </section>
  );
};

const RewardButton: React.FC<{
  frame: ReturnType<typeof getProfileFrame>;
  ready: boolean;
  claimed: boolean;
  busy: boolean;
  label: string;
  lockedLabel?: string;
  onClick: () => void;
}> = ({ frame, ready, claimed, busy, label, lockedLabel, onClick }) => (
  <button
    type="button"
    disabled={!ready || claimed || busy}
    onClick={onClick}
    className={`rounded-xl border p-2.5 text-left transition ${
      claimed
        ? 'cursor-default border-emerald-400/35 bg-emerald-950/20'
        : ready
          ? 'cursor-pointer border-amber-300/50 bg-amber-400/8 hover:bg-amber-400/14'
          : 'cursor-not-allowed border-slate-800 bg-[#0a0e1a]/35 opacity-70'
    }`}
  >
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 text-xs font-black"
        style={{ borderColor: frame.accent, background: frame.background, boxShadow: frame.glow }}
      >
        ✦
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
        <span className="block truncate text-xs font-bold text-white">{frame.name}</span>
      </span>
      {claimed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> : ready ? <Gift className="h-4 w-4 shrink-0 text-amber-300" /> : <LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" />}
    </div>
    <div className={`mt-1 text-[10px] ${claimed ? 'text-emerald-300' : ready ? 'text-amber-200' : 'text-slate-500'}`}>
      {claimed ? 'Получено и включено' : ready ? 'Забрать косметическую награду' : lockedLabel ?? 'Цель ещё не готова'}
    </div>
  </button>
);
