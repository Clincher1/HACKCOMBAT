import { BookOpen, Flame, Gem, Gift, Palette, Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import React from 'react';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

export const TopHud: React.FC = () => {
  const {
    player,
    soundMuted,
    toggleSound,
    setDailyModalOpen,
    setSkinModalOpen,
    openTutorial,
    tutorialUnseen,
    nowMs,
  } = useGame();

  if (!player) return null;

  const { derived } = player;
  const energyPct = Math.min(100, Math.max(0, (player.energy / derived.maxEnergy) * 100));

  const dailyAvailable =
    !player.lastDailyClaim ||
    (nowMs - new Date(player.lastDailyClaim).getTime()) / (1000 * 3600) >= 20;

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0a0e1a]/92 border-b border-[#00f0ff]/18 px-3 pt-2.5 pb-2">
      <div className="max-w-xl mx-auto space-y-2">
        {/* Верхняя строка: Уровень/Ранг + быстрые кнопки Бонуса, Скинов и Звука */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="px-2 py-0.5 rounded-md bg-[#00f0ff]/15 border border-[#00f0ff]/40 text-[#00f0ff] font-display text-xs font-bold shrink-0">
              УР. {derived.level}
            </div>
            <span className="text-xs text-slate-300 truncate font-semibold">
              {derived.rankTitle}
            </span>
            {player.prestigeCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-[#ff00a0]/20 border border-[#ff00a0]/45 text-[#ff00a0] text-[10px] font-bold">
                ×{derived.prestigeMultiplier} PRESTIGE
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={openTutorial}
              className="relative flex items-center gap-1 px-2 py-1 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-[#00f0ff]/45 text-[#00f0ff] text-xs font-semibold transition cursor-pointer"
              title="Обучение: что качать и как играть"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Обучение</span>
              {tutorialUnseen && (
                <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setDailyModalOpen(true)}
              className="relative flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-[#7dff00]/35 text-[#7dff00] text-xs font-semibold transition cursor-pointer"
              title="Ежедневный бонус Crypto"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Бонус</span>
              {dailyAvailable && (
                <span className="w-2 h-2 rounded-full bg-[#7dff00] animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSkinModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-[#ff00a0]/35 text-[#ff00a0] text-xs font-semibold transition cursor-pointer"
              title="Эксклюзивные скины за Crypto"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Скины</span>
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label="Переключить звук"
              className="p-1.5 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-slate-700/70 text-slate-300 transition cursor-pointer"
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-[#00f0ff]" />}
            </button>
          </div>
        </div>

        {/* Средняя строка: 4 основные валюты (Data, Data/ч, Crypto, Rep / Heat) */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="col-span-2 rounded-xl bg-[#10172e] border border-[#00f0ff]/25 px-3 py-1.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Data Баланс
              </div>
              <div className="font-display text-lg font-extrabold text-white leading-tight tracking-tight">
                {formatCompact(Math.floor(player.data))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">В час</div>
              <div className="text-xs font-bold text-[#7dff00]">
                +{formatCompact(derived.dataPerHour)}/ч
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSkinModalOpen(true)}
            className="rounded-xl bg-[#10172e] hover:bg-[#151e3b] border border-purple-400/25 px-2.5 py-1.5 text-left transition cursor-pointer"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Gem className="w-3 h-3 text-purple-400" /> Crypto
            </div>
            <div className="font-display text-sm font-bold text-purple-300 mt-0.5">
              {player.crypto}
            </div>
          </button>

          <div className="rounded-xl bg-[#10172e] border border-slate-700/60 px-2.5 py-1.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#00f0ff] flex items-center gap-0.5" title="Репутация (Rep)">
                <Shield className="w-3 h-3" /> {player.rep}
              </span>
              <span
                className={`flex items-center gap-0.5 ${
                  player.heat >= 75 ? 'text-rose-400 animate-pulse' : 'text-[#ff00a0]'
                }`}
                title="Розыск (Heat > 100 = штраф!)"
              >
                <Flame className="w-3 h-3" /> {player.heat}
              </span>
            </div>
            <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden mt-1">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, player.heat)}%`,
                  background: player.heat >= 75 ? '#fb7185' : '#ff00a0',
                }}
              />
            </div>
          </div>
        </div>

        {/* Шкала CPU Energy (восстановление 1 Energy / 3 сек) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-[#00f0ff]">
              <Zap className="w-3.5 h-3.5 fill-[#00f0ff]/30" />
              CPU Charge: {player.energy} / {derived.maxEnergy}
            </span>
            <span className="text-slate-400 text-[10px]">
              Тап: +{formatCompact(derived.clickPower)} Data • +1⚡/3с
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#090d19] border border-slate-800 p-[1px] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${energyPct}%`,
                background: 'linear-gradient(90deg, #00f0ff 0%, #7dff00 100%)',
                boxShadow: '0 0 10px rgba(0, 240, 255, 0.55)',
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
