import { Award, Eye, Lock, Sparkles } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  ACHIEVEMENTS_CONFIG,
  PUBLIC_ACHIEVEMENTS_COUNT,
} from '../../shared/achievements.config';
import type { AchievementRarity } from '../../shared/types';
import { useGame } from '../context/GameContext';
import { CheckIcon, ChipsIcon, CryptoIcon } from './ui-icons';
import { withAlpha } from '../lib/colors';

const RARITY_META: Record<AchievementRarity, { label: string; color: string }> = {
  common: { label: 'Обычное', color: 'var(--ui-text-faint)' },
  rare: { label: 'Редкое', color: 'var(--ui-primary)' },
  epic: { label: 'Эпическое', color: 'var(--ui-purple)' },
  legendary: { label: 'Легендарное', color: 'var(--ui-warn)' },
  secret: { label: 'Секретное', color: 'var(--ui-secondary)' },
};

type Filter = 'all' | 'unlocked' | 'locked';

/**
 * Достижения.
 * ВАЖНО: у закрытых ачивок картинка СКРЫТА (замок вместо иконки),
 * а секретные дополнительно не показывают ни название, ни описание, ни награду.
 */
export const AchievementsPanel: React.FC = () => {
  const { player } = useGame();
  const [filter, setFilter] = useState<Filter>('all');

  const unlockedSet = useMemo(
    () => new Set(player?.achievements ?? []),
    [player?.achievements]
  );

  if (!player) return null;

  const publicTotal = PUBLIC_ACHIEVEMENTS_COUNT;
  const publicUnlocked = ACHIEVEMENTS_CONFIG.filter(
    (a) => !a.secret && unlockedSet.has(a.key)
  ).length;
  const secretsTotal = ACHIEVEMENTS_CONFIG.filter((a) => a.secret).length;
  const secretsFound = ACHIEVEMENTS_CONFIG.filter(
    (a) => a.secret && unlockedSet.has(a.key)
  ).length;
  const progressPct = Math.round((publicUnlocked / Math.max(1, publicTotal)) * 100);

  const visible = ACHIEVEMENTS_CONFIG.filter((ach) => {
    const unlocked = unlockedSet.has(ach.key);
    if (filter === 'unlocked') return unlocked;
    if (filter === 'locked') return !unlocked;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Сводка прогресса */}
      <div className="rounded-2xl bg-[var(--ui-panel)] border border-[var(--ui-success)]/25 p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-bold text-white flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[var(--ui-success)]" />
            <span>
              Достижения {publicUnlocked}/{publicTotal}
            </span>
          </div>
          <span className="text-[11px] font-bold text-[var(--ui-secondary)] flex items-center gap-1">
            <Eye className="w-3 h-3" /> Секретов найдено: {secretsFound}/{secretsTotal}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--ui-primary)] to-[var(--ui-success)] transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Иконки закрытых достижений скрыты. Секретные не показывают даже название — ищи сам.
        </p>
      </div>

      {/* Фильтр */}
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            { id: 'all', label: 'Все' },
            { id: 'unlocked', label: 'Получены' },
            { id: 'locked', label: 'Впереди' },
          ] as { id: Filter; label: string }[]
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
              filter === f.id
                ? 'bg-[var(--ui-success)]/18 border-[var(--ui-success)] text-[var(--ui-success)]'
                : 'bg-[var(--ui-panel-deep)] border-slate-800 text-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Сетка */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {visible.map((ach) => {
          const unlocked = unlockedSet.has(ach.key);
          const hidden = Boolean(ach.secret) && !unlocked;
          const meta = RARITY_META[ach.rarity] ?? RARITY_META.common;

          return (
            <div
              key={ach.key}
              className={`rounded-xl p-3 border flex items-start gap-2.5 ${
                unlocked
                  ? 'bg-[var(--ui-panel)] border-[var(--ui-success)]/50'
                  : hidden
                    ? 'bg-[var(--ui-panel)] border-slate-800/70'
                    : 'bg-[var(--ui-panel-deep)] border-slate-800/80'
              }`}
            >
              {/* Медальон: картинка видна ТОЛЬКО после получения */}
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[20px] shrink-0 border"
                style={{
                  borderColor: unlocked ? meta.color : 'var(--ui-border-muted)',
                  backgroundColor: unlocked ? withAlpha(meta.color, 0.09) : 'var(--ui-panel)',
                  boxShadow: unlocked ? `0 0 12px ${withAlpha(meta.color, 0.25)}` : 'none',
                }}
              >
                {unlocked ? ach.icon : hidden ? <Sparkles className="w-4 h-4 text-slate-700" /> : <Lock className="w-4 h-4 text-slate-600" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-[13px] font-bold truncate ${
                      unlocked ? 'text-white' : hidden ? 'text-slate-500' : 'text-slate-300'
                    }`}
                  >
                    {hidden ? '???' : ach.title}
                  </span>
                  {unlocked ? (
                    <span className="text-[11px] font-bold text-purple-300 shrink-0">
                      +{ach.cryptoReward} <CryptoIcon className="inline h-3 w-3 align-[-1px]" />
                      {ach.chipReward ? <> +{ach.chipReward} <ChipsIcon className="inline h-3 w-3 align-[-1px]" /></> : null}
                    </span>
                  ) : (
                    <span
                      className="text-[11px] font-bold shrink-0 px-1.5 py-0.5 rounded"
                      style={{ color: meta.color, backgroundColor: withAlpha(meta.color, 0.08) }}
                    >
                      {hidden ? 'СЕКРЕТ' : meta.label}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {hidden
                    ? 'Секретное достижение. Откроется само — просто играй по-своему.'
                    : ach.description}
                </p>
                {unlocked && (
                  <div className="text-[11px] font-bold mt-1 uppercase tracking-wide" style={{ color: meta.color }}>
                    <CheckIcon className="inline h-3 w-3 align-[-1px]" /> Получено
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-center text-[11px] text-slate-500 py-6">Здесь пока пусто.</p>
      )}
    </div>
  );
};
