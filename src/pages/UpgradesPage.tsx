import { motion } from 'framer-motion';
import { BookOpen, Cpu, Flame, Layers, Lock, Sparkles, Zap } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { getBaseUpgradeChipCost, getBaseUpgradePrice } from '../../shared/base.config';
import {
  CARD_CATEGORIES,
  CARDS_CONFIG,
  CARD_TIERS,
  getCardIndexMultiplier,
  getCardPrice,
  getCardTierConfig,
  getMaxCardLevel,
} from '../../shared/cards.config';
import { BASE_UPGRADES_CONFIG } from '../../shared/base.config';
import { computeDerivedStats } from '../../shared/mechanics';
import type { CardCategory } from '../../shared/types';
import { BaseUpgradeList } from '../components/BaseUpgradeList';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';
import { triggerHapticSelection } from '../lib/telegram';

type WorkshopTab = 'cards' | 'base';

export const UpgradesPage: React.FC = () => {
  const { player, buyCard, unlockTier, busyKey, openTutorial } = useGame();
  const [tab, setTab] = useState<WorkshopTab>('cards');
  const [selectedCategory, setSelectedCategory] = useState<CardCategory>('hardware');

  const activeCategoryMeta = useMemo(
    () => CARD_CATEGORIES.find((c) => c.id === selectedCategory) ?? CARD_CATEGORIES[0],
    [selectedCategory]
  );

  if (!player) return null;

  const maxLevel = getMaxCardLevel(player.cardTier);
  const tierCfg = getCardTierConfig(player.cardTier);
  const nextTierCfg = player.cardTier < CARD_TIERS.length ? CARD_TIERS[player.cardTier] : null;
  const filteredCards = CARDS_CONFIG.filter((c) => c.category === selectedCategory);
  const totalLevels = player.derived.totalCardLevels;

  const baseAffordable = BASE_UPGRADES_CONFIG.filter((cfg) => {
    const lvl = player.baseUpgrades[cfg.key] ?? 0;
    if (lvl >= cfg.maxLevel || (cfg.requiredLevel ?? 1) > player.derived.level) return false;
    return (
      player.data >= getBaseUpgradePrice(cfg, lvl) &&
      player.chips >= getBaseUpgradeChipCost(cfg, lvl)
    );
  }).length;

  return (
    <div className="space-y-3.5 pb-4">
      {/* Шапка: уровень, чипы, тир */}
      <div className="rounded-2xl bg-[#10172e] border border-[#00f0ff]/25 p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#00f0ff] shrink-0" />
            <span>Мастерская Рабочего Стола (48 модулей)</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            Модули улучшают доход и силу. Уровень игрока растёт от XP за игру. Уровни всех модулей{' '}
            <strong className="text-[#00f0ff]">{totalLevels}</strong>.
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            Зелёная цифра — прибавка к доходу после следующего уровня. «Итого» — скорость до → после; баланс Data сверху — отдельно.
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <div className="font-display text-sm font-extrabold text-[#00f0ff]">
            УР. {player.derived.level}
          </div>
          <div className="text-[10px] font-bold text-[#7dff00] flex items-center justify-end gap-1">
            ⚙️ {player.chips}
          </div>
          <button
            type="button"
            onClick={openTutorial}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7dff00] hover:underline cursor-pointer"
          >
            <BookOpen className="w-3 h-3" /> Что качать?
          </button>
        </div>
      </div>

      {/* Переключатель только игровых улучшений: косметика живёт в Кибер-Косметике */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            triggerHapticSelection();
            setTab('cards');
          }}
          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
            tab === 'cards'
              ? 'bg-[#00f0ff]/18 border-[#00f0ff] text-[#00f0ff]'
              : 'bg-[#10172e] border-slate-800 text-slate-400'
          }`}
        >
          <Cpu className="w-4 h-4" /> Модули (48)
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHapticSelection();
            setTab('base');
          }}
          className={`relative py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
            tab === 'base'
              ? 'bg-[#7dff00]/18 border-[#7dff00] text-[#7dff00]'
              : 'bg-[#10172e] border-slate-800 text-slate-400'
          }`}
        >
          <Layers className="w-4 h-4" /> База (10)
          {baseAffordable > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#ff00a0] text-white text-[9px] font-extrabold flex items-center justify-center">
              {baseAffordable}
            </span>
          )}
        </button>
      </div>

      {tab === 'base' ? (
        <BaseUpgradeList />
      ) : (
        <>
          {/* Блок Тира: потолок уровней и разблокировка */}
          <div className="rounded-2xl bg-[#0f1730] border border-[#ff00a0]/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#ff00a0]" />
                {tierCfg.title}
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ff00a0]/15 border border-[#ff00a0]/35 text-[#ff00a0] shrink-0">
                макс. Ур. {maxLevel}
              </span>
            </div>

            {nextTierCfg ? (
              (() => {
                const levelOk = player.derived.level >= nextTierCfg.requiredPlayerLevel;
                const chipsOk = player.chips >= nextTierCfg.chipCost;
                const dataOk = player.data >= nextTierCfg.dataCost;
                const canUnlock = levelOk && chipsOk && dataOk;
                return (
                  <>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {nextTierCfg.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          levelOk ? 'bg-[#7dff00]/12 text-[#7dff00]' : 'bg-slate-800/80 text-amber-300'
                        }`}
                      >
                        Ур. {nextTierCfg.requiredPlayerLevel}+
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          chipsOk ? 'bg-[#7dff00]/12 text-[#7dff00]' : 'bg-slate-800/80 text-amber-300'
                        }`}
                      >
                        {nextTierCfg.chipCost} ⚙️
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          dataOk ? 'bg-[#7dff00]/12 text-[#7dff00]' : 'bg-slate-800/80 text-amber-300'
                        }`}
                      >
                        {formatCompact(nextTierCfg.dataCost)} Data
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!canUnlock || busyKey === 'tier'}
                      onClick={() => void unlockTier()}
                      className={`w-full py-2 rounded-xl font-display text-xs font-bold transition cursor-pointer ${
                        canUnlock
                          ? 'bg-gradient-to-r from-[#ff00a0] to-purple-500 text-white shadow-[0_0_16px_rgba(255,0,160,0.35)]'
                          : 'bg-[#0a0e1a] text-slate-500 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      {canUnlock
                        ? `🔓 ОТКРЫТЬ ТИР ${nextTierCfg.tier}`
                        : `Тир ${nextTierCfg.tier}: ${!levelOk ? `нужен Ур. ${nextTierCfg.requiredPlayerLevel}` : !chipsOk ? `нужно ${nextTierCfg.chipCost} ⚙️` : 'нужно больше Data'}`}
                    </button>
                    <p className="text-[9px] text-slate-500 text-center">
                      Чипы падают с завершённых контрактов во вкладке «Взломы»
                    </p>
                  </>
                );
              })()
            ) : (
              <p className="text-[10px] text-[#7dff00] font-bold">
                ✅ Тир IV открыт — все 48 модулей доступны до 60 уровня!
              </p>
            )}
          </div>

          {/* Категории */}
          <div className="grid grid-cols-4 gap-1.5">
            {CARD_CATEGORIES.map((cat) => {
              const active = cat.id === selectedCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setSelectedCategory(cat.id);
                  }}
                  className={`rounded-xl p-2 text-center border transition cursor-pointer ${
                    active
                      ? 'bg-[#152042] text-white'
                      : 'bg-[#0d1326] border-slate-800/90 text-slate-400 hover:text-slate-200'
                  }`}
                  style={active ? { borderColor: cat.accentColor } : undefined}
                >
                  <img
                    src={cat.iconUrl}
                    alt={cat.label}
                    loading="lazy"
                    className="w-6 h-6 mx-auto mb-1"
                  />
                  <div className="text-[11px] font-bold truncate">{cat.label}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-1 gap-2">
            <span className="theme-accent-text text-[11px] font-bold" style={{ color: activeCategoryMeta.accentColor }}>
              {activeCategoryMeta.label} — {activeCategoryMeta.subtitle}
            </span>
          </div>

          {/* Сетка карточек */}
          <div className="grid grid-cols-2 gap-2.5">
            {filteredCards.map((card) => {
              const level = player.cards[card.key] ?? 0;
              const isMax = level >= maxLevel;
              const lockedByLevel = Boolean(card.minLevel && player.derived.level < card.minLevel);
              const price = getCardPrice(card, level, totalLevels, player.derived.cardPriceDiscountPct);
              const canAfford = !isMax && !lockedByLevel && player.data >= price;
              const isBusy = busyKey === `card:${card.key}`;
              const indexMultiplier = getCardIndexMultiplier(card, totalLevels);

              // Показываем именно эффект следующего уровня, а не условное
              // `база × (уровень + 1)`. Сервер считает доход геометрически и
              // учитывает команду, питомцев, ветку и престиж — превью считает
              // тот же shared-механизм, поэтому итог можно честно сравнить с
              // цифрой Data/ч в верхней панели.
              const projectedDerived = isMax
                ? player.derived
                : computeDerivedStats({
                    cards: { ...player.cards, [card.key]: level + 1 },
                    team: player.team,
                    rep: player.rep,
                    heat:
                      player.heat +
                      (card.heatOnBuy
                        ? Math.round(card.heatOnBuy * player.derived.heatMultiplier)
                        : 0),
                    data: Math.max(0, player.data - price),
                    xp: player.xp,
                    prestigeCount: player.prestigeCount,
                    equippedSkin: player.equippedSkin,
                    equippedUi: player.stats.equippedUi,
                    equippedAvatar: player.stats.equippedAvatar,
                    pets: player.pets,
                    baseUpgrades: player.baseUpgrades,
                    cardTier: player.cardTier,
                  });
              const dataGain = projectedDerived.dataPerHour - player.derived.dataPerHour;
              const tapGain = projectedDerived.clickPower - player.derived.clickPower;
              const heatGain = card.heatOnBuy
                ? Math.round(card.heatOnBuy * player.derived.heatMultiplier)
                : 0;
              const signedDataGain = `${dataGain >= 0 ? '+' : ''}${formatCompact(dataGain)}`;
              const signedTapGain = `${tapGain >= 0 ? '+' : ''}${formatCompact(tapGain)}`;
              const dataGainClass =
                dataGain < 0
                  ? 'bg-rose-500/12 text-rose-300'
                  : 'bg-[#7dff00]/12 text-[#7dff00]';
              const tapGainClass =
                tapGain < 0
                  ? 'bg-rose-500/12 text-rose-300'
                  : 'bg-[#00f0ff]/12 text-[#00f0ff]';

              return (
                <motion.div
                  key={card.key}
                  whileTap={canAfford ? { scale: 0.98 } : undefined}
                  className={`rounded-2xl border p-3 flex flex-col justify-between gap-2.5 ${
                    lockedByLevel
                      ? 'bg-[#0b1021]/90 border-slate-800/60 opacity-80'
                      : 'bg-[#10172e]/95 border-slate-800/90'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="w-9 h-9 rounded-xl bg-[#0a0e1a] border border-slate-800 flex items-center justify-center text-lg shrink-0">
                        {lockedByLevel ? <Lock className="w-4 h-4 text-slate-500" /> : card.iconGlyph}
                      </div>
                      {lockedByLevel ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/12 border border-amber-500/35 text-[10px] font-bold text-amber-300">
                          Ур. {card.minLevel}+
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-md bg-[#0a0e1a] border text-[10px] font-bold ${
                            isMax
                              ? 'border-[#7dff00]/45 text-[#7dff00]'
                              : 'border-slate-700/80 text-[#00f0ff]'
                          }`}
                        >
                          Ур. {level}/{maxLevel}
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-xs font-extrabold text-white leading-snug">{card.name}</h3>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5 line-clamp-2">
                        {card.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {!isMax && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${dataGainClass}`}
                          title="Точное изменение общей скорости Data/ч после покупки следующего уровня"
                        >
                          {signedDataGain} Data/ч
                        </span>
                      )}
                      {!isMax && card.clickBonusPerLevel && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tapGainClass}`}
                          title="Точное изменение Data за один тап после покупки следующего уровня"
                        >
                          {signedTapGain} Data/тап
                        </span>
                      )}
                      {!isMax && (
                        <span
                          className="w-full text-[9px] font-semibold text-slate-400 leading-snug"
                          title="Слева — текущий общий доход, справа — доход после покупки"
                        >
                          Итого Data/ч: {formatCompact(player.derived.dataPerHour)} → {formatCompact(projectedDerived.dataPerHour)}
                        </span>
                      )}
                      {card.energyMaxPerLevel && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" /> +{card.energyMaxPerLevel} Energy Max
                        </span>
                      )}
                      {card.heatOnBuy && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 flex items-center gap-0.5"
                          title="Heat с учётом текущей защиты от розыска"
                        >
                          <Flame className="w-2.5 h-2.5" /> +{heatGain} Heat
                        </span>
                      )}
                      {indexMultiplier > 1.05 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#ff00a0]/12 text-[#ff00a0]">
                          индекс цен ×{indexMultiplier.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-px">
                      {Array.from({ length: maxLevel }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1 flex-1 rounded-full ${
                            idx < level ? 'bg-[#00f0ff]' : idx === level ? 'bg-[#00f0ff]/35' : 'bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={isMax || lockedByLevel || !canAfford || isBusy}
                      onClick={() => void buyCard(card.key)}
                      className={`w-full py-2 px-2.5 rounded-xl text-xs font-display font-bold transition cursor-pointer ${
                        isMax
                          ? 'bg-[#7dff00]/15 text-[#7dff00] border border-[#7dff00]/35 cursor-default'
                          : lockedByLevel
                            ? 'bg-[#0a0e1a] text-amber-300/75 border border-amber-500/25 cursor-not-allowed'
                            : canAfford
                              ? 'bg-[#00f0ff] hover:bg-[#00f0ff]/90 text-[#061018] shadow-[0_0_16px_rgba(0,240,255,0.28)]'
                              : 'bg-[#0a0e1a] text-slate-500 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      {isMax
                        ? `МАКС. УР. ${maxLevel}`
                        : lockedByLevel
                          ? `🔒 Нужен Ур. ${card.minLevel}`
                          : isBusy
                            ? '⏳ Покупаю…'
                            : `Купить • ${formatCompact(price)}`}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
