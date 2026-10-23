import { ArrowRight, BookOpen, Cpu, Crosshair, ShieldAlert } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { CARDS_CONFIG, getCardPrice, MAX_CARD_LEVEL } from '../../shared/cards.config';
import { DeskScene } from '../components/DeskScene';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

export const DeskPage: React.FC = () => {
  const { player, openTutorial, tutorialUnseen } = useGame();
  if (!player) return null;

  const cheapestUpgrade = CARDS_CONFIG.filter(
    (c) =>
      (player.cards[c.key] ?? 0) < MAX_CARD_LEVEL &&
      (!c.minLevel || player.derived.level >= c.minLevel)
  )
    .map((c) => ({ card: c, price: getCardPrice(c, player.cards[c.key] ?? 0) }))
    .sort((a, b) => a.price - b.price)[0];

  return (
    <div className="space-y-3.5 pb-4">
      <DeskScene />

      {/* Плашка быстрого входа в Академию / Обучение (всегда доступна на главном столе для новичков и тактики) */}
      {(tutorialUnseen || player.derived.level <= 5) && (
        <button
          type="button"
          onClick={openTutorial}
          className="w-full rounded-xl bg-gradient-to-r from-[#102042] via-[#131c38] to-[#1d1438] hover:brightness-110 border border-[#00f0ff]/40 p-3 flex items-center justify-between gap-3 text-left transition cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.12)]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#00f0ff]/15 border border-[#00f0ff]/45 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-[#00f0ff]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-white truncate">
                📖 Как играть и что качать первым?
              </div>
              <div className="text-[11px] text-slate-300 truncate">
                Открой Академию: гайд по 4 валютам, веткам White/Black Hat и билдам до Ур. 90+
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#00f0ff] shrink-0" />
        </button>
      )}

      {/* Быстрые тактические подсказки на главном экране */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {cheapestUpgrade && (
          <Link
            to="/upgrades"
            className="rounded-xl bg-[#10172e]/90 hover:bg-[#152040] border border-[#00f0ff]/25 p-3 flex items-center justify-between gap-2 transition"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#00f0ff]/12 border border-[#00f0ff]/30 flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4 text-[#00f0ff]" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white truncate">
                  Апгрейд: {cheapestUpgrade.card.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  Цена:{' '}
                  <span className="text-[#7dff00] font-semibold">
                    {formatCompact(cheapestUpgrade.price)} Data
                  </span>
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#00f0ff] shrink-0" />
          </Link>
        )}

        <Link
          to="/hacks"
          className="rounded-xl bg-[#10172e]/90 hover:bg-[#152040] border border-[#ff00a0]/25 p-3 flex items-center justify-between gap-2 transition"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#ff00a0]/12 border border-[#ff00a0]/30 flex items-center justify-center shrink-0">
              <Crosshair className="w-4 h-4 text-[#ff00a0]" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white truncate">
                Вылазки и Взломы целей
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Bad (+Rep) • Good (+++Data, +Heat)
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#ff00a0] shrink-0" />
        </Link>
      </div>

      {/* Индикатор риска при высоком Heat */}
      {player.heat >= 70 && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-500/50 p-3 flex items-center gap-2.5 text-xs text-rose-200">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <strong>Внимание: Розыск {player.heat}/100!</strong> При превышении 100 сработает штраф
            (-10% Data и блок кликов на 60 сек). Выполняйте 🔴 Bad-миссии или наймите Fence!
          </div>
        </div>
      )}
    </div>
  );
};
