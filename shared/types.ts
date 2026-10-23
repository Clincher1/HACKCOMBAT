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

export type MissionTargetType = 'bad' | 'good' | 'neutral' | 'grey';

export interface MissionConfig {
  key: string;
  targetName: string;
  targetType: MissionTargetType;
  description: string;
  durationSec: number; // 5–30 сек по ТЗ
  baseDataReward: number;
  repDelta: number;
  heatDelta: number;
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
  passiveBonusPct: number; // % к Data/hour (например 0.05 = +5%)
  clickBonusPct: number; // % к Data за клик (например 0.10 = +10%)
  autoClickPerSec: number; // Botmaster = 1 клик/сек
  heatReductionPct: number; // Fence = 0.20 (-20% к приросту Heat)
  unlocksGreyMissions: boolean; // Analyst = true
}

export interface AchievementConfig {
  key: string;
  title: string;
  description: string;
  cryptoReward: number;
  icon: string;
}

export interface SkinConfig {
  key: string;
  name: string;
  description: string;
  cryptoCost: number;
  prestigeRequired?: boolean;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  cssFilter: string;
  clickBonusPct: number; // DEFAULT: небольшой косметический бонус к стилю/клику
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
}

export interface DerivedStats {
  level: number;
  totalCardLevels: number;
  nextLevelProgress: number; // 0..4 из 5
  rankIndex: number; // 1..4
  rankTitle: string;
  alignment: AlignmentBranch;
  maxEnergy: number;
  energyRegenPerSec: number;
  clickPower: number;
  dataPerHour: number;
  autoClickPerSec: number;
  heatMultiplier: number;
  missionSlots: number;
  unlockedGreyMissions: boolean;
  deskStage: 1 | 5 | 10 | 15 | 20 | 25 | 30;
  prestigeMultiplier: number;
}

export interface PlayerState {
  id: string;
  tgId: number;
  username: string;
  data: number;
  crypto: number;
  energy: number;
  energyUpdated: string;
  heat: number;
  rep: number;
  prestigeCount: number;
  clickBlockedUntil: string | null;
  dailyStreak: number;
  lastDailyClaim: string | null;
  equippedSkin: string;
  unlockedSkins: string[];
  totalClicks: number;
  totalMissions: number;
  cards: Record<string, number>; // card_key -> level (1..10)
  team: string[]; // hired npc_keys
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
