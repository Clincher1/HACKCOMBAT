import { Cpu, Lock } from 'lucide-react';
import React from 'react';
import {
  BASE_UPGRADES_CONFIG,
  getBaseUpgradeChipCost,
  getBaseUpgradePrice,
} from '../../shared/base.config';
import { computeBaseUpgradeTotals, computeDerivedStats } from '../../shared/mechanics';
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
          {totalLevels}/{BASE_UPGRADES_CONFIG.length * 15} уровней. Каждый уровень также даёт +3 к силе железа для взломов. Стоят Data + ⚙️ Чипы.
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
          const nextLevel = isMax ? level : level + 1;
          const projected = isMax ? player.derived : computeDerivedStats({
            cards: player.cards, team: player.team, rep: player.rep, heat: player.heat,
            data: player.data, xp: player.xp, prestigeCount: player.prestigeCount,
            equippedSkin: player.equippedSkin, equippedUi: player.stats.equippedUi,
            equippedAvatar: player.stats.equippedAvatar, pets: player.pets,
            baseUpgrades: { ...player.baseUpgrades, [cfg.key]: nextLevel }, cardTier: player.cardTier,
          });
          const currentTotals = computeBaseUpgradeTotals(player.baseUpgrades);
          const nextTotals = computeBaseUpgradeTotals({ ...player.baseUpgrades, [cfg.key]: nextLevel });
          const pct = (n: number) => `${(n * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
          const rate = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
          const change = (before: string, after: string) => isMax ? before : `${before} → ${after}`;
          let detail = '';
          let note = '';
          switch (cfg.key) {
            case 'coffee_machine':
              detail = `Реген: ${change(`${rate(player.derived.energyRegenPerSec * 60)} ⚡/мин`, `${rate(projected.energyRegenPerSec * 60)} ⚡/мин`)}`;
              break;
            case 'standing_desk':
              detail = `Бонус базы: ${change(`+${pct(currentTotals.clickBonusPct)}`, `+${pct(nextTotals.clickBonusPct)}`)} • тап: ${change(formatCompact(player.derived.clickPower), formatCompact(projected.clickPower))} Data`;
              note = 'Сила тапа округляется до 0,1 Data, поэтому отдельный уровень может не изменить её сразу.';
              break;
            case 'vpn_router':
              detail = `Снижение базы: ${change(pct(currentTotals.heatReductionPct), pct(nextTotals.heatReductionPct))}`;
              note = 'Heat каждого действия округляется до целого; общий эффект снижения ограничен.';
              break;
            case 'ups_battery':
              detail = `Лимит пассива: ${change(`${rate(player.derived.offlineCapSeconds / 3600)} ч`, `${rate(projected.offlineCapSeconds / 3600)} ч`)}`;
              note = 'Не увеличивает отдельный лимит фоновых тапов; действуют правила допуска оффлайн-дохода.';
              break;
            case 'auto_script':
              detail = `Всего авто-кликов: ${change(`${rate(player.derived.autoClickPerSec)}/с`, `${rate(projected.autoClickPerSec)}/с`)}`;
              note = 'Общий предел с командой — 5 авто-кликов/с.';
              break;
            case 'analytics_desk':
              detail = `Общий бонус награды: ${change(`+${pct(player.derived.missionRewardBonusPct)}`, `+${pct(projected.missionRewardBonusPct)}`)}`;
              note = 'Общий бонус ограничен 50%; взнос на запуск также зависит от награды.';
              break;
            case 'storage_rack':
              detail = `Бонус базы: ${change(`+${pct(currentTotals.passiveBonusPct)}`, `+${pct(nextTotals.passiveBonusPct)}`)} • доход: ${change(`${formatCompact(player.derived.dataPerHour)}/ч`, `${formatCompact(projected.dataPerHour)}/ч`)}`;
              note = 'Бонус применяется к доходу карточек, не к части дохода от авто-кликов.';
              break;
            case 'thermal_paste':
              detail = `Скидка на карточки: ${change(pct(player.derived.cardPriceDiscountPct), pct(projected.cardPriceDiscountPct))}`;
              note = 'Итоговая цена округляется; на границах тиров могут потребоваться чипы.';
              break;
            case 'auto_feeder':
              detail = `Скидка на корм: ${change(pct(player.derived.feedDiscountPct), pct(projected.feedDiscountPct))}`;
              note = 'Корм покупается за Data при достаточном балансе; цена зависит от дохода.';
              break;
            case 'lucky_charm':
              detail = `Бонус шанса: ${change(`+${pct(player.derived.cryptoDropBonusPct)} п.п.`, `+${pct(projected.cryptoDropBonusPct)} п.п.`)}`;
              note = 'Шанс не выше 90%; Crypto выдаётся только при успешном контракте.';
              break;
          }

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
                <p className="text-[10px] text-slate-200 leading-relaxed">{detail}</p>
                {note && <p className="text-[10px] text-slate-400 leading-relaxed">{note}</p>}
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
                  ) : isBusy ? (
                    '⏳ Покупаю…'
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
