/**
 * HACKER KOMBAT — полоса локаций (v6.5): единственный вход в мир.
 *
 * Что было: две параллельные двери на столе — «Сменить» (косметический вид из
 * окна) и «Выйти» (карта города с восемью бэкдропами). Игрок путался, какая из
 * них меняет место, а какая — картинку.
 *
 * Что стало:
 *   1) одна полоса крупных иконок под сценой стола и над контрактной доской;
 *   2) тап по открытой локации → компактный bottom sheet: иконка, название,
 *      одна строка лора и честные множители из shared/locations.ts;
 *   3) тап по закрытой → тост «Откроется на уровне N», без модалки.
 *
 * Перф: смена места не перерисовывает приложение — меняются класс фона у
 * LocationBackdrop и подсветка чипов. Панель живёт локальным состоянием и
 * рендерится только когда открыта; чипы мемоизированы.
 */

import { Check, Lock, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import {
  LOCATION_WORLDS,
  locationEffectLabel,
  type LocationWorld as WorldEntry,
} from '../../shared/locations';
import {
  LOCATIONS,
  isLocationUnlocked,
  type LocationId,
  type WorldLocation,
} from '../../shared/world.config';
import { useGame } from '../context/GameContext';
import { ModalFrame } from './ModalFrame';
import { LocationIcon } from './ui-icons';

/** Один чип полосы: крупная иконка + название, закрытые — с замком. */
const LocationChip = React.memo(function LocationChip({
  location,
  active,
  locked,
  busy,
  onPick,
}: {
  location: WorldLocation;
  active: boolean;
  locked: boolean;
  busy: boolean;
  onPick: (location: WorldLocation, locked: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-qa="location-chip"
      data-location-id={location.id}
      data-active={active ? 'true' : 'false'}
      data-locked={locked ? 'true' : 'false'}
      aria-pressed={active}
      aria-label={
        locked ? `${location.name} — откроется на уровне ${location.minLevel}` : location.name
      }
      onClick={() => onPick(location, locked)}
      className={`relative flex h-[58px] min-h-[44px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 transition-transform duration-100 active:scale-[0.96] cursor-pointer ${
        active
          ? 'border-[var(--loc-accent)] bg-[rgba(var(--loc-accent-rgb),0.18)] shadow-[0_0_18px_rgba(var(--loc-accent-rgb),0.35)]'
          : locked
            ? 'border-white/10 bg-white/[0.03] opacity-60'
            : 'border-white/12 bg-[var(--ui-panel)] hover:border-white/30'
      }`}
    >
      <LocationIcon locationId={location.id} className="h-5 w-5" />
      <span
        className={`max-w-full truncate text-[11px] font-bold leading-tight ${
          active ? 'text-white' : 'text-white/75'
        }`}
      >
        {location.name}
      </span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/60 text-[11px] font-bold text-white/85">
          …
        </span>
      )}
      {locked && (
        <span
          data-qa="location-lock"
          className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-md border border-white/20 bg-black/70 px-1 py-px text-[11px] font-extrabold text-white/85"
        >
          <Lock className="h-2 w-2" />L{location.minLevel}
        </span>
      )}
      {active && (
        <span
          className="absolute left-1 top-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[11px] font-black text-[var(--ui-on-primary)]"
          style={{ background: 'var(--loc-accent)' }}
          aria-hidden
        >
          <Check className="h-2 w-2" />
        </span>
      )}
    </button>
  );
});

/** Компактная панель выбора: иконка, имя, лор, множители, одна кнопка. */
const LocationSheet: React.FC<{
  entry: WorldEntry;
  location: WorldLocation;
  active: boolean;
  busy: boolean;
  onClose: () => void;
  onTravel: (id: LocationId) => void;
}> = ({ entry, location, active, busy, onClose, onTravel }) => (
  <ModalFrame
    open
    zIndex={60}
    backdropClassName="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm"
    cardClassName="w-full max-w-md rounded-3xl border border-white/12 bg-[var(--ui-panel)] p-4 pb-5"
  >
    <div data-qa="location-sheet" data-location-id={entry.id} className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[28px]"
          style={{
            // Акцент берём у выбранной локации, а не у активной: --loc-accent
            // на :root принадлежит месту, где игрок стоит сейчас.
            background: `rgba(${location.accentRgb}, 0.16)`,
            border: `1px solid rgba(${location.accentRgb}, 0.45)`,
          }}
          aria-hidden
        >
          <LocationIcon locationId={location.id} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[16px] font-extrabold text-white">{location.name}</h3>
            {active && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
                style={{
                  background: `rgba(${location.accentRgb}, 0.2)`,
                  color: `rgb(${location.accentRgb})`,
                }}
              >
                ты здесь
              </span>
            )}
          </div>
          <p data-qa="location-tagline" className="mt-0.5 text-[11px] leading-snug text-[var(--ui-text-muted)]">
            {entry.tagline}
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 text-white/70 hover:border-white/30 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Числа — из shared/locations.ts: то же, что применяет сервер. */}
      <div
        data-qa="location-effects"
        className="rounded-xl border bg-black/25 px-3 py-2 text-[13px] font-bold text-white/85"
        style={{ borderColor: `rgba(${location.accentRgb}, 0.35)` }}
      >
        {locationEffectLabel(entry.id)}
      </div>

      <button
        type="button"
        data-qa="location-travel"
        disabled={active || busy}
        onClick={() => onTravel(entry.id)}
        className="w-full rounded-2xl py-3 text-[13px] font-extrabold text-[var(--ui-on-primary)] transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        style={{
          background: `rgb(${location.accentRgb})`,
          boxShadow: `0 0 18px rgba(${location.accentRgb}, 0.4)`,
        }}
      >
        {active ? 'Ты уже здесь' : busy ? 'Переезжаем…' : 'Перейти'}
      </button>
    </div>
  </ModalFrame>
);

const LocationStripInner: React.FC = () => {
  const { player, activeLocation, setLocation, busyKey, worldEnabled, pushClientAlert } = useGame();
  const [openId, setOpenId] = useState<LocationId | null>(null);

  // Пары «конфиг мира + метаданные локации» собираются один раз за жизнь экрана.
  const worlds = useMemo(
    () => LOCATIONS.map((location) => ({ location, world: LOCATION_WORLDS[location.id] })),
    []
  );
  const level = player?.derived.level ?? 0;

  const pick = useCallback(
    (location: WorldLocation, locked: boolean) => {
      if (locked) {
        // Никакой модалки: закрытая локация отвечает тостом и не двигает состояние.
        pushClientAlert({
          type: 'warning',
          title: 'Локация закрыта',
          message: `Откроется на уровне ${location.minLevel}`,
        });
        return;
      }
      setOpenId(location.id);
    },
    [pushClientAlert]
  );

  const travel = useCallback(
    (id: LocationId) => {
      setOpenId(null);
      void setLocation(id);
    },
    [setLocation]
  );

  if (!worldEnabled || !player) return null;

  const openPair = openId ? worlds.find((pair) => pair.location.id === openId) : undefined;

  return (
    <section data-qa="location-strip" aria-label="Локации города" className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ui-text-muted)]">
          Где я работаю
        </span>
        <span className="text-[11px] text-[var(--ui-text-muted)]">{activeLocation.name}</span>
      </div>
      {/* Сетка 3×2, а не горизонтальный скролл: все шесть локаций видны сразу,
          без «прокрути-и-догадайся». Цели — 58 px по высоте (норма ≥ 44 px). */}
      <div className="grid grid-cols-3 gap-1.5">
        {worlds.map(({ location }) => (
          <LocationChip
            key={location.id}
            location={location}
            active={location.id === activeLocation.id}
            locked={!isLocationUnlocked(location.id, level)}
            busy={busyKey === `location:${location.id}`}
            onPick={pick}
          />
        ))}
      </div>

      {openPair && (
        <LocationSheet
          entry={openPair.world}
          location={openPair.location}
          active={openPair.location.id === activeLocation.id}
          busy={busyKey === `location:${openPair.location.id}`}
          onClose={() => setOpenId(null)}
          onTravel={travel}
        />
      )}
    </section>
  );
};

export const LocationStrip = React.memo(LocationStripInner);
