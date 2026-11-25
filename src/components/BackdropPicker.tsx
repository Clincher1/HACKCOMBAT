import React from 'react';
import { BACKDROPS_CONFIG } from '../../shared/backdrops.config';
import { useGame } from '../context/GameContext';

/**
 * «Вид из окна» (v4.1) — переключатель сцены за спиной оператора.
 *
 * Это косметика: ни Data, ни Crypto не тратятся, бонусов к тапу нет.
 * Выбор хранится в stats.deskBackdrop и переживает Престиж, как темы и рамки.
 */
export const BackdropPicker: React.FC = () => {
  const { player, deskBackdrop, setDeskBackdrop, busyKey } = useGame();
  if (!player) return null;

  const activeKey = deskBackdrop?.key;
  const level = player.derived.level;

  return (
    <section className="rounded-2xl bg-gradient-to-br from-[#15112f] to-[#10172e] border border-white/10 p-3.5 space-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-display font-extrabold text-white">
          <span aria-hidden="true">🌤️</span>
          <span>Вид из окна</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          Сцена, у которой стоит твой терминал: закат на крыше, пляж днём, мотель у бассейна или дождь
          за стеклом. Чистая атмосфера — без бонусов к тапу.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {BACKDROPS_CONFIG.map((backdrop) => {
          const active = activeKey === backdrop.key;
          const locked = level < backdrop.requiredLevel;
          const busy = busyKey === `backdrop:${backdrop.key}`;
          return (
            <button
              key={backdrop.key}
              type="button"
              disabled={locked || busy}
              onClick={() => void setDeskBackdrop(backdrop.key)}
              aria-pressed={active}
              className={`relative overflow-hidden rounded-xl border text-left transition-transform duration-100 active:scale-[0.98] ${
                active
                  ? 'border-white/70 ring-2 ring-offset-0'
                  : 'border-white/10 hover:border-white/25'
              } ${locked ? 'opacity-45 cursor-not-allowed' : ''}`}
              style={active ? { borderColor: backdrop.accent, boxShadow: `0 0 18px ${backdrop.accent}55` } : undefined}
            >
              <img
                src={backdrop.url}
                alt={backdrop.name}
                loading="lazy"
                decoding="async"
                className="w-full h-[74px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#08060f]/95 via-[#08060f]/25 to-transparent" />

              <div className="absolute left-2 right-2 bottom-1.5">
                <div className="text-[11.5px] font-bold text-white leading-tight truncate">
                  {backdrop.glyph} {backdrop.name}
                </div>
                <div className="text-[9.5px] text-white/60 truncate">{backdrop.weatherLabel}</div>
              </div>

              {active && (
                <span
                  className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full text-[11px] font-black text-[#08060f]"
                  style={{ background: backdrop.accent }}
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
              {locked && (
                <span className="absolute top-1.5 left-1.5 rounded-md bg-[#08060f]/85 border border-white/20 px-1.5 py-0.5 text-[9.5px] font-bold text-white/80">
                  🔒 Ур. {backdrop.requiredLevel}
                </span>
              )}
              {busy && (
                <span className="absolute inset-0 grid place-items-center bg-[#08060f]/60 text-[10px] font-bold text-white/80">
                  применяем…
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-slate-500">
          {deskBackdrop ? 'Сейчас: ' + deskBackdrop.name : 'Сейчас: сцена по уровню'}
        </span>
        <button
          type="button"
          disabled={!deskBackdrop || busyKey === 'backdrop:'}
          onClick={() => void setDeskBackdrop('')}
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 disabled:opacity-40"
        >
          Сцена по уровню
        </button>
      </div>
    </section>
  );
};
