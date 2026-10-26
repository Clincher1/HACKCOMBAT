import { Cpu, Crosshair, Monitor, UserCheck, Users } from 'lucide-react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { CARDS_CONFIG, getCardPrice, MAX_CARD_LEVEL } from '../../shared/cards.config';
import { useGame } from '../context/GameContext';
import { triggerHapticSelection } from '../lib/telegram';

const TABS = [
  { to: '/', label: 'Стол', icon: Monitor },
  { to: '/upgrades', label: 'Улучшения', icon: Cpu },
  { to: '/hacks', label: 'Взломы', icon: Crosshair },
  { to: '/team', label: 'Команда', icon: Users },
  { to: '/profile', label: 'Профиль', icon: UserCheck },
];

export const BottomNav: React.FC = () => {
  const { player, nowMs } = useGame();

  const affordableCardsCount = React.useMemo(() => {
    if (!player) return 0;
    const maxLevel = Math.min(MAX_CARD_LEVEL, player.derived.maxCardLevel);
    const totalLevels = player.derived.totalCardLevels;
    return CARDS_CONFIG.filter((c) => {
      const lvl = player.cards[c.key] ?? 0;
      return (
        lvl < maxLevel &&
        player.data >= getCardPrice(c, lvl, totalLevels, player.derived.cardPriceDiscountPct)
      );
    }).length;
  }, [player]);

  const readyMissionsCount = React.useMemo(() => {
    if (!player) return 0;
    return player.activeMissions.filter((m) => new Date(m.finishAt).getTime() <= nowMs).length;
  }, [player, nowMs]);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 backdrop-blur-xl bg-[rgba(var(--ui-panel-deep-rgb),0.95)] border-t border-[rgba(var(--ui-primary-rgb),0.20)] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-xl mx-auto grid grid-cols-5 px-1.5 py-1.5 gap-1">
        {TABS.map(({ to, label, icon: Icon }) => {
          const badge =
            to === '/upgrades' && affordableCardsCount > 0
              ? affordableCardsCount
              : to === '/hacks' && readyMissionsCount > 0
                ? readyMissionsCount
                : 0;

          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => triggerHapticSelection()}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[11px] font-semibold transition ${
                  isActive
                    ? 'bg-[rgba(var(--ui-primary-rgb),0.14)] text-[var(--ui-primary)] border border-[rgba(var(--ui-primary-rgb),0.40)] shadow-[0_0_15px_rgba(var(--ui-primary-rgb),0.16)]'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="truncate max-w-full">{label}</span>
              {badge > 0 && (
                <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--ui-secondary)] text-white text-[9px] font-extrabold flex items-center justify-center leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
