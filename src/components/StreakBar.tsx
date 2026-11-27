import React, { useState } from 'react';
import { Bell, BellOff, Check, Flame, Gift } from 'lucide-react';
import {
  DAILY_STREAK_MAX,
  DAILY_STREAK_REWARDS,
  getDailyStreakReward,
  getUtcDayKey,
} from '../../shared/economy.config';
import { formatCompact } from '../lib/format';
import { useGame } from '../context/GameContext';

// ============================================================================
// STREAK BAR — 7 клеток дневного цикла (v5.6)
// ----------------------------------------------------------------------------
// Что показывает: где игрок в цикле 1..7, что даёт следующий день и когда
// бонус уже забран. Что НЕ делает: не считает стрик сам. Все даты — серверные
// (stats.lastDailyClaim в UTC приезжает в init-ответе), клиент только рисует
// и подсвечивает. Поэтому перевод часов на телефоне ничего не продлевает.
//
// Гейт онбординга: пока онбординг v2 не пройден, панель не рендерится вовсе —
// новичок не должен видеть «стрик 0/7» раньше, чем понял правила игры.
// ============================================================================

export const StreakBar: React.FC = () => {
  const { player, retention, claimDailyBonus, setReminderOptIn, busyKey, newPlayerMode } = useGame();
  const [reminderBusy, setReminderBusy] = useState(false);

  // Флаг выключен или снимка нет — панели нет (инертность при RETENTION_V1=false).
  if (!retention?.enabled || !player) return null;
  // Правило v5.6: не конфликтуем с онбордингом.
  if (newPlayerMode) return null;

  const claimedToday = retention.dailyClaimedToday;
  const day = Math.min(DAILY_STREAK_MAX, Math.max(1, retention.dailyStreakDay || 1));
  const nextReward = getDailyStreakReward(claimedToday ? Math.min(DAILY_STREAK_MAX, day + 1) : day);
  const utcToday = getUtcDayKey(Date.now());
  const claimBusy = busyKey === 'daily';

  const handleReminder = async (value: boolean) => {
    setReminderBusy(true);
    try {
      await setReminderOptIn(value);
    } finally {
      setReminderBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[var(--ui-panel)] border border-[var(--ui-primary)]/25 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-[13px] font-extrabold text-white uppercase tracking-wider">
          <Flame className="w-3.5 h-3.5 text-amber-400" /> Стрик {retention.dailyStreak}/7
        </span>
        <span className="text-[11px] text-slate-400">
          {claimedToday ? 'сегодня забрано' : `доступен день ${day}`}
        </span>
      </div>

      {/* 7 клеток: пройденные — залиты, текущая — пульсирует, будущие — приглушены */}
      <div className="grid grid-cols-7 gap-1">
        {DAILY_STREAK_REWARDS.map((reward) => {
          const isDone = claimedToday ? reward.day <= day : reward.day < day;
          const isToday = !claimedToday && reward.day === day;
          return (
            <div
              key={reward.day}
              className={[
                'rounded-lg border px-1 py-1.5 text-center transition-colors',
                isDone
                  ? 'bg-[var(--ui-success)]/20 border-[var(--ui-success)]/45'
                  : isToday
                    ? 'bg-[var(--ui-primary)]/20 border-[var(--ui-primary)]/70 animate-pulse'
                    : 'bg-[var(--ui-panel-deep)] border-slate-800',
              ].join(' ')}
              title={`День ${reward.day}: +${reward.crypto} Crypto, ×${reward.dataUnits} Data, +${reward.chips} чип`}
            >
              <div className="text-[11px] text-slate-400 leading-none">{reward.day}</div>
              <div className="text-[11px] font-bold text-white leading-tight mt-0.5">
                {isDone ? <Check className="w-3 h-3 mx-auto text-[var(--ui-success)]" /> : `×${reward.dataUnits}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          <Gift className="w-3 h-3 text-[var(--ui-primary)]" />
          День {nextReward.day}: {formatCompact(nextReward.crypto)} Crypto · ×{nextReward.dataUnits} Data
        </span>
        <button
          type="button"
          disabled={claimedToday || claimBusy}
          onClick={() => void claimDailyBonus()}
          className={[
            'px-3 py-1.5 rounded-lg font-display font-extrabold text-[11px] uppercase tracking-wider transition-colors',
            claimedToday || claimBusy
              ? 'bg-[var(--ui-panel-deep)] text-slate-500 cursor-not-allowed border border-slate-800'
              : 'bg-[var(--ui-primary)] text-[var(--ui-on-primary)] cursor-pointer hover:bg-[var(--ui-primary)]/90',
          ].join(' ')}
        >
          {claimedToday ? 'Забрано' : claimBusy ? '…' : 'Забрать'}
        </button>
      </div>

      {/* Напоминания: checkbox default OFF. Без токена на сервере — заглушка. */}
      <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={retention.reminderOptIn === true}
          disabled={reminderBusy || !retention.reminderAvailable}
          onChange={(e) => void handleReminder(e.target.checked)}
          className="mt-0.5 w-3.5 h-3.5 accent-[var(--ui-primary)] cursor-pointer disabled:cursor-not-allowed"
        />
        <span className="flex-1">
          {retention.reminderAvailable ? (
            <>
              {retention.reminderOptIn ? <Bell className="w-3 h-3 inline mr-1" /> : <BellOff className="w-3 h-3 inline mr-1" />}
              Напомнить в Telegram, если сутки не заходил и не забрал бонус (не чаще раза в сутки)
            </>
          ) : (
            <>Напоминания пока недоступны: бот не настроен на сервере (нужен TELEGRAM_BOT_TOKEN)</>
          )}
        </span>
      </label>

      <p className="text-[11px] text-slate-600">
        день считается по UTC на сервере · {utcToday} · пропуск дня сбрасывает стрик на 1
      </p>
    </div>
  );
};

export default StreakBar;
