/**
 * HACKER KOMBAT — фича-флаги приложения (v5.4).
 *
 * Зачем: гейт первого сеанса (онбординг, скрытие вкладок, защита новичка)
 * должен включаться и выключаться БЕЗ правки кода.
 *
 * Порядок приоритетов (первое найденное побеждает):
 *   1. серверная переменная окружения ONBOARDING_V2=false (Vercel → Env);
 *   2. window.__HK_FLAGS__.onboardingV2 (можно выставить из консоли/скрипта);
 *   3. VITE_ONBOARDING_V2 (клиентская сборка, читается в src/main.tsx);
 *   4. значение по умолчанию ниже.
 */

export interface FeatureFlags {
  /** Гейт первого сеанса: оверлей-онбординг, locked-вкладки, защита новичка от Heat. */
  onboardingV2: boolean;
}

/** Значения по умолчанию. */
export const FEATURE_FLAGS: FeatureFlags = {
  onboardingV2: true,
};

/** «1/true/on/yes» → true, «0/false/off/no» → false, всё остальное → undefined. */
export function parseFlag(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
  return undefined;
}

function readEnvFlag(name: string): boolean | undefined {
  // В браузере `process` нет — typeof-проверка безопасна и не тянет node-типы в бандл.
  if (typeof process === 'undefined' || !process.env) return undefined;
  return parseFlag(process.env[name]);
}

function readWindowFlag(name: string): boolean | undefined {
  const host = globalThis as unknown as { __HK_FLAGS__?: Record<string, unknown> };
  return parseFlag(host.__HK_FLAGS__?.[name]);
}

/** Принудительно выставить флаги (используется в src/main.tsx для VITE_*-переменных). */
export function configureFeatureFlags(next: Partial<FeatureFlags>): void {
  if (typeof next.onboardingV2 === 'boolean') FEATURE_FLAGS.onboardingV2 = next.onboardingV2;
}

/** Включён ли гейт первого сеанса прямо сейчас. */
export function isOnboardingV2Enabled(): boolean {
  return (
    readEnvFlag('ONBOARDING_V2') ??
    readWindowFlag('onboardingV2') ??
    FEATURE_FLAGS.onboardingV2
  );
}
