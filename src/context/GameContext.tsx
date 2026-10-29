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
import { CARDS_CONFIG, getCardPrice, getMaxCardLevel } from '../../shared/cards.config';
import { syncEnergy } from '../../shared/mechanics';
import { getManualTapMultiplier } from '../../shared/newYearCandy';
import type {
  ApiSyncResponse,
  GameAlert,
  LeaderboardEntry,
  LeaderboardSelf,
  LeaderboardSort,
  PlayerState,
} from '../../shared/types';
import { ApiError, gameApi } from '../lib/api';
import { getBaseTheme, type BaseThemeConfig, type BaseThemeKey } from '../../shared/themes.config';
import { getDailyTaskDefinition } from '../../shared/dailyTasks.config';
import { resolveEquippedSkins } from '../../shared/skins.config';
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
  initError: string | null;
  retryInit: () => Promise<void>;
  busyKey: string | null;
  storageMode: 'supabase' | 'memory-fallback';
  alerts: GameAlert[];
  offlineModalEarned: number | null;
  offlineModalTaps: number;
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
  resolveDailyIncident: (choiceKey: string) => Promise<void>;
  claimDailyTask: (taskKey: string) => Promise<void>;
  claimSeasonEvent: (action: 'claim_participation' | 'claim_mastery') => Promise<void>;
  buyOrEquipSkin: (skinKey: string) => Promise<void>;
  unequipSkin: (skinKey: string) => Promise<void>;
  buyOrEquipProfileFrame: (frameKey: string) => Promise<void>;
  setInventoryVisibility: (itemKey: string, visible: boolean) => Promise<void>;
  useNewYearCandy: () => Promise<void>;
  /** Выбранная бесплатная базовая тема (v3.6.1). */
  baseTheme: BaseThemeConfig;
  setBaseTheme: (key: BaseThemeKey) => Promise<void>;
  clearHeatLockdown: () => Promise<void>;
  triggerPrestige: () => Promise<void>;
  leaderboard: LeaderboardEntry[];
  /** По какой метрике построена таблица (data / xp / level). */
  leaderboardSort: LeaderboardSort;
  /** Своё место в рейтинге (null — гость или рейтинг недоступен). */
  leaderboardSelf: LeaderboardSelf | null;
  setLeaderboardSort: (sort: LeaderboardSort) => void;
  refreshLeaderboard: (sort?: LeaderboardSort) => Promise<void>;
  updateDemoName: (newName: string) => Promise<void>;
  /** Последние результаты операций в текущей сессии (локальный UX-архив, без БД). */
  missionHistory: GameAlert[];
}

function isMissionOutcomeAlert(alert: GameAlert): boolean {
  return (
    (alert.type === 'success' && alert.title.includes('взломана')) ||
    (alert.type === 'info' && alert.title.includes('частичный доступ')) ||
    (alert.type === 'penalty' && alert.title.includes('взлом сорвался'))
  );
}

/**
 * Локально двигаем только счётчики, которые напрямую зависят от тапа.
 * Сервер всё равно подтвердит их при ближайшем batch-ответе, поэтому это
 * лишь быстрый UX-слой: кнопка «Забрать» становится готовой сразу после
 * последнего нужного тапа, а не через задержку отправки batch.
 */
function incrementOptimisticTapProgress(stats: PlayerState['stats']): PlayerState['stats'] {
  const nextStats = { ...stats };

  if (stats.dailyTasks) {
    const progress = { ...stats.dailyTasks.progress };
    for (const taskKey of stats.dailyTasks.taskKeys) {
      const task = getDailyTaskDefinition(taskKey);
      if (task?.kind !== 'tap') continue;
      progress[taskKey] = Math.min(task.target, (progress[taskKey] ?? 0) + 1);
    }
    nextStats.dailyTasks = { ...stats.dailyTasks, progress };
  }

  if (stats.seasonEvent) {
    const dayKey = String(stats.seasonEvent.currentDay);
    const day = stats.seasonEvent.days[dayKey];
    if (day && !day.completed) {
      const progress = { ...day.progress };
      for (const task of day.tasks) {
        if (task.kind !== 'tap') continue;
        progress[task.key] = Math.min(task.target, (progress[task.key] ?? 0) + 1);
      }
      nextStats.seasonEvent = {
        ...stats.seasonEvent,
        days: { ...stats.seasonEvent.days, [dayKey]: { ...day, progress } },
      };
    }
  }

  return nextStats;
}


/** '#00f0ff' -> '0, 240, 255' — нужен для rgba(var(--ui-primary-rgb), 0.2). */
function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(num)) return '0, 240, 255';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

const GameContext = createContext<GameContextValue | null>(null);

// ============================================================================
// Настройки отправки кликов (v3.1).
// Задача: быстрый «палец» не должен ловить rate-limit и терять клики.
//  • CLICK_MAX_BATCH   — сколько кликов уходит в одном запросе (сервер разрешает до 60);
//  • CLICK_MIN_GAP_MS  — минимальная пауза между запросами (анти-дребезг);
//  • CLICK_FLUSH_DELAY_MS — как долго копим клики, если их набралось мало;
//  • CLICK_QUEUE_LIMIT — предохранитель, чтобы очередь не росла бесконечно.
// ============================================================================
const CLICK_MAX_BATCH = 20;
// Быстрый хвост кликов: игрок видит серверную синхронизацию почти сразу,
// но мы всё ещё оставляем паузу, чтобы не превращать живой тап в HTTP-флуд.
const CLICK_MIN_GAP_MS = 300;
const CLICK_FLUSH_DELAY_MS = 250;
const CLICK_QUEUE_LIMIT = 600;


export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tgProfile, setTgProfile] = useState<TelegramProfileInfo>(() => initTelegramMiniApp());
  const [player, setPlayer] = useState<PlayerState | null>(null);
  // React batches simultaneous touch events; reserve energy synchronously so
  // multiple fingers cannot queue more taps than the displayed available CPU.
  const tapEnergyRef = useRef(0);
  tapEnergyRef.current = player?.energy ?? 0;
  // Базовая тема — производная от player.stats.baseTheme (сервер — источник истины).
  const baseTheme = useMemo<BaseThemeConfig>(
    () => getBaseTheme(player?.stats.baseTheme),
    [player?.stats.baseTheme]
  );
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyKeyRef = useRef<string | null>(null);
  // Все изменяющие состояние действия идут через одну клиентскую очередь.
  // Иначе быстрый тап по двум разным карточкам мог отправить два POST
  // параллельно: ответы приходили в другом порядке и визуально откатывали
  // баланс назад, хотя сервер всё сохранил правильно.
  const actionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedActionKeysRef = useRef<Set<string>>(new Set());
  const initInFlightRef = useRef<Promise<void> | null>(null);
  const [storageMode, setStorageMode] = useState<'supabase' | 'memory-fallback'>('memory-fallback');
  const [alerts, setAlerts] = useState<GameAlert[]>([]);
  // Короткий локальный журнал помогает понять результат после исчезновения toast.
  // Это намеренно не PlayerState: экономика и постоянные данные остаются на сервере.
  const [missionHistory, setMissionHistory] = useState<GameAlert[]>([]);
  const [offlineModalEarned, setOfflineModalEarned] = useState<number | null>(null);
  const [offlineModalTaps, setOfflineModalTaps] = useState<number>(0);
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
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>('data');
  const [leaderboardSelf, setLeaderboardSelf] = useState<LeaderboardSelf | null>(null);

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
  /** Промис текущей отправки кликов: покупка не должна обгонять её (иначе сервер видит старый баланс). */
  const inflightClickRef = useRef<Promise<unknown> | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const lastFlushAtRef = useRef<number>(0);
  const backoffUntilRef = useRef<number>(0);
  const hiddenAtRef = useRef<number>(0);

  // Toasts are a single non-blocking queue item, not a stack. Several alerts
  // from one server action used to pile up and force the player to close each
  // one by hand. The next alert is shown only after the current one disappears.
  const pushAlerts = useCallback((incoming?: GameAlert[]) => {
    if (!incoming || incoming.length === 0) return;
    const visibleAlert =
      incoming.find((a) => a.type === 'penalty' || a.type === 'warning') ?? incoming[incoming.length - 1];
    setAlerts([visibleAlert]);
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
    setAlerts([item]);
    if (alert.type === 'warning' || alert.type === 'penalty') {
      cyberSound.playAlarm();
      triggerHapticNotification('warning');
    }
  }, []);

  // Stable reference is important: AlertStack uses it in its timer effect.
  // An inline callback here changed every second with the HUD tick and reset
  // the auto-dismiss timer indefinitely.
  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
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
              data: res.player.data + unsent * res.player.derived.clickPower * getManualTapMultiplier(res.player.newYearCandy, Date.now()),
              energy: Math.max(0, res.player.energy - unsent),
              totalClicks: res.player.totalClicks + unsent,
              // Показатели тап-поручения и сезонной цели тоже двигаются сразу,
              // пока хвост находится в очереди. Сервер всё равно повторно
              // проверяет их при фактическом claim.
              stats: {
                ...res.player.stats,
                ...(res.player.stats.dailyTasks
                  ? {
                      dailyTasks: {
                        ...res.player.stats.dailyTasks,
                        progress: Object.fromEntries(
                          Object.entries(res.player.stats.dailyTasks.progress).map(([key, value]) => {
                            const task = getDailyTaskDefinition(key);
                            return [
                              key,
                              task?.kind === 'tap'
                                ? Math.min(task.target, value + unsent)
                                : value,
                            ];
                          })
                        ),
                      },
                    }
                  : {}),
                ...(res.player.stats.seasonEvent
                  ? {
                      seasonEvent: (() => {
                        const seasonEvent = res.player.stats.seasonEvent;
                        const dayKey = String(seasonEvent.currentDay);
                        const day = seasonEvent.days[dayKey];
                        if (!day || day.completed) return seasonEvent;
                        const progress = Object.fromEntries(
                          Object.entries(day.progress).map(([key, value]) => {
                            const task = day.tasks.find((candidate) => candidate.key === key);
                            return [
                              key,
                              task?.kind === 'tap'
                                ? Math.min(task.target, value + unsent)
                                : value,
                            ];
                          })
                        );
                        return {
                          ...seasonEvent,
                          days: { ...seasonEvent.days, [dayKey]: { ...day, progress } },
                        };
                      })(),
                    }
                  : {}),
              },
            }
          : res.player;

      setPlayer(adjustedPlayer);
      if (showOfflineModal && res.offlineEarned && res.offlineEarned >= 10) {
        setOfflineModalEarned(res.offlineEarned);
        setOfflineModalTaps(res.offlineTaps ?? 0);
      }
      const missionResults = (res.alerts ?? []).filter(isMissionOutcomeAlert);
      if (missionResults.length > 0) {
        setMissionHistory((prev) => {
          const seen = new Set<string>();
          return [...missionResults].reverse().concat(prev).filter((alert) => {
            if (seen.has(alert.id)) return false;
            seen.add(alert.id);
            return true;
          }).slice(0, 5);
        });
      }
      pushAlerts(res.alerts);
    },
    [pushAlerts]
  );

  // ==========================================================================
  // Batch-отправка кликов на /api/click (v3.1)
  // --------------------------------------------------------------------------
  // Было: пачка каждые 10 кликов или 5 секунд, а при ошибке счётчик обнулялся —
  // быстрый тап упирался в rate-limit и клики терялись с тостом «Слишком много
  // запросов». Стало: пачка до 20 кликов, не чаще раза в 300 мс, а при 429/сети
  // клики возвращаются в очередь и досылаются молча, с экспоненциальным откатом.
  // ==========================================================================
  const flushClicksRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  const scheduleFlush = useCallback((delayMs: number) => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushClicksRef.current(true);
    }, Math.max(120, delayMs));
  }, []);

  const flushClicks = useCallback(
    async (force = false) => {
      if (flushingRef.current || pendingClicksRef.current <= 0) return;

      const now = Date.now();
      const earliest = Math.max(lastFlushAtRef.current + CLICK_MIN_GAP_MS, backoffUntilRef.current);
      if (!force && now < earliest) {
        scheduleFlush(earliest - now);
        return;
      }

      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const countToSend = Math.min(pendingClicksRef.current, CLICK_MAX_BATCH);
      pendingClicksRef.current -= countToSend;
      flushingRef.current = true;
      lastFlushAtRef.current = now;

      const request = gameApi.clickBatch(countToSend);
      inflightClickRef.current = request;
      try {
        const res = await request;
        // Anti-cheat может принять только часть пачки. Возвращаем остаток,
        // иначе быстрый тап теряется и серверный прогресс отстаёт от экрана.
        const applied = Math.max(0, Math.min(countToSend, res.appliedClicks ?? countToSend));
        const leftover = countToSend - applied;
        if (leftover > 0) {
          pendingClicksRef.current = Math.min(pendingClicksRef.current + leftover, CLICK_QUEUE_LIMIT);
        }
        // Do not defer unfunded taps until later regeneration.
        pendingClicksRef.current = Math.min(pendingClicksRef.current, res.player.energy);
        applyServerSync(res);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const retryAfterMs = err instanceof ApiError && err.retryAfterSec > 0 ? err.retryAfterSec * 1000 : 0;

        if (status === 400 || status === 403) {
          // Некорректный запрос — повторять бессмысленно, но и клики не выкидываем.
          pendingClicksRef.current = 0;
          // Откатываем локальный прогресс к серверному, если пачка была
          // отвергнута окончательно (например, из-за lockdown/авторизации).
          void gameApi
            .init()
            .then((res) => applyServerSync(res))
            .catch(() => {});
          pushClientAlert({
            type: 'warning',
            title: 'Синхронизация',
            message: err instanceof Error ? err.message : 'Ошибка отправки кликов',
          });
        } else {
          // 429 / сеть / 5xx: возвращаем клики в очередь и досылаем без шума.
          pendingClicksRef.current = Math.min(pendingClicksRef.current + countToSend, CLICK_QUEUE_LIMIT);
          backoffUntilRef.current = Date.now() + Math.max(600, retryAfterMs + 250);
        }
      } finally {
        flushingRef.current = false;
        inflightClickRef.current = null;
        if (pendingClicksRef.current > 0) {
          scheduleFlush(CLICK_MIN_GAP_MS);
        }
      }
    },
    [applyServerSync, pushClientAlert, scheduleFlush]
  );

  useEffect(() => {
    flushClicksRef.current = flushClicks;
  }, [flushClicks]);

  // Первичная загрузка профиля игрока. Ошибка не должна оставлять пустой экран:
  // пользователь получает понятный экран повтора, а не бесконечное ощущение
  // «игра зависла».
  const retryInit = useCallback((): Promise<void> => {
    // React StrictMode и двойной tap по кнопке retry не должны запускать два
    // параллельных /api/init для одного и того же игрока.
    if (initInFlightRef.current) return initInFlightRef.current;

    const request = (async () => {
      setLoading(true);
      setInitError(null);
      try {
        const res = await gameApi.init();
        setAlerts([]);
        applyServerSync(res, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось загрузить профиль';
        setInitError(message);
        pushClientAlert({
          type: 'warning',
          title: 'Ошибка подключения',
          message,
        });
      } finally {
        setLoading(false);
      }
    })();

    initInFlightRef.current = request;
    request.then(
      () => {
        if (initInFlightRef.current === request) initInFlightRef.current = null;
      },
      () => {
        if (initInFlightRef.current === request) initInFlightRef.current = null;
      }
    );
    return request;
  }, [applyServerSync, pushClientAlert]);

  useEffect(() => {
    void retryInit();
  }, [retryInit]);

  // Живой секундный тик на клиенте: плавный прирост Data/hour, реген Energy по shared-модели и обновление таймеров
  useEffect(() => {
    const interval = window.setInterval(() => {
      // A hidden Telegram WebView is already throttled by the browser. Avoid
      // producing React work every second in the background; the visibility
      // handler below performs a server sync after a long absence.
      if (document.visibilityState !== 'visible') return;

      const t = Date.now();
      setNowMs(t);
      setPlayer((prev) => {
        if (!prev) return prev;
        const perSec = prev.derived.dataPerHour / 3600;
        // Тот же таймер и та же скорость, что на сервере: кофемашина
        // ускоряет реальный реген, а не только периодическую сверку.
        const synced = syncEnergy(prev.energy, prev.energyUpdated, prev.derived.maxEnergy, t, prev.derived.energyRegenPerSec);
        const clearedLock =
          prev.clickBlockedUntil && new Date(prev.clickBlockedUntil).getTime() <= t
            ? null
            : prev.clickBlockedUntil;

        return {
          ...prev,
          data: Math.round((prev.data + perSec) * 10) / 10,
          energy: synced.energy,
          energyUpdated: synced.updatedAtIso,
          clickBlockedUntil: clearedLock,
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  // Периодическая сверка пассивного дохода с сервером раз в 30 сек и при скрытии вкладки
  useEffect(() => {
    const syncInterval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (pendingClicksRef.current > 0) {
        void flushClicks();
      } else {
        void gameApi.init().then((res) => applyServerSync(res, false)).catch(() => {});
      }
    }, 30000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        // Уходим с экрана — досылаем очередь немедленно, не дожидаясь паузы.
        if (pendingClicksRef.current > 0) void flushClicks(true);
        return;
      }
      // При возвращении всегда сверяем баланс; окно копилки показываем только
      // после длительного отсутствия, чтобы короткие переключения не мешали.
      if (hiddenAtRef.current > 0) {
        const showOffline = Date.now() - hiddenAtRef.current >= 60_000;
        hiddenAtRef.current = 0;
        void gameApi
          .init()
          .then((res) => applyServerSync(res, showOffline))
          .catch(() => {});
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
    if (tapEnergyRef.current <= 0) {
      triggerHapticNotification('warning');
      return false;
    }

    cyberSound.playClick();
    triggerHapticImpact('light');
    lastActivityAtRef.current = Date.now();
    idleReportedRef.current = false;

    tapEnergyRef.current -= 1;
    pendingClicksRef.current += 1;

    setPlayer((prev) => {
      if (!prev || prev.energy <= 0) return prev;
      return {
        ...prev,
        data: Math.round((prev.data + prev.derived.clickPower * getManualTapMultiplier(prev.newYearCandy, Date.now())) * 10) / 10,
        energy: Math.max(0, prev.energy - 1),
        // На полном заряде отсчёт начинается с момента расхода энергии.
        energyUpdated: prev.energy >= prev.derived.maxEnergy ? new Date().toISOString() : prev.energyUpdated,
        totalClicks: prev.totalClicks + 1,
        stats: incrementOptimisticTapProgress(prev.stats),
      };
    });

    if (pendingClicksRef.current >= CLICK_MAX_BATCH) {
      void flushClicks();
    } else {
      scheduleFlush(CLICK_FLUSH_DELAY_MS);
    }

    return true;
  }, [flushClicks, scheduleFlush, lockdownRemainingSec, player]);

  /**
   * v3.3 — быстрые покупки без гонки.
   *
   * Раньше «досылание» кликов и сама покупка были двумя отдельными запросами,
   * и если пачка кликов уже летела, покупка обгоняла её — сервер видел старый
   * баланс и отвечал «Недостаточно Data», хотя на экране деньги были.
   *
   * Теперь остаток неотправленных кликов прикладывается к самой покупке
   * (`clicks` в теле запроса), а сервер обрабатывает запросы игрока строго по
   * очереди (withPlayerLock) и применяет этот хвост ДО проверки цены.
   *
   * v3.5: убрано ожидание летящей пачки (было «до 1.5 секунды» тишины после
   * вибрации — именно из-за него покупка ощущалась как «нажал и ничего не
   * происходит»). Ждать не нужно: порядок обеспечивает серверная блокировка,
   * а хвост кликов едет в том же запросе.
   */
  const runAction = useCallback(
    (
      key: string,
      fn: (clicks: number) => Promise<ApiSyncResponse>,
      playUpgradeTone = false,
      vibrate: 'none' | 'light' = 'none'
    ): Promise<void> => {
      // Один и тот же action не должен дважды попасть в очередь (double tap,
      // повторный клик по кнопке или быстрый ререндер не создают дубль).
      if (queuedActionKeysRef.current.has(key)) return Promise.resolve();
      queuedActionKeysRef.current.add(key);

      const execute = async (): Promise<void> => {
        // Если прямо сейчас летит пачка кликов, сначала дождёмся её ответа.
        // Иначе более быстрый action мог получить старый серверный snapshot.
        if (inflightClickRef.current) {
          try {
            await inflightClickRef.current;
          } catch {
            // flushClicks уже вернул клики в очередь при сетевой ошибке.
          }
        }

        if (vibrate === 'light') triggerHapticImpact('light');
        busyKeyRef.current = key;
        setBusyKey(key);

        const clicksToSend = Math.max(0, pendingClicksRef.current);
        if (clicksToSend > 0) pendingClicksRef.current -= clicksToSend;

        try {
          const res = await fn(clicksToSend);
          if (playUpgradeTone) {
            cyberSound.playUpgrade();
            triggerHapticImpact('medium');
          }
          if (key.startsWith('card:') || key.startsWith('base:') || key.startsWith('pet:buy:')) {
            lastBuyAtRef.current = Date.now();
            freezeReportedRef.current = false;
          }
          // Сервер мог зачесть не все клики (античит/энергия) — остаток вернём в очередь.
          const applied = res.appliedClicks ?? clicksToSend;
          const leftover = clicksToSend - applied;
          if (leftover > 0) {
            pendingClicksRef.current = Math.min(pendingClicksRef.current + leftover, CLICK_QUEUE_LIMIT);
          }
          pendingClicksRef.current = Math.min(pendingClicksRef.current, res.player.energy);
          if (pendingClicksRef.current > 0) scheduleFlush(CLICK_MIN_GAP_MS);
          applyServerSync(res);
        } catch (err) {
          if (clicksToSend > 0) {
            // Сервер отвечает ошибкой уже ПОСЛЕ того, как зафиксировал хвост кликов,
            // поэтому повторять их нельзя — иначе начислим дважды. Возвращаем в очередь
            // только при сетевом сбое, когда запрос мог вообще не дойти.
            if (!(err instanceof ApiError)) {
              pendingClicksRef.current = Math.min(pendingClicksRef.current + clicksToSend, CLICK_QUEUE_LIMIT);
              scheduleFlush(900);
            }
          }
          // В любом случае подтягиваем правду с сервера: баланс не должен «врать».
          void gameApi
            .init()
            .then((res) => applyServerSync(res))
            .catch(() => {});
          pushClientAlert({
            type: 'warning',
            title: 'Операция отклонена',
            message: err instanceof Error ? err.message : 'Ошибка запроса',
          });
        } finally {
          busyKeyRef.current = null;
          setBusyKey(null);
        }
      };

      // Очередь восстанавливается даже если неожиданный runtime-ошибочный action
      // случится вне обычного API catch — один сбой не блокирует все следующие.
      const task = actionQueueRef.current.then(execute, execute);
      actionQueueRef.current = task.catch(() => undefined);
      task.then(
        () => queuedActionKeysRef.current.delete(key),
        () => queuedActionKeysRef.current.delete(key)
      );
      return task;
    },
    [applyServerSync, pushClientAlert, scheduleFlush]
  );

  /**
   * v3.5 — мгновенный отклик на покупку карточки.
   *
   * Раньше экран менялся только после ответа сервера: игрок жал кнопку, получал
   * вибрацию и... тишину. Теперь цену считаем тем же shared-кодом, что и сервер
   * (getCardPrice), и сразу показываем результат локально, а ответ сервера его
   * подтверждает или откатывает (если сервер откажет — catch в runAction
   * перезапрашивает правду через /api/init).
   *
   * Это ТОЛЬКО визуальный слой: баланс, цены и лимиты по-прежнему считает сервер,
   * поэтому накрутить данные через DevTools нельзя.
   */
  const applyOptimisticCard = useCallback((cardKey: string) => {
    setPlayer((prev) => {
      if (!prev) return prev;
      const card = CARDS_CONFIG.find((c) => c.key === cardKey);
      if (!card) return prev;
      const level = prev.cards[cardKey] ?? 0;
      if (level >= getMaxCardLevel(prev.cardTier)) return prev;
      const price = getCardPrice(
        card,
        level,
        prev.derived.totalCardLevels,
        prev.derived.cardPriceDiscountPct
      );
      // Не хватает — не рисуем фантазию, сервер всё равно откажет.
      if (prev.data < price) return prev;
      return {
        ...prev,
        data: prev.data - price,
        cards: { ...prev.cards, [cardKey]: level + 1 },
      };
    });
  }, []);

  const buyCard = useCallback(
    (cardKey: string) => {
      applyOptimisticCard(cardKey);
      return runAction(
        `card:${cardKey}`,
        (clicks) => gameApi.buyCard(cardKey, clicks),
        true,
        'light'
      );
    },
    [applyOptimisticCard, runAction]
  );

  const startMission = useCallback(
    (missionKey: string) =>
      runAction(`mission:start:${missionKey}`, (clicks) =>
        gameApi.missionAction('start', { missionKey }, clicks),
        true,
        'light'
      ),
    [runAction]
  );

  const claimMission = useCallback(
    (missionId: string) =>
      runAction(`mission:claim:${missionId}`, (clicks) =>
        gameApi.missionAction('claim', { missionId }, clicks)
      ),
    [runAction]
  );

  const skipMission = useCallback(
    (missionId: string) =>
      runAction(`mission:skip:${missionId}`, (clicks) =>
        gameApi.missionAction('skip', { missionId }, clicks),
        true,
        'light'
      ),
    [runAction]
  );

  const refreshMissions = useCallback(
    // Скан — фоновое обновление списка, не «покупка»: без лишнего звука и вибрации.
    () => runAction('mission:refresh', (clicks) => gameApi.missionAction('refresh', undefined, clicks), false, 'none'),
    [runAction]
  );

  const hireNpc = useCallback(
    (npcKey: string) => runAction(`hire:${npcKey}`, (clicks) => gameApi.hireNpc(npcKey, clicks), true, 'light'),
    [runAction]
  );

  const unlockTier = useCallback(
    () => runAction('tier', (clicks) => gameApi.unlockTier(clicks), true, 'light'),
    [runAction]
  );

  const buyBaseUpgrade = useCallback(
    (upgradeKey: string) =>
      runAction(`base:${upgradeKey}`, (clicks) => gameApi.buyBaseUpgrade(upgradeKey, clicks), true, 'light'),
    [runAction]
  );

  const petAction = useCallback(
    (action: 'buy' | 'feed', petKey: string) =>
      runAction(`pet:${action}:${petKey}`, (clicks) => gameApi.petAction(action, petKey, clicks), true, 'light'),
    [runAction]
  );

  // Телеметрия для «неочевидных» достижений: fire-and-forget, без блокировки UI
  const trackEvent = useCallback((event: string, value?: number) => {
    void gameApi
      .track(event, value)
      .then((res) => {
        if (res.alerts && res.alerts.length > 0) {
          setAlerts([res.alerts[0]]);
        }
      })
      .catch(() => {
        // молча игнорируем: телеметрия не должна мешать игре
      });
  }, []);

  const claimDailyBonus = useCallback(
    () => runAction('daily', (clicks) => gameApi.claimDaily(clicks), true, 'light'),
    [runAction]
  );

  const resolveDailyIncident = useCallback(
    (choiceKey: string) =>
      runAction(
        `daily-incident:${choiceKey}`,
        (clicks) => gameApi.resolveDailyIncident(choiceKey, clicks),
        true,
        'light'
      ),
    [runAction]
  );

  const claimDailyTask = useCallback(
    (taskKey: string) =>
      runAction(`daily-task:claim:${taskKey}`, (clicks) => gameApi.claimDailyTask(taskKey, clicks), true, 'light'),
    [runAction]
  );

  const claimSeasonEvent = useCallback(
    (action: 'claim_participation' | 'claim_mastery') =>
      runAction(`season-event:${action}`, (clicks) => gameApi.claimSeasonEvent(action, clicks), true, 'light'),
    [runAction]
  );

  const buyOrEquipSkin = useCallback(
    (skinKey: string) =>
      runAction(`skin:${skinKey}`, (clicks) => gameApi.skinAction('buy_or_equip', skinKey, clicks), true, 'light'),
    [runAction]
  );

  const unequipSkin = useCallback(
    (skinKey: string) =>
      runAction(`skin:${skinKey}`, (clicks) => gameApi.skinAction('unequip', skinKey, clicks), true, 'light'),
    [runAction]
  );

  const buyOrEquipProfileFrame = useCallback(
    (frameKey: string) =>
      runAction(
        `profile-frame:${frameKey}`,
        (clicks) => gameApi.profileFrameAction(frameKey, clicks),
        true,
        'light'
      ),
    [runAction]
  );

  const setInventoryVisibility = useCallback(
    (itemKey: string, visible: boolean) =>
      runAction(
        `inventory:${itemKey}:${visible ? 'show' : 'hide'}`,
        (clicks) => gameApi.inventoryVisibility(itemKey, visible, clicks),
        false,
        'light'
      ),
    [runAction]
  );

  const useNewYearCandy = useCallback(() => {
    // A fresh operation id ensures duplicate delivery of one request is harmless.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
    const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return runAction('inventory:new-year-candy:use', (clicks) => gameApi.useNewYearCandy(requestId, clicks), true, 'light');
  }, [runAction]);

  const setBaseTheme = useCallback(
    (key: BaseThemeKey) =>
      runAction(`theme:${key}`, (clicks) => gameApi.skinAction('set_theme', key, clicks), true, 'light'),
    [runAction]
  );

  const clearHeatLockdown = useCallback(
    () => runAction('clear_lockdown', (clicks) => gameApi.skinAction('clear_lockdown', undefined, clicks), true, 'light'),
    [runAction]
  );

  const triggerPrestige = useCallback(
    () => runAction('prestige', (clicks) => gameApi.prestige(clicks), true, 'light'),
    [runAction]
  );

  const refreshLeaderboard = useCallback(
    async (sort?: LeaderboardSort) => {
      const metric: LeaderboardSort = sort ?? leaderboardSort;
      try {
        const res = await gameApi.leaderboard(metric);
        setLeaderboard(res.entries);
        setLeaderboardSelf(res.me ?? null);
        if (res.sort !== leaderboardSort) setLeaderboardSort(res.sort);
      } catch {
        // ignore background error
      }
    },
    [leaderboardSort]
  );

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

  const dismissOfflineModal = useCallback(() => {
    setOfflineModalEarned(null);
    setOfflineModalTaps(0);
  }, []);

  // v3.6.1: палитра берётся из БАЗОВОЙ ТЕМЫ, а скин стола накладывается в сцене.
  // Раньше переменные прибивались к скину: надел аватар — перекрасился весь UI.
  useEffect(() => {
    const theme = getBaseTheme(player?.stats.baseTheme);
    const root = document.documentElement.style;
    root.setProperty('--cyber-cyan', theme.palette.cyan);
    root.setProperty('--cyber-magenta', theme.palette.magenta);
    root.setProperty('--cyber-green', theme.palette.green);
    root.setProperty('--cyber-purple', theme.palette.purple);
    root.setProperty('--cyber-bg', theme.palette.bg);
    root.setProperty('--cyber-panel', theme.palette.panel);
    root.setProperty('--cyber-panel-deep', theme.palette.panelDeep);
    root.setProperty('--theme-vignette', theme.sceneVignette);
    document.body.dataset.theme = theme.key;
    if (theme.colorScheme === 'light') document.body.dataset.colorScheme = 'light';
    else delete document.body.dataset.colorScheme;
  }, [player?.stats.baseTheme]);

  // v3.6.5: скин интерфейса наконец красит интерфейс.
  // До этого палитра бралась только из базовой темы, и Amber Panels с друзьями
  // не делали НИЧЕГО: их фильтр применялся к арту стола в DeskScene.
  // Теперь UI-скин выставляет свои токены хрома, а сцена остаётся нетронутой.
  useEffect(() => {
    const theme = getBaseTheme(player?.stats.baseTheme);
    const equipped = resolveEquippedSkins({
      equippedSkin: player?.equippedSkin,
      stats: player?.stats,
    });
    // Тема может временно сохранять свою палитру; надетый скин и его бонус остаются.
    const uiSkin = theme.colorScheme === 'light' || theme.overrideUiSkinPalette ? undefined : equipped.ui;
    const root = document.documentElement.style;
    const accent = uiSkin?.uiTokens?.accent ?? theme.palette.cyan;
    const accent2 = uiSkin?.uiTokens?.accent2 ?? theme.palette.magenta;
    const panel = uiSkin?.uiTokens?.panel ?? theme.palette.panel;
    const panelDeep = uiSkin?.uiTokens?.panel ?? theme.palette.panelDeep;
    root.setProperty('--ui-primary', accent);
    root.setProperty('--ui-primary-rgb', hexToRgbTriplet(accent));
    root.setProperty('--ui-secondary', accent2);
    root.setProperty('--ui-secondary-rgb', hexToRgbTriplet(accent2));
    root.setProperty('--ui-panel', panel);
    root.setProperty('--ui-panel-rgb', hexToRgbTriplet(panel));
    root.setProperty('--ui-panel-deep', panelDeep);
    root.setProperty('--ui-panel-deep-rgb', hexToRgbTriplet(panelDeep));
    root.setProperty('--ui-text', uiSkin?.uiTokens?.text ?? theme.palette.text);
    root.setProperty('--ui-text-muted', theme.palette.textMuted);
    if (uiSkin) {
      document.body.dataset.uiSkin = uiSkin.key;
    } else {
      delete document.body.dataset.uiSkin;
    }
  }, [player?.stats.baseTheme, player?.stats.equippedUi, player?.equippedSkin]);

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

  // ==========================================================================
  // v3.5 — ВАЖНО ПРО ЛАГИ ТАПА
  // --------------------------------------------------------------------------
  // Раньше обе телеметрии висели на `player`, а он меняется на КАЖДЫЙ тап:
  // десять тапов в секунду = двадцать лишних POST /api/track в секунду. Мобильная
  // сеть забивалась, пачки кликов и покупки вставали в очередь, а игрок видел
  // «тапнул — тормозит». Теперь вкладка шлётся только при реальной смене
  // маршрута, а час — только при смене часа (плюс один раз при входе).
  // ==========================================================================
  const playerReadyRef = useRef<boolean>(false);
  if (player && !playerReadyRef.current) playerReadyRef.current = true;
  const lastTrackedTabRef = useRef<string>('');
  const lastTrackedHourRef = useRef<number>(-1);

  // Заход на вкладку
  useEffect(() => {
    if (!playerReadyRef.current) return;
    if (lastTrackedTabRef.current === location.pathname) return;
    lastTrackedTabRef.current = location.pathname;
    trackEvent(`tab:${location.pathname}`);
  }, [location.pathname, trackEvent]);

  // Локальный час (для «Ночной Смены» и «Ранней Пташки»)
  useEffect(() => {
    if (!playerReadyRef.current) return;
    const hour = new Date().getHours();
    if (lastTrackedHourRef.current === hour) return;
    lastTrackedHourRef.current = hour;
    trackEvent('local_hour', hour);
  }, [trackEvent]);

  // Каждую минуту: сессия, «кофе-брейк» и «дзен-режим»
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      // Смена часа прямо в открытой игре — чтобы «Ночная смена» ловилась,
      // даже если игрок не перезапускал мини-апп.
      const hour = new Date(now).getHours();
      if (lastTrackedHourRef.current !== -1 && lastTrackedHourRef.current !== hour) {
        lastTrackedHourRef.current = hour;
        trackEvent('local_hour', hour);
      }
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

  const contextValue = useMemo<GameContextValue>(
    () => ({
      player,
      tgProfile,
      loading,
      initError,
      retryInit,
      busyKey,
      storageMode,
      alerts,
      offlineModalEarned,
      offlineModalTaps,
      dismissOfflineModal,
      dismissAlert,
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
      resolveDailyIncident,
      claimDailyTask,
      claimSeasonEvent,
      buyOrEquipSkin,
      unequipSkin,
      buyOrEquipProfileFrame,
      setInventoryVisibility,
      useNewYearCandy,
      baseTheme,
      setBaseTheme,
      clearHeatLockdown,
      triggerPrestige,
      leaderboard,
      leaderboardSort,
      leaderboardSelf,
      setLeaderboardSort,
      refreshLeaderboard,
      updateDemoName,
      missionHistory,
    }),
    [
      player,
      tgProfile,
      loading,
      initError,
      retryInit,
      busyKey,
      storageMode,
      alerts,
      offlineModalEarned,
      offlineModalTaps,
      dismissOfflineModal,
      dismissAlert,
      pushClientAlert,
      lockdownRemainingSec,
      nowMs,
      soundMuted,
      toggleSound,
      dailyModalOpen,
      skinModalOpen,
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
      resolveDailyIncident,
      claimDailyTask,
      claimSeasonEvent,
      buyOrEquipSkin,
      unequipSkin,
      buyOrEquipProfileFrame,
      setInventoryVisibility,
      useNewYearCandy,
      baseTheme,
      setBaseTheme,
      clearHeatLockdown,
      triggerPrestige,
      leaderboard,
      leaderboardSort,
      leaderboardSelf,
      setLeaderboardSort,
      refreshLeaderboard,
      updateDemoName,
      missionHistory,
    ]
  );

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
