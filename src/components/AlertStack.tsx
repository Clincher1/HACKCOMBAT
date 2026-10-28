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

  return (
    <div className="fixed top-24 inset-x-0 z-40 pointer-events-none px-4" aria-live="polite">
      <div className="max-w-md mx-auto">
        {alerts.slice(0, 1).map((alert) => {
            const borderClass =
              alert.type === 'penalty'
                ? 'border-rose-500 bg-rose-950/95 text-rose-100'
                : alert.type === 'achievement'
                  ? 'border-[#7dff00] bg-[#0e1d14]/95 text-white'
                  : alert.type === 'warning'
                    ? 'border-amber-400/70 bg-[#1c160c]/95 text-amber-100'
                    : 'border-[#00f0ff]/70 bg-[#0d172e]/95 text-white';

            return (
              <div
                key={alert.id}
                className={`alert-drop pointer-events-auto rounded-xl border px-3 py-2 shadow-xl flex items-start justify-between gap-2 backdrop-blur-md ${borderClass}`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-extrabold">{alert.title}</div>
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
