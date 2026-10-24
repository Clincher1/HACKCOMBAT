import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { ENERGY_REGEN_SECONDS } from '../../shared/mechanics';
import { SKINS_CONFIG } from '../../shared/skins.config';
import type {
  ApiSyncResponse,
  GameAlert,
  LeaderboardEntry,
  PlayerState,
} from '../../shared/types';
import { gameApi } from '../lib/api';
import { cyberSound } from '../lib/sound';
import {
  initTelegramMiniApp,
  renameDemoIdentity,
  triggerHapticImpact,
  triggerHapticNotification,
  type TelegramProfileInfo,
} from '../lib/telegram';

interface GameContextValue {
  player: PlayerState | null;
  tgProfile: TelegramProfileInfo;
  loading: boolean;
  busyKey: string | null;
  storageMode: 'supabase' | 'memory-fallback';
  alerts: GameAlert[];
  offlineModalEarned: number | null;
  dismissOfflineModal: () => void;
  dismissAlert: (id: string) => void;
  pushClientAlert: (alert: Omit<GameAlert, 'id'>) => void;
  lockdownRemainingSec: number;
  nowMs: number;
  soundMuted: boolean;
  toggleSound: () => void;
  dailyModalOpen: boolean;
  setDailyModalOpen: (v: boolean) => void;
  skinModalOpen: boolean;
  setSkinModalOpen: (v: boolean) => void;
  tutorialModalOpen: boolean;
  tutorialUnseen: boolean;
  openTutorial: () => void;
  closeTutorial: () => void;
  tapHack: () => boolean;
  buyCard: (cardKey: string) => Promise<void>;
  startMission: (missionKey: string) => Promise<void>;
  claimMission: (missionId: string) => Promise<void>;
  skipMission: (missionId: string) => Promise<void>;
  refreshMissions: () => Promise<void>;
  hireNpc: (npcKey: string) => Promise<void>;
  unlockTier: () => Promise<void>;
  buyBaseUpgrade: (upgradeKey: string) => Promise<void>;
  petAction: (action: 'buy' | 'feed', petKey: string) => Promise<void>;
  trackEvent: (event: string, value?: number) => void;
  claimDailyBonus: () => Promise<void>;
  buyOrEquipSkin: (skinKey: string) => Promise<void>;
  clearHeatLockdown: () => Promise<void>;
  triggerPrestige: () => Promise<void>;
  leaderboard: LeaderboardEntry[];
  refreshLeaderboard: () => Promise<void>;
  updateDemoName: (newName: string) => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tgProfile, setTgProfile] = useState<TelegramProfileInfo>(() => initTelegramMiniApp());
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'supabase' | 'memory-fallback'>('memory-fallback');
  const [alerts, setAlerts] = useState<GameAlert[]>([]);
  const [offlineModalEarned, setOfflineModalEarned] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [soundMuted, setSoundMuted] = useState(() => cyberSound.isMuted());
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [skinModalOpen, setSkinModalOpen] = useState(false);
  const [tutorialModalOpen, setTutorialModalOpen] = useState(false);
  const [tutorialUnseen, setTutorialUnseen] = useState(() => {
    try {
      return localStorage.getItem('hk_tutorial_seen_v1') !== '1';
    } catch {
      return true;
    }
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const openTutorial = useCallback(() => {
    setTutorialModalOpen(true);
    setTutorialUnseen(false);
    try {
      localStorage.setItem('hk_tutorial_seen_v1', '1');
    } catch {
      // ignore storage quota
    }
  }, []);

  const closeTutorial = useCallback(() => {
    setTutorialModalOpen(false);
  }, []);

  const pendingClicksRef = useRef<number>(0);
  const flushingRef = useRef<boolean>(false);
  const flushTimerRef = useRef<number | null>(null);

  const pushAlerts = useCallback((incoming?: GameAlert[]) => {
    if (!incoming || incoming.length === 0) return;
    setAlerts((prev) => [...incoming, ...prev].slice(0, 5));
    const hasPenalty = incoming.some((a) => a.type === 'penalty');
    if (hasPenalty) {
      cyberSound.playAlarm();
      triggerHapticNotification('error');
    } else {
      cyberSound.playMissionSuccess();
      triggerHapticNotification('success');
    }
  }, []);

  const pushClientAlert = useCallback((alert: Omit<GameAlert, 'id'>) => {
    const item: GameAlert = { ...alert, id: `${Date.now()}-${Math.random()}` };
    setAlerts((prev) => [item, ...prev].slice(0, 5));
    if (alert.type === 'warning' || alert.type === 'penalty') {
      cyberSound.playAlarm();
      triggerHapticNotification('warning');
    }
  }, []);

  const applyServerSync = useCallback(
    (res: ApiSyncResponse, showOfflineModal = false) => {
      setStorageMode(res.storageMode);
      // Сохраняем локально ещё не отправленные клики поверх серверного снэпшота, чтобы счётчик не прыгал назад
      const unsent = pendingClicksRef.current;
      const adjustedPlayer: PlayerState =
        unsent > 0
          ? {
              ...res.player,
              data: res.player.data + unsent * res.player.derived.clickPower,
              energy: Math.max(0, res.player.energy - unsent),
              totalClicks: res.player.totalClicks + unsent,
            }
          : res.player;

      setPlayer(adjustedPlayer);
      if (showOfflineModal && res.offlineEarned && res.offlineEarned >= 10) {
        setOfflineModalEarned(res.offlineEarned);
      }
      pushAlerts(res.alerts);
    },
    [pushAlerts]
  );

  // Batch-отправка кликов на /api/click (каждые 10 кликов ИЛИ каждые 5 секунд — Шаг 4 и п. 5.1 ТЗ)
  const flushClicks = useCallback(async () => {
    if (flushingRef.current || pendingClicksRef.current <= 0) return;
    const countToSend = pendingClicksRef.current;
    pendingClicksRef.current = 0;
    flushingRef.current = true;
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    try {
      const res = await gameApi.clickBatch(countToSend);
      applyServerSync(res);
    } catch (err) {
      pushClientAlert({
        type: 'warning',
        title: 'Синхронизация',
        message: err instanceof Error ? err.message : 'Ошибка отправки кликов',
      });
    } finally {
      flushingRef.current = false;
      if (pendingClicksRef.current >= 10) {
        void flushClicks();
      }
    }
  }, [applyServerSync, pushClientAlert]);

  // Первичная загрузка профиля игрока
  useEffect(() => {
    let mounted = true;
    gameApi
      .init()
      .then((res) => {
        if (!mounted) return;
        applyServerSync(res, true);
      })
      .catch((err) => {
        if (!mounted) return;
        pushClientAlert({
          type: 'warning',
          title: 'Ошибка инициализации',
          message: err instanceof Error ? err.message : 'Не удалось загрузить профиль',
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [applyServerSync, pushClientAlert]);

  // Живой секундный тик на клиенте: плавный прирост Data/hour, реген 1 Energy / 3 сек и обновление таймеров
  const energyTickCounter = useRef(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      energyTickCounter.current += 1;

      setPlayer((prev) => {
        if (!prev) return prev;
        const perSec = prev.derived.dataPerHour / 3600;
        const regenGain = energyTickCounter.current % ENERGY_REGEN_SECONDS === 0 ? 1 : 0;
        const nextEnergy = Math.min(prev.derived.maxEnergy, prev.energy + regenGain);
        const clearedLock =
          prev.clickBlockedUntil && new Date(prev.clickBlockedUntil).getTime() <= t
            ? null
            : prev.clickBlockedUntil;

        return {
          ...prev,
          data: Math.round((prev.data + perSec) * 10) / 10,
          energy: nextEnergy,
          clickBlockedUntil: clearedLock,
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  // Периодическая сверка пассивного дохода с сервером раз в 30 сек и при скрытии вкладки
  useEffect(() => {
    const syncInterval = window.setInterval(() => {
      if (pendingClicksRef.current > 0) {
        void flushClicks();
      } else {
        void gameApi.init().then((res) => applyServerSync(res, false)).catch(() => {});
      }
    }, 30000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingClicksRef.current > 0) {
        void flushClicks();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [applyServerSync, flushClicks]);

  const lockdownRemainingSec = useMemo(() => {
    if (!player?.clickBlockedUntil) return 0;
    return Math.max(0, Math.ceil((new Date(player.clickBlockedUntil).getTime() - nowMs) / 1000));
  }, [player?.clickBlockedUntil, nowMs]);

  const tapHack = useCallback((): boolean => {
    if (!player) return false;
    if (lockdownRemainingSec > 0) {
      cyberSound.playAlarm();
      triggerHapticNotification('error');
      return false;
    }
    if (player.energy <= 0) {
      triggerHapticNotification('warning');
      return false;
    }

    cyberSound.playClick();
    triggerHapticImpact('light');
    lastActivityAtRef.current = Date.now();
    idleReportedRef.current = false;

    pendingClicksRef.current += 1;

    setPlayer((prev) => {
      if (!prev || prev.energy <= 0) return prev;
      return {
        ...prev,
        data: Math.round((prev.data + prev.derived.clickPower) * 10) / 10,
        energy: Math.max(0, prev.energy - 1),
        totalClicks: prev.totalClicks + 1,
      };
    });

    if (pendingClicksRef.current >= 10) {
      void flushClicks();
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void flushClicks();
      }, 5000);
    }

    return true;
  }, [flushClicks, lockdownRemainingSec, player]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<ApiSyncResponse>, playUpgradeTone = false) => {
      setBusyKey(key);
      try {
        if (pendingClicksRef.current > 0) {
          await flushClicks();
        }
        const res = await fn();
        if (playUpgradeTone) {
          cyberSound.playUpgrade();
          triggerHapticImpact('medium');
        }
        if (key.startsWith('card:') || key.startsWith('base:') || key.startsWith('pet:buy:')) {
          lastBuyAtRef.current = Date.now();
          freezeReportedRef.current = false;
        }
        applyServerSync(res);
      } catch (err) {
        pushClientAlert({
          type: 'warning',
          title: 'Операция отклонена',
          message: err instanceof Error ? err.message : 'Ошибка запроса',
        });
      } finally {
        setBusyKey(null);
      }
    },
    [applyServerSync, flushClicks, pushClientAlert]
  );

  const buyCard = useCallback(
    (cardKey: string) => runAction(`card:${cardKey}`, () => gameApi.buyCard(cardKey), true),
    [runAction]
  );

  const startMission = useCallback(
    (missionKey: string) =>
      runAction(`mission:start:${missionKey}`, () =>
        gameApi.missionAction('start', { missionKey }),
        true
      ),
    [runAction]
  );

  const claimMission = useCallback(
    (missionId: string) =>
      runAction(`mission:claim:${missionId}`, () =>
        gameApi.missionAction('claim', { missionId })
      ),
    [runAction]
  );

  const skipMission = useCallback(
    (missionId: string) =>
      runAction(`mission:skip:${missionId}`, () =>
        gameApi.missionAction('skip', { missionId }),
        true
      ),
    [runAction]
  );

  const refreshMissions = useCallback(
    () => runAction('mission:refresh', () => gameApi.missionAction('refresh'), true),
    [runAction]
  );

  const hireNpc = useCallback(
    (npcKey: string) => runAction(`hire:${npcKey}`, () => gameApi.hireNpc(npcKey), true),
    [runAction]
  );

  const unlockTier = useCallback(
    () => runAction('tier', () => gameApi.unlockTier(), true),
    [runAction]
  );

  const buyBaseUpgrade = useCallback(
    (upgradeKey: string) =>
      runAction(`base:${upgradeKey}`, () => gameApi.buyBaseUpgrade(upgradeKey), true),
    [runAction]
  );

  const petAction = useCallback(
    (action: 'buy' | 'feed', petKey: string) =>
      runAction(`pet:${action}:${petKey}`, () => gameApi.petAction(action, petKey), true),
    [runAction]
  );

  // Телеметрия для «неочевидных» достижений: fire-and-forget, без блокировки UI
  const trackEvent = useCallback((event: string, value?: number) => {
    void gameApi
      .track(event, value)
      .then((res) => {
        if (res.alerts && res.alerts.length > 0) {
          setAlerts((prev) => [...res.alerts!, ...prev].slice(0, 5));
        }
      })
      .catch(() => {
        // молча игнорируем: телеметрия не должна мешать игре
      });
  }, []);

  const claimDailyBonus = useCallback(
    () => runAction('daily', () => gameApi.claimDaily(), true),
    [runAction]
  );

  const buyOrEquipSkin = useCallback(
    (skinKey: string) =>
      runAction(`skin:${skinKey}`, () => gameApi.skinAction('buy_or_equip', skinKey), true),
    [runAction]
  );

  const clearHeatLockdown = useCallback(
    () => runAction('clear_lockdown', () => gameApi.skinAction('clear_lockdown'), true),
    [runAction]
  );

  const triggerPrestige = useCallback(
    () => runAction('prestige', () => gameApi.prestige(), true),
    [runAction]
  );

  const refreshLeaderboard = useCallback(async () => {
    try {
      const res = await gameApi.leaderboard();
      setLeaderboard(res.entries);
    } catch {
      // ignore background error
    }
  }, []);

  const updateDemoName = useCallback(
    async (newName: string) => {
      renameDemoIdentity(newName);
      setTgProfile(initTelegramMiniApp());
      const res = await gameApi.init();
      applyServerSync(res);
    },
    [applyServerSync]
  );

  const toggleSound = useCallback(() => {
    const muted = cyberSound.toggleMute();
    setSoundMuted(muted);
  }, []);

  // Обновляем CSS-переменные активного скина стола
  useEffect(() => {
    const activeSkin =
      SKINS_CONFIG.find((s) => s.key === player?.equippedSkin) ?? SKINS_CONFIG[0];
    document.documentElement.style.setProperty('--cyber-cyan', activeSkin.primaryHex);
    document.documentElement.style.setProperty('--cyber-magenta', activeSkin.secondaryHex);
    document.documentElement.style.setProperty('--cyber-green', activeSkin.accentHex);
  }, [player?.equippedSkin]);

  // ==========================================================================
  // АВТО-ТЕЛЕМЕТРИЯ ДЛЯ «НЕОЧЕВИДНЫХ» ДОСТИЖЕНИЙ
  // Сообщаем серверу только безопасные факты (вкладка, глава Академии, время суток).
  // ==========================================================================
  const location = useLocation();
  const lastActivityAtRef = useRef<number>(Date.now());
  const lastBuyAtRef = useRef<number>(Date.now());
  const idleReportedRef = useRef<boolean>(false);
  const freezeReportedRef = useRef<boolean>(false);
  const sessionStartRef = useRef<number>(Date.now());

  // Заход на вкладку
  useEffect(() => {
    if (!player) return;
    trackEvent(`tab:${location.pathname}`);
  }, [location.pathname, player, trackEvent]);

  // Локальный час (для «Ночной Смены» и «Ранней Пташки»)
  useEffect(() => {
    if (!player) return;
    trackEvent('local_hour', new Date().getHours());
  }, [player, trackEvent]);

  // Каждую минуту: сессия, «кофе-брейк» и «дзен-режим»
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const sessionMinutes = Math.floor((now - sessionStartRef.current) / 60_000);
      if (sessionMinutes > 0 && sessionMinutes % 5 === 0) {
        trackEvent('session', sessionMinutes);
      }
      if (!idleReportedRef.current && now - lastActivityAtRef.current >= 15 * 60_000) {
        idleReportedRef.current = true;
        trackEvent('idle_15');
      }
      if (
        !freezeReportedRef.current &&
        (player?.derived.level ?? 0) >= 10 &&
        now - lastBuyAtRef.current >= 30 * 60_000
      ) {
        freezeReportedRef.current = true;
        trackEvent('shop_freeze_30');
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [player?.derived.level, trackEvent]);

  return (
    <GameContext.Provider
      value={{
        player,
        tgProfile,
        loading,
        busyKey,
        storageMode,
        alerts,
        offlineModalEarned,
        dismissOfflineModal: () => setOfflineModalEarned(null),
        dismissAlert: (id) => setAlerts((prev) => prev.filter((a) => a.id !== id)),
        pushClientAlert,
        lockdownRemainingSec,
        nowMs,
        soundMuted,
        toggleSound,
        dailyModalOpen,
        setDailyModalOpen,
        skinModalOpen,
        setSkinModalOpen,
        tutorialModalOpen,
        tutorialUnseen,
        openTutorial,
        closeTutorial,
        tapHack,
        buyCard,
        startMission,
        claimMission,
        skipMission,
        refreshMissions,
        hireNpc,
        unlockTier,
        buyBaseUpgrade,
        petAction,
        trackEvent,
        claimDailyBonus,
        buyOrEquipSkin,
        clearHeatLockdown,
        triggerPrestige,
        leaderboard,
        refreshLeaderboard,
        updateDemoName,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
