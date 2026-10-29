export type CardCategory = 'hardware' | 'software' | 'comfort' | 'darknet';

export interface CardConfig {
  key: string;
  name: string;
  description: string;
  category: CardCategory;
  basePrice: number;
  dataPerHourPerLevel: number;
  clickBonusPerLevel?: number; // Дополнительный вклад в множитель клика
  energyMaxPerLevel?: number; // Для категории Comfort (рост Energy max от 1500 до 5000)
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
  /** Отмечаются только специальные достижения за события, не обычный прогресс. */
  inventoryEventReward?: boolean;
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
  /**
   * v3.6.5: цвета интерфейса для категории 'ui'.
   * До этого UI-скин не перекрашивал ничего — палитра бралась из базовой темы.
   * Здесь задаётся только хром (панели, рамки, акценты), арт сцены не трогается.
   */
  uiTokens?: {
    /** Основной акцент интерфейса: подписи, активные вкладки, рамки. */
    accent: string;
    /** Второй акцент: градиенты кнопок, бейджи. */
    accent2: string;
    /** Подложка панелей и шапки. */
    panel: string;
    /** Текст на подложке панели. */
    text: string;
  };
}

export type AlignmentBranch = 'neutral' | 'white_hat' | 'black_hat';

/** Предметы постоянного профиля: всё, что игрок получил и может показать. */
export type InventoryItemKind = 'reward' | 'frame' | 'skin' | 'achievement' | 'companion';
export type InventoryEquipAction = 'profile_frame' | 'skin' | null;
export type InventoryCategory = 'event' | 'prize' | 'gift';

export interface InventoryItemDefinition {
  key: string;
  kind: InventoryItemKind;
  name: string;
  description: string;
  icon: string;
  source: string;
  accent: string;
  /** Можно ли применить предмет к профилю/аватару. Памятные призы — false. */
  usable: boolean;
  equipAction: InventoryEquipAction;
  equipKey?: string;
  imageUrl?: string;
  inventoryCategory?: InventoryCategory;
}

export interface PlayerInventoryState {
  /** Полный набор известных полученных предметов, включая будущие награды. */
  ownedKeys: string[];
  /** Только предметы, которые игрок сознательно открыл для других. */
  showcaseKeys: string[];
}

export interface PublicProfileItem extends InventoryItemDefinition {
  equipped?: boolean;
}

export interface PublicProfile {
  profileId: string;
  username: string;
  level: number;
  rankTitle: string;
  prestigeCount: number;
  avatarKey?: string;
  profileFrameKey?: string;
  items: PublicProfileItem[];
  viewerIsOwner: boolean;
}

export interface PublicProfileResponse {
  ok: true;
  profile: PublicProfile;
}

export interface InventoryActionResponse {
  ok: true;
  player: PlayerState;
  storageMode: 'supabase' | 'memory-fallback';
}


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
  /** Взнос, списанный при запуске: сохраняется для истории и активной карточки. */
  entryEnergyCost?: number;
  entryDataCost?: number;
  /** Зафиксированный на старте шанс успеха (0..1) — игрок видит, на что шёл. */
  successChance: number;
  /** Исход фиксируется сервером в момент забора: success / partial / fail. */
  outcome?: 'success' | 'partial' | 'fail' | null;
}

// Счётчики для «неочевидных» достижений. Живут в players.stats (jsonb), считает сервер.
export type DailyTaskKind = 'tap' | 'mission_start' | 'mission_complete';

export interface ProfileFrameConfig {
  key: string;
  name: string;
  description: string;
  accent: string;
  background: string;
  glow: string;
  source: string;
  /** Необязательный арт поверх аватара для особых временных рамок. */
  iconUrl?: string;
  /** Полный временный аватар, который заменяет Telegram-фото в профиле и рейтинге. */
  avatarUrl?: string;
  /** Встроенный анимированный аватар без внешнего файла. */
  avatarMode?: 'matrix_rain';
  /** Текст, который должен быть читаемым внутри анимированного аватара. */
  avatarLabel?: string;
  /** CSS-градиент рамки для специальных косметических подарков. */
  borderImage?: string;
  /** Такая рамка не покупается и автоматически снимается по expiry в stats. */
  temporary?: boolean;
  /** Персональный подарок администратора: нельзя купить или разблокировать через API. */
  giftOnly?: boolean;
  eventKey?: string;
  /** Цена Crypto для постоянной покупки в магазине; у event-наград её нет. */
  cryptoCost?: number;
  /** Рамки магазина открываются только с этого уровня. */
  requiredLevel?: number;
}

export interface SeasonEventTaskDefinition {
  key: string;
  kind: DailyTaskKind;
  target: number;
  title: string;
  description: string;
  icon: string;
}

export interface SeasonEventDayState {
  day: number;
  dayKey: string;
  /** Уровень, зафиксированный сервером при создании набора задач. */
  levelAtGeneration: number;
  tasks: SeasonEventTaskDefinition[];
  progress: Record<string, number>;
  completed: boolean;
  completedAt?: string | null;
}

export interface SeasonEventScenario {
  day: number;
  title: string;
  description: string;
  system: string;
}

export interface SeasonEventState {
  /** Версия формата нужна, чтобы старые глобальные goals не мигрировали в новый ивент. */
  version: 2;
  eventKey: string;
  weekKey: string;
  currentDay: number;
  /** Ключи 1…7 появляются только при наступлении соответствующего календарного дня. */
  days: Record<string, SeasonEventDayState>;
  completedDays: number[];
  /** Эти флаги означают уже выданные навсегда косметические награды. */
  participationClaimed: boolean;
  masteryClaimed: boolean;
}

export interface DailyTaskDefinition {
  key: string;
  kind: DailyTaskKind;
  target: number;
  rewardXp: number;
  icon: string;
  title: string;
  description: string;
}

/** Постоянная часть ежедневных поручений хранится внутри уже существующего stats jsonb. */
export interface DailyTaskState {
  dayKey: string;
  taskKeys: string[];
  progress: Record<string, number>;
  claimed: string[];
}

/** Один серверный выбор в ежедневном киберинциденте. */
export interface DailyIncidentChoiceDefinition {
  key: string;
  title: string;
  description: string;
  icon: string;
}

export interface DailyIncidentDefinition {
  key: string;
  title: string;
  brief: string;
  system: string;
  choices: readonly DailyIncidentChoiceDefinition[];
}

export interface DailyIncidentOutcomeState {
  data: number;
  crypto: number;
  rep: number;
  heat: number;
  summary: string;
}

/** Состояние одного неизменяемого инцидента за московские сутки. */
export interface DailyIncidentState {
  version: 1;
  dayKey: string;
  incidentKey: string;
  choiceKey?: string | null;
  resolvedAt?: string | null;
  outcome?: DailyIncidentOutcomeState | null;
}

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
  /** Доли Data от онлайн-пассива, ещё не достигшие точности хранения (0.01). */
  onlinePassiveRemainder?: number;
  /** Когда последний раз начислялась «фоновая копилка тапов» (ISO). */
  lastTapClaimAt?: string | null;
  /** v3.2: игровой день (YYYY-MM-DD по Москве), за который считаем активность. */
  activeDayKey?: string | null;
  /** v3.8: три персональных ежедневных поручения и их серверный прогресс. */
  dailyTasks?: DailyTaskState;
  /** v3.13: один серверный киберинцидент с выбором в каждые московские сутки. */
  dailyIncident?: DailyIncidentState;
  /** v3.9: прогресс текущей 7-дневной сезонной операции. */
  seasonEvent?: SeasonEventState;
  /** v3.9: профильные рамки, открытые за косметические события. */
  unlockedProfileFrames?: string[];
  /** v3.9: выбранная рамка, видимая в турнирной таблице. */
  equippedProfileFrame?: string;
  /** v3.2: сколько секунд активной игры набрано в текущем игровом дне. */
  activeSecondsToday?: number;
  /** v3.5: игровой день, за который считаем суточный лимит Чипов. */
  chipsDayKey?: string | null;
  /** v3.5: сколько Чипов уже выбито за этот день (для лимита и для UI). */
  chipsToday?: number;
  /** v3.5: день, за который уже показали предупреждение о лимите (без спама). */
  chipsCapNotifiedDay?: string | null;
  /** v3.7: версия ручного скана целей — хранится в stats, чтобы Vercel-инстансы видели один оффер. */
  missionRefreshSalt?: number;
  /** v3.7: серверное время последнего ручного скана; auto-refresh не продлевает cooldown. */
  lastMissionRefreshAt?: string | null;
  /** v3.12: временная рамка-подарок автоматически исчезает после этого ISO-времени. */
  equippedProfileFrameExpiresAt?: string | null;
  /** Выбранная базовая тема оформления; проверяется серверным реестром. */
  baseTheme?: string;
  /**
   * v3.6.5: отдельные слоты косметики.
   * Раньше все три категории писались в players.equipped_skin, поэтому
   * надевание интерфейса сбрасывало стол и аватар. Теперь стол остаётся
   * в players.equipped_skin, а эти два поля живут в stats (jsonb) — миграция не нужна.
   */
  equippedUi?: string;
  equippedAvatar?: string;
  /** v4.0: постоянные предметы профиля, вручную выданные награды и витрина. */
  inventoryOwned?: string[];
  inventoryShowcase?: string[];
  /** v3.2: последний день, в котором набрано 8+ минут активности (даёт право на оффлайн). */
  lastQualifiedDayKey?: string | null;
  /** v3.2: время последнего запроса к серверу — «пульс» активной сессии. */
  lastActiveAt?: string | null;
  /** v3.2: одноразовая поблажка для сейвов, созданных до появления счётчиков. */
  offlineGraceUsed?: boolean;
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
  cards: Record<string, number>; // card_key -> level (1..60)
  team: string[]; // hired npc_keys
  pets: PetState[];
  baseUpgrades: Record<string, number>;
  stats: PlayerProgressStats;
  activeMissions: ActiveMissionInstance[];
  availableMissionKeys: string[];
  missionsRefreshedAt: string;
  achievements: string[];
  inventory: PlayerInventoryState;
  newYearCandy: import('./newYearCandy').NewYearCandyState;
  derived: DerivedStats;
}

/** По какой метрике строится турнирная таблица. */
export type LeaderboardSort = 'data' | 'xp' | 'level';

export interface LeaderboardEntry {
  /** Непрозрачный стабильный идентификатор публичного профиля (UUID записи). */
  profileId?: string;
  username: string;
  /** Косметика профиля, видимая всем в таблице; сервер возвращает только ключи. */
  avatarKey?: string;
  profileFrameKey?: string;
  level: number;
  data: number;
  /** Суммарный накопленный опыт — не тратится, поэтому честно показывает прогресс. */
  xp: number;
  rankTitle: string;
  prestigeCount: number;
  isCurrentUser?: boolean;
}

/**
 * Своя строка в рейтинге. Нужна, чтобы игрок видел место, даже если он
 * не попал в топ-100 — иначе таблица «не про него» и играть неинтересно.
 */
export interface LeaderboardSelf {
  rank: number;
  total: number;
  level: number;
  data: number;
  xp: number;
  /** Метрика, по которой посчитано место. */
  metric: LeaderboardSort;
  /** Моё значение в этой метрике. */
  value: number;
  /** Ник игрока прямо над тобой (null — ты первый). */
  aheadUsername: string | null;
  aheadValue: number | null;
  /** Сколько не хватает до места выше (в единицах метрики). */
  gap: number;
}

export interface LeaderboardResponse {
  ok: true;
  sort: LeaderboardSort;
  entries: LeaderboardEntry[];
  me: LeaderboardSelf | null;
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
  /** Сколько «фоновых тапов» накопилось за отсутствие (для окна «пока вас не было»). */
  offlineTaps?: number;
  /** v3.3: сколько кликов из присланного «хвоста» сервер реально зачёл (остаток клиент досылает). */
  appliedClicks?: number;
  alerts?: GameAlert[];
  storageMode: 'supabase' | 'memory-fallback';
}
