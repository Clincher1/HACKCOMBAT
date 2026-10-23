import { motion } from 'framer-motion';
import { BookOpen, Flame, Lock, Sparkles, Zap } from 'lucide-react';
import React, { useState } from 'react';
import {
  CARD_CATEGORIES,
  CARDS_CONFIG,
  getCardPrice,
  MAX_CARD_LEVEL,
} from '../../shared/cards.config';
import type { CardCategory } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';
import { triggerHapticSelection } from '../lib/telegram';

export const UpgradesPage: React.FC = () => {
  const { player, buyCard, busyKey, openTutorial } = useGame();
  const [selectedCategory, setSelectedCategory] = useState<CardCategory>('hardware');

  if (!player) return null;

  const activeCategoryMeta =
    CARD_CATEGORIES.find((c) => c.id === selectedCategory) ?? CARD_CATEGORIES[0];
  const filteredCards = CARDS_CONFIG.filter((c) => c.category === selectedCategory);

  return (
    <div className="space-y-3.5 pb-4">
      {/* Шапка прогресса уровня от карточек + кнопка подсказки */}
      <div className="rounded-2xl bg-[#10172e] border border-[#00f0ff]/25 p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#00f0ff] shrink-0" />
            <span>Мастерская Рабочего Стола (48 модулей)</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Каждые 5 уровней карточек = +1 Уровень игрока (макс. 97 ур. + Global Hack Престиж).
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <div className="font-display text-sm font-extrabold text-[#00f0ff]">
            УР. {player.derived.level}
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

      {/* Переключатель 4 категорий: Hardware | Software | Comfort | Darknet */}
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

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold" style={{ color: activeCategoryMeta.accentColor }}>
          {activeCategoryMeta.label} — {activeCategoryMeta.subtitle}
        </span>
      </div>

      {/* Сетка карточек 2×N */}
      <div className="grid grid-cols-2 gap-2.5">
        {filteredCards.map((card) => {
          const level = player.cards[card.key] ?? 0;
          const isMax = level >= MAX_CARD_LEVEL;
          const lockedByLevel = Boolean(card.minLevel && player.derived.level < card.minLevel);
          const price = getCardPrice(card, level);
          const canAfford = !isMax && !lockedByLevel && player.data >= price;
          const isBusy = busyKey === `card:${card.key}`;

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
                    <span className="px-2 py-0.5 rounded-md bg-[#0a0e1a] border border-slate-700/80 text-[10px] font-bold text-[#00f0ff]">
                      Ур. {level}/{MAX_CARD_LEVEL}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-extrabold text-white leading-snug">{card.name}</h3>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5 line-clamp-2">
                    {card.description}
                  </p>
                </div>

                {/* Бонусы карточки */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#7dff00]/12 text-[#7dff00]">
                    +{formatCompact(card.dataPerHourPerLevel)}/ч
                  </span>
                  {card.clickBonusPerLevel && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#00f0ff]/12 text-[#00f0ff]">
                      +{card.clickBonusPerLevel} тап
                    </span>
                  )}
                  {card.energyMaxPerLevel && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5" /> +{card.energyMaxPerLevel}
                    </span>
                  )}
                  {card.heatOnBuy && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 flex items-center gap-0.5">
                      <Flame className="w-2.5 h-2.5" /> +{card.heatOnBuy} Heat
                    </span>
                  )}
                </div>
              </div>

              {/* Прогресс 10 уровней + Кнопка Купить */}
              <div className="space-y-2">
                <div className="grid grid-cols-10 gap-0.5">
                  {Array.from({ length: MAX_CARD_LEVEL }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 rounded-full ${
                        idx < level ? 'bg-[#00f0ff]' : 'bg-slate-800'
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
                    ? 'МАКСИМУМ'
                    : lockedByLevel
                      ? `🔒 Нужен Ур. ${card.minLevel}`
                      : `Купить • ${formatCompact(price)}`}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
