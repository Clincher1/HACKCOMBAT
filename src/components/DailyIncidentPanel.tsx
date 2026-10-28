import { CheckCircle2, Flame, Gem, Radio, ShieldCheck, Zap } from 'lucide-react';
import React from 'react';
import { getDailyIncidentDefinition } from '../../shared/incidents.config';
import { useGame } from '../context/GameContext';

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Один короткий серверный выбор в день — без новой валюты и без обязательного гринда. */
export const DailyIncidentPanel: React.FC = () => {
  const { player, busyKey, resolveDailyIncident } = useGame();
  const state = player?.stats.dailyIncident;
  if (!state) return null;

  const incident = getDailyIncidentDefinition(state.incidentKey);
  if (!incident) return null;

  const resolved = Boolean(state.choiceKey);
  const busy = busyKey?.startsWith('daily-incident:') === true;

  return (
    <section
      aria-label="Ежедневный киберинцидент"
      className={`daily-incident-panel rounded-2xl border border-fuchsia-300/30 bg-gradient-to-br from-[#261238] via-[#171535] to-[#10172e] p-3.5 shadow-[0_0_24px_rgba(217,70,239,0.14)]${resolved ? ' daily-incident-panel--resolved' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="daily-incident-panel__signal mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-100 ring-1 ring-fuchsia-200/45">
          <Radio className={`h-4 w-4 ${resolved ? '' : 'animate-pulse motion-reduce:animate-none'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-100">
              {!resolved && <span className="daily-incident-live-dot" aria-hidden="true" />}
              <span>{resolved ? 'ИНЦИДЕНТ ЗАКРЫТ' : 'СИГНАЛ ДНЯ'}</span>
            </div>
            <span className="daily-incident-panel__badge rounded-md bg-fuchsia-300/10 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-50 ring-1 ring-fuchsia-200/35">
              1 выбор · Москва
            </span>
          </div>
          <h2 className="mt-1 font-display text-sm font-extrabold text-white">{incident.title}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{incident.brief}</p>
          <div className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-300/80">{incident.system}</div>
        </div>
      </div>

      {!resolved ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {incident.choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              disabled={busy}
              onClick={() => void resolveDailyIncident(choice.key)}
              className="group rounded-xl border border-fuchsia-200/20 bg-[#0a0e1a]/55 p-2.5 text-left transition hover:border-fuchsia-200/55 hover:bg-fuchsia-300/10 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="flex items-start gap-2">
                <span className="text-base leading-none" aria-hidden="true">{choice.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-white group-hover:text-fuchsia-100">{choice.title}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{choice.description}</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-950/20 p-2.5">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white">Решение сохранено до следующего дня</div>
              <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/80">
                {state.outcome?.summary ?? 'Сервер зафиксировал твой протокол.'}
              </p>
              {state.outcome && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                  {state.outcome.data > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-cyan-300/10 px-1.5 py-1 text-cyan-100">
                      <Zap className="h-3 w-3" /> +{state.outcome.data.toLocaleString('ru-RU')} Data
                    </span>
                  )}
                  {state.outcome.crypto > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-300/10 px-1.5 py-1 text-violet-100">
                      <Gem className="h-3 w-3" /> +{state.outcome.crypto} Crypto
                    </span>
                  )}
                  {state.outcome.rep !== 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-300/10 px-1.5 py-1 text-emerald-100">
                      <ShieldCheck className="h-3 w-3" /> {signed(state.outcome.rep)} Rep
                    </span>
                  )}
                  {state.outcome.heat !== 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-300/10 px-1.5 py-1 text-rose-100">
                      <Flame className="h-3 w-3" /> {signed(state.outcome.heat)} Heat
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 text-[10px] text-slate-500">
        Сервер выдаёт один сценарий в сутки. Выбор нельзя переиграть или получить повторно.
      </div>
    </section>
  );
};
