import { Check, Palette, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { BASE_THEMES, type BaseThemeConfig, type BaseThemeKey } from '../../shared/themes.config';
import { useGame } from '../context/GameContext';

function isNewOperator(player: ReturnType<typeof useGame>['player']): boolean {
  if (!player) return false;
  return (
    !player.stats.baseTheme &&
    player.totalClicks === 0 &&
    player.totalMissions === 0 &&
    player.xp === 0 &&
    player.achievements.length === 0
  );
}

/** Первый запуск: тема выбирается до начала игры, но сохраняется обычным серверным action. */
export const ThemeOnboardingModal: React.FC = () => {
  const { player, setBaseTheme, busyKey } = useGame();
  const [open, setOpen] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<BaseThemeKey | null>(null);

  const newOperator = isNewOperator(player);

  useEffect(() => {
    if (newOperator && !player?.stats.baseTheme) setOpen(true);
  }, [newOperator, player?.stats.baseTheme]);

  useEffect(() => {
    if (!pendingTheme || player?.stats.baseTheme !== pendingTheme) return;
    setPendingTheme(null);
    setOpen(false);
  }, [pendingTheme, player?.stats.baseTheme]);

  if (!open || !player) return null;

  const themeBusy = busyKey?.startsWith('theme:') ?? false;
  // Порядок BASE_THEMES — часть UX: классика слева, женская тема справа.
  const themes = BASE_THEMES.filter((theme) => !theme.hiddenFromSelection);

  const chooseTheme = (theme: BaseThemeConfig) => {
    if (themeBusy) return;
    setPendingTheme(theme.key);
    void setBaseTheme(theme.key);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="theme-onboarding"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-onboarding-title"
      >
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-[rgba(var(--ui-primary-rgb),0.45)] bg-[var(--ui-panel)] shadow-[0_0_55px_rgba(var(--ui-primary-rgb),0.2)]"
        >
          <div className="border-b border-slate-800/90 bg-gradient-to-r from-[#111c3a] to-[#1d1230] px-4 py-4 text-center sm:px-5">
            <div className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-black/20 px-3 py-1.5">
              <span className="font-display text-xs font-black tracking-[0.22em] text-[var(--ui-primary)]">
                HK
              </span>
              <span className="text-[10px] font-bold tracking-[0.18em] text-slate-300">
                HACKER KOMBAT
              </span>
            </div>
            <div className="mb-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ui-primary)]">
              <Sparkles className="h-3.5 w-3.5" /> Первый запуск
            </div>
            <h1 id="theme-onboarding-title" className="font-display text-lg font-extrabold text-white sm:text-xl">
              Выбери базовую тему терминала
            </h1>
            <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-slate-300">
              Это визуальный стиль игры. Выбор бесплатный и не меняет Data, XP, шанс успеха или награды.
            </p>
          </div>

          <div className="p-3.5 sm:p-5">
            <div className="mb-2.5 flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>Темы оформления</span>
              <span>Все бесплатно</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {themes.map((theme) => {
                const selecting = pendingTheme === theme.key;
                const active = player.stats.baseTheme === theme.key;
                return (
                  <button
                    key={theme.key}
                    type="button"
                    disabled={themeBusy}
                    onClick={() => chooseTheme(theme)}
                    className={`theme-art group relative min-h-[170px] overflow-hidden rounded-2xl border p-2.5 text-left transition sm:min-h-[190px] sm:p-3 ${
                      selecting
                        ? 'border-white ring-2 ring-white/30'
                        : 'border-slate-700/80 hover:border-white/70'
                    } ${themeBusy ? 'cursor-wait opacity-75' : 'cursor-pointer'}`}
                  >
                    {theme.previewImage && (
                      <img
                        src={theme.previewImage}
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        className="absolute inset-0 h-full w-full object-cover opacity-65 transition duration-500 group-hover:scale-105"
                      />
                    )}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: theme.previewImage
                          ? `linear-gradient(180deg, ${theme.previewFrom}22 0%, ${theme.previewTo}35 48%, #080914ee 100%)`
                          : `linear-gradient(145deg, ${theme.previewFrom}30 0%, ${theme.previewTo}28 48%, #080914 100%)`,
                      }}
                    />

                    <div className="relative flex h-full flex-col">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xl leading-none" aria-hidden="true">
                          {theme.glyph}
                        </span>
                        {active || selecting ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-black text-[#080914]">
                            {selecting ? 'СОХРАНЯЕМ' : <><Check className="h-2.5 w-2.5" /> ВЫБРАНО</>}
                          </span>
                        ) : (
                          <span className="rounded-md bg-black/35 px-1.5 py-0.5 text-[9px] font-bold text-white/85">
                            бесплатно
                          </span>
                        )}
                      </div>

                      {/* Мини-превью логотипа: игрок видит характер бренда до выбора. */}
                      <div className="mt-5 rounded-xl border border-white/15 bg-black/25 px-2 py-3 text-center backdrop-blur-[2px]">
                        <div
                          className="font-display text-[10px] font-black tracking-[0.22em]"
                          style={{ color: theme.previewFrom }}
                        >
                          HACKER
                        </div>
                        <div
                          className="font-display text-xl font-black leading-none tracking-[0.08em]"
                          style={{ color: theme.previewTo, textShadow: `0 0 14px ${theme.previewTo}99` }}
                        >
                          KOMBAT
                        </div>
                      </div>

                      <div className="mt-auto pt-3">
                        <div className="flex items-center gap-1.5 font-display text-sm font-extrabold text-white">
                          <Palette className="h-3.5 w-3.5" style={{ color: theme.previewFrom }} />
                          {theme.key === 'femme' ? 'Женская · Neon Muse' : theme.name}
                        </div>
                        <div className="mt-1 text-[10px] leading-snug text-slate-200/85">
                          {theme.tagline}
                        </div>
                        <div
                          className="mt-2 h-1.5 w-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${theme.previewFrom}, ${theme.previewTo})` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-slate-800 bg-[var(--ui-panel-deep)] px-3 py-2.5 text-[10px] leading-relaxed text-slate-400">
              <strong className="text-slate-200">Можно поменять позже:</strong> открой кнопку{' '}
              <span className="font-bold text-[var(--ui-secondary)]">«Скины»</span> в верхней панели и выбери{' '}
              <span className="font-bold text-slate-200">«Базовая тема»</span>. Все темы остаются бесплатными.
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
