import { BookOpen, ChevronRight, Flame, Gift, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveEquippedSkins } from '../../shared/skins.config';
import { ENERGY_REGEN_SECONDS } from '../../shared/mechanics';
import { LollipopBadge } from './LollipopBadge';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';
import { withAlpha } from '../lib/colors';
import { AvatarFallbackIcon, ChipsIcon, CosmeticsIcon, CryptoIcon, DataIcon, LocationIcon, PackageIcon, RepIcon } from './ui-icons';

/**
 * v1.1: экран инвентаря — ленивый чанк. Внутри ModalFrame и framer-motion,
 * поэтому статический импорт утащил бы анимации в главный чанк (+41 kB gzip).
 * Так HUD получает кнопку бесплатно, а код экрана грузится первым тапом.
 */
const InventoryScreen = React.lazy(async () => ({
  default: (await import('./InventoryScreen')).InventoryScreen,
}));

/** Общий каркас кнопок пары «Инвентарь + Косметика»: 44×44, свечение из CSS. */
const HUD_GLOW_BUTTON =
  'hud-glow grid size-11 place-items-center rounded-xl border bg-[var(--ui-panel)] transition active:scale-95 cursor-pointer';

/**
 * HACKER KOMBAT — верхняя панель (v6.9, «лёгкий HUD»).
 *
 * Что было: две строки валют, отдельные плитки Rep и Heat, четыре кнопки
 * (Обучение, Бонус, Скины, Звук) и три шкалы — до первого контента на экране
 * оказывалось 9+ интерактивных элементов, и игрок не понимал, куда нажимать.
 *
 * Что стало:
 *   • один блок валют (Data / Crypto / Чипы / Rep) — это ЧТЕНИЕ, а не навигация;
 *   • интерактивных элементов в HUD ровно шесть: профиль, пара
 *     «Инвентарь + Косметика», бонус, обучение и сезонный леденец (он живёт
 *     внутри плитки Data, потому что это событие, а не раздел меню);
 *   • инвентарь (v1.1) — заметная, но пока пустая заготовка: кнопка рядом с
 *     блоком уровня, экран-заглушка;
 *   • косметика (v1.2) — единственная дверь в «Кибер-Косметику»: кнопка стоит
 *     парой с инвентарём, а из профиля убрана, чтобы не было двух входов;
 *   • шкалы XP / CPU / Heat — тонкие полосы одной строкой, Heat только вне
 *     онбординга.
 *
 * Все цвета — токены темы (index.css), иконки — ui-icons, цифры — Share Tech Mono.
 */
export const TopHud: React.FC = () => {
  // v1.1: инвентарь — только UI-заготовка, состояние живёт в самом HUD.
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const {
    player,
    gameplayV3,
    contractIncomePerHour,
    setDailyModalOpen,
    setSkinModalOpen,
    openTutorial,
    tutorialUnseen,
    nowMs,
    baseTheme,
    newPlayerMode,
    worldEnabled,
    activeLocation,
  } = useGame();

  if (!player) return null;

  const { derived } = player;
  const energyPct = Math.min(100, Math.max(0, (player.energy / derived.maxEnergy) * 100));
  const xpPct =
    derived.xpToNext > 0
      ? Math.min(100, Math.max(0, (derived.xpIntoLevel / derived.xpToNext) * 100))
      : 100;
  const equippedAvatar = resolveEquippedSkins({
    equippedSkin: player.equippedSkin,
    stats: player.stats,
  }).avatar;

  const dailyAvailable =
    !player.lastDailyClaim ||
    (nowMs - new Date(player.lastDailyClaim).getTime()) / (1000 * 3600) >= 20;

  const heatPct = Math.min(100, Math.max(0, player.heat));
  const heatRisk = player.heat >= 75;

  const currencies = [
    {
      key: 'data',
      icon: <DataIcon className="h-3 w-3" />,
      value: formatCompact(Math.floor(player.data)),
      label: 'Data',
      color: 'var(--ui-primary)',
      hint: gameplayV3
        ? 'Data: лучший контракт из витрины приносит столько за час'
        : 'Data: скорость пассивного дохода за час',
      extra:
        gameplayV3 ? `+${formatCompact(contractIncomePerHour)}/ч` : `+${formatCompact(derived.dataPerHour)}/ч`,
      badge: <LollipopBadge />,
    },
    {
      key: 'crypto',
      icon: <CryptoIcon className="h-3 w-3" />,
      value: String(player.crypto),
      label: 'Crypto',
      color: 'var(--ui-purple)',
      hint: 'Crypto: премиум-валюта для косметики',
    },
    {
      key: 'chips',
      icon: <ChipsIcon className="h-3 w-3" />,
      value: String(player.chips),
      label: 'Чипы',
      color: 'var(--ui-success)',
      hint: 'Чипы: открывают тиры карточек и «Базу»',
    },
    {
      key: 'rep',
      icon: <RepIcon className="h-3 w-3" />,
      value: formatCompact(player.rep),
      label: 'Rep',
      color: 'var(--ui-secondary)',
      hint: 'Rep: найм элитной команды и белый хакинг',
    },
  ];

  return (
    <>
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(var(--ui-panel-deep-rgb),0.94)] border-b border-[rgba(var(--ui-primary-rgb),0.18)] px-3 pt-2 pb-2">
      <div className="mx-auto max-w-xl space-y-1.5">
        {/* Строка 1: профиль (одна кнопка) + два действия. */}
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/profile"
            data-qa="hud-profile"
            aria-label={`Профиль: уровень ${derived.level}, ${derived.rankTitle}`}
            className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl px-1 transition hover:bg-[rgba(var(--ui-primary-rgb),0.08)]"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[rgba(var(--ui-primary-rgb),0.40)] bg-[var(--ui-panel)] text-[20px] leading-none"
              style={{ boxShadow: `0 0 10px ${withAlpha(equippedAvatar?.primaryHex ?? 'var(--ui-primary)', 0.35)}` }}
            >
              {equippedAvatar?.avatarGlyph ?? <AvatarFallbackIcon className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="font-num text-[16px] font-bold leading-none text-white">УР. {derived.level}</span>
                {player.prestigeCount > 0 && (
                  <span
                    className="rounded bg-[rgba(var(--ui-secondary-rgb),0.20)] px-1 font-num text-[11px] font-bold text-[var(--ui-secondary)]"
                    title={`Пройдено циклов Global Hack: ${player.prestigeCount} · множитель дохода ×${derived.prestigeMultiplier}`}
                  >
                    ×{derived.prestigeMultiplier}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-none text-[var(--ui-text-muted)]">
                {worldEnabled ? (
                  <>
                    <LocationIcon locationId={activeLocation.id} className="h-3 w-3 shrink-0" />
                    <span className="max-w-[9rem] truncate">{activeLocation.name}</span>
                  </>
                ) : (
                  <span className="truncate">{derived.rankTitle}</span>
                )}
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* v1.1: инвентарь. Кнопка рядом с блоком уровня (аватар / «УР. N» /
                локация), заметно подсвечивается токенами темы (.hud-glow),
                тап-таргет 44×44. Открывает экран-заготовку, механики нет. */}
            <button
              type="button"
              onClick={() => setInventoryOpen(true)}
              data-qa="hud-inventory"
              aria-label="Инвентарь"
              className={`${HUD_GLOW_BUTTON} hud-glow--primary text-[var(--ui-primary)]`}
            >
              <PackageIcon className="h-4 w-4" />
              <span className="hud-glow__dot" aria-hidden="true" />
            </button>
            {/* v1.2: косметика — только здесь, парой с инвентарём. Кнопка из
                профиля убрана: в косметику теперь ровно одна дверь, рядом с
                уровнем. Модалка «Кибер-Косметика» живёт в ленивом чанке
                ModalsAndOverlays, здесь только 44×44 и глиф. */}
            <button
              type="button"
              onClick={() => setSkinModalOpen(true)}
              data-qa="hud-skins"
              aria-label="Кибер-Косметика"
              className={`${HUD_GLOW_BUTTON} hud-glow--secondary text-[var(--ui-secondary)]`}
            >
              <CosmeticsIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDailyModalOpen(true)}
              aria-label="Ежедневный бонус Crypto"
              title="Ежедневный бонус Crypto"
              className="relative grid h-11 w-11 place-items-center rounded-xl border border-[rgba(var(--ui-success-rgb),0.35)] bg-[var(--ui-panel)] text-[var(--ui-success)] transition active:scale-95 cursor-pointer"
            >
              <Gift className="h-4 w-4" />
              {dailyAvailable && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--ui-success)]" />
              )}
            </button>
            <button
              type="button"
              onClick={openTutorial}
              aria-label="Обучение: что качать и как играть"
              title="Обучение: что качать и как играть"
              className="relative grid h-11 w-11 place-items-center rounded-xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel)] text-[var(--ui-primary)] transition active:scale-95 cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              {tutorialUnseen && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--ui-primary)]" />
              )}
            </button>
          </div>
        </div>

        {/* Строка 2: один блок валют. Не кнопки — читать, а не нажимать. */}
        <div
          data-qa="hud-currencies"
          className="grid grid-cols-4 overflow-hidden rounded-xl border border-[rgba(var(--ui-primary-rgb),0.18)] bg-[var(--ui-panel)]/90"
        >
          {currencies.map((currency, index) => (
            <div
              key={currency.key}
              title={currency.hint}
              className={`min-w-0 px-2 py-1 ${index > 0 ? 'border-l border-[rgba(var(--ui-primary-rgb),0.14)]' : ''}`}
            >
              <div className="flex items-center gap-1 text-[11px] font-bold leading-none" style={{ color: currency.color }}>
                {currency.icon}
                <span className="truncate">{currency.label}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="font-num text-[13px] font-bold leading-none tabular-nums text-white">
                  {currency.value}
                </span>
                {currency.extra && (
                  <span
                    className="truncate font-num text-[11px] leading-none"
                    style={{ color: baseTheme.ui.successHex }}
                  >
                    {currency.extra}
                  </span>
                )}
              </div>
              {currency.badge && <div className="mt-1 flex">{currency.badge}</div>}
            </div>
          ))}
        </div>

        {/* Строка 3: три тонкие шкалы — уровни и риск, без подписей-простыней. */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ui-secondary)]">
              XP
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full border border-[var(--ui-border-muted)] bg-[var(--ui-track)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--ui-magic)] to-[var(--ui-primary)] transition-all duration-300"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <span className="shrink-0 font-num text-[11px] leading-none text-[var(--ui-text-faint)]">
              {formatCompact(derived.xpIntoLevel)}/{formatCompact(derived.xpToNext)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--ui-primary)]">
              <Zap className="h-3 w-3" /> CPU
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full border border-[var(--ui-border-muted)] bg-[var(--ui-track)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--ui-primary)] to-[var(--ui-success)] transition-all duration-200"
                style={{ width: `${energyPct}%` }}
              />
            </div>
            <span
              className="shrink-0 font-num text-[11px] leading-none text-[var(--ui-text-faint)]"
              title={`Тап: +${formatCompact(derived.clickPower)} Data · +1 за ${ENERGY_REGEN_SECONDS} с`}
            >
              {Math.floor(player.energy)}/{derived.maxEnergy}
            </span>
          </div>

          {/* Heat — не валюта, а риск: показываем только вне онбординга. */}
          {!newPlayerMode && (
            <div className="flex items-center gap-2">
              <span
                className={`flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${
                  heatRisk ? 'text-[var(--ui-danger)]' : 'text-[var(--ui-text-muted)]'
                }`}
              >
                <Flame className={`h-3 w-3 ${heatRisk ? 'animate-pulse' : ''}`} /> Heat
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full border border-[var(--ui-border-muted)] bg-[var(--ui-track)]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${heatPct}%`,
                    background: heatRisk
                      ? 'linear-gradient(90deg, var(--ui-danger), var(--ui-danger-strong))'
                      : 'linear-gradient(90deg, var(--ui-secondary), var(--ui-danger))',
                  }}
                />
              </div>
              <span
                className={`shrink-0 font-num text-[11px] leading-none ${
                  heatRisk ? 'text-[var(--ui-danger)]' : 'text-[var(--ui-text-faint)]'
                }`}
              >
                {player.heat}/100
              </span>
            </div>
          )}
        </div>
      </div>
    </header>

    {/* Экран инвентаря — сосед хедера, а не ребёнок: у header есть backdrop-filter,
        который создаёт containing block для fixed-подложки. Здесь подложка
        ModalFrame снова кроет весь экран. */}
    {inventoryOpen && (
      <React.Suspense fallback={null}>
        <InventoryScreen open={inventoryOpen} onClose={() => setInventoryOpen(false)} />
      </React.Suspense>
    )}
    </>
  );
};
