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
  /**
   * v5.5: мир «День хакера» — карта локаций, свои фоны и акценты, пулы контрактов
   * по локациям. Выключено = ровно прежнее поведение: одна витрина, один фон.
   */
  worldV2: boolean;
  /**
   * v5.6: retention-петля — оффлайн-доход с welcome-back модалом, daily streak
   * bar по UTC-дню, opt-in напоминание в Telegram. Выключено = ровно прежнее
   * поведение: оффлайн-копилка v3.2, без модала и без панели стрика.
   */
  retentionV1: boolean;
  /**
   * v5.6: реферальные deep links вида ?start=ref_<tgId> с записью в
   * stats.referrals и welcome-бонусом приглашённому. Выключено = работает
   * только старая кодовая рефералка v3.5 (она флага не знает).
   */
  referralV1: boolean;
}

/** Значения по умолчанию. */
export const FEATURE_FLAGS: FeatureFlags = {
  onboardingV2: true,
  worldV2: true,
  retentionV1: true,
  referralV1: true,
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
  if (typeof next.worldV2 === 'boolean') FEATURE_FLAGS.worldV2 = next.worldV2;
  if (typeof next.retentionV1 === 'boolean') FEATURE_FLAGS.retentionV1 = next.retentionV1;
  if (typeof next.referralV1 === 'boolean') FEATURE_FLAGS.referralV1 = next.referralV1;
}

/** Включён ли гейт первого сеанса прямо сейчас. */
export function isOnboardingV2Enabled(): boolean {
  return (
    readEnvFlag('ONBOARDING_V2') ??
    readWindowFlag('onboardingV2') ??
    FEATURE_FLAGS.onboardingV2
  );
}

/**
 * Включён ли мир «День хакера» (v5.5).
 *
 * Цепочка приоритетов та же, что у onboardingV2:
 *   1. серверная переменная WORLD_V2=false (Vercel → Env) — гасит и сервер, и клиент;
 *   2. window.__HK_FLAGS__.worldV2;
 *   3. VITE_WORLD_V2 (читается в src/main.tsx);
 *   4. значение по умолчанию.
 *
 * Сервер читает ту же функцию: при выключенном флаге витрина миссий остаётся
 * общей, как до v5.5, а клиент не рисует карту.
 */
export function isWorldV2Enabled(): boolean {
  return readEnvFlag('WORLD_V2') ?? readWindowFlag('worldV2') ?? FEATURE_FLAGS.worldV2;
}

/**
 * Включена ли retention-петля (v5.6).
 *
 * Цепочка приоритетов та же, что у onboardingV2/worldV2:
 *   1. серверная переменная RETENTION_V1=false (Vercel → Env) — гасит и сервер, и клиент;
 *   2. window.__HK_FLAGS__.retentionV1;
 *   3. VITE_RETENTION_V1 (читается в src/main.tsx);
 *   4. значение по умолчанию (true).
 *
 * Выключенный флаг обязан быть инертным: сервер не пишет ни одного нового поля
 * в stats, не платит оффлайн по-новому и не шлёт напоминаний; клиент не рисует
 * welcome-back модал и streak bar.
 */
export function isRetentionV1Enabled(): boolean {
  return readEnvFlag('RETENTION_V1') ?? readWindowFlag('retentionV1') ?? FEATURE_FLAGS.retentionV1;
}

/**
 * Включены ли реферальные deep links (v5.6): ?start=ref_<tgId>.
 *
 * Цепочка приоритетов: REFERRAL_V1 (env) → window.__HK_FLAGS__.referralV1 →
 * VITE_REFERRAL_V1 → FEATURE_FLAGS.referralV1 (true).
 *
 * Выключенный флаг инертен: сервер игнорирует start_param вида ref_<tgId>,
 * не пишет stats.referrals и не выдаёт welcome-бонус приглашённому; старая
 * кодовая рефералка v3.5 продолжает работать как раньше.
 */
export function isReferralV1Enabled(): boolean {
  return readEnvFlag('REFERRAL_V1') ?? readWindowFlag('referralV1') ?? FEATURE_FLAGS.referralV1;
}
