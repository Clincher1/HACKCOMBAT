import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Lock, Sparkles, Terminal, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  getDeskStageInfo,
  getGameDayKey,
  OFFLINE_PASSIVE_RATE_MULT,
  OFFLINE_REQUIRED_ACTIVE_SECONDS,
  OFFLINE_TAP_CAP_SECONDS,
  OFFLINE_TAP_RATE_PER_SEC,
} from '../../shared/mechanics';
import { getManualTapMultiplier } from '../../shared/newYearCandy';
import { SKINS_CONFIG } from '../../shared/skins.config';
import { composeSceneFilter, getThemeScene } from '../../shared/themes.config';
import { resolveEquippedSkins } from '../../shared/skins.config';
import type { DerivedStats, PlayerProgressStats } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

interface ByteParticle {
  id: number;
  x: number;
  y: number;
  text: string;
}

const ALL_STAGES: (1 | 5 | 10 | 15 | 20 | 25 | 30)[] = [1, 5, 10, 15, 20, 25, 30];
const BYTE_SNIPPETS = ['0xFF', '10110', 'ACK', 'SYN', '0x7A', 'ROOT', '200 OK'];

let particleSeq = 1;

export const DeskScene: React.FC = () => {
  const {
    player,
    tapHack,
    lockdownRemainingSec,
    clearHeatLockdown,
    busyKey,
    baseTheme,
    nowMs,
  } = useGame();

  // Touch identifiers belong to individual fingers, including simultaneous taps.
  // Keep gestures that became scrolling separate from real taps.
  const touchesRef = useRef(new Map<number, { x: number; y: number; moved: boolean; target: HTMLElement }>());
  const suppressTouchClickUntilRef = useRef(0);
  const [particles, setParticles] = useState<ByteParticle[]>([]);
  const [pulseActive, setPulseActive] = useState(false);
  const [previewStage, setPreviewStage] = useState<1 | 5 | 10 | 15 | 20 | 25 | 30 | null>(null);
  const [showStageBar, setShowStageBar] = useState(false);

  // Автономная визуальная вспышка Botmaster (автоклик 1/сек).
  // v3.5: зависимость сузили до autoClickPerSec. Раньше в deps лежал весь
  // `player`, который меняется на КАЖДЫЙ тап — интервал пересоздавался десятки
  // раз в секунду, и тап на телефоне начинал подтормаживать. Сила клика читается
  // через ref, поэтому счётчик всегда свежий без перезапуска таймера.
  const clickPowerRef = useRef<number>(1);
  clickPowerRef.current = player?.derived.clickPower ?? 1;
  const autoClickPerSec = player?.derived.autoClickPerSec ?? 0;

  useEffect(() => {
    if (autoClickPerSec <= 0) return;
    const timer = window.setInterval(() => {
      const id = particleSeq++;
      setParticles((prev) => [
        ...prev.slice(-14),
        {
          id,
          x: 42 + Math.random() * 16,
          y: 52 + Math.random() * 10,
          text: `🤖 +${formatCompact(clickPowerRef.current)}`,
        },
      ]);
      window.setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== id));
      }, 850);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoClickPerSec]);

  // Превью можно включить только для уже открытого этапа. Это также закрывает
  // «старый» локальный выбор после Престижа, когда уровень игрока снова стал 1.
  useEffect(() => {
    if (previewStage !== null && (player?.derived.level ?? 0) < previewStage) {
      setPreviewStage(null);
      setShowStageBar(false);
    }
  }, [player?.derived.level, previewStage]);

  if (!player) return null;

  const { derived } = player;
  const tapMultiplier = getManualTapMultiplier(player.newYearCandy, nowMs);
  const manualTapPower = derived.clickPower * tapMultiplier;
  const boostSeconds = tapMultiplier > 1 ? Math.max(0, Math.ceil((Date.parse(player.newYearCandy.boostUntil!) - nowMs) / 1000)) : 0;
  const activeStage = previewStage ?? derived.deskStage;
  const stageInfo = getDeskStageInfo(activeStage);
  // v3.6.5: арт стола реагирует ТОЛЬКО на скин категории «рабочий стол».
  // Раньше сюда попадал любой надетый скин, и сепия от Amber Panels
  // (категория «интерфейс») перекрашивала сцену вместо панелей.
  const equippedSkins = resolveEquippedSkins({
    equippedSkin: player.equippedSkin,
    stats: player.stats,
  });
  const activeSkin = equippedSkins.desk;
  const uiSkin = equippedSkins.ui;
  // v3.6.5: скин интерфейса задаёт градиент главной кнопки. Если его нет —
  // работает градиент базовой темы (у классики циан, у Neon Muse роза).
  const buttonGradient: [string, string] = baseTheme.colorScheme !== 'light' && uiSkin?.uiTokens
    ? [uiSkin.uiTokens.accent, uiSkin.uiTokens.accent2]
    : baseTheme.ui.buttonGradient;
  // v3.6.3: у базовой темы свой арт на КАЖДЫЙ этап (1/5/10/15/20/25/30) —
  // рабочий стол растёт вместе с уровнем, как в классике. Если у темы набора
  // нет, падаем на единственную сцену, а дальше — на сцену классики.
  const sceneUrl = getThemeScene(baseTheme, activeStage) ?? stageInfo.sceneUrl;
  const sceneFilter = composeSceneFilter(activeSkin.cssFilter, baseTheme);

  const performTap = (target: HTMLElement, clientX: number, clientY: number) => {
    const rect = target.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * 100;
    const relY = ((clientY - rect.top) / rect.height) * 100;

    const ok = tapHack();
    if (!ok) return;

    setPulseActive(true);
    window.setTimeout(() => setPulseActive(false), 110);

    const id = particleSeq++;
    const tag = BYTE_SNIPPETS[id % BYTE_SNIPPETS.length];
    const x = Number.isFinite(relX) && relX > 0 ? relX : 50 + (Math.random() - 0.5) * 24;
    const y = Number.isFinite(relY) && relY > 0 ? relY : 55;

    setParticles((prev) => [
      ...prev.slice(-16),
      {
        id,
        x,
        y,
        text: `+${formatCompact(manualTapPower)} • ${tag}`,
      },
    ]);

    window.setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 850);
  };


  // Do not disable native scrolling: count a touch only on release if the finger
  // has not moved substantially. touchcancel never creates a tap.
  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (lockdownRemainingSec > 0) return;
    // The lockdown overlay has its own interactive button; never count it as a tap.
    const innerButton = (e.target as Element).closest('button');
    if (innerButton && innerButton !== e.currentTarget) return;
    for (const touch of Array.from(e.changedTouches)) {
      touchesRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY, moved: false, target: e.currentTarget });
    }
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    for (const touch of Array.from(e.changedTouches)) {
      const start = touchesRef.current.get(touch.identifier);
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 12) start.moved = true;
    }
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    let handled = false;
    for (const touch of Array.from(e.changedTouches)) {
      const start = touchesRef.current.get(touch.identifier);
      if (!start || start.target !== e.currentTarget) continue;
      touchesRef.current.delete(touch.identifier);
      handled = true;
      if (!start.moved && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) <= 12) {
        performTap(start.target, touch.clientX, touch.clientY);
      }
    }
    if (handled) {
      // iOS/Android can emit a compatibility click after touchend. A keyboard
      // click (detail=0) remains available, including to assistive technology.
      suppressTouchClickUntilRef.current = Date.now() + 800;
      if (e.cancelable) e.preventDefault();
    }
  };
  const handleTouchCancel = (e: React.TouchEvent<HTMLElement>) => {
    for (const touch of Array.from(e.changedTouches)) touchesRef.current.delete(touch.identifier);
  };
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.detail !== 0 && Date.now() < suppressTouchClickUntilRef.current) return;
    performTap(e.currentTarget, e.clientX, e.clientY);
  };
  const tapHandlers = { onClick: handleClick, onTouchStart: handleTouchStart, onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd, onTouchCancel: handleTouchCancel };

  return (
    <div className="space-y-3">
      {/* Инфо-строка эволюции стола + кнопка предпросмотра всех 7 этапов */}
      <div className="flex items-center justify-between gap-2 bg-[#10172e]/90 border border-slate-800 rounded-xl px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ui-primary)]">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{stageInfo.title}</span>
            {previewStage && previewStage !== derived.deskStage && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                Превью
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate">{stageInfo.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowStageBar((s) => !s);
            if (showStageBar) setPreviewStage(null);
          }}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#162040] hover:bg-[#1e2c56] border border-[rgba(var(--ui-primary-rgb),0.30)] text-[11px] font-semibold text-slate-200 transition cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-[var(--ui-primary)]" />
          <span>Этапы ({ALL_STAGES.indexOf(derived.deskStage) + 1}/7)</span>
        </button>
      </div>

      {/* Панель переключения уже открытых этапов. Закрытые уровни видны как
          ориентир прогрессии, но не являются интерактивными и не показывают арт. */}
      <AnimatePresence>
        {showStageBar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {ALL_STAGES.map((st) => {
                const unlocked = derived.level >= st;
                const isSelected = activeStage === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={!unlocked}
                    aria-label={unlocked ? `Посмотреть этап рабочего стола: уровень ${st}` : `Этап уровня ${st} закрыт`}
                    onClick={() => {
                      if (!unlocked) return;
                      setPreviewStage(st === derived.deskStage ? null : st);
                    }}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                      isSelected
                        ? 'bg-[rgba(var(--ui-primary-rgb),0.20)] border-[var(--ui-primary)] text-[var(--ui-primary)] cursor-pointer'
                        : unlocked
                          ? 'bg-[#10172e] border-[#7dff00]/35 text-[#7dff00] cursor-pointer'
                          : 'bg-[#0d1224] border-slate-800 text-slate-500 cursor-not-allowed opacity-70'
                    }`}
                  >
                    {unlocked ? '✓ ' : '🔒 '}Ур.{st}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Центральная интерактивная сцена рабочего стола хакера */}
      <div
        {...tapHandlers}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            tapHack();
          }
        }}
        className="theme-art relative rounded-2xl overflow-hidden border select-none cursor-pointer aspect-[16/10] bg-[#070a14] transition-transform duration-100 active:scale-[0.992]"
        style={{
          borderColor: `${activeSkin.primaryHex}55`,
          boxShadow: pulseActive
            ? `0 0 36px ${activeSkin.primaryHex}55, inset 0 0 28px ${activeSkin.secondaryHex}44`
            : `0 0 24px rgba(var(--ui-primary-rgb),0.12)`,
        }}
      >
        {/* WebP слой эволюционирующего стола */}
        <motion.img
          key={sceneUrl}
          src={sceneUrl}
          alt={stageInfo.title}
          loading="lazy"
          initial={{ opacity: 0.4, scale: 1.03 }}
          animate={{ opacity: 1, scale: pulseActive ? 1.015 : 1 }}
          transition={{ duration: 0.25 }}
          style={{ filter: sceneFilter }}
          className="w-full h-full object-cover pointer-events-none"
        />

        {/* Вуаль темы: мягко подкрашивает сцену под палитру базы */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(120% 90% at 50% 100%, ${baseTheme.sceneVignette} 0%, transparent 62%)`,
          }}
        />



        {/* Живой анимированный цифровой дождь Матрицы на 30+ уровне (п. 5.3 ТЗ) */}
        {activeStage >= 30 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-45">
            {[8, 22, 38, 54, 70, 86].map((leftPct, i) => (
              <div
                key={leftPct}
                className="matrix-column absolute top-0 text-[10px] font-bold text-[#7dff00] leading-tight whitespace-pre"
                style={{
                  left: `${leftPct}%`,
                  animationDelay: `${i * 0.7}s`,
                }}
              >
                {'1\n0\nF\nA\n9\n0\n1\nC'}
              </div>
            ))}
          </div>
        )}

        {/* CRT скан-линии и виньетка */}
        <div className="scanline-overlay absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-[#0a0e1a]/45 pointer-events-none" />

        {/* Праздничный декор не перехватывает нажатия и не заменяет сцену/скин. */}
        {baseTheme.key === 'new_year' && (
          <img src="/assets/themes/new-year/ornaments.svg" alt="" aria-hidden="true"
            className="absolute inset-x-0 top-0 w-full h-auto pointer-events-none" />
        )}

        {/* Верхние бейджи трёх направлений и автоклика Botmaster */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex flex-wrap items-center gap-1.5">
            {derived.alignment === 'white_hat' && (
              <span className="px-2 py-0.5 rounded-md bg-[#0a0e1a]/85 border border-[rgba(var(--ui-primary-rgb),0.60)] text-[var(--ui-primary)] text-[10px] font-bold">
                🛡️ БЕЛЫЙ ХАКИНГ (+20% Data/ч • ×2 белые миссии)
              </span>
            )}
            {derived.alignment === 'black_hat' && (
              <span className="px-2 py-0.5 rounded-md bg-[#0a0e1a]/85 border border-[rgba(var(--ui-secondary-rgb),0.70)] text-[var(--ui-secondary)] text-[10px] font-bold">
                🕶️ ЧЁРНЫЙ ХАКИНГ (+50% к тапу • риск Heat)
              </span>
            )}
            {derived.alignment === 'neutral' && (
              <span className="px-2 py-0.5 rounded-md bg-[#0a0e1a]/80 border border-slate-700/80 text-slate-300 text-[10px]">
                ⚖️ Нейтральный хакер
              </span>
            )}
          </div>

          {derived.autoClickPerSec > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-[#0a0e1a]/85 border border-[#7dff00]/60 text-[#7dff00] text-[10px] font-bold animate-pulse">
              🤖 Автоклик {derived.autoClickPerSec}/сек
            </span>
          )}
        </div>

        {/* Нижний прогресс-индикатор до следующего уровня */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] text-slate-300 pointer-events-none">
          <span className="bg-[#0a0e1a]/80 px-2 py-0.5 rounded border border-slate-800">
            До Ур. {derived.level + 1}:{' '}
            <strong className="text-[var(--ui-primary)]">
              {Math.round(derived.xpIntoLevel).toLocaleString('ru-RU')}/
              {Math.round(derived.xpToNext).toLocaleString('ru-RU')} XP
            </strong>
          </span>
          {stageInfo.nextLevel && (
            <span className="bg-[#0a0e1a]/80 px-2 py-0.5 rounded border border-slate-800 text-[10px] text-slate-400">
              След. сцена: Ур. {stageInfo.nextLevel}
            </span>
          )}
        </div>

        {/* Летящие байты при каждом тапе */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: 0, scale: 0.9 }}
            animate={{ opacity: 0, y: -76, scale: 1.12 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className="pointer-events-none absolute -translate-x-1/2 font-display text-xs sm:text-sm font-extrabold text-[var(--ui-primary)] drop-shadow-[0_0_10px_rgba(var(--ui-primary-rgb),0.95)] whitespace-nowrap"
          >
            {p.text}
          </motion.div>
        ))}

        {/* Оверлей штрафа Heat > 100 (блокировка кликов на 60 сек) */}
        {lockdownRemainingSec > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-[#0a0e1a]/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-10"
          >
            <Lock className="w-9 h-9 text-rose-500 animate-bounce mb-1.5" />
            <div className="font-display text-sm font-extrabold text-rose-400 tracking-wide">
              ПЕРЕГРЕВ РОЗЫСКА — БЛОК ТЕРМИНАЛА
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xs">
              Киберпатруль заблокировал консоль. Авторазблокировка через{' '}
              <span className="font-bold text-white">{lockdownRemainingSec} сек.</span>
            </p>
            <button
              type="button"
              disabled={busyKey === 'clear_lockdown'}
              onClick={() => void clearHeatLockdown()}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-[var(--ui-secondary)] hover:bg-[rgba(var(--ui-secondary-rgb),0.85)] text-white text-xs font-bold shadow-[0_0_18px_rgba(var(--ui-secondary-rgb),0.5)] transition cursor-pointer"
            >
              ⚡ Сбросить прокси за 2 💎 Crypto
            </button>
          </div>
        )}
      </div>

      {/* Главная тактильная кнопка «HACK» (Центр-низ по п. 4.1 ТЗ) */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        {...tapHandlers}
        disabled={lockdownRemainingSec > 0}
        className="relative w-full py-4 px-6 rounded-2xl font-display font-black tracking-widest uppercase text-lg sm:text-xl text-[#061018] transition overflow-hidden cursor-pointer disabled:opacity-45"
        style={{
          // v3.6.2: градиент берём из темы — у женской он розово-лавандовый,
          // у классики прежний кибер-циан. Скин по-прежнему влияет на сцену.
          background: `linear-gradient(135deg, ${buttonGradient[0]} 0%, ${buttonGradient[1]} 100%)`,
          boxShadow: `0 0 28px ${buttonGradient[0]}55`,
          marginTop: baseTheme.ui.catEars ? 10 : 0,
        }}
      >
        {/* Кошачьи ушки — аккуратная «форма» женской темы, без потери киберпанка */}
        {baseTheme.ui.catEars && (
          <span aria-hidden className="pointer-events-none absolute -top-[9px] inset-x-0 flex justify-center gap-1">
            <span
              className="w-0 h-0"
              style={{
                borderLeft: '11px solid transparent',
                borderRight: '11px solid transparent',
                borderBottom: `14px solid ${buttonGradient[0]}`,
                transform: 'skewX(-12deg)',
              }}
            />
            <span
              className="w-0 h-0"
              style={{
                borderLeft: '11px solid transparent',
                borderRight: '11px solid transparent',
                borderBottom: `14px solid ${buttonGradient[0]}`,
                transform: 'skewX(12deg)',
              }}
            />
          </span>
        )}
        <span className="relative z-10 flex items-center justify-center gap-2.5">
          <Terminal className="w-6 h-6 stroke-[2.5]" />
          <span>HACK</span>
          <span
            className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-md bg-[#0a0e1a]/85"
            style={{ color: baseTheme.palette.cyan }}
          >
            +{formatCompact(manualTapPower)} DATA
          </span>
        </span>
        {player.energy <= 0 && (
          <span className="block text-[10px] font-mono text-[#0a0e1a] mt-0.5">
            Нет энергии CPU — восстановление +{formatCompact(derived.energyRegenPerSec * 60)}⚡/мин
          </span>
        )}
      </motion.button>

      {tapMultiplier > 1 && <div className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-center text-xs font-bold text-rose-200">
        🍬 ×2 Data за ручные тапы · {Math.floor(boostSeconds / 3600)}:{String(Math.floor(boostSeconds % 3600 / 60)).padStart(2, '0')}:{String(boostSeconds % 60).padStart(2, '0')}
      </div>}
      {/* Быстрая сводка бустов под кнопкой HACK */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[#10172e]/85 border border-slate-800/90 p-2">
          <div className="text-[10px] text-slate-400">Сила тапа</div>
          <div className="text-xs font-bold text-[var(--ui-primary)] flex items-center justify-center gap-1 mt-0.5">
            <Zap className="w-3 h-3" /> +{formatCompact(manualTapPower)}
          </div>
        </div>
        <div className="rounded-xl bg-[#10172e]/85 border border-slate-800/90 p-2">
          <div className="text-[10px] text-slate-400">Команда</div>
          <div className="text-xs font-bold text-[#7dff00] mt-0.5">{player.team.length} / 6</div>
        </div>
        <div className="rounded-xl bg-[#10172e]/85 border border-slate-800/90 p-2">
          <div className="text-[10px] text-slate-400">Слоты взломов</div>
          <div className="text-xs font-bold text-[var(--ui-secondary)] mt-0.5">
            {player.activeMissions.length} / {derived.missionSlots}
          </div>
        </div>
      </div>

    </div>
  );
};

/**
 * Плашка оффлайн-копилки (v3.2).
 * Показывает, сколько капает в час и сколько ещё нужно поиграть сегодня,
 * чтобы копилка «открылась». Считаем тот же день, что и сервер (Москва, UTC+3).
 */
export const OfflineBankNote: React.FC<{
  derived: DerivedStats;
  stats: PlayerProgressStats;
}> = ({ derived, stats }) => {
  const requiredSec = OFFLINE_REQUIRED_ACTIVE_SECONDS;
  // Живые сутки по Москве: после полуночи счётчик начинается заново.
  const [dayKey, setDayKey] = useState(() => getGameDayKey());
  useEffect(() => {
    const timer = window.setInterval(() => setDayKey(getGameDayKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const isToday = stats.activeDayKey === dayKey;
  const activeSec = isToday ? Math.min(requiredSec, Math.floor(stats.activeSecondsToday ?? 0)) : 0;
  const qualified = activeSec >= requiredSec;
  const perHour =
    derived.clickPower * OFFLINE_TAP_RATE_PER_SEC * 3600 +
    derived.dataPerHour * OFFLINE_PASSIVE_RATE_MULT;
  const leftMin = Math.max(0, Math.ceil((requiredSec - activeSec) / 60));
  const capMinutes = Math.floor(derived.offlineCapSeconds / 60);
  const passiveCap = `${Math.floor(capMinutes / 60)} ч${capMinutes % 60 ? ` ${capMinutes % 60} мин` : ''}`;

  return (
    <div
      className={`rounded-xl border px-3 py-2 space-y-1.5 ${
        qualified
          ? 'bg-[#0a0e1a]/70 border-[#7dff00]/35'
          : 'bg-[#0a0e1a]/70 border-slate-800/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">
          Оффлайн-копилка
        </span>
        <span className="text-[11px] font-mono font-bold text-[#7dff00]">
          +{formatCompact(Math.round(perHour))} DATA/час
        </span>
      </div>
      <p className="text-[10px] text-slate-400 leading-snug">
        50% дохода + 6 фоновых тапов/мин. Пассив до {passiveCap},
        тапы до {Math.round(OFFLINE_TAP_CAP_SECONDS / 3600)} ч. После 8 минут игры за сутки.
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">
          {qualified ? '✅ копилка активна' : `Активность сегодня: ${leftMin > 0 ? `${leftMin} мин осталось` : '—'}`}
        </span>
        <span className={`text-[11px] font-mono font-bold ${qualified ? 'text-[#7dff00]' : 'text-[#ffc400]'}`}>
          {Math.floor(activeSec / 60)} / {Math.round(requiredSec / 60)} мин
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-800/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${qualified ? 'bg-[#7dff00]' : 'bg-[#ffc400]'}`}
          style={{ width: `${Math.min(100, (activeSec / requiredSec) * 100)}%` }}
        />
      </div>
    </div>
  );
};
