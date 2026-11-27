import { Cpu, Crosshair, Lock, Monitor, UserCheck, Users } from 'lucide-react';
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ONBOARDING_UNLOCK_LEVEL } from '../../shared/onboarding.config';
import { CARDS_CONFIG, getCardPrice, MAX_CARD_LEVEL } from '../../shared/cards.config';
import { getMissionEntryCost, getMissionRewardScale } from '../../shared/hack.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { useGame } from '../context/GameContext';
import { triggerHapticSelection } from '../lib/telegram';

/**
 * v6.9: пять вкладок вместо шести.
 *
 * «Инвентарь» был второй дверью в тот же /profile (?tab=inventory): на 320 px
 * шесть иконок сжимались до ~48 px с подписями, которые уже не читались, а
 * игрок не понимал, чем «Профиль» отличается от «Инвентаря». Инвентарь живёт
 * внутри профиля отдельной вкладкой — там же, где коллекция и ачивки.
 */
const TABS = [
  { to: '/', label: 'Стол', icon: Monitor },
  { to: '/upgrades', label: 'Улучшения', icon: Cpu },
  { to: '/hacks', label: 'Взломы', icon: Crosshair },
  { to: '/team', label: 'Команда', icon: Users },
  { to: '/profile', label: 'Профиль', icon: UserCheck },
];

const LOCK_HINT_MS = 2400;

export const BottomNav: React.FC = () => {
  const { player, nowMs, newPlayerMode } = useGame();
  const location = useLocation();
  const [lockHint, setLockHint] = React.useState<string | null>(null);
  const lockTimerRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
    },
    []
  );

  const showLockHint = (label: string): void => {
    setLockHint(label);
    if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = window.setTimeout(() => setLockHint(null), LOCK_HINT_MS);
  };

  const affordableCardsCount = React.useMemo(() => {
    if (!player) return 0;
    const maxLevel = Math.min(MAX_CARD_LEVEL, player.derived.maxCardLevel);
    const totalLevels = player.derived.totalCardLevels;
    return CARDS_CONFIG.filter((c) => {
      const lvl = player.cards[c.key] ?? 0;
      return (
        lvl < maxLevel &&
        player.data >=
          getCardPrice(c, lvl, totalLevels, player.derived.cardPriceDiscountPct, player.derived.level)
      );
    }).length;
  }, [player]);

  const actionableMissionsCount = React.useMemo(() => {
    if (!player) return 0;

    const readyToClaim = player.activeMissions.filter(
      (mission) => new Date(mission.finishAt).getTime() <= nowMs
    ).length;
    const hasFreeSlot = player.activeMissions.length < player.derived.missionSlots;
    if (!hasFreeSlot) return readyToClaim;

    const refreshedAt = new Date(
      player.stats.lastMissionRefreshAt ?? player.missionsRefreshedAt
    ).getTime();
    const scanFresh =
      !Number.isFinite(refreshedAt) || nowMs - refreshedAt < 15 * 60 * 1000;
    if (!scanFresh) return readyToClaim;

    const runningKeys = new Set(player.activeMissions.map((mission) => mission.missionKey));
    const rewardScale = getMissionRewardScale(player.derived.level);
    let startable = 0;

    for (const missionKey of player.availableMissionKeys) {
      const mission = MISSIONS_CONFIG.find((candidate) => candidate.key === missionKey);
      if (!mission || runningKeys.has(mission.key)) continue;
      if ((mission.minLevel ?? 1) > player.derived.level) continue;
      if (mission.targetType === 'grey' && !player.derived.unlockedGreyMissions) continue;

      const whiteHatMultiplier =
        player.derived.alignment === 'white_hat' && mission.targetType === 'bad' ? 2 : 1;
      const estimatedReward = Math.round(
        mission.baseDataReward *
          rewardScale *
          whiteHatMultiplier *
          player.derived.prestigeMultiplier *
          (1 + player.derived.missionRewardBonusPct)
      );
      const entryCost = getMissionEntryCost(mission, estimatedReward);
      if (player.data >= entryCost.data && player.energy >= entryCost.energy) {
        startable += 1;
      }
    }

    // The badge covers both actions that need attention: claiming a completed
    // contract and starting a currently available one.
    return readyToClaim + startable;
  }, [player, nowMs]);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 backdrop-blur-xl bg-[rgba(var(--ui-panel-deep-rgb),0.95)] border-t border-[rgba(var(--ui-primary-rgb),0.20)] pb-[env(safe-area-inset-bottom)]">
      {lockHint !== null && (
        <div
          role="status"
          className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel-deep)] px-2.5 py-1 text-[11px] font-semibold text-slate-200 shadow-lg"
        >
          {lockHint} · откроется на {ONBOARDING_UNLOCK_LEVEL} уровне
        </div>
      )}
      <div className="max-w-xl mx-auto grid grid-cols-5 px-1 py-1.5 gap-1">
        {TABS.map(({ to, label, icon: Icon }) => {
          // v5.4: в первом сеансе открыт только стол, остальные вкладки залочены.
          const isLocked = newPlayerMode && to !== '/';
          // Профиль активен и на ?tab=inventory — это та же страница.
          const tabActive = to === '/profile' ? location.pathname === '/profile' : location.pathname === to;
          const badge =
            to === '/upgrades' && affordableCardsCount > 0
              ? affordableCardsCount
              : to === '/hacks' && actionableMissionsCount > 0
                ? actionableMissionsCount
                : 0;

          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-disabled={isLocked}
              title={isLocked ? `Откроется на ${ONBOARDING_UNLOCK_LEVEL} уровне` : label}
              onClick={(event) => {
                if (isLocked) {
                  // Навигация не происходит: игрок остаётся на столе и видит подсказку.
                  event.preventDefault();
                  showLockHint(label);
                  try {
                    triggerHapticSelection();
                  } catch {
                    // вибро — необязательный бонус
                  }
                  return;
                }
                triggerHapticSelection();
              }}
              className={() =>
                `relative flex min-h-[44px] flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[11px] font-semibold transition ${
                  isLocked
                    ? 'text-slate-600 border border-transparent cursor-not-allowed opacity-70'
                    : tabActive
                      ? 'bg-[rgba(var(--ui-primary-rgb),0.14)] text-[var(--ui-primary)] border border-[rgba(var(--ui-primary-rgb),0.40)] shadow-[0_0_15px_rgba(var(--ui-primary-rgb),0.16)]'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`
              }
            >
              {isLocked ? <Lock className="w-5 h-5 mb-0.5" /> : <Icon className="w-5 h-5 mb-0.5" />}
              <span className="truncate max-w-full">{label}</span>
              {!isLocked && badge > 0 && (
                <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--ui-secondary)] text-white text-[11px] font-extrabold flex items-center justify-center leading-none">
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
