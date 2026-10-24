import { Check, Lock, Shield, Users } from 'lucide-react';
import React from 'react';
import { TEAM_CONFIG } from '../../shared/team.config';
import { PetsSection } from '../components/PetsSection';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

export const TeamPage: React.FC = () => {
  const { player, hireNpc, busyKey } = useGame();
  if (!player) return null;

  return (
    <div className="space-y-3.5 pb-4">
      <div className="rounded-2xl bg-[#10172e] border border-[#00f0ff]/25 p-3.5 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#7dff00]" />
            <span>Синдикат Специалистов ({player.team.length}/{TEAM_CONFIG.length})</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Специалисты — дорогое удовольствие: нужен <strong>уровень 12+</strong>, закрытые
            контракты и <strong>Data</strong>/<strong>Rep</strong>. Найм даёт силу железа.
          </p>
        </div>
        <div className="text-right shrink-0 text-xs font-bold text-[#00f0ff] flex items-center gap-1">
          <Shield className="w-4 h-4" />
          <span>{player.rep} Rep</span>
        </div>
      </div>

      <PetsSection />

      {/* Сетка NPC-персонажей 2×3 с ИИ-аватарками WebP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEAM_CONFIG.map((npc) => {
          const hired = player.team.includes(npc.key);
          const canAfford =
            npc.costCurrency === 'data'
              ? player.data >= npc.costAmount
              : player.rep >= npc.costAmount;
          const isBusy = busyKey === `hire:${npc.key}`;
          const levelOk = (npc.requiredLevel ?? 1) <= player.derived.level;
          const missionsOk = (npc.requiredMissions ?? 0) <= player.totalMissions;
          const locked = !levelOk || !missionsOk;

          return (
            <div
              key={npc.key}
              className={`rounded-2xl bg-[#10172e]/95 border p-3.5 flex flex-col justify-between gap-3 transition ${
                hired ? 'border-[#7dff00]/50' : 'border-slate-800/90'
              }`}
            >
              <div className="flex items-start gap-3">
                <img
                  src={npc.avatarUrl}
                  alt={npc.callsign}
                  loading="lazy"
                  className="w-16 h-16 rounded-xl object-cover border border-[#00f0ff]/35 shrink-0 bg-[#0a0e1a]"
                />
                <div className="min-w-0 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-[#00f0ff] font-bold">
                    {npc.roleTitle}
                  </div>
                  <h3 className="font-display text-xs font-extrabold text-white truncate">
                    {npc.callsign}
                  </h3>
                  <p className="text-[11px] italic text-slate-400 leading-snug">{npc.quote}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-2.5 py-1.5 rounded-lg bg-[#0a0e1a] border border-slate-800 text-[11px] font-bold text-[#7dff00]">
                  ⚡ {npc.effectLabel}
                  <span className="ml-1 text-slate-400 font-normal">· +{npc.hackPower} силы</span>
                </div>
                {locked && !hired && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-[#0a0e1a] border border-amber-500/30 text-[10px] font-bold text-amber-300 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Уровень {npc.requiredLevel}
                      {levelOk ? ' ✓' : ` (у тебя ${player.derived.level})`}
                    </div>
                    <div className="flex items-center gap-1">
                      <Lock className="w-3 h-3" /> {npc.requiredMissions} контрактов
                      {missionsOk ? ' ✓' : ` (у тебя ${player.totalMissions})`}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={hired || locked || !canAfford || isBusy}
                  onClick={() => void hireNpc(npc.key)}
                  className={`w-full py-2 rounded-xl font-display font-bold text-xs transition cursor-pointer ${
                    hired
                      ? 'bg-[#7dff00]/15 text-[#7dff00] border border-[#7dff00]/40 cursor-default'
                      : locked
                        ? 'bg-[#0a0e1a] text-amber-400/80 border border-amber-500/25 cursor-not-allowed'
                        : canAfford
                        ? npc.costCurrency === 'rep'
                          ? 'bg-[#ff00a0] hover:bg-[#ff00a0]/90 text-white shadow-[0_0_16px_rgba(255,0,160,0.3)]'
                          : 'bg-[#00f0ff] hover:bg-[#00f0ff]/90 text-[#061018]'
                        : 'bg-[#0a0e1a] text-slate-500 border border-slate-800 cursor-not-allowed'
                  }`}
                >
                  {hired ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> В КОМАНДЕ
                    </span>
                  ) : locked ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      {!levelOk ? `Ур. ${npc.requiredLevel}` : `${npc.requiredMissions} контрактов`}
                    </span>
                  ) : npc.costCurrency === 'data' ? (
                    `Нанять • ${formatCompact(npc.costAmount)} Data`
                  ) : (
                    `Нанять • ${npc.costAmount} Rep`
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
