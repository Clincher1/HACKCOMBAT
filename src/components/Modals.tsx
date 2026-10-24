import { AnimatePresence, motion } from 'framer-motion';
import { Check, Gem, Gift, Lock, Sparkles, X } from 'lucide-react';
import React, { useState } from 'react';
import { SKIN_CATEGORIES, SKINS_CONFIG } from '../../shared/skins.config';
import type { SkinCategory } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';
import { TutorialModal } from './TutorialModal';

export const ModalsAndOverlays: React.FC = () => {
  const {
    player,
    dailyModalOpen,
    setDailyModalOpen,
    skinModalOpen,
    setSkinModalOpen,
    offlineModalEarned,
    offlineModalTaps,
    dismissOfflineModal,
    claimDailyBonus,
    buyOrEquipSkin,
    busyKey,
    nowMs,
  } = useGame();

  const [skinFilter, setSkinFilter] = useState<'all' | SkinCategory>('all');

  if (!player) return null;

  const canClaimDaily =
    !player.lastDailyClaim ||
    (nowMs - new Date(player.lastDailyClaim).getTime()) / (1000 * 3600) >= 20;

  return (
    <>
      <TutorialModal />
      {/* Модалка накопленного оффлайн пассивного дохода */}
      <AnimatePresence>
        {offlineModalEarned !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              className="w-full max-w-sm rounded-2xl bg-[#10172e] border border-[#00f0ff]/45 p-5 text-center shadow-[0_0_40px_rgba(0,240,255,0.2)]"
            >
              <Sparkles className="w-10 h-10 text-[#7dff00] mx-auto mb-2" />
              <h3 className="font-display text-lg font-extrabold text-white">
                Пассивный майнинг завершён!
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Пока вы были оффлайн, ваши серверы и команда заработали. Только Data — опыт, Crypto
                и чипы падают лишь за игру. Копилка живёт максимум 8 часов и работает лишь в те
                сутки, где вы наиграли 8 минут.
              </p>
              <div className="my-4 py-3 rounded-xl bg-[#0a0e1a] border border-[#7dff00]/35 font-display text-2xl font-black text-[#7dff00]">
                +{formatCompact(offlineModalEarned)} DATA
              </div>
              {offlineModalTaps > 0 && (
                <p className="text-[11px] text-slate-400 -mt-2 mb-1">
                  в том числе {formatCompact(offlineModalTaps)} фоновых тапов × сила клика
                </p>
              )}
              <p className="text-[10px] text-slate-500 mb-3">
                карточки в оффлайне платят 50% от обычной ставки
              </p>
              <button
                type="button"
                onClick={dismissOfflineModal}
                className="w-full py-2.5 rounded-xl bg-[#00f0ff] text-[#061018] font-display font-bold text-sm cursor-pointer"
              >
                Забрать и продолжить
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модалка ежедневного бонуса Crypto (Шаг 9 и раздел 2 ТЗ) */}
      <AnimatePresence>
        {dailyModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDailyModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-[#10172e] border border-[#7dff00]/40 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#7dff00]" />
                  <h3 className="font-display font-bold text-base text-white">
                    Ежедневный Крипто-Дроп
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDailyModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Заходи каждый день без пропусков, чтобы получать премиальную валюту{' '}
                <strong className="text-purple-300">Crypto</strong> и пакеты Data!
              </p>

              <div className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const claimed = day <= player.dailyStreak;
                  const nextTarget = (player.dailyStreak % 7) + 1 === day && canClaimDaily;
                  return (
                    <div
                      key={day}
                      className={`rounded-xl p-2 text-center border ${
                        nextTarget
                          ? 'bg-[#7dff00]/20 border-[#7dff00] text-white'
                          : claimed
                            ? 'bg-[#00f0ff]/15 border-[#00f0ff]/40 text-[#00f0ff]'
                            : 'bg-[#0a0e1a] border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px]">Д{day}</div>
                      <div className="font-bold text-xs mt-1">+{3 + day * 2}💎</div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={!canClaimDaily || busyKey === 'daily'}
                onClick={() => void claimDailyBonus()}
                className="w-full py-3 rounded-xl font-display font-bold text-sm bg-[#7dff00] text-[#071005] disabled:opacity-40 transition cursor-pointer"
              >
                {canClaimDaily
                  ? '🎁 Получить ежедневный бонус!'
                  : 'Уже получено сегодня — возвращайся завтра!'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модалка магазина эксклюзивных скинов стола за Crypto (раздел 2 ТЗ) */}
      <AnimatePresence>
        {skinModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSkinModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[#10172e] border border-[#ff00a0]/40 p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gem className="w-5 h-5 text-purple-400" />
                  <h3 className="font-display font-bold text-base text-white">
                    Кибер-Косметика ({player.crypto} 💎)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSkinModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Категории косметики: рабочий стол / интерфейс / аватар */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[{ id: 'all' as const, label: 'Все' }, ...SKIN_CATEGORIES].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSkinFilter(cat.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      skinFilter === cat.id
                        ? 'bg-[#ff00a0]/18 border-[#ff00a0] text-[#ff00a0]'
                        : 'bg-[#0a0e1a] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                {SKINS_CONFIG.filter(
                  (skin) => skinFilter === 'all' || skin.category === skinFilter
                ).map((skin) => {
                  const unlocked = player.unlockedSkins.includes(skin.key);
                  const equipped = player.equippedSkin === skin.key;
                  const levelLocked = (skin.requiredLevel ?? 1) > player.derived.level;
                  return (
                    <div
                      key={skin.key}
                      className="rounded-xl bg-[#0a0e1a] border border-slate-800 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${skin.primaryHex}, ${skin.secondaryHex})`,
                            }}
                          />
                          <span className="font-bold text-sm text-white truncate">
                            {skin.avatarGlyph ? `${skin.avatarGlyph} ` : ''}
                            {skin.name}
                          </span>
                          {levelLocked && !unlocked && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
                              <Lock className="w-2.5 h-2.5" /> Ур. {skin.requiredLevel}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{skin.description}</p>
                      </div>

                      <button
                        type="button"
                        disabled={equipped || levelLocked || busyKey === `skin:${skin.key}`}
                        onClick={() => void buyOrEquipSkin(skin.key)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          equipped
                            ? 'bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/40'
                            : levelLocked
                              ? 'bg-[#0a0e1a] text-amber-400/80 border border-amber-500/25 cursor-not-allowed'
                              : unlocked
                                ? 'bg-[#162244] hover:bg-[#1e2e5c] text-white'
                                : skin.prestigeRequired
                                  ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
                                  : 'bg-[#ff00a0] hover:bg-[#ff00a0]/85 text-white'
                        }`}
                      >
                        {equipped ? (
                          <span className="flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Активен
                          </span>
                        ) : levelLocked ? (
                          `Ур. ${skin.requiredLevel}`
                        ) : unlocked ? (
                          'Надеть'
                        ) : skin.prestigeRequired ? (
                          '50 Ур. Престиж'
                        ) : (
                          `${skin.cryptoCost} 💎`
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
