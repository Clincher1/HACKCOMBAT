/**
 * HACKER KOMBAT — Telegram-профиль и тактильная отдача.
 * ----------------------------------------------------------------------------
 * v1.4 («разгрузка бандла»): SDK Telegram больше НЕ импортируется статически.
 *
 * Было: `import {...} from '@telegram-apps/sdk-react'` в самом верху файла.
 * Этот файл тянет `src/lib/api.ts`, а его — контекст игры, поэтому весь SDK
 * (≈23.2 kB gzip) попадал в стартовый payload: Vite выносил его в отдельный
 * чанк, но `index.html` тут же его `modulepreload`-ил, и первый экран ждал
 * лишние 74 kB raw ещё до запроса профиля.
 *
 * Стало: SDK грузится динамическим импортом ровно в тот момент, когда он
 * реально нужен — на определении Telegram-профиля перед первым запросом к API
 * (`initTelegramProfile()`), а также из платёжных карточек через их собственные
 * `import()`. Браузерный гость, которому Telegram-функции не нужны вовсе, ждёт
 * только сам чанк профиля, а не SDK.
 *
 * Правила, которые нельзя ломать:
 *  • профиль определяется ОДИН раз и кешируется: гостевой id из localStorage не
 *    должен «перебить» настоящий Telegram-профиль (это была бы потеря прогресса);
 *  • синхронный `peekTelegramProfile()` отдаёт только уже известный профиль или
 *    гостя — он нужен первому рендеру и аналитике, но ничего не фиксирует;
 *  • тактильная отдача никогда не ждёт сеть: если SDK ещё не загружен, работает
 *    `navigator.vibrate`, а после загрузки — родные haptics Telegram.
 */

/** Тип модуля SDK без статического импорта: код в бандл не попадает. */
type TelegramSdkModule = typeof import('@telegram-apps/sdk-react');

let sdk: TelegramSdkModule | null = null;
let sdkLoading: Promise<TelegramSdkModule | null> | null = null;

/**
 * Загрузка SDK по требованию. Возвращает `null`, если чанк не загрузился:
 * игра обязана остаться рабочей (гостевой режим), а не падать на старте.
 */
export function loadTelegramSdk(): Promise<TelegramSdkModule | null> {
  if (sdk) return Promise.resolve(sdk);
  if (!sdkLoading) {
    sdkLoading = import('@telegram-apps/sdk-react')
      .then((module) => {
        sdk = module;
        return module;
      })
      .catch(() => {
        // Не кешируем ошибку навсегда: следующий вызов попробует ещё раз.
        sdkLoading = null;
        return null;
      });
  }
  return sdkLoading;
}

/** SDK уже в памяти (нужно тактильной отдаче, чтобы не будить сеть). */
export function isTelegramSdkLoaded(): boolean {
  return sdk !== null;
}

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
function readTelegramLaunchStartParam(module: TelegramSdkModule): string | undefined {
  try {
    const launch = module.retrieveLaunchParams(true) as { tgWebAppStartParam?: unknown };
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
let profileLoading: Promise<TelegramProfileInfo> | null = null;

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

function buildGuestProfile(): TelegramProfileInfo {
  const demo = getOrCreateDemoIdentity();
  return { tgId: demo.id, username: demo.name, rawInitData: '', isInsideTelegram: false };
}

export function renameDemoIdentity(newName: string): void {
  const clean = newName.trim().slice(0, 24);
  if (!clean) return;
  localStorage.setItem('hk_demo_username', clean);
  if (cachedProfile && !cachedProfile.isInsideTelegram) {
    cachedProfile = { ...cachedProfile, username: clean };
  }
}

/** Инициализация Mini App и чтение подписанного профиля из уже загруженного SDK. */
function readTelegramProfile(module: TelegramSdkModule): TelegramProfileInfo | null {
  try {
    module.init();
    module.restoreInitData();

    try {
      module.mountMiniAppSync();
      module.setMiniAppBackgroundColor('var(--ui-panel-deep)');
      module.setMiniAppHeaderColor('var(--ui-panel-deep)');
      module.miniAppReady();
    } catch {
      // ignore optional color calls if host client is older
    }

    try {
      void module.mountViewport().then(() => {
        try {
          module.expandViewport();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }

    const rawInitData = module.retrieveRawInitData() || '';
    const user = module.initDataUser();

    if (user?.id) {
      return {
        tgId: user.id,
        username: user.username || user.first_name || `Hacker_${user.id}`,
        photoUrl: user.photo_url,
        rawInitData,
        startParam: readTelegramLaunchStartParam(module),
        isInsideTelegram: true,
      };
    }
  } catch {
    // Работа вне Telegram WebView (превью в браузере / локальная отладка)
  }
  return null;
}

/**
 * Профиль для первого запроса к API. Грузит SDK только здесь, поэтому вызов
 * обязан быть асинхронным: экран загрузки уже нарисован, а сеть к API всё
 * равно пойдёт после этой строки.
 */
export function initTelegramProfile(): Promise<TelegramProfileInfo> {
  if (cachedProfile) return Promise.resolve(cachedProfile);
  if (!profileLoading) {
    profileLoading = (async () => {
      const module = await loadTelegramSdk();
      const fromTelegram = module ? readTelegramProfile(module) : null;
      cachedProfile = fromTelegram ?? buildGuestProfile();
      return cachedProfile;
    })();
  }
  return profileLoading;
}

/**
 * Синхронный снимок профиля для первого рендера и аналитики.
 * Ничего не фиксирует: если SDK ещё не загружен, это гостевая идентичность,
 * и настоящий Telegram-профиль заменит её после `initTelegramProfile()`.
 */
export function peekTelegramProfile(): TelegramProfileInfo {
  return cachedProfile ?? buildGuestProfile();
}

export function triggerHapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (sdk) {
    try {
      if (sdk.isHapticFeedbackSupported()) {
        sdk.hapticFeedbackImpactOccurred(style);
        return;
      }
    } catch {
      // fallback below
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(style === 'heavy' ? 28 : style === 'medium' ? 16 : 8);
  }
}

export function triggerHapticNotification(type: 'success' | 'warning' | 'error'): void {
  if (sdk) {
    try {
      if (sdk.isHapticFeedbackSupported()) {
        sdk.hapticFeedbackNotificationOccurred(type);
        return;
      }
    } catch {
      // fallback below
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(type === 'error' ? [40, 30, 50] : [18, 20, 28]);
  }
}

export function triggerHapticSelection(): void {
  if (sdk) {
    try {
      if (sdk.isHapticFeedbackSupported()) {
        sdk.hapticFeedbackSelectionChanged();
      }
    } catch {
      // ignore
    }
  }
}
