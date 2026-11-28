import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Eye, Lock, Sparkles, Terminal, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  ENERGY_REGEN_SECONDS,
  getDeskStageInfo,
  getGameDayKey,
  OFFLINE_PASSIVE_RATE_MULT,
  OFFLINE_REQUIRED_ACTIVE_SECONDS,
  OFFLINE_TAP_CAP_SECONDS,
  OFFLINE_TAP_RATE_PER_SEC,
} from '../../shared/mechanics';
import { SKINS_CONFIG } from '../../shared/skins.config';
import { composeSceneFilter, getThemeScene } from '../../shared/themes.config';
import {
  hasLocationDeskScene,
  locationDeskScene,
  locationTagline,
} from '../../shared/locations';
import {
  DESK_STAGE_KEYS,
  DESK_STAGE_TOTAL,
  deskStageLabel,
  deskStageNumber,
  type DeskStage,
} from '../../shared/desk-stages.config';
import { BackdropWeather } from './BackdropWeather';
import { resolveEquippedSkins } from '../../shared/skins.config';
import type { DerivedStats, PlayerProgressStats } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { CheckIcon, GlassesIcon, LockIcon, RepIcon, ScaleIcon } from './ui-icons';
import { formatCompact } from '../lib/format';
import { withAlpha } from '../lib/colors';

interface ByteParticle {
  id: number;
  x: number;
  y: number;
  text: string;
}

// v1.4: список этапов больше не дублируется в компоненте — он живёт в
// shared/desk-stages.config.ts вместе с границами уровней и артами (R2).
const ALL_STAGES = DESK_STAGE_KEYS;
// v5.0: вместо HEX-мусора — короткие человеческие подтверждения.
const BYTE_SNIPPETS = ['+Data', 'ок', 'пакет', 'готово', '+Data', 'кафе', 'налито'];

let particleSeq = 1;

export const DeskScene: React.FC = () => {
  const {
    player,
    tapHack,
    lockdownRemainingSec,
    clearHeatLockdown,
    busyKey,
    baseTheme,
    deskBackdrop,
    gameplayV3,
    activeLocation,
    worldEnabled,
  } = useGame();

  const [particles, setParticles] = useState<ByteParticle[]>([]);
  const [pulseActive, setPulseActive] = useState(false);
  const [previewStage, setPreviewStage] = useState<DeskStage | null>(null);
  const [showStageBar, setShowStageBar] = useState(false);

  // Автономная визуальная вспышка Botmaster (автоклик 1/сек).
  // v3.5: зависимость сузили до autoClickPerSec. Раньше в deps лежал весь
  // `player`, который меняется на КАЖДЫЙ тап — интервал пересоздавался десятки
  // раз в секунду, и тап на телефоне начинал подтормаживать. Сила клика читается
  // через ref, поэтому счётчик всегда свежий без перезапуска таймера.
  // v6.7: у места есть собственный кадр рабочего места ⇒ панель «Этапы» не нужна.
  // Считаем это ДО early-return, потому что на флаге висит сброс превью ниже.
  const hasPlaceScene = worldEnabled && hasLocationDeskScene(activeLocation.id);

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
          text: `+${formatCompact(clickPowerRef.current)}`,
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

  // Уехал из Комнаты с открытым превью — превью больше не к чему: сцена теперь
  // принадлежит месту, а панели этапов на экране нет.
  useEffect(() => {
    if (hasPlaceScene && previewStage !== null) {
      setPreviewStage(null);
      setShowStageBar(false);
    }
  }, [hasPlaceScene, previewStage]);

  if (!player) return null;

  const { derived } = player;
  /**
   * v1.4 (R3): статус ветки — отдельная строка над сценой, а не баннер поверх
   * арта. Подпись короткая и однострочная (на 320 px она обрезается, но не
   * переносится в 2–3 строки), полный текст живёт в title/aria.
   */
  const alignmentLabel =
    derived.alignment === 'white_hat'
      ? {
          short: 'Белый хакинг · +20% Data/ч · ×2 белые миссии',
          long: 'Белый хакинг: +20% Data в час и двойная награда белых миссий',
          className:
            'bg-[var(--ui-panel-deep)]/85 border-[rgba(var(--ui-primary-rgb),0.60)] text-[var(--ui-primary)]',
          icon: <RepIcon className="mr-1 inline h-3 w-3 shrink-0 align-[-1px]" />,
        }
      : derived.alignment === 'black_hat'
        ? {
            short: 'Чёрный хакинг · +50% к тапу · риск Heat',
            long: 'Чёрный хакинг: +50% к силе тапа, но каждый взлом добавляет Heat',
            className:
              'bg-[var(--ui-panel-deep)]/85 border-[rgba(var(--ui-secondary-rgb),0.70)] text-[var(--ui-secondary)]',
            icon: <GlassesIcon className="mr-1 inline h-3 w-3 shrink-0 align-[-1px]" />,
          }
        : {
            short: 'Нейтральный хакер',
            long: 'Нейтральный хакер: без бонусов и без штрафов ветки',
            className: 'bg-[var(--ui-panel-deep)]/80 border-slate-700/80 text-slate-300',
            icon: <ScaleIcon className="mr-1 inline h-3 w-3 shrink-0 align-[-1px]" />,
          };
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
  const buttonGradient: [string, string] = uiSkin?.uiTokens
    ? [uiSkin.uiTokens.accent, uiSkin.uiTokens.accent2]
    : baseTheme.ui.buttonGradient;
  // v3.6.3: у базовой темы свой арт на КАЖДЫЙ этап (1/5/10/15/20/25/30) —
  // рабочий стол растёт вместе с уровнем, как в классике. Если у темы набора
  // нет, падаем на единственную сцену, а дальше — на сцену классики.
  // v4.1: «вид из окна» — отдельный косметический слой. Если он выбран, он
  // заменяет арт этапа/темы; скин стола при этом не перекрашивает фотографию
  // (hue-rotate превратил бы закат в кислоту), но продолжает жить в интерфейсе.
  // v6.7: место работы меняет и сцену, а не только фон страницы. Вне Комнаты
  // сцена — кадр рабочего места этой локации (ноутбук → полная станция), и он
  // сильнее косметического «вида из окна»: мир важнее декора. Дома всё как было:
  // бэкдроп из профиля, арт темы или этап стола.
  const locationArt = hasPlaceScene ? locationDeskScene(activeLocation.id, activeStage) : null;
  const sceneUrl =
    locationArt?.url ?? deskBackdrop?.url ?? getThemeScene(baseTheme, activeStage) ?? stageInfo.sceneUrl;
  const sceneFilter =
    locationArt || deskBackdrop ? 'none' : composeSceneFilter(activeSkin.cssFilter, baseTheme);
  /**
   * Подпись сцены (v1.5, пакет «Чистый стол»).
   *
   * Было: дома «Ур. N — Название этапа», на чужом месте «Улица · Ноутбук».
   * Стало: дома — «Этап N/7 — Название» (номер этапа, не уровень), в чужом
   * месте — только название места и его лор. Тир рабочего места («ноутбук»
   * /«полная станция») со сцены убран совсем: это информация об этапе, а
   * этапы живут в кнопке «Этапы» и на её экране.
   */
  const sceneTitle = locationArt ? activeLocation.name : stageInfo.title;
  const sceneSubtitle = locationArt ? locationTagline(activeLocation.id) : stageInfo.subtitle;

  /**
   * v6.4: сцена снова тап-поверхность в ОБОИХ режимах флага.
   *
   * Отклик мгновенный и полностью локальный: `tapHack()` сразу двигает Data,
   * CPU и счётчики в оптимистичном стейте (сервер подтвердит фоном, пачками по
   * 20 через /api/click). Здесь только визуал — вспышка сцены и плавающее
   * число; анимируются лишь transform/opacity.
   */
  const emitTapFeedback = (x: number, y: number) => {
    setPulseActive(true);
    window.setTimeout(() => setPulseActive(false), 110);

    const id = particleSeq++;
    const tag = BYTE_SNIPPETS[id % BYTE_SNIPPETS.length];
    setParticles((prev) => [
      ...prev.slice(-16),
      { id, x, y, text: `+${formatCompact(derived.clickPower)} • ${tag}` },
    ]);

    window.setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 850);
  };

  const handleTap = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * 100;
    const relY = ((e.clientY - rect.top) / rect.height) * 100;

    if (!tapHack()) return;

    const x = Number.isFinite(relX) && relX > 0 ? relX : 50 + (Math.random() - 0.5) * 24;
    const y = Number.isFinite(relY) && relY > 0 ? relY : 55;
    emitTapFeedback(x, y);
  };

  /** Клавиатура: Enter/Space — тот же тап, число всплывает по центру сцены. */
  const handleTapKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!tapHack()) return;
    emitTapFeedback(50, 58);
  };

  /** Тап доступен, пока терминал не в блокировке и есть заряд CPU. */
  const tapReady = lockdownRemainingSec === 0 && (player?.energy ?? 0) > 0;

  return (
    <div className="space-y-3">
      {/* Шапка сцены: подпись этапа/места + кнопка «Этапы».
          v1.5 («Чистый стол»): подпись приглушена до второстепенной — 11 px,
          muted-токен, без жирности и без акцентного цвета, чтобы не спорить с
          заголовком локации в HUD. Уровней здесь нет вообще: номер уровня
          принадлежит игроку (HUD), этапы — экрану кнопки «Этапы». */}
      <div className="flex items-center justify-between gap-2 bg-[var(--ui-panel)]/90 border border-slate-800 rounded-xl px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-normal text-[var(--ui-text-muted)]">
            <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
            <span className="truncate" data-qa="desk-scene-title">
              {sceneTitle}
            </span>
            {previewStage && previewStage !== derived.deskStage && (
              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.2 text-[11px] text-amber-300">
                Превью
              </span>
            )}
          </div>
          <p
            data-qa="desk-scene-subtitle"
            className="truncate text-[11px] text-[var(--ui-text-faint)]"
          >
            {sceneSubtitle}
          </p>
        </div>

        {locationArt ? null : (
          <button
            type="button"
            onClick={() => {
              setShowStageBar((s) => !s);
              if (showStageBar) setPreviewStage(null);
            }}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ui-panel)] hover:bg-[var(--ui-panel)] border border-[rgba(var(--ui-primary-rgb),0.30)] text-[11px] font-semibold text-slate-200 transition cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[var(--ui-primary)]" />
            <span>Этапы ({deskStageNumber(derived.deskStage)}/{DESK_STAGE_TOTAL})</span>
          </button>
        )}
      </div>

      {/* Панель переключения уже открытых этапов. Закрытые уровни видны как
          ориентир прогрессии, но не являются интерактивными и не показывают арт. */}
      <AnimatePresence>
        {showStageBar && !locationArt && (
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
                    aria-label={
                      unlocked
                        ? `Посмотреть этап рабочего стола: этап ${deskStageNumber(st)} из ${DESK_STAGE_TOTAL} (открыт с Ур. ${st})`
                        : `Этап ${deskStageNumber(st)} из ${DESK_STAGE_TOTAL} закрыт — откроется на Ур. ${st}`
                    }
                    onClick={() => {
                      if (!unlocked) return;
                      setPreviewStage(st === derived.deskStage ? null : st);
                    }}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                      isSelected
                        ? 'bg-[rgba(var(--ui-primary-rgb),0.20)] border-[var(--ui-primary)] text-[var(--ui-primary)] cursor-pointer'
                        : unlocked
                          ? 'bg-[var(--ui-panel)] border-[var(--ui-success)]/35 text-[var(--ui-success)] cursor-pointer'
                          : 'bg-[var(--ui-panel-deep)] border-slate-800 text-slate-500 cursor-not-allowed opacity-70'
                    }`}
                  >
                    {unlocked ? <CheckIcon className="mr-1 inline h-3 w-3 align-[-1px]" /> : <LockIcon className="mr-1 inline h-3 w-3 align-[-1px]" />}
                    {deskStageLabel(st)}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* v1.4 (R3): ветка и автоклик — отдельной строкой в потоке над сценой.
          Раньше баннер «БЕЛЫЙ ХАКИНГ» лежал поверх арта: на 320–360 px он
          переносился в две-три строки, и шапка сцены («Этапы») визуально
          оставалась под ним. Теперь строка физически не может перекрыть ни
          шапку, ни тап-поверхность арта. Проверяется в qa:ui. */}
      <div className="flex items-center justify-between gap-2" data-qa="desk-status">
        <span
          data-qa="desk-alignment"
          title={alignmentLabel.long}
          className={`min-w-0 truncate rounded-lg border px-2 py-1 text-[11px] font-bold ${alignmentLabel.className}`}
        >
          {alignmentLabel.icon}
          {alignmentLabel.short}
        </span>
        {derived.autoClickPerSec > 0 && (
          <span
            data-qa="desk-autoclick"
            className="shrink-0 rounded-lg border border-[var(--ui-success)]/60 bg-[var(--ui-panel-deep)]/85 px-2 py-1 text-[11px] font-bold text-[var(--ui-success)]"
          >
            Автоклик {derived.autoClickPerSec}/сек
          </span>
        )}
      </div>

      {/* Центральная интерактивная сцена рабочего стола хакера */}
      {/* v6.4: сцена — главная тап-поверхность при любом значении флага.
          Один тап = 1 CPU Charge + clickPower Data; отклик мгновенный. */}
      <div
        onClick={handleTap}
        onKeyDown={handleTapKey}
        role="button"
        tabIndex={0}
        aria-label={`Взломать цель тапом: +${formatCompact(derived.clickPower)} Data за 1 CPU Charge. Осталось ${Math.floor(player?.energy ?? 0)} CPU`}
        data-qa="desk-tap"
        data-tap-state={tapReady ? 'ready' : 'blocked'}
        className="relative rounded-2xl overflow-hidden border select-none aspect-[16/10] bg-[var(--ui-panel-deep)] transition-transform duration-100 cursor-pointer touch-manipulation active:scale-[0.992] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-primary)]"
        style={{
          borderColor: withAlpha(activeSkin.primaryHex, 0.33),
          boxShadow: pulseActive
            ? `0 0 36px ${withAlpha(activeSkin.primaryHex, 0.33)}, inset 0 0 28px ${withAlpha(activeSkin.secondaryHex, 0.27)}`
            : `0 0 24px rgba(var(--ui-primary-rgb),0.12)`,
        }}
      >
        {/* WebP слой эволюционирующего стола */}
        <motion.img
          key={sceneUrl}
          src={sceneUrl}
          alt={sceneTitle}
          data-qa="desk-scene"
          data-scene-kind={locationArt ? `${activeLocation.id}:${locationArt.tier}` : 'home'}
          loading="lazy"
          initial={{ opacity: 0.4, scale: 1.03 }}
          animate={{ opacity: 1, scale: pulseActive ? 1.015 : 1 }}
          transition={{ duration: 0.25 }}
          style={{ filter: sceneFilter }}
          className="w-full h-full object-cover pointer-events-none"
        />

        {/* Погода за окном: солнце, облака, чайки, дождь или ночные огни */}
        {deskBackdrop && !locationArt && <BackdropWeather kind={deskBackdrop.weather} />}

        {/* Вуаль темы: мягко подкрашивает сцену под палитру базы.
            Только для сцен по уровню: у выбранной локации свой арт и своя погода,
            поверх них ещё один слой не нужен. Раньше здесь была отдельная ветка
            для локации: к rgba-строке темы дописывался суффикс прозрачности, цвет
            становился невалидным и браузер выбрасывал весь градиент. Ветка
            удалена — визуал не изменился ни в одном из двух режимов. */}
        {!deskBackdrop && !locationArt && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(120% 90% at 50% 100%, ${baseTheme.sceneVignette} 0%, transparent 62%)`,
            }}
          />
        )}



        {/* v5.0: на 30+ уровне — не «матрица», а тёплые искры над столом:
            свет фонарей, пыль в воздухе. Атмосфера, а не терминал. */}
        {activeStage >= 30 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[
              { left: 12, top: 28, size: 3, delay: 0 },
              { left: 26, top: 62, size: 2, delay: 1.4 },
              { left: 41, top: 18, size: 2, delay: 2.6 },
              { left: 58, top: 74, size: 3, delay: 0.9 },
              { left: 72, top: 34, size: 2, delay: 3.2 },
              { left: 88, top: 56, size: 3, delay: 1.9 },
            ].map((spark) => (
              <span
                key={`${spark.left}-${spark.top}`}
                className="absolute rounded-full animate-pulse"
                style={{
                  left: `${spark.left}%`,
                  top: `${spark.top}%`,
                  width: spark.size,
                  height: spark.size,
                  background: 'var(--ui-primary)',
                  boxShadow: '0 0 10px rgba(var(--ui-primary-rgb),0.75)',
                  animationDelay: `${spark.delay}s`,
                  animationDuration: '3.4s',
                }}
              />
            ))}
          </div>
        )}

        {/* v6.4: подсказка тап-цикла — что даёт нажатие и сколько стоит.
            pointer-events-none: не перехватывает сам тап у сцены. */}
        <div
          data-qa="tap-hint"
          className="pointer-events-none absolute left-2.5 bottom-9 z-[3] max-w-[52%]"
        >
          <span
            className={`flex items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[11px] font-extrabold tracking-wide backdrop-blur-sm ${
              tapReady
                ? 'border-[rgba(var(--ui-primary-rgb),0.65)] bg-[var(--ui-panel-deep)]/85 text-[var(--ui-primary)]'
                : 'border-slate-700/80 bg-[var(--ui-panel-deep)]/85 text-slate-400'
            }`}
          >
            <Zap className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {tapReady
                ? `ТАП · +${formatCompact(derived.clickPower)} DATA · −1 CPU`
                : 'НЕТ CPU · 1 за 2 с'}
            </span>
          </span>
        </div>


        {/* v6.5: чип «что за окном» убран со сцены. Смена места теперь живёт
            в одной полосе локаций под сценой (LocationStrip) — третьей двери в
            тот же экран больше нет. Косметические бэкдропы остались в профиле. */}

        {/* CRT скан-линии и виньетка */}
        <div className="scanline-overlay absolute inset-0" />
        <div
          className={`absolute inset-0 pointer-events-none bg-gradient-to-t ${
            'from-[var(--ui-panel-deep)]/55 via-transparent to-[var(--ui-panel-deep)]/20'
          }`}
        />

        {/* v1.5 («Чистый стол»): нижний ряд «До Ур. N: XP» и чипы
            «Полная станция с Ур. 20» / «Следующий этап с Ур. 10» удалены.
            Поверх сцены не остаётся ни одного текста про уровни: прогресс XP
            виден шкалой и числом в HUD, этапы — за кнопкой «Этапы». */}

        {/* Летящие байты при каждом тапе */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: 0, scale: 0.9 }}
            animate={{ opacity: 0, y: -76, scale: 1.12 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className="pointer-events-none absolute -translate-x-1/2 font-display text-[13px] sm:text-[16px] font-extrabold text-[var(--ui-primary)] drop-shadow-[0_0_10px_rgba(var(--ui-primary-rgb),0.95)] whitespace-nowrap"
          >
            {p.text}
          </motion.div>
        ))}

        {/* Оверлей штрафа Heat > 100 (блокировка кликов на 60 сек) */}
        {lockdownRemainingSec > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-[var(--ui-panel-deep)]/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-10"
          >
            <Lock className="w-9 h-9 text-rose-500 animate-bounce mb-1.5" />
            <div className="font-display text-[16px] font-extrabold text-rose-400 tracking-wide">
              ПЕРЕГРЕВ РОЗЫСКА — БЛОК ТЕРМИНАЛА
            </div>
            <p className="text-[13px] text-slate-300 mt-1 max-w-xs">
              Киберпатруль заблокировал консоль. Авторазблокировка через{' '}
              <span className="font-bold text-white">{lockdownRemainingSec} сек.</span>
            </p>
            <button
              type="button"
              disabled={busyKey === 'clear_lockdown'}
              onClick={() => void clearHeatLockdown()}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-[var(--ui-secondary)] hover:bg-[rgba(var(--ui-secondary-rgb),0.85)] text-white text-[13px] font-bold shadow-[0_0_18px_rgba(var(--ui-secondary-rgb),0.5)] transition cursor-pointer"
            >
              ⚡ Сбросить прокси за 2 💎 Crypto
            </button>
          </div>
        )}
      </div>

      {/* Главная тактильная кнопка «HACK» (Центр-низ по п. 4.1 ТЗ).
          v5.7: при GAMEPLAY_V3 её нет — доход идёт из контрактов. */}
      {!gameplayV3 && (
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={handleTap}
        disabled={lockdownRemainingSec > 0}
        className="relative w-full py-4 px-6 rounded-2xl font-display font-black tracking-widest uppercase text-[20px] sm:text-[20px] text-[var(--ui-on-primary)] transition overflow-hidden cursor-pointer disabled:opacity-45"
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
            className="text-[13px] font-num font-extrabold px-2 py-0.5 rounded-md bg-[var(--ui-panel-deep)]/85"
            style={{ color: baseTheme.palette.cyan }}
          >
            +{formatCompact(derived.clickPower)} DATA
          </span>
        </span>
        {player.energy <= 0 && (
          <span className="block text-[11px] font-num text-[var(--ui-panel-deep)] mt-0.5">
            Нет энергии CPU — ждите регенерации (+1⚡/{ENERGY_REGEN_SECONDS}с)
          </span>
        )}
      </motion.button>
      )}

      {/* Быстрая сводка бустов под кнопкой HACK */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[var(--ui-panel)]/85 border border-slate-800/90 p-2">
          <div className="text-[11px] text-slate-400">{gameplayV3 ? 'CPU Charge' : 'Сила тапа'}</div>
          <div className="text-[13px] font-bold text-[var(--ui-primary)] flex items-center justify-center gap-1 mt-0.5">
            <Zap className="w-3 h-3" />{' '}
            {gameplayV3
              ? `${formatCompact(player.energy)}/${formatCompact(derived.maxEnergy)}`
              : `+${formatCompact(derived.clickPower)}`}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--ui-panel)]/85 border border-slate-800/90 p-2">
          <div className="text-[11px] text-slate-400">Команда</div>
          <div className="text-[13px] font-bold text-[var(--ui-success)] mt-0.5">{player.team.length} / 6</div>
        </div>
        <div className="rounded-xl bg-[var(--ui-panel)]/85 border border-slate-800/90 p-2">
          <div className="text-[11px] text-slate-400">Слоты взломов</div>
          <div className="text-[13px] font-bold text-[var(--ui-secondary)] mt-0.5">
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

  return (
    <div
      className={`rounded-xl border px-3 py-2 space-y-1.5 ${
        qualified
          ? 'bg-[var(--ui-panel-deep)]/70 border-[var(--ui-success)]/35'
          : 'bg-[var(--ui-panel-deep)]/70 border-slate-800/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          Оффлайн-копилка (до {Math.round(OFFLINE_TAP_CAP_SECONDS / 3600)} ч)
        </span>
        <span className="text-[11px] font-num font-bold text-[var(--ui-success)]">
          +{formatCompact(Math.round(perHour))} DATA/час
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          {qualified ? <><CheckIcon className="mr-1 inline h-3 w-3 align-[-1px] text-[var(--ui-success)]" /> копилка активна</> : `Активность сегодня: ${leftMin > 0 ? `${leftMin} мин осталось` : '—'}`}
        </span>
        <span className={`text-[11px] font-num font-bold ${qualified ? 'text-[var(--ui-success)]' : 'text-[var(--ui-warn)]'}`}>
          {Math.floor(activeSec / 60)} / {Math.round(requiredSec / 60)} мин
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-800/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${qualified ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-warn)]'}`}
          style={{ width: `${Math.min(100, (activeSec / requiredSec) * 100)}%` }}
        />
      </div>
    </div>
  );
};
