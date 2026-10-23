import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { useGame } from '../context/GameContext';

export const AlertStack: React.FC = () => {
  const { alerts, dismissAlert } = useGame();

  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    const timer = window.setTimeout(() => dismissAlert(latest.id), 4500);
    return () => window.clearTimeout(timer);
  }, [alerts, dismissAlert]);

  return (
    <div className="fixed top-28 inset-x-0 z-40 pointer-events-none px-3">
      <div className="max-w-xl mx-auto space-y-2">
        <AnimatePresence>
          {alerts.slice(0, 2).map((alert) => {
            const borderClass =
              alert.type === 'penalty'
                ? 'border-rose-500 bg-rose-950/95 text-rose-100'
                : alert.type === 'achievement'
                  ? 'border-[#7dff00] bg-[#0e1d14]/95 text-white'
                  : alert.type === 'warning'
                    ? 'border-amber-400/70 bg-[#1c160c]/95 text-amber-100'
                    : 'border-[#00f0ff]/70 bg-[#0d172e]/95 text-white';

            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                className={`pointer-events-auto rounded-xl border px-3.5 py-2.5 shadow-xl flex items-start justify-between gap-2 backdrop-blur-md ${borderClass}`}
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
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
