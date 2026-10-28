import {
  expandViewport,
  hapticFeedbackImpactOccurred,
  hapticFeedbackNotificationOccurred,
  hapticFeedbackSelectionChanged,
  init,
  initDataUser,
  isHapticFeedbackSupported,
  miniAppReady,
  mountMiniAppSync,
  mountViewport,
  restoreInitData,
  retrieveLaunchParams,
  retrieveRawInitData,
  setMiniAppBackgroundColor,
  setMiniAppHeaderColor,
} from '@telegram-apps/sdk-react';

export interface TelegramProfileInfo {
  tgId: number;
  username: string;
  photoUrl?: string;
  rawInitData: string;
  /**
   * startapp из внешних launch-параметров Telegram.
   * В некоторых клиентах Telegram он приходит только как
   * tgWebAppStartParam, а не дублируется внутри tgWebAppData.
   */
  startParam?: string;
  isInsideTelegram: boolean;
}

const TELEGRAM_START_PARAM_RE = /^[a-z0-9_:-]{1,64}$/i;

function normalizeStartParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  return TELEGRAM_START_PARAM_RE.test(candidate) ? candidate : undefined;
}

/**
 * Telegram передаёт startapp в двух местах в зависимости от версии клиента:
 * внутри подписанного initData и отдельным launch-параметром
 * tgWebAppStartParam. Сначала читаем официальный launch payload, затем URL как
 * совместимый fallback для старых WebView. Сам пользователь всё равно
 * подтверждается сервером по HMAC initData; этот параметр лишь не даёт
 * потерять код, когда Telegram не продублировал его в tgWebAppData.
 */
function readTelegramLaunchStartParam(): string | undefined {
  try {
    const launch = retrieveLaunchParams(true) as { tgWebAppStartParam?: unknown };
    const fromLaunch = normalizeStartParam(launch.tgWebAppStartParam);
    if (fromLaunch) return fromLaunch;
  } catch {
    // Вне Telegram launch-параметров нет — проверяем обычный URL ниже.
  }

  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      normalizeStartParam(params.get('tgWebAppStartParam')) ||
      normalizeStartParam(params.get('start_param')) ||
      normalizeStartParam(params.get('startapp'))
    );
  } catch {
    return undefined;
  }
}

let cachedProfile: TelegramProfileInfo | null = null;

function getOrCreateDemoIdentity(): { id: number; name: string } {
  const storageKeyId = 'hk_demo_tg_id';
  const storageKeyName = 'hk_demo_username';
  let id = Number(localStorage.getItem(storageKeyId) || '0');
  if (!id) {
    id = 700000 + Math.floor(Math.random() * 299999);
    localStorage.setItem(storageKeyId, String(id));
  }
  let name = localStorage.getItem(storageKeyName) || '';
  if (!name) {
    name = `CyberRunner_${String(id).slice(-3)}`;
    localStorage.setItem(storageKeyName, name);
  }
  return { id, name };
}

export function renameDemoIdentity(newName: string): void {
  const clean = newName.trim().slice(0, 24);
  if (!clean) return;
  localStorage.setItem('hk_demo_username', clean);
  if (cachedProfile && !cachedProfile.isInsideTelegram) {
    cachedProfile = { ...cachedProfile, username: clean };
  }
}

export function initTelegramMiniApp(): TelegramProfileInfo {
  if (cachedProfile) return cachedProfile;

  try {
    init();
    restoreInitData();

    try {
      mountMiniAppSync();
      setMiniAppBackgroundColor('#0a0e1a');
      setMiniAppHeaderColor('#0a0e1a');
      miniAppReady();
    } catch {
      // ignore optional color calls if host client is older
    }

    try {
      void mountViewport().then(() => {
        try {
          expandViewport();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }

    const rawInitData = retrieveRawInitData() || '';
    const user = initDataUser();

    if (user?.id) {
      cachedProfile = {
        tgId: user.id,
        username: user.username || user.first_name || `Hacker_${user.id}`,
        photoUrl: user.photo_url,
        rawInitData,
        startParam: readTelegramLaunchStartParam(),
        isInsideTelegram: true,
      };
      return cachedProfile;
    }
  } catch {
    // Работа вне Telegram WebView (превью в браузере / локальная отладка)
  }

  const demo = getOrCreateDemoIdentity();
  cachedProfile = {
    tgId: demo.id,
    username: demo.name,
    rawInitData: '',
    isInsideTelegram: false,
  };
  return cachedProfile;
}

export function triggerHapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    if (isHapticFeedbackSupported()) {
      hapticFeedbackImpactOccurred(style);
      return;
    }
  } catch {
    // fallback below
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(style === 'heavy' ? 28 : style === 'medium' ? 16 : 8);
  }
}

export function triggerHapticNotification(type: 'success' | 'warning' | 'error'): void {
  try {
    if (isHapticFeedbackSupported()) {
      hapticFeedbackNotificationOccurred(type);
      return;
    }
  } catch {
    // fallback below
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(type === 'error' ? [40, 30, 50] : [18, 20, 28]);
  }
}

export function triggerHapticSelection(): void {
  try {
    if (isHapticFeedbackSupported()) {
      hapticFeedbackSelectionChanged();
    }
  } catch {
    // ignore
  }
}
