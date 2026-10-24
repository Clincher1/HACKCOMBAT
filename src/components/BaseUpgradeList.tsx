import { Cpu, Lock } from 'lucide-react';
import React from 'react';
import {
  BASE_UPGRADES_CONFIG,
  getBaseUpgradeChipCost,
  getBaseUpgradePrice,
} from '../../shared/base.config';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

/**
 * «База» — 10 пассивных покупок игрока по 15 уровней.
 * Не сбрасываются Global Hack Престижем: это долгая инвестиция в комфорт.
 */
export const BaseUpgradeList: React.FC = () => {
  const { player, buyBaseUpgrade, busyKey } = useGame();
  if (!player) return null;

  const ownedLevels = Object.values(player.baseUpgrades).filter((lvl) => lvl > 0).length;
  const totalLevels = Object.values(player.baseUpgrades).reduce((acc, lvl) => acc + lvl, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#10172e] border border-[#7dff00]/25 p-3.5">
        <div className="text-xs font-bold text-white flex items-center gap-1.5">
          <Cpu className="w-4 h-4 text-[#7dff00] shrink-0" />
          <span>База Оператора ({ownedLevels}/{BASE_UPGRADES_CONFIG.length} улучшений)</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          Пассивные покупки <strong className="text-[#7dff00]">не сбрасываются Престижем</strong>. Суммарно{' '}
          {totalLevels}/{BASE_UPGRADES_CONFIG.length * 15} уровней. Стоят Data + ⚙️ Чипы.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {BASE_UPGRADES_CONFIG.map((cfg) => {
          const level = player.baseUpgrades[cfg.key] ?? 0;
          const isMax = level >= cfg.maxLevel;
          const price = getBaseUpgradePrice(cfg, level);
          const chipCost = getBaseUpgradeChipCost(cfg, level);
          const levelLocked = (cfg.requiredLevel ?? 1) > player.derived.level;
          const canBuy =
            !isMax && !levelLocked && player.data >= price && player.chips >= chipCost;
          const isBusy = busyKey === `base:${cfg.key}`;

          return (
            <div
              key={cfg.key}
              className={`rounded-2xl border p-3 flex flex-col justify-between gap-2.5 ${
                isMax
                  ? 'bg-[#101c28] border-[#7dff00]/45'
                  : 'bg-[#10172e]/95 border-slate-800/90'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#0a0e1a] border border-slate-800 flex items-center justify-center text-lg shrink-0">
                    {isMax ? '✅' : cfg.icon}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#0a0e1a] border border-slate-700/80 text-[10px] font-bold text-[#7dff00]">
                    Ур. {level}/{cfg.maxLevel}
                  </span>
                </div>
                <h3 className="text-xs font-extrabold text-white leading-snug">{cfg.name}</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">{cfg.description}</p>
                <div className="text-[10px] font-bold px-2 py-1 rounded bg-[#7dff00]/10 text-[#7dff00] border border-[#7dff00]/25">
                  ⚡ {cfg.effectLabel}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex gap-0.5">
                  {Array.from({ length: cfg.maxLevel }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 flex-1 rounded-full ${idx < level ? 'bg-[#7dff00]' : 'bg-slate-800'}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isMax || !canBuy || isBusy}
                  onClick={() => void buyBaseUpgrade(cfg.key)}
                  className={`w-full py-2 px-2 rounded-xl text-[11px] font-display font-bold transition cursor-pointer ${
                    isMax
                      ? 'bg-[#7dff00]/15 text-[#7dff00] border border-[#7dff00]/35 cursor-default'
                      : canBuy
                        ? 'bg-[#7dff00] hover:bg-[#7dff00]/90 text-[#061018] shadow-[0_0_16px_rgba(125,255,0,0.25)]'
                        : 'bg-[#0a0e1a] text-slate-500 border border-slate-800 cursor-not-allowed'
                  }`}
                >
                  {isMax ? (
                    'МАКСИМУМ'
                  ) : levelLocked ? (
                    <span className="inline-flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3" /> Ур. {cfg.requiredLevel}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1">
                      {canBuy ? 'Купить' : <Lock className="w-3 h-3" />}
                      {formatCompact(price)} Data • {chipCost} ⚙️
                    </span>
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
