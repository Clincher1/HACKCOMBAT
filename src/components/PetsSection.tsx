import { Heart, Lock, Utensils } from 'lucide-react';
import React from 'react';
import {
  getEffectiveHunger,
  getPetAffection,
  getPetFeedCost,
  PETS_CONFIG,
} from '../../shared/pets.config';
import type { PetConfig, PetState } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { formatCompact, formatCountdown } from '../lib/format';

const CURRENCY_LABEL: Record<PetConfig['costCurrency'], string> = {
  data: 'Data',
  crypto: '💎 Crypto',
  rep: 'Rep',
};

function hungerColor(hunger: number): string {
  if (hunger >= 60) return 'var(--ui-success)';
  if (hunger >= 30) return '#ffd166';
  return '#ff3b6b';
}

function hungerStatus(hunger: number): string {
  if (hunger >= 60) return 'Сыт — баф 100%';
  if (hunger >= 30) return 'Проголодался — баф 50%';
  return 'Спит — баф выключен';
}

/**
 * Питомцы-компаньоны (вкладка «Команда»).
 * Питомцы НЕ умирают и НЕ теряются при престиже — максимум «засыпают», пока их не покормят.
 */
export const PetsSection: React.FC = () => {
  const { player, petAction, busyKey, nowMs } = useGame();
  if (!player) return null;

  const ownedByKey = new Map<string, PetState>(player.pets.map((p) => [p.key, p]));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[var(--ui-panel)] border border-[var(--ui-secondary)]/25 p-3.5">
        <div className="text-xs font-bold text-white flex items-center gap-1.5">
          <span className="text-base">🐾</span>
          <span>Питомцы-Компаньоны ({player.pets.length}/{PETS_CONFIG.length})</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          Покупаются один раз и <strong className="text-[var(--ui-secondary)]">не сбрасываются Престижем</strong>.
          Корми их, чтобы баф работал: сытость падает примерно за 48 часов.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PETS_CONFIG.map((cfg) => {
          const owned = ownedByKey.get(cfg.key);
          const isBusy = busyKey === `pet:buy:${cfg.key}` || busyKey === `pet:feed:${cfg.key}`;
          const usesCurrency =
            cfg.costCurrency === 'data'
              ? player.data
              : cfg.costCurrency === 'crypto'
                ? player.crypto
                : player.rep;
          const canAfford = usesCurrency >= cfg.costAmount;
          const levelLocked = (cfg.requiredLevel ?? 1) > player.derived.level;

          const hunger = owned
            ? getEffectiveHunger(owned.hunger, owned.lastFedAt, cfg.hungerDecayPerHour, nowMs)
            : 0;
          const affection = getPetAffection(owned?.feedCount ?? 0);
          const feedPrice = getPetFeedCost(
            cfg,
            player.derived.dataPerHour,
            player.derived.feedDiscountPct
          );
          const cooldownLeftSec = owned
            ? Math.max(
                0,
                Math.ceil(
                  (new Date(owned.lastFedAt).getTime() +
                    cfg.feedCooldownHours * 3_600_000 -
                    nowMs) /
                    1000
                )
              )
            : 0;
          const canFeed =
            Boolean(owned) && cooldownLeftSec === 0 && hunger < 99 && player.data >= feedPrice;

          return (
            <div
              key={cfg.key}
              className={`rounded-2xl border p-3.5 flex flex-col justify-between gap-3 ${
                owned ? 'border-[var(--ui-secondary)]/45 bg-[#121a30]/95' : 'border-slate-800/90 bg-[var(--ui-panel)]/95'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-xl bg-[var(--ui-panel-deep)] border border-[var(--ui-secondary)]/30 flex items-center justify-center text-3xl shrink-0">
                  {owned ? cfg.emoji : '❔'}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ui-secondary)] font-bold">
                    {cfg.species}
                  </div>
                  <h3 className="font-display text-xs font-extrabold text-white truncate">
                    {cfg.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                    {cfg.description}
                  </p>
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-lg bg-[var(--ui-panel-deep)] border border-slate-800 text-[11px] font-bold text-[var(--ui-success)]">
                ⚡ {cfg.buffLabel}
              </div>

              {owned ? (
                <div className="space-y-2">
                  {/* Шкала сытости */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold" style={{ color: hungerColor(hunger) }}>
                        Сытость {Math.round(hunger)}%
                      </span>
                      <span className="text-slate-500">{hungerStatus(hunger)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(0, Math.min(100, hunger))}%`,
                          backgroundColor: hungerColor(hunger),
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3 h-3 text-[var(--ui-secondary)]" /> Привязанность {affection}/10
                    </span>
                    <span>Кормлений: {owned.feedCount}</span>
                  </div>

                  <button
                    type="button"
                    disabled={!canFeed || isBusy}
                    onClick={() => void petAction('feed', cfg.key)}
                    className={`w-full py-2 rounded-xl font-display font-bold text-xs transition cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                      canFeed
                        ? 'bg-[var(--ui-secondary)] hover:bg-[var(--ui-secondary)]/90 text-white shadow-[0_0_16px_rgba(var(--ui-secondary-rgb),0.3)]'
                        : 'bg-[var(--ui-panel-deep)] text-slate-500 border border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    {isBusy
                      ? 'Кормлю…'
                      : cooldownLeftSec > 0
                      ? `Корм через ${formatCountdown(cooldownLeftSec)}`
                      : hunger >= 99
                        ? 'Сыт под завязку'
                        : `Покормить • ${formatCompact(feedPrice)} Data`}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canAfford || levelLocked || isBusy}
                  onClick={() => void petAction('buy', cfg.key)}
                  className={`w-full py-2 rounded-xl font-display font-bold text-xs transition cursor-pointer ${
                    levelLocked
                      ? 'bg-[var(--ui-panel-deep)] text-amber-400/80 border border-amber-500/25 cursor-not-allowed'
                      : canAfford
                        ? 'bg-[var(--ui-primary)] hover:bg-[var(--ui-primary)]/90 text-[var(--ui-on-primary)]'
                        : 'bg-[var(--ui-panel-deep)] text-slate-500 border border-slate-800 cursor-not-allowed'
                  }`}
                >
                  {isBusy ? (
                    '⏳ Завожу…'
                  ) : levelLocked ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Ур. {cfg.requiredLevel}
                    </span>
                  ) : (
                    <>
                      Завести • {formatCompact(cfg.costAmount)} {CURRENCY_LABEL[cfg.costCurrency]}
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
