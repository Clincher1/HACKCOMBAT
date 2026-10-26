import { CalendarDays, CheckCircle2, Globe2, Gift, LockKeyhole } from 'lucide-react';
import React from 'react';
import { getProfileFrame } from '../../shared/profileFrames.config';
import {
  ACTIVE_SEASON_EVENT,
  getSeasonWeekWindow,
  isSeasonEventLive,
} from '../../shared/seasonalEvent.config';
import type { SeasonEventState } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCountdown } from '../lib/format';

interface SeasonEventPanelProps {
  state?: SeasonEventState;
}

/** Семидневная косметическая операция: личные цели, без новой игровой валюты. */
export const SeasonEventPanel: React.FC<SeasonEventPanelProps> = ({ state }) => {
  const { nowMs, busyKey, claimSeasonEvent } = useGame();
  if (!state || !isSeasonEventLive(nowMs)) return null;

  const window = getSeasonWeekWindow(nowMs);
  const secondsToEnd = Math.max(0, (window.endMs - nowMs) / 1000);
  const participationFrame = getProfileFrame(ACTIVE_SEASON_EVENT.participationFrameKey);
  const masteryFrame = getProfileFrame(ACTIVE_SEASON_EVENT.masteryFrameKey);
  const allComplete = ACTIVE_SEASON_EVENT.goals.every(
    (goal) => (state.progress[goal.key] ?? 0) >= goal.target
  );
  const hasParticipation = ACTIVE_SEASON_EVENT.goals.some(
    (goal) => (state.progress[goal.key] ?? 0) > 0
  );

  return (
    <section
      aria-label="Сезонная операция"
      className="rounded-2xl bg-gradient-to-br from-indigo-950/45 via-[#171535] to-[#10172e] border border-indigo-400/40 p-3.5 shadow-[0_0_24px_rgba(99,102,241,0.12)]"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-400/14 text-indigo-300">
          <Globe2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-300">
              🌍 Сезонная операция · Neon Relay
            </div>
            <span className="shrink-0 rounded-md bg-indigo-400/12 px-1.5 py-0.5 text-[10px] font-bold text-indigo-200">
              7 дней
            </span>
          </div>
          <h2 className="mt-0.5 font-display text-sm font-extrabold text-white">
            {ACTIVE_SEASON_EVENT.subtitle}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
            {ACTIVE_SEASON_EVENT.description} Все награды — только оформление профиля.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {ACTIVE_SEASON_EVENT.goals.map((goal) => {
          const progress = Math.min(goal.target, state.progress[goal.key] ?? 0);
          const done = progress >= goal.target;
          return (
            <div key={goal.key} className={`rounded-xl border p-2.5 ${done ? 'border-[#7dff00]/40 bg-[#7dff00]/7' : 'border-slate-700/80 bg-[#0a0e1a]/45'}`}>
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
                <div className={`h-full rounded-full transition-all ${done ? 'bg-[#7dff00]' : 'bg-indigo-400'}`} style={{ width: `${Math.round((progress / goal.target) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <RewardButton
          frame={participationFrame}
          ready={hasParticipation}
          claimed={state.participationClaimed}
          busy={busyKey === 'season-event:claim_participation'}
          label="Рамка участника"
          onClick={() => void claimSeasonEvent('claim_participation')}
        />
        <RewardButton
          frame={masteryFrame}
          ready={allComplete}
          claimed={state.masteryClaimed}
          busy={busyKey === 'season-event:claim_mastery'}
          label="Рамка мастера"
          onClick={() => void claimSeasonEvent('claim_mastery')}
        />
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-500">
        <CalendarDays className="h-3 w-3" />
        <span>До конца недели</span>
        <span className="font-bold text-slate-300">{formatCountdown(secondsToEnd)}</span>
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
  onClick: () => void;
}> = ({ frame, ready, claimed, busy, label, onClick }) => (
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
      {claimed ? 'Получено и включено' : ready ? 'Забрать косметическую награду' : 'Цель ещё не готова'}
    </div>
  </button>
);
