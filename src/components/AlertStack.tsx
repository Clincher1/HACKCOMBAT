import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { useGame } from '../context/GameContext';

const ALERT_AUTO_DISMISS_MS = 3200;

export const AlertStack: React.FC = () => {
  const { alerts, dismissAlert } = useGame();
  const latestId = alerts[0]?.id;

  useEffect(() => {
    if (!latestId) return;
    const timer = window.setTimeout(() => dismissAlert(latestId), ALERT_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [latestId, dismissAlert]);

  /**
   * v1.4 (R4): алерт стоит ПОД верхней панелью, а не поверх неё.
   *
   * Было: `top-24` (96 px). HUD с ресурсами и шкалой Heat выше — уведомление
   * ложилось ровно на строку ресурсов, и подпись слева срезалась. Теперь
   * смещение считается от реальной высоты HUD (`--hk-hud-h`, публикует
   * TopHud через ResizeObserver) плюс 8 px зазора. Фолбэк 156 px — оценка
   * HUD на 320 px без онбординга: даже без наблюдателя алерт ниже панели.
   */
  return (
    <div
      className="fixed inset-x-0 z-40 pointer-events-none px-4"
      style={{ top: 'calc(var(--hk-hud-h, 156px) + 8px)' }}
      aria-live="polite"
      data-qa="alert-stack"
    >
      <div className="max-w-md mx-auto">
        {alerts.slice(0, 1).map((alert) => {
            const borderClass =
              alert.type === 'penalty'
                ? 'border-rose-500 bg-rose-950/95 text-rose-100'
                : alert.type === 'achievement'
                  ? 'border-[var(--ui-success)] bg-[rgba(var(--ui-panel-rgb), 0.95)] text-white'
                  : alert.type === 'warning'
                    ? 'border-amber-400/70 bg-[rgba(var(--ui-panel-rgb), 0.95)] text-amber-100'
                    : 'border-[var(--ui-primary)]/70 bg-[rgba(var(--ui-panel-rgb), 0.95)] text-white';

            return (
              <div
                key={alert.id}
                className={`alert-drop pointer-events-auto rounded-xl border px-3 py-2 shadow-xl flex items-start justify-between gap-2 backdrop-blur-md ${borderClass}`}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-extrabold">{alert.title}</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{alert.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAlert(alert.id)}
                  className="opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
};
