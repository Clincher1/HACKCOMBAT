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
  retrieveRawInitData,
  setMiniAppBackgroundColor,
  setMiniAppHeaderColor,
} from '@telegram-apps/sdk-react';

export interface TelegramProfileInfo {
  tgId: number;
  username: string;
  photoUrl?: string;
  rawInitData: string;
  isInsideTelegram: boolean;
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
