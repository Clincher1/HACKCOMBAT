import { Check, Palette, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { BASE_THEMES, type BaseThemeConfig, type BaseThemeKey } from '../../shared/themes.config';
import { useGame } from '../context/GameContext';
import { withAlpha } from '../lib/colors';

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
  const { player, setBaseTheme, busyKey, newPlayerMode } = useGame();
  const [open, setOpen] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<BaseThemeKey | null>(null);

  const newOperator = isNewOperator(player);

  useEffect(() => {
    // v5.4: в первом сеансе на экране ровно один вопрос — «тапни». Выбор темы
    // вернётся после онбординга (stats.baseTheme по-прежнему пуст).
    if (newPlayerMode) return;
    if (newOperator && !player?.stats.baseTheme) setOpen(true);
  }, [newOperator, newPlayerMode, player?.stats.baseTheme]);

  useEffect(() => {
    if (!pendingTheme || player?.stats.baseTheme !== pendingTheme) return;
    setPendingTheme(null);
    setOpen(false);
  }, [pendingTheme, player?.stats.baseTheme]);

  if (!open || !player) return null;

  const themeBusy = busyKey?.startsWith('theme:') ?? false;
  // Порядок BASE_THEMES — часть UX: классика слева, женская тема справа.
  const themes = BASE_THEMES;

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
          className="w-full max-w-lg overflow-hidden rounded-3xl border border-[rgba(var(--ui-primary-rgb),0.45)] bg-[var(--ui-panel)] shadow-[0_0_55px_rgba(var(--ui-primary-rgb),0.2)]"
        >
          <div className="border-b border-white/10 bg-gradient-to-r from-[var(--ui-panel)] to-[var(--ui-panel-deep)] px-4 py-4 text-center sm:px-5">
            <div className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-black/20 px-3 py-1.5">
              <span className="font-display text-[13px] font-black tracking-[0.22em] text-[var(--ui-primary)]">
                HK
              </span>
              <span className="text-[11px] font-bold tracking-[0.18em] text-slate-300">
                HACKER KOMBAT
              </span>
            </div>
            <div className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ui-primary)]">
              <Sparkles className="h-3.5 w-3.5" /> Первый запуск
            </div>
            <h1 id="theme-onboarding-title" className="font-display text-[20px] font-extrabold text-white sm:text-[20px]">
              Выбери, как всё будет выглядеть
            </h1>
            <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-slate-300">
              Это визуальный стиль игры. Выбор бесплатный и не меняет Data, XP, шанс успеха или награды.
            </p>
          </div>

          <div className="p-3.5 sm:p-5">
            <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Тёплая база · неон · Neon Muse</span>
              <span>всё бесплатно</span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {themes.map((theme) => {
                const selecting = pendingTheme === theme.key;
                const active = player.stats.baseTheme === theme.key;
                return (
                  <button
                    key={theme.key}
                    type="button"
                    disabled={themeBusy}
                    onClick={() => chooseTheme(theme)}
                    className={`group relative min-h-[238px] overflow-hidden rounded-2xl border p-2 text-left transition sm:min-h-[255px] sm:p-3 ${
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
                          ? `linear-gradient(180deg, ${withAlpha(theme.previewFrom, 0.13)} 0%, ${withAlpha(theme.previewTo, 0.21)} 48%, rgba(var(--ui-panel-deep-rgb), 0.93) 100%)`
                          : `linear-gradient(145deg, ${withAlpha(theme.previewFrom, 0.19)} 0%, ${withAlpha(theme.previewTo, 0.16)} 48%, var(--ui-panel-deep) 100%)`,
                      }}
                    />

                    <div className="relative flex h-full min-w-0 flex-col">
                      {/* Верхняя строка без текста: только глиф и отметка выбора.
                          Текстовый бейдж в узкой колонке (≈64 px на 320 px экрана)
                          обрезался по правому краю — он переехал в плашку на всю
                          ширину карточки, где обрезаться физически не может. */}
                      <div className="flex items-start justify-between gap-1">
                        <span className="shrink-0 text-[20px] leading-none" aria-hidden="true">
                          {theme.glyph}
                        </span>
                        {(active || selecting) && (
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/90 text-[var(--ui-panel-deep)]">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>

                      {/* Мини-превью логотипа. Текст живёт в SVG с viewBox и
                          w-full: он масштабируется по ширине карточки, поэтому
                          «HACKER KOMBAT» не выходит за рамку ни на одной теме и
                          ни на одной ширине экрана (320–390 px включительно). */}
                      <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-white/15 bg-black/25 px-1 py-2 backdrop-blur-[2px]">
                        <svg
                          viewBox="0 0 132 54"
                          className="mx-auto block h-auto w-full"
                          preserveAspectRatio="xMidYMid meet"
                          role="presentation"
                          aria-hidden="true"
                          data-qa="theme-preview-logo"
                        >
                          <text
                            x="66"
                            y="19"
                            textAnchor="middle"
                            className="font-display"
                            fontSize="15"
                            fontWeight="900"
                            letterSpacing="3"
                            fill={theme.previewFrom}
                          >
                            HACKER
                          </text>
                          <text
                            x="66"
                            y="45"
                            textAnchor="middle"
                            className="font-display"
                            fontSize="25"
                            fontWeight="900"
                            letterSpacing="1.4"
                            fill={theme.previewTo}
                            style={{ filter: `drop-shadow(0 0 7px ${withAlpha(theme.previewTo, 0.6)})` }}
                          >
                            KOMBAT
                          </text>
                        </svg>
                      </div>

                      <div className="mt-auto pt-2">
                        <div className="flex min-w-0 items-center gap-1.5 font-display text-[16px] font-extrabold text-white">
                          <Palette className="h-3.5 w-3.5 shrink-0" style={{ color: theme.previewFrom }} />
                          <span className="truncate">{theme.key === 'femme' ? 'Женская · Neon Muse' : theme.name}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-200/85">
                          {theme.tagline}
                        </div>
                        <div
                          className="mt-2 h-1.5 w-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${theme.previewFrom}, ${theme.previewTo})` }}
                        />
                        {/* Статус на всю ширину: «бесплатно» целиком в карточке
                            при любой ширине экрана (без обрезки по краю). */}
                        <div
                          data-qa="theme-price"
                          className={`mt-2 w-full truncate rounded-md px-0.5 py-0.5 text-center text-[11px] font-bold ${
                            active || selecting
                              ? 'bg-white/90 font-black text-[var(--ui-panel-deep)]'
                              : 'bg-black/35 text-white/85'
                          }`}
                        >
                          {selecting ? 'СОХРАНЯЮ' : active ? 'ВЫБРАНО' : 'бесплатно'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-slate-800 bg-[var(--ui-panel-deep)] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
              <strong className="text-slate-200">Можно поменять позже:</strong> открой кнопку{' '}
              <span className="font-bold text-[var(--ui-secondary)]">«Скины»</span> в верхней панели и выбери{' '}
              <span className="font-bold text-slate-200">«Базовая тема»</span>. Обе темы остаются бесплатными.
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
