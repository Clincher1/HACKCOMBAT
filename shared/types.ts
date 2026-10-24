export type CardCategory = 'hardware' | 'software' | 'comfort' | 'darknet';

export interface CardConfig {
  key: string;
  name: string;
  description: string;
  category: CardCategory;
  basePrice: number;
  dataPerHourPerLevel: number;
  clickBonusPerLevel?: number; // Дополнительный вклад в множитель клика
  energyMaxPerLevel?: number; // Для категории Comfort (рост Energy max от 1000 до 5000)
  heatOnBuy?: number; // Для категории Darknet (+Heat при покупке)
  minLevel?: number; // Опциональное требование к уровню игрока
  iconGlyph: string;
}

// Глобальные тиры прокачки карточек: тир открывается за Чипы + Data и поднимает потолок уровня ВСЕХ карточек.
// Так игрок не может «раскачать» одну дешёвую карточку до максимума — сначала нужно заслужить сам тир.
export interface CardTierConfig {
  tier: number; // 1..4
  title: string;
  maxLevel: number; // 10 / 15 / 20 / 25
  requiredPlayerLevel: number;
  chipCost: number;
  dataCost: number;
  description: string;
}

export type MissionTargetType = 'bad' | 'good' | 'neutral' | 'grey';

export interface MissionConfig {
  key: string;
  targetName: string;
  targetType: MissionTargetType;
  description: string;
  /** Тир сложности 1..6: чем выше, тем дольше взлом и тем больше добыча. */
  tier: number;
  /** Реальная длительность взлома в секундах: от 40 до 900 (ТЗ v3: не мгновенный клик). */
  durationSec: number;
  baseDataReward: number;
  repDelta: number;
  heatDelta: number;
  /** Опыт за успешный взлом (до множителей уровня и исхода). */
  xpReward: number;
  /** Требуемая «сила железа» (hackPower) для комфортного взлома. */
  requiredPower: number;
  /** Базовый шанс успеха у подготовленного игрока (0..1). */
  baseSuccess: number;
  minLevel?: number; // Минимальный уровень игрока, чтобы контракт появился в витрине
  cryptoDropChance?: number; // DEFAULT: шанс редкого дропа 1 Crypto на серых миссиях
}

export interface TeamNpcConfig {
  key: string;
  callsign: string;
  roleTitle: string;
  quote: string;
  effectLabel: string;
  avatarUrl: string;
  costCurrency: 'data' | 'rep';
  costAmount: number;
  /** Минимальный уровень игрока: специалисты не нанимаются на старте (ТЗ v3). */
  requiredLevel: number;
  /** Сколько контрактов нужно закрыть, прежде чем синдикат вообще станет доступен. */
  requiredMissions: number;
  /** Вклад в «силу железа» (hackPower) — влияет на шанс успеха взлома. */
  hackPower: number;
  passiveBonusPct: number; // % к Data/hour (например 0.05 = +5%)
  clickBonusPct: number; // % к Data за клик (например 0.10 = +10%)
  autoClickPerSec: number; // Botmaster = 1 клик/сек
  heatReductionPct: number; // Fence = 0.20 (-20% к приросту Heat)
  unlocksGreyMissions: boolean; // Analyst = true
}

// ===================== ПИТОМЦЫ (компаньоны) =====================
export type PetBuffType = 'passive' | 'click' | 'heat' | 'mission';

export interface PetConfig {
  key: string;
  name: string;
  species: string;
  emoji: string;
  description: string;
  quote: string;
  costCurrency: 'data' | 'crypto' | 'rep';
  costAmount: number;
  requiredLevel: number; // Питомцы тоже не для первого дня (ТЗ v3)
  buffType: PetBuffType;
  buffPct: number; // Базовый баф при полной сытости (0.03 = +3%)
  buffLabel: string;
  missionBonusPct?: number; // Дополнительный бонус к награде за контракты (для морской свинки)
  hungerDecayPerHour: number; // Сколько сытости теряется за час (100 -> 0 за ~48 ч)
  feedHunger: number; // Сколько сытости восстанавливает одно кормление
  feedCooldownHours: number;
  feedBaseCost: number; // Минимальная цена корма в Data
}

export interface PetState {
  key: string;
  hunger: number; // Сытость на момент lastFedAt (0..100) — дальше убывает линейно во времени
  lastFedAt: string;
  feedCount: number;
  affection: number; // 1..10 — «привязанность», растёт от количества кормлений
  effectiveHunger: number; // Сытость прямо сейчас (рассчитана сервером)
  isHungry: boolean; // effectiveHunger < 30 -> баф отключён
  buffMultiplier: number; // Итоговый множитель бафа (0..~1.27)
  canFeedAt: string; // Время, когда снова можно покормить
}

// ===================== БАЗА: ПАССИВНЫЕ ПОКУПКИ =====================
export interface BaseUpgradeConfig {
  key: string;
  requiredLevel?: number; // Минимальный уровень игрока для покупки
  name: string;
  description: string;
  effectLabel: string; // Описание эффекта на 1 уровне
  icon: string;
  maxLevel: number;
  basePrice: number; // Data за 1-й уровень
  priceGrowth: number; // Множитель цены за уровень
  baseChipCost: number; // Чипы за 1-й уровень
  effectPerLevel: number; // Числовой эффект на уровень (трактовка зависит от key)
}

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'secret';

export interface AchievementConfig {
  key: string;
  title: string;
  description: string;
  cryptoReward: number;
  icon: string;
  rarity: AchievementRarity;
  // Секретные ачивки полностью скрыты (нет ни названия, ни описания, ни картинки) до открытия
  secret?: boolean;
  // Необязательная награда Чипами/Data за особенно «душные» достижения
  chipReward?: number;
  dataReward?: number;
}

export type SkinCategory = 'desk' | 'ui' | 'avatar';

export interface SkinConfig {
  key: string;
  name: string;
  description: string;
  category: SkinCategory; // рабочий стол / элементы интерфейса / аватар
  cryptoCost: number;
  requiredLevel?: number;
  prestigeRequired?: boolean;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  cssFilter: string;
  clickBonusPct: number; // DEFAULT: небольшой косметический бонус к стилю/клику
  /** Эмодзи-аватар для категории 'avatar' (0 = не аватар). */
  avatarGlyph?: string;
}

export type AlignmentBranch = 'neutral' | 'white_hat' | 'black_hat';

export interface ActiveMissionInstance {
  id: string;
  missionKey: string;
  targetName: string;
  targetType: MissionTargetType;
  startedAt: string;
  finishAt: string;
  reward: number;
  repDelta: number;
  heatDelta: number;
  cryptoReward: number;
  xpReward: number;
  /** Зафиксированный на старте шанс успеха (0..1) — игрок видит, на что шёл. */
  successChance: number;
  /** Исход фиксируется сервером в момент забора: success / partial / fail. */
  outcome?: 'success' | 'partial' | 'fail' | null;
}

// Счётчики для «неочевидных» достижений. Живут в players.stats (jsonb), считает сервер.
export interface PlayerProgressStats {
  tutorialTabs: string[]; // Просмотренные главы Академии
  tutorialOpens: number;
  tabsVisited: string[]; // Посещённые вкладки приложения
  petFeedings: number;
  petHungrySeen: number;
  missionFails: number;
  missionTypes: string[]; // Типы завершённых контрактов (bad/good/neutral/grey)
  greyMissions: number; // Сколько выполнено серых контрактов
  nightSessions: number; // Заходы ночью (03:00–04:59)
  earlySessions: number; // Заходы до 07:00
  idleSessions: number; // «Кофе-брейки» без кликов
  maxSessionMinutes: number;
  bestHeatEscape: number; // Максимальный Heat, с которого не словил штраф
  heatPenalties: number; // Сколько раз срабатывал киберпатруль
  shopFreezeMinutes: number; // Минуты без покупок после 10 уровня
  petFeedingStreakDays: number;
  lastPetFeedDay: string | null;
  trackEventsToday: number;
  trackEventsDay: string | null;
  /** Опыт по классам целей: сколько успехов и провалов было для каждого типа. */
  hackSuccessByType: Record<string, number>;
  hackFailByType: Record<string, number>;
  /** Всего XP добыто (дублирует players.xp для статистики профиля). */
  totalXpEarned: number;
}

export interface DerivedStats {
  level: number;
  totalCardLevels: number;
  xpIntoLevel: number;
  xpToNext: number;
  totalXp: number;
  /** Сила железа: суммарная подготовка к взломам (карточки + команда + база). */
  hackPower: number;
  nextLevelProgress: number; // 0..4 из 5 (устарело, оставлено для совместимости UI)
  rankIndex: number; // 1..N
  rankTitle: string;
  alignment: AlignmentBranch;
  maxEnergy: number;
  energyRegenPerSec: number;
  clickPower: number;
  dataPerHour: number;
  autoClickPerSec: number;
  heatMultiplier: number;
  missionRewardBonusPct: number;
  offlineCapSeconds: number;
  cardPriceDiscountPct: number;
  cryptoDropBonusPct: number;
  autoFeedEnabled: boolean;
  feedDiscountPct: number;
  missionSlots: number;
  unlockedGreyMissions: boolean;
  deskStage: 1 | 5 | 10 | 15 | 20 | 25 | 30;
  prestigeMultiplier: number;
  cardTier: number;
  maxCardLevel: number;
}

export interface PlayerState {
  id: string;
  tgId: number;
  username: string;
  data: number;
  crypto: number;
  chips: number;
  xp: number;
  energy: number;
  energyUpdated: string;
  heat: number;
  rep: number;
  prestigeCount: number;
  cardTier: number;
  clickBlockedUntil: string | null;
  dailyStreak: number;
  lastDailyClaim: string | null;
  equippedSkin: string;
  unlockedSkins: string[];
  totalClicks: number;
  totalMissions: number;
  cards: Record<string, number>; // card_key -> level (1..25)
  team: string[]; // hired npc_keys
  pets: PetState[];
  baseUpgrades: Record<string, number>;
  stats: PlayerProgressStats;
  activeMissions: ActiveMissionInstance[];
  availableMissionKeys: string[];
  missionsRefreshedAt: string;
  achievements: string[];
  derived: DerivedStats;
}

export interface LeaderboardEntry {
  username: string;
  level: number;
  data: number;
  rankTitle: string;
  prestigeCount: number;
  isCurrentUser?: boolean;
}

export interface GameAlert {
  id: string;
  type: 'info' | 'success' | 'warning' | 'penalty' | 'achievement';
  title: string;
  message: string;
}

export interface ApiSyncResponse {
  ok: true;
  player: PlayerState;
  offlineEarned?: number;
  alerts?: GameAlert[];
  storageMode: 'supabase' | 'memory-fallback';
}
