import React from 'react';
import {
  canActivateLollipop,
  formatLollipopLeft,
  isLollipopActive,
  isSeasonActive,
  lollipopCooldownMs,
  lollipopRemainingMs,
} from '../../shared/season.config';
import { useGame } from '../context/GameContext';
import { CandiesIcon } from './ui-icons';

/**
 * Бейдж сезонного леденца (v6.3).
 *
 * Один компонент на весь интерфейс: счётчик Data на столе. Никакого своего
 * таймера — время приходит из общего `nowMs` контекста, поэтому буст истёк
 * сам, без перезагрузки и без лишних подписок.
 *
 * Состояния:
 *   • активен — яркая плашка «×2 · 0:42»;
 *   • доступен — кнопка «Активировать», тап идёт через общий runAction;
 *   • уже использован сегодня — серая плашка с временем до новых суток.
 */
const LollipopBadgeBase: React.FC = () => {
  const { player, nowMs, activateLollipop, busyKey } = useGame();
  if (!player || !isSeasonActive) return null;

  const state = player.stats.lollipop;
  const active = isLollipopActive(state, nowMs);
  const busy = busyKey === 'lollipop:activate';

  if (active) {
    return (
      <span
        data-qa="lollipop-badge"
        data-lollipop-state="active"
        className="inline-flex items-center gap-1 rounded-md bg-amber-300/20 px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-amber-200"
        title="Леденец: Data ×2 со всех ручных действий"
      >
        <CandiesIcon className="h-3 w-3" />
        ×2 · {formatLollipopLeft(lollipopRemainingMs(state, nowMs))}
      </span>
    );
  }

  if (canActivateLollipop(state, nowMs)) {
    return (
      <button
        type="button"
        data-qa="lollipop-badge"
        data-qa-action="activate-lollipop"
        data-lollipop-state="ready"
        onClick={() => void activateLollipop()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-300 transition-colors duration-150 active:bg-slate-700 disabled:opacity-60 cursor-pointer"
        title="Леденец: ×2 Data на час, активируется раз в сутки"
      >
        <CandiesIcon className="h-3 w-3" />
        {busy ? '…' : 'Активировать'}
      </button>
    );
  }

  return (
    <span
      data-qa="lollipop-badge"
      data-lollipop-state="spent"
      className="inline-flex items-center gap-1 rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-500"
      title="Леденец снова будет доступен с новыми игровыми сутками"
    >
      <CandiesIcon className="h-3 w-3" />
      {formatLollipopLeft(lollipopCooldownMs(state, nowMs))}
    </span>
  );
};

export const LollipopBadge = React.memo(LollipopBadgeBase);
LollipopBadge.displayName = 'LollipopBadge';
