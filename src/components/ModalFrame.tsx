import { motion } from 'framer-motion';
import React from 'react';

/**
 * HACKER KOMBAT — каркас модала с инвариантом «подложка = только вместе с карточкой»
 * (v5.6-fix).
 *
 * Зачем: затемняющая подложка (`fixed inset-0 bg-black/…`) без видимой карточки
 * — это полноэкранный слой, который блокирует тапы и выглядит как зависшая
 * игра. Такое уже случалось (desk-overlay баг): состояние модала считалось
 * «открытым», а содержимое не рендерилось. Теперь это невозможно структурно:
 *
 *   1) `open === false`  → ничего не рендерится (ни подложки, ни карточки);
 *   2) `children` пустой (null / undefined / false / пустая строка) → тоже
 *      ничего: без карточки подложки не существует;
 *   3) подложка и карточка всегда в одном дереве, поэтому их невозможно
 *      «рассинхронизировать» условным рендером снаружи.
 *
 * Проверяется scripts/qa/overlays.ts: если в разметке есть маркер подложки
 * (`data-qa-backdrop`), то в ней обязан быть маркер карточки (`data-qa-modal-card`).
 */

export const MODAL_BACKDROP_ATTR = 'data-qa-backdrop';
export const MODAL_CARD_ATTR = 'data-qa-modal-card';

export interface ModalFrameProps {
  /** Модал открыт. false ⇒ компонент не рендерит НИЧЕГО. */
  open: boolean;
  /** Классы подложки: по умолчанию затемнение + центрирование. */
  backdropClassName?: string;
  /** Классы карточки. */
  cardClassName?: string;
  /** z-index подложки (по умолчанию 50 — как у остальных модалов). */
  zIndex?: number;
  children?: React.ReactNode;
}

/** Есть ли у детей хоть что-то, что реально отрисуется. */
export function hasRenderableContent(children: React.ReactNode): boolean {
  if (children === null || children === undefined || children === false) return false;
  if (typeof children === 'string') return children.trim().length > 0;
  if (Array.isArray(children)) return children.some((child) => hasRenderableContent(child));
  return true;
}

export const ModalFrame: React.FC<ModalFrameProps> = ({
  open,
  backdropClassName = 'fixed inset-0 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm',
  cardClassName = 'w-full max-w-sm rounded-2xl bg-[var(--ui-panel)] p-5',
  zIndex = 50,
  children,
}) => {
  // Инвариант: без видимой карточки подложка не существует.
  if (!open) return null;
  if (!hasRenderableContent(children)) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={backdropClassName}
      style={{ zIndex }}
      data-qa-backdrop="true"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12 }}
        className={cardClassName}
        data-qa-modal-card="true"
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export default ModalFrame;
