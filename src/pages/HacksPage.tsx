import { CheckCircle2, Clock, Flame, Gem, Lock, RefreshCw, Shield } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import type { MissionTargetType } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCompact, formatCountdown } from '../lib/format';

type FilterType = 'all' | MissionTargetType;

const TYPE_META: Record<
  MissionTargetType,
  { badge: string; dot: string; border: string; bg: string }
> = {
  bad: {
    badge: '🔴 Bad site (+Rep, 0 Heat)',
    dot: 'text-emerald-300',
    border: 'border-[#00f0ff]/35',
    bg: 'bg-[#00f0ff]/10 text-[#00f0ff]',
  },
  good: {
    badge: '🟢 Good site (+++Data, +Heat)',
    dot: 'text-rose-300',
    border: 'border-[#ff00a0]/35',
    bg: 'bg-[#ff00a0]/12 text-[#ff00a0]',
  },
  neutral: {
    badge: '⚪ Neutral (+Data)',
    dot: 'text-slate-300',
    border: 'border-slate-700',
    bg: 'bg-slate-800 text-slate-300',
  },
  grey: {
    badge: '🟣 Grey Ops (+Data, +Rep, 💎)',
    dot: 'text-purple-300',
    border: 'border-purple-500/45',
    bg: 'bg-purple-500/15 text-purple-300',
  },
};

export const HacksPage: React.FC = () => {
  const {
    player,
    nowMs,
    startMission,
    claimMission,
    skipMission,
    refreshMissions,
    busyKey,
  } = useGame();
  const [filter, setFilter] = useState<FilterType>('all');

  if (!player) return null;

  const { derived } = player;
  const refreshLeftSec = Math.max(
    0,
    15 * 60 - Math.floor((nowMs - new Date(player.missionsRefreshedAt).getTime()) / 1000)
  );

  // Показываем миссии из текущей 15-минутной выборки (или все открытые при переключении фильтра)
  const visibleMissions = MISSIONS_CONFIG.filter((m) => {
    if (m.targetType === 'grey' && !derived.unlockedGreyMissions) return false;
    if (filter !== 'all' && m.targetType !== filter) return false;
    if (filter === 'all') {
      return player.availableMissionKeys.includes(m.key);
    }
    return true;
  });

  const levelScale = 1 + (derived.level - 1) * 0.22;

  return (
    <div className="space-y-3.5 pb-4">
      {/* Верхняя панель слотов и 15-минутного обновления */}
      <div className="rounded-2xl bg-[#10172e] border border-[#00f0ff]/25 p-3.5 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-extrabold text-white">
            Активные слоты: {player.activeMissions.length} / {derived.missionSlots}
            {derived.missionSlots < 3 && (
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                (3 слота с 20 ур.)
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-[#00f0ff]" />
            <span>Автообновление целей: {formatCountdown(refreshLeftSec)}</span>
          </div>
        </div>

        <button
          type="button"
          disabled={busyKey === 'mission:refresh'}
          onClick={() => void refreshMissions()}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#162244] hover:bg-[#1f305e] border border-[#00f0ff]/35 text-xs font-bold text-[#00f0ff] transition cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${busyKey === 'mission:refresh' ? 'animate-spin' : ''}`}
          />
          <span>Обновить</span>
        </button>
      </div>

      {/* Секция текущих запущенных миссий с живыми прогресс-барами */}
      {player.activeMissions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-[#7dff00] px-1">⚡ В процессе взлома</div>
          {player.activeMissions.map((active) => {
            const startMs = new Date(active.startedAt).getTime();
            const finishMs = new Date(active.finishAt).getTime();
            const totalMs = Math.max(1000, finishMs - startMs);
            const pct = Math.min(100, Math.max(0, ((nowMs - startMs) / totalMs) * 100));
            const remSec = Math.max(0, Math.ceil((finishMs - nowMs) / 1000));
            const ready = remSec <= 0;

            return (
              <div
                key={active.id}
                className="rounded-2xl bg-[#121c38] border border-[#7dff00]/50 p-3.5 space-y-2.5 shadow-[0_0_20px_rgba(125,255,0,0.08)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-display font-bold text-white">
                      {active.targetName}
                    </div>
                    <div className="text-[11px] text-[#7dff00] font-semibold">
                      Награда: +{formatCompact(active.reward)} Data
                      {active.repDelta !== 0 &&
                        ` • ${active.repDelta > 0 ? '+' : ''}${active.repDelta} Rep`}
                      {active.heatDelta > 0 && ` • +${active.heatDelta} Heat`}
                    </div>
                  </div>

                  {ready ? (
                    <button
                      type="button"
                      disabled={busyKey === `mission:claim:${active.id}`}
                      onClick={() => void claimMission(active.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#7dff00] text-[#071005] font-display font-extrabold text-xs flex items-center gap-1.5 animate-pulse cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Забрать!</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyKey === `mission:skip:${active.id}`}
                      onClick={() => void skipMission(active.id)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600/85 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      title="Мгновенно завершить за 1 Crypto"
                    >
                      <Gem className="w-3 h-3" />
                      <span>Пропустить (1💎)</span>
                    </button>
                  )}
                </div>

                {/* Прогресс-бар миссии */}
                <div className="space-y-1">
                  <div className="h-2.5 w-full rounded-full bg-[#090d1a] overflow-hidden p-[1px] border border-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        background: ready
                          ? '#7dff00'
                          : 'linear-gradient(90deg, #00f0ff 0%, #ff00a0 100%)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{ready ? 'Прорыв завершён!' : 'Подбор ключей доступа...'}</span>
                    <span className="font-bold text-white">
                      {ready ? 'ГОТОВО' : `${remSec} сек`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Фильтры типов сайтов */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: 'all', label: 'Витрина (15м)' },
          { id: 'bad', label: '🔴 Bad (+Rep)' },
          { id: 'good', label: '🟢 Good (+++Data)' },
          { id: 'neutral', label: '⚪ Neutral' },
          ...(derived.unlockedGreyMissions ? [{ id: 'grey', label: '🟣 Серые' }] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as FilterType)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
              filter === tab.id
                ? 'bg-[#00f0ff]/18 border-[#00f0ff] text-[#00f0ff]'
                : 'bg-[#10172e] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Подсказка о секретных «серых» миссиях, если Analyst ещё не нанят */}
      {!derived.unlockedGreyMissions && (
        <Link
          to="/team"
          className="block rounded-xl bg-purple-950/30 border border-purple-500/35 px-3 py-2 text-[11px] text-purple-200 hover:bg-purple-950/45 transition"
        >
          <span className="font-bold inline-flex items-center gap-1">
            <Lock className="w-3 h-3 text-purple-400" /> Секретные «серые» миссии закрыты:
          </span>{' '}
          наймите <strong>Analyst</strong> во вкладке «Команда», чтобы получать контракты с шансом
          дропа 💎 Crypto!
        </Link>
      )}

      {/* Список доступных целей */}
      <div className="space-y-2.5">
        {visibleMissions.map((m) => {
          const meta = TYPE_META[m.targetType];
          const whiteHatMult =
            derived.alignment === 'white_hat' && m.targetType === 'bad' ? 2 : 1;
          const estReward = Math.round(
            m.baseDataReward * levelScale * whiteHatMult * derived.prestigeMultiplier
          );
          const estRep = m.repDelta * (whiteHatMult > 1 && m.repDelta > 0 ? 2 : 1);
          const estHeat = Math.round(m.heatDelta * derived.heatMultiplier);
          const alreadyRunning = player.activeMissions.some((am) => am.missionKey === m.key);
          const slotsFull = player.activeMissions.length >= derived.missionSlots;

          return (
            <div
              key={m.key}
              className={`rounded-2xl bg-[#10172e]/95 border ${meta.border} p-3.5 flex items-center justify-between gap-3`}
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${meta.bg}`}>
                    {meta.badge}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> {m.durationSec} сек
                  </span>
                </div>

                <h3 className="font-display text-sm font-bold text-white truncate">
                  {m.targetName}
                </h3>
                <p className="text-[11px] text-slate-400 leading-snug">{m.description}</p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] font-bold">
                  <span className="text-[#7dff00]">+{formatCompact(estReward)} Data</span>
                  {estRep !== 0 && (
                    <span
                      className={`flex items-center gap-0.5 ${
                        estRep > 0 ? 'text-[#00f0ff]' : 'text-amber-400'
                      }`}
                    >
                      <Shield className="w-3 h-3" /> {estRep > 0 ? `+${estRep}` : estRep} Rep
                    </span>
                  )}
                  {estHeat > 0 && (
                    <span className="text-rose-400 flex items-center gap-0.5">
                      <Flame className="w-3 h-3" /> +{estHeat} Heat
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={alreadyRunning || slotsFull || busyKey === `mission:start:${m.key}`}
                onClick={() => void startMission(m.key)}
                className={`shrink-0 px-4 py-2.5 rounded-xl font-display font-extrabold text-xs uppercase tracking-wider transition cursor-pointer ${
                  alreadyRunning
                    ? 'bg-[#7dff00]/15 text-[#7dff00] border border-[#7dff00]/40'
                    : slotsFull
                      ? 'bg-[#0a0e1a] text-slate-500 border border-slate-800 cursor-not-allowed'
                      : 'bg-[#00f0ff] hover:bg-[#00f0ff]/90 text-[#061018] shadow-[0_0_16px_rgba(0,240,255,0.28)]'
                }`}
              >
                {alreadyRunning ? 'Активна' : slotsFull ? 'Занято' : 'HACK'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
