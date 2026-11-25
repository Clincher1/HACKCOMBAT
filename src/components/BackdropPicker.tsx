import React, { useState } from 'react';
import { BACKDROPS_CONFIG } from '../../shared/backdrops.config';
import { useGame } from '../context/GameContext';
import { DEVICE_LABEL, LocationGrid, LocationPickerModal } from './LocationPicker';

/**
 * «Локации» (v5.0, было «вид из окна» v4.1).
 *
 * Игрок выбирает, где он работает: крыша, пляжная терраса, уличное кафе,
 * пляжный бар, мотель или квартира в дождь. Чистая атмосфера: ни Data, ни
 * Crypto не тратятся, бонусов к тапу нет, выбор переживает Престиж.
 */
export const BackdropPicker: React.FC = () => {
  const { deskBackdrop } = useGame();
  const [open, setOpen] = useState(false);

  const laptops = BACKDROPS_CONFIG.filter((location) => location.device === 'laptop').length;
  const phones = BACKDROPS_CONFIG.filter((location) => location.device === 'phone').length;

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-[var(--ui-panel)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-display text-sm font-extrabold text-white">
            <span aria-hidden>🗺️</span>
            <span>Локации</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--ui-text-muted)]">
            Где ты сейчас: {BACKDROPS_CONFIG.length} мест — от крыши до пляжного бара. Везде можно
            работать: {laptops} мест с ноутбуком, {phones} с телефона. Антураж, не бонус.
          </p>
        </div>
        {deskBackdrop && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
            style={{ background: `${deskBackdrop.accent}22`, color: deskBackdrop.accent }}
          >
            {deskBackdrop.place}
          </span>
        )}
      </div>

      <LocationGrid />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-[var(--ui-text-muted)]">
          {deskBackdrop
            ? `Сейчас: ${deskBackdrop.place} · ${DEVICE_LABEL[deskBackdrop.device].short}`
            : 'Сейчас: сцена по уровню'}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-[var(--ui-primary)] px-2.5 py-1.5 text-[11px] font-extrabold text-[var(--ui-on-primary)] transition hover:brightness-110 cursor-pointer"
        >
          Открыть карту мест
        </button>
      </div>

      <LocationPickerModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
};
