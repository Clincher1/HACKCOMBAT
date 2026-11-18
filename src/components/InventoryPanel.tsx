import { Backpack, Eye, EyeOff } from 'lucide-react';
import React, { useMemo } from 'react';
import { getInventoryItemDefinition, isCollectibleInventoryItem } from '../../shared/inventory.config';
import { NEW_YEAR_CANDY_KEY, NEW_YEAR_CANDY_MAX_USES } from '../../shared/newYearCandy';
import type { InventoryCategory, InventoryItemDefinition } from '../../shared/types';
import { useGame } from '../context/GameContext';

const CATEGORIES: { key: InventoryCategory; label: string; description: string }[] = [
  { key: 'event', label: 'События', description: 'Достижения и награды событий' },
  { key: 'prize', label: 'Призы', description: 'Памятные и выигранные предметы' },
  { key: 'gift', label: 'Подарки', description: 'Общие и персональные подарки' },
];

/** Only server-owned collectibles are displayed; cosmetics remain in Cyber-Cosmetics. */
export const InventoryPanel: React.FC = () => {
  const { player, busyKey, setInventoryVisibility, useNewYearCandy, nowMs } = useGame();
  const groups = useMemo(() => {
    const items = (player?.inventory.ownedKeys ?? [])
      .filter(isCollectibleInventoryItem)
      .map(getInventoryItemDefinition)
      .filter((item): item is InventoryItemDefinition => item !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.key.localeCompare(b.key));
    return CATEGORIES.map((category) => ({
      ...category,
      items: items.filter((item) => item.inventoryCategory === category.key),
    })).filter((category) => category.items.length > 0);
  }, [player?.inventory.ownedKeys]);

  if (!player) return null;

  const showcase = new Set(player.inventory.showcaseKeys);
  const total = groups.reduce((count, group) => count + group.items.length, 0);
  const shown = groups.reduce((count, group) => count + group.items.filter((item) => showcase.has(item.key)).length, 0);

  return (
    <section className="space-y-4 pb-6" aria-labelledby="inventory-title">
      <div className="rounded-2xl border border-[var(--ui-primary)]/35 bg-[var(--ui-panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Backpack className="h-5 w-5 text-[var(--ui-primary)]" />
              <h1 id="inventory-title" className="font-display text-base font-extrabold text-white">Инвентарь</h1>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              Здесь хранятся награды событий, призы и подарки. Выстави предмет, чтобы его увидели другие игроки.
              Рамки и другая косметика находятся в «Кибер-Косметике».
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-[var(--ui-primary)]/30 bg-black/20 px-2 py-1 text-right text-[10px] font-bold text-[var(--ui-primary)]">
            <div>{total} предметов</div>
            <div className="text-slate-400">{shown} выставлено</div>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#10172e] p-5 text-center text-xs text-slate-400">
          Пока здесь пусто. Предметы появятся после получения призов и подарков.
        </div>
      ) : groups.map((group) => (
        <section key={group.key} aria-labelledby={`inventory-${group.key}`} className="space-y-2">
          <div>
            <h2 id={`inventory-${group.key}`} className="text-xs font-extrabold text-white">{group.label} <span className="text-slate-500">· {group.items.length}</span></h2>
            <p className="text-[10px] text-slate-500">{group.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {group.items.map((item) => {
              const isPublic = showcase.has(item.key);
              const visibilityBusy = busyKey === `inventory:${item.key}:${isPublic ? 'hide' : 'show'}`;
              return (
                <article key={item.key} className={`flex min-h-[190px] flex-col overflow-hidden rounded-2xl border bg-[#10172e] p-2.5 ${isPublic ? 'border-[var(--ui-primary)]/70 shadow-[0_0_18px_rgba(var(--ui-primary-rgb),0.12)]' : 'border-slate-800'}`}>
                  <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl border bg-black/20 text-4xl" style={{ borderColor: `${item.accent}66`, boxShadow: `inset 0 0 20px ${item.accent}12` }}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span aria-hidden="true">{item.icon}</span>}
                  </div>
                  <div className="mt-2 min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-white" title={item.name}>{item.name}</div>
                    <div className="theme-accent-text mt-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: item.accent }}>{item.source}</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{item.description}</p>
                  </div>
                  {item.key === NEW_YEAR_CANDY_KEY && (() => {
                    const candy = player.newYearCandy;
                    const active = candy.boostUntil && Date.parse(candy.boostUntil) > nowMs;
                    const seconds = active ? Math.ceil((Date.parse(candy.boostUntil!) - nowMs) / 1000) : 0;
                    const time = `${Math.floor(seconds / 3600)} ч ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')} мин`;
                    return <div className="mt-2 space-y-1">
                      <div className="text-center text-[10px] font-bold text-rose-200">Осталось укусов: {candy.usesRemaining}/{NEW_YEAR_CANDY_MAX_USES}</div>
                      {active && <div className="text-center text-[10px] font-bold text-emerald-300">×2 на тапы ещё {time}</div>}
                      <button type="button" onClick={() => void useNewYearCandy()}
                        disabled={candy.usesRemaining <= 0 || busyKey === 'inventory:new-year-candy:use'}
                        className="w-full rounded-lg bg-rose-500 px-2 py-2 text-[11px] font-extrabold text-white disabled:opacity-50 disabled:cursor-not-allowed">
                        {busyKey === 'inventory:new-year-candy:use' ? 'Сохраняем…' : candy.usesRemaining > 0 ? '🍬 Откусить · ×2 на 1 час' : 'Леденец съеден'}
                      </button>
                    </div>;
                  })()}
                  <button
                    type="button"
                    aria-label={isPublic ? `Скрыть ${item.name} из витрины` : `Выставить ${item.name} в витрину`}
                    aria-pressed={isPublic}
                    disabled={visibilityBusy}
                    onClick={() => void setInventoryVisibility(item.key, !isPublic)}
                    className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition cursor-pointer disabled:cursor-wait disabled:opacity-60 ${isPublic ? 'border-[var(--ui-primary)]/50 bg-[rgba(var(--ui-primary-rgb),0.12)] text-[var(--ui-primary)]' : 'border-slate-700 bg-[#0a0e1a] text-slate-300 hover:border-[var(--ui-primary)]'}`}
                  >
                    {isPublic ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {visibilityBusy ? 'Сохранение…' : isPublic ? 'Скрыть' : 'Выставить'}
                  </button>
                  <div className={`mt-1 text-center text-[9px] font-bold ${isPublic ? 'text-[var(--ui-primary)]' : 'text-slate-500'}`}>
                    {isPublic ? 'Видно другим игрокам' : 'Скрыто от других игроков'}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
};
