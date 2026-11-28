import { Package as PackageGlyph, Sparkles, X } from 'lucide-react';
import React from 'react';
import { ModalFrame } from './ModalFrame';

/**
 * HACKER KOMBAT — v1.1: экран инвентаря (заготовка).
 * ----------------------------------------------------------------------------
 * Заказчик попросил заметную точку входа, но БЕЗ механики: предметов, бафов и
 * экипировки пока нет, они приедут отдельным релизом. Поэтому здесь нет ни
 * данных, ни запросов к API, ни стейта — только каркас экрана и честная
 * заглушка. Ничего не читается из player, поэтому экран не может «сломаться»
 * от формы сейва.
 *
 * Постоянные подарки и витрина профиля (вкладка «Инвентарь профиля») — это
 * другая, уже выпущенная сущность; здесь она намеренно не дублируется.
 *
 * Модал собран через ModalFrame: подложка без карточки структурно невозможна
 * (инвариант проверяет scripts/qa/overlays.ts).
 */

export const INVENTORY_EMPTY_TITLE = 'Инвентарь пуст';
export const INVENTORY_EMPTY_HINT = 'Предметы появятся позже — здесь будут бафы и экипировка.';

export interface InventoryScreenProps {
  open: boolean;
  onClose: () => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ open, onClose }) => (
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
          <p className="mt-0.5 truncate text-[11px] text-slate-400">Снаряжение оператора</p>
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

    {/* Пустая ячейка-заглушка: без предметов, бафов и экипировки. */}
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

    <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
      Пока это заготовка: надеть, продать или улучшить нечего. Как только предметы появятся, они
      окажутся здесь.
    </p>
  </ModalFrame>
);
