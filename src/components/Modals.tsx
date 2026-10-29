import { AnimatePresence, motion } from 'framer-motion';
import { Check, Gem, Gift, Lock, Sparkles, X } from 'lucide-react';
import React, { useState } from 'react';
import { SKIN_CATEGORIES, SKINS_CONFIG } from '../../shared/skins.config';
import { BASE_THEMES } from '../../shared/themes.config';
import type { SkinCategory } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';
import { ProfileFramesShop } from './ProfileFramesShop';
import { ThemeOnboardingModal } from './ThemeOnboardingModal';
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
    unequipSkin,
    baseTheme,
    setBaseTheme,
    busyKey,
    nowMs,
  } = useGame();

  const [skinFilter, setSkinFilter] = useState<'all' | SkinCategory>('all');
  const [storeTab, setStoreTab] = useState<'skins' | 'frames'>('skins');

  if (!player) return null;

  const canClaimDaily =
    !player.lastDailyClaim ||
    (nowMs - new Date(player.lastDailyClaim).getTime()) / (1000 * 3600) >= 20;

  return (
    <>
      <ThemeOnboardingModal />
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
              className="w-full max-w-sm rounded-2xl bg-[var(--ui-panel)] border border-[rgba(var(--ui-primary-rgb),0.45)] p-5 text-center shadow-[0_0_40px_rgba(var(--ui-primary-rgb),0.2)]"
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
              <div className="my-4 py-3 rounded-xl bg-[var(--ui-panel-deep)] border border-[#7dff00]/35 font-display text-2xl font-black text-[#7dff00]">
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
                className="w-full py-2.5 rounded-xl bg-[var(--ui-primary)] text-[#061018] font-display font-bold text-sm cursor-pointer"
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
              className="w-full max-w-md rounded-2xl bg-[var(--ui-panel)] border border-[#7dff00]/40 p-5 space-y-4"
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
                            ? 'bg-[rgba(var(--ui-primary-rgb),0.15)] border-[rgba(var(--ui-primary-rgb),0.40)] text-[var(--ui-primary)]'
                            : 'bg-[var(--ui-panel-deep)] border-slate-800 text-slate-400'
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
              className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--ui-panel)] border border-[rgba(var(--ui-secondary-rgb),0.40)] p-5 space-y-3"
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

              {storeTab === 'skins' && (
                <>
                  {/* Бесплатные темы — основа оформления, без игровых бонусов. */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Бесплатные темы интерфейса
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {BASE_THEMES.filter((theme) => !theme.hiddenFromSelection).map((theme) => {
                        const active = baseTheme.key === theme.key;
                        const pending = busyKey === `theme:${theme.key}`;
                        return (
                          <button
                            key={theme.key}
                            type="button"
                            disabled={pending}
                            onClick={() => void setBaseTheme(theme.key)}
                            className={`theme-preview-card relative overflow-hidden rounded-xl border p-2.5 text-left transition cursor-pointer disabled:opacity-60 ${
                              active
                                ? 'border-white/70 ring-1 ring-white/30'
                                : 'border-slate-700/70 hover:border-slate-500'
                            }`}
                            style={{
                              background: theme.previewImage
                                ? undefined
                                : `linear-gradient(135deg, ${theme.previewFrom}22 0%, ${theme.previewTo}22 100%)`,
                            }}
                          >
                            {/* Если у темы есть арт — показываем его, иначе градиент */}
                            {theme.previewImage && (
                              <>
                                <img
                                  src={theme.previewImage}
                                  alt={theme.name}
                                  loading="lazy"
                                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[var(--ui-panel-deep)] via-[rgba(var(--ui-panel-deep-rgb),0.45)] to-transparent" />
                              </>
                            )}
                            <div className="relative flex items-center justify-between gap-1">
                              <span className="text-base leading-none">{theme.glyph}</span>
                              {active ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/90 text-[var(--ui-panel-deep)] flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> ВКЛ
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/30 text-white/80">
                                  бесплатно
                                </span>
                              )}
                            </div>
                            <div className="relative font-display font-bold text-xs text-white mt-1.5 leading-tight">
                              {theme.name}
                            </div>
                            <div className="relative text-[9px] text-slate-300/90 mt-0.5 leading-snug">
                              {theme.tagline}
                            </div>
                            <div
                              className="relative h-1.5 w-full rounded-full mt-1.5"
                              style={{
                                background: `linear-gradient(90deg, ${theme.previewFrom}, ${theme.previewTo})`,
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug">
                      Новогодняя тема временно использует свою палитру: надетый UI-скин и его бонус сохраняются и вернутся при выборе другой тёмной темы.
                    </p>
                  </div>
                </>
              )}

              {/* Единый переключатель разделов косметики: рамки находятся рядом
                  с рабочим столом, интерфейсом и аватарами. */}
              <div className="grid grid-cols-2 gap-1.5">
                {[{ id: 'all' as const, label: 'Все' }, ...SKIN_CATEGORIES].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={storeTab === 'skins' && skinFilter === cat.id}
                    onClick={() => {
                      setStoreTab('skins');
                      setSkinFilter(cat.id);
                    }}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      storeTab === 'skins' && skinFilter === cat.id
                        ? 'bg-[rgba(var(--ui-secondary-rgb),0.18)] border-[var(--ui-secondary)] text-[var(--ui-secondary)]'
                        : 'bg-[var(--ui-panel-deep)] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={storeTab === 'frames'}
                  onClick={() => setStoreTab('frames')}
                  className={`col-span-2 inline-flex w-full items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    storeTab === 'frames'
                      ? 'bg-purple-500/18 border-purple-400 text-purple-300'
                      : 'bg-[var(--ui-panel-deep)] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="h-3 w-3" /> Рамки Профиля
                </button>
              </div>

              {storeTab === 'frames' ? (
                <ProfileFramesShop />
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-slate-400">Активные скины можно снять и снова надеть бесплатно. Бонус действует только пока скин надет.</p>
                  {SKINS_CONFIG.filter(
                    (skin) => skinFilter === 'all' || skin.category === skinFilter
                  ).map((skin) => {
                    const unlocked = player.unlockedSkins.includes(skin.key);
                    // v3.6.5: «активен» считается ПО СВОЕМУ СЛОТУ категории.
                    // Раньше сравнивалось одно общее поле, поэтому надеть можно
                    // было только что-то одно, а остальные «слетали».
                    const equipped =
                      skin.category === 'ui'
                        ? player.stats?.equippedUi === skin.key
                        : skin.category === 'avatar'
                          ? player.stats?.equippedAvatar === skin.key
                          : player.equippedSkin === skin.key;
                    const levelLocked = (skin.requiredLevel ?? 1) > player.derived.level;
                    const prestigeLocked = Boolean(skin.prestigeRequired && player.prestigeCount < 1);
                    const eliteCosmetic = skin.prestigeRequired || skin.cryptoCost >= 160;
                    const canUnequip = equipped && skin.key !== 'default';
                    const locked = !unlocked && (levelLocked || prestigeLocked);
                    return (
                      <div
                        key={skin.key}
                        className="rounded-xl bg-[var(--ui-panel-deep)] border border-slate-800 p-2.5 flex items-center justify-between gap-2"
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
                            {equipped && (
                              <span className="text-[9px] font-bold text-[var(--ui-primary)] shrink-0">✓ Активен</span>
                            )}
                            {levelLocked && !unlocked && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
                                <Lock className="w-2.5 h-2.5" /> Ур. {skin.requiredLevel}
                              </span>
                            )}
                            {eliteCosmetic && !levelLocked && !unlocked && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30 shrink-0">
                                ЭЛИТА
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{skin.description}</p>
                        </div>

                        <button
                          type="button"
                          disabled={(equipped && !canUnequip) || locked || busyKey === `skin:${skin.key}`}
                          onClick={() => void (canUnequip ? unequipSkin(skin.key) : buyOrEquipSkin(skin.key))}
                          aria-label={`${canUnequip ? 'Снять' : unlocked ? 'Надеть' : 'Купить'} ${skin.name}`}
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            equipped
                              ? 'bg-[rgba(var(--ui-primary-rgb),0.15)] text-[var(--ui-primary)] border border-[rgba(var(--ui-primary-rgb),0.40)]'
                              : locked
                                ? 'bg-[var(--ui-panel-deep)] text-amber-400/80 border border-amber-500/25 cursor-not-allowed'
                                : unlocked
                                  ? 'bg-[#162244] hover:bg-[#1e2e5c] text-white'
                                  : eliteCosmetic
                                    ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
                                    : 'bg-[var(--ui-secondary)] hover:bg-[rgba(var(--ui-secondary-rgb),0.85)] text-white'
                          }`}
                        >
                          {equipped ? (
                            <span className="flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> {canUnequip ? 'Снять' : 'Стандарт'}
                            </span>
                          ) : levelLocked && !unlocked ? (
                            `Ур. ${skin.requiredLevel}`
                          ) : prestigeLocked && !unlocked ? (
                            'После Престижа'
                          ) : unlocked ? (
                            'Надеть'
                          ) : (
                            `${skin.cryptoCost} 💎`
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
