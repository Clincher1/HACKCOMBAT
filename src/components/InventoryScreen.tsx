import { Package as PackageGlyph, Sparkles, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { getConsumableItem } from '../../shared/consumables.config';
import type { ApiSyncResponse, ItemRarity } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { apiRequest } from '../lib/api';
import { withAlpha } from '../lib/colors';
import { ModalFrame } from './ModalFrame';

/**
 * HACKER KOMBAT — v1: экран инвентаря («Инвентарь оживает»).
 * ----------------------------------------------------------------------------
 * Что здесь: сетка карточек выпавших расходников. Данные приходят только с
 * сервера (`player.items` из player_items), применение — POST /api/inventory
 * с action: 'use'. Экран ничего не начисляет и не считает эффекты сам: после
 * ответа стейт берётся из ответа сервера, поэтому расхождений быть не может.
 *
 * Чего здесь намеренно нет: слотов экипировки, крафта и общего компонента
 * карточки с «Косметикой»/«Коллекцией». Это отдельные сущности, и связывать их
 * в один компонент — значит получить регрессию в двух готовых экранах.
 *
 * Только ленивый чанк: HUD подключает экран через React.lazy, поэтому
 * framer-motion внутри ModalFrame в главный бандл не попадает.
 */

export const INVENTORY_EMPTY_TITLE = 'Инвентарь пуст';
export const INVENTORY_EMPTY_HINT = 'Предметы появятся позже — здесь будут бафы и экипировка.';

/** Рамка и подпись редкости — на токенах темы, без hex в разметке. */
const RARITY_TOKENS: Record<ItemRarity, { border: string; text: string; label: string }> = {
  common: { border: 'var(--ui-primary)', text: 'var(--ui-text-muted)', label: 'Обычный' },
  rare: { border: 'var(--ui-secondary)', text: 'var(--ui-secondary)', label: 'Редкий' },
  epic: { border: 'var(--ui-magic)', text: 'var(--ui-magic)', label: 'Эпический' },
};

export interface InventoryScreenProps {
  open: boolean;
  onClose: () => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ open, onClose }) => {
  const { player, syncFromServer, pushClientAlert } = useGame();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const hasNewItems = player?.stats.hasNewItems === true;

  // Открыли экран — точка «новый дроп» гаснет. Отметку ставит сервер: клиент
  // не может «прочитать» дроп, если его на сервере не было.
  useEffect(() => {
    if (!open || !hasNewItems) return;
    void apiRequest<ApiSyncResponse>('/api/inventory', 'POST', { action: 'seen' })
      .then((res) => syncFromServer(res))
      .catch(() => {});
  }, [open, hasNewItems, syncFromServer]);

  const applyItem = useCallback(
    async (itemKey: string) => {
      if (busyKey) return;
      setBusyKey(itemKey);
      try {
        // Эффект считает сервер; клиент только просит и берёт стейт из ответа.
        const res = await apiRequest<ApiSyncResponse>('/api/inventory', 'POST', { action: 'use', itemKey });
        syncFromServer(res);
      } catch (err) {
        pushClientAlert({
          type: 'warning',
          title: 'Предмет не применён',
          message: err instanceof Error ? err.message : 'Ошибка запроса',
        });
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, syncFromServer, pushClientAlert]
  );

  const items = (player?.items ?? []).filter((stack) => stack.qty > 0);

  return (
    <ModalFrame
      open={open}
      zIndex={55}
      cardClassName="w-full max-w-sm rounded-3xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[rgba(var(--ui-primary-rgb),0.40)] bg-[var(--ui-panel-deep)] text-[var(--ui-primary)]">
            <PackageGlyph className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-[16px] font-extrabold text-white">Инвентарь</h2>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {items.length > 0 ? `Расходники: ${items.length}` : 'Снаряжение оператора'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-qa="inventory-close"
          aria-label="Закрыть инвентарь"
          className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-slate-700 bg-[var(--ui-panel-deep)] text-slate-400 transition cursor-pointer hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div
          data-qa="inventory-empty"
          className="mt-3 rounded-2xl border border-dashed border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel-deep)] px-4 py-7 text-center"
        >
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(var(--ui-primary-rgb),0.12)] text-[var(--ui-primary)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="mt-2.5 font-display text-[16px] font-extrabold text-white">{INVENTORY_EMPTY_TITLE}</p>
          <p className="mx-auto mt-1 max-w-[16rem] text-[11px] leading-relaxed text-slate-400">
            {INVENTORY_EMPTY_HINT}
          </p>
        </div>
      ) : (
        <div data-qa="inventory-grid" className="mt-3 grid grid-cols-2 gap-2">
          {items.map((stack) => {
            const item = getConsumableItem(stack.key);
            if (!item) return null;
            const rarity = RARITY_TOKENS[item.rarity];
            const busy = busyKey === item.key;
            return (
              <article
                key={item.key}
                data-qa={`inventory-card-${item.key}`}
                className="flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-[var(--ui-panel-deep)] p-2.5"
                style={{ borderColor: withAlpha(rarity.border, 0.55) }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[20px] leading-none"
                    style={{ background: withAlpha(rarity.border, 0.14) }}
                  >
                    {item.icon}
                  </span>
                  <span
                    className="rounded-lg px-1.5 py-0.5 font-num text-[11px] leading-none"
                    style={{ background: withAlpha(rarity.border, 0.16), color: rarity.text }}
                  >
                    ×{stack.qty}
                  </span>
                </div>
                <p className="min-w-0 truncate font-display text-[13px] font-bold text-white">{item.name}</p>
                <p className="text-[11px] leading-tight" style={{ color: rarity.text }}>
                  {rarity.label}
                  {item.durationLabel ? ` · ${item.durationLabel}` : ''}
                </p>
                <p className="line-clamp-3 text-[11px] leading-snug text-slate-400">{item.description}</p>
                <button
                  type="button"
                  onClick={() => void applyItem(item.key)}
                  disabled={!item.usable || busy}
                  data-qa={`inventory-use-${item.key}`}
                  aria-label={`Применить: ${item.name}`}
                  className="mt-auto grid min-h-[44px] w-full place-items-center rounded-xl border px-2 font-display text-[11px] font-bold uppercase tracking-wide transition cursor-pointer active:scale-95 disabled:cursor-default disabled:opacity-50"
                  style={{
                    borderColor: withAlpha(rarity.border, 0.6),
                    background: withAlpha(rarity.border, 0.14),
                    color: rarity.text,
                  }}
                >
                  {item.usable ? (busy ? 'Применяем…' : 'Применить') : 'Сработает сам'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
        Предметы выпадают за успешные взломы, контракты и уровни 5/10/15/20. Тапы дроп не дают.
      </p>
    </ModalFrame>
  );
};
