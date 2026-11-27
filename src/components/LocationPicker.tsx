// ============================================================================
// ЛОКАЦИИ (v5.0)
// ----------------------------------------------------------------------------
// Было «вид из окна» — стало «где я работаю». Игрок выходит из дома: крыша,
// улица, уличное кафе, пляжный бар, мотель, квартира в дождь. В каждой локации
// указано, с чего он там работает (ноут / телефон) — это атмосфера, а не бонус:
// экономика и шанс взлома не меняются.
//
// Компонент используется в двух местах:
//   • DeskPage — модалка «Сменить место» прямо над сценой;
//   • ProfilePage — карточка внутри коллекции.
// ============================================================================

import { Check, Lock, X } from 'lucide-react';
import React from 'react';
import {
  BACKDROPS_CONFIG,
  type BackdropConfig,
  type LocationDevice,
} from '../../shared/backdrops.config';
import { useGame } from '../context/GameContext';
import { withAlpha } from '../lib/colors';
import { DeviceIcon } from './ui-icons';

export const DEVICE_LABEL: Record<LocationDevice, { label: string; short: string }> = {
  laptop: { label: 'с ноутбука', short: 'ноут' },
  phone: { label: 'с телефона', short: 'телефон' },
  desk: { label: 'за столом', short: 'стол' },
};

export const deviceOf = (location: BackdropConfig | undefined): LocationDevice =>
  location?.device ?? 'laptop';

/** Сетка локаций. Одна и та же в модалке и в профиле. */
export const LocationGrid: React.FC<{ onPick?: () => void }> = ({ onPick }) => {
  const { player, deskBackdrop, setDeskBackdrop, busyKey } = useGame();
  if (!player) return null;

  const activeKey = deskBackdrop?.key;
  const level = player.derived.level;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {BACKDROPS_CONFIG.map((location) => {
        const active = activeKey === location.key;
        const locked = level < location.requiredLevel;
        const busy = busyKey === `backdrop:${location.key}`;
        const device = DEVICE_LABEL[location.device];
        return (
          <button
            key={location.key}
            type="button"
            disabled={locked || busy}
            onClick={() => {
              void setDeskBackdrop(location.key);
              onPick?.();
            }}
            aria-pressed={active}
            className={`relative overflow-hidden rounded-2xl border text-left transition-transform duration-100 active:scale-[0.98] ${
              active ? 'border-white/70' : 'border-white/10 hover:border-white/30'
            } ${locked ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
            style={
              active
                ? { borderColor: location.accent, boxShadow: `0 0 20px ${withAlpha(location.accent, 0.27)}` }
                : undefined
            }
          >
            <img
              src={location.url}
              alt={location.name}
              loading="lazy"
              decoding="async"
              className="h-[86px] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--ui-panel-deep)] via-[rgba(var(--ui-panel-deep-rgb),0.35)] to-transparent" />

            <div className="absolute inset-x-2 bottom-1.5">
              <div className="truncate text-[13px] font-bold leading-tight text-white">
                {location.glyph} {location.place}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/70">
                <span className="rounded bg-black/35 px-1 py-px">
                  <DeviceIcon device={location.device} className="mr-1 inline h-3 w-3 align-[-1px]" /> {device.short}
                </span>
                <span className="truncate">{location.weatherLabel}</span>
              </div>
            </div>

            {active && (
              <span
                className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-black text-[var(--ui-on-primary)]"
                style={{ background: location.accent }}
                aria-hidden
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            {locked && (
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white/80">
                <Lock className="h-2.5 w-2.5" /> Ур. {location.requiredLevel}
              </span>
            )}
            {busy && (
              <span className="absolute inset-0 grid place-items-center bg-black/60 text-[11px] font-bold text-white/80">
                переезжаем…
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/** Модалка «Сменить место»: открывается с рабочего стола одним тапом. */
export const LocationPickerModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const { deskBackdrop, setDeskBackdrop, busyKey } = useGame();
  if (!open) return null;

  const current = deskBackdrop;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Сменить локацию"
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[var(--ui-panel)] p-3.5 pb-5 shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="font-display text-[16px] font-extrabold text-white">Куда пойдём?</div>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--ui-text-muted)]">
              Локация — это антураж, не бонус. Работать можно откуда угодно: с ноутбука, с телефона
              или за столом.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <LocationGrid onPick={onClose} />

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--ui-text-muted)]">
            {current ? `Сейчас: ${current.place}` : 'Сейчас: сцена по уровню'}
          </span>
          <button
            type="button"
            disabled={!current || busyKey === 'backdrop:'}
            onClick={() => void setDeskBackdrop('')}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ui-text)] transition hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          >
            Вернуться к своей сцене
          </button>
        </div>
      </div>
    </div>
  );
};
