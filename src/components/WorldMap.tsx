/**
 * HACKER KOMBAT — карта города (v5.5, фаза 1).
 *
 * Полноэкранный оверлей со списком локаций. Открытые — карточки с переездом,
 * закрытые — приглушены и честно говорят, на каком уровне откроются.
 *
 * Слои: карта стоит ПОД онбордингом (WORLD_Z_INDEX.map < WORLD_Z_INDEX.onboarding),
 * поэтому гейт первого сеанса остаётся сверху и его шаги не ломаются.
 */

import { ArrowRight, Lock, MapPin, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { LOCATIONS, WORLD_Z_INDEX, type WorldLocation } from '../../shared/world.config';
import { useGame } from '../context/GameContext';
import { canTravelTo, markFirstMoveOut } from '../lib/world';

interface WorldMapProps {
  open: boolean;
  onClose: () => void;
}

const TAG_LABEL: Record<string, string> = {
  hub: 'быт',
  scam: 'скам',
  social: 'социалка',
  rep: 'репутация',
  tech: 'техника',
  corp: 'корпорации',
};

const LocationCard: React.FC<{
  location: WorldLocation;
  level: number;
  active: boolean;
  busy: boolean;
  onPick: (location: WorldLocation) => void;
}> = ({ location, level, active, busy, onPick }) => {
  const unlocked = canTravelTo(location.id, level);
  const disabled = !unlocked || busy || active;

  return (
    <button
      type="button"
      onClick={() => onPick(location)}
      disabled={disabled}
      aria-current={active ? 'true' : undefined}
      aria-label={`${location.name}${unlocked ? '' : ` — откроется на ${location.minLevel} уровне`}`}
      className={`relative w-full overflow-hidden rounded-2xl border p-3 text-left transition ${
        unlocked
          ? 'border-[rgba(var(--loc-accent-rgb),0.45)] bg-[var(--ui-panel)] hover:border-[var(--loc-accent)]'
          : 'border-slate-800 bg-[var(--ui-panel-deep)]/70'
      } ${active ? 'ring-1 ring-[var(--loc-accent)]' : ''} ${
        disabled ? 'cursor-default' : 'cursor-pointer'
      } ${unlocked ? '' : 'opacity-55'}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full ${location.bgClass} opacity-40 blur-xl`}
      />
      <span className="relative flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/25 text-lg" aria-hidden>
          {location.glyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-extrabold text-white">{location.name}</span>
            {active && (
              <span className="shrink-0 rounded bg-[rgba(var(--loc-accent-rgb),0.18)] px-1 py-0.5 text-[9px] font-bold text-[var(--loc-accent)]">
                ты здесь
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[10px] leading-snug text-[var(--ui-text-muted)]">
            {location.flavor}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {location.missionTags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300"
              >
                {TAG_LABEL[tag] ?? tag}
              </span>
            ))}
            {location.minLevel > 0 && (
              <span className="rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                ур. {location.minLevel}+
              </span>
            )}
          </span>
        </span>
      </span>

      {!unlocked && (
        <span className="relative mt-2 flex items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1.5 text-[10px] font-bold text-slate-300">
          <Lock className="h-3 w-3 shrink-0" />
          Откроется на {location.minLevel} уровне
        </span>
      )}
      {unlocked && !active && (
        <span className="relative mt-2 flex items-center justify-between rounded-lg bg-[rgba(var(--loc-accent-rgb),0.14)] px-2 py-1.5 text-[10px] font-extrabold text-[var(--loc-accent)]">
          <span>Пойти сюда</span>
          <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </button>
  );
};

export const WorldMap: React.FC<WorldMapProps> = ({ open, onClose }) => {
  const { player, activeLocation, setLocation, busyKey, worldEnabled } = useGame();
  const busy = busyKey !== null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!worldEnabled || !open || !player) return null;

  const level = player.derived.level;

  const handlePick = (location: WorldLocation) => {
    if (!canTravelTo(location.id, level) || busy || location.id === activeLocation.id) return;
    void setLocation(location.id)
      .then(() => {
        // «Вышел в город» — шаг воронки first_move. Только Улица (первый выход
        // из дома) и только при включённом мире: внутри функции есть флаг-гейт.
        if (location.id === 'street') markFirstMoveOut(location, level);
        onClose();
      })
      .catch(() => undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Карта города"
      className="fixed inset-0 overflow-y-auto bg-[rgba(var(--ui-panel-deep-rgb),0.96)] px-3 pb-24 pt-3 backdrop-blur-xl"
      style={{ zIndex: WORLD_Z_INDEX.map }}
    >
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-base font-extrabold text-white">
              <MapPin className="mr-1 inline h-4 w-4 text-[var(--loc-accent)]" /> Куда пойдём
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--ui-text-muted)]">
              У каждой локации свой пул контрактов и свой фон. Комната — хаб, он открыт всегда.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть карту"
            className="shrink-0 rounded-xl border border-slate-700 bg-[var(--ui-panel)] p-2 text-slate-300 transition hover:border-[var(--loc-accent)] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {LOCATIONS.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              level={level}
              active={location.id === activeLocation.id}
              busy={busy}
              onPick={handlePick}
            />
          ))}
        </div>

        <p className="mt-3 text-center text-[10px] text-slate-500">
          Переезд бесплатный. Уровень и прогресс не сбрасываются.
        </p>
      </div>
    </div>
  );
};
