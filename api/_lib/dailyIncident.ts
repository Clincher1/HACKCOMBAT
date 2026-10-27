import {
  getDailyIncidentDefinition,
  getDailyIncidentForPlayer,
} from '../../shared/incidents.config';
import type {
  DailyIncidentOutcomeState,
  DailyIncidentState,
  PlayerProgressStats,
} from '../../shared/types';

const DAILY_INCIDENT_VERSION = 1 as const;
const MAX_INCIDENT_DATA = 5_000;

function validDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function finiteInt(value: unknown, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Убираем из jsonb повреждённые или подменённые поля, не меняя экономику. */
export function normalizeDailyIncidentState(raw: unknown): DailyIncidentState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const dayKey = source.dayKey;
  const incidentKey = typeof source.incidentKey === 'string' ? source.incidentKey : '';
  const definition = getDailyIncidentDefinition(incidentKey);
  if (source.version !== DAILY_INCIDENT_VERSION || !validDayKey(dayKey) || !definition) return undefined;

  const rawChoice = typeof source.choiceKey === 'string' ? source.choiceKey : null;
  const choiceIsKnown = Boolean(rawChoice && definition.choices.some((choice) => choice.key === rawChoice));
  const rawOutcome =
    source.outcome && typeof source.outcome === 'object'
      ? (source.outcome as Record<string, unknown>)
      : null;
  // A choice without its outcome is an interrupted/corrupt write, not a
  // completed incident. Drop both pieces so the player can safely choose once.
  const choiceKey = choiceIsKnown && rawOutcome ? rawChoice : null;
  const resolvedAt =
    choiceKey && typeof source.resolvedAt === 'string' && !Number.isNaN(new Date(source.resolvedAt).getTime())
      ? source.resolvedAt
      : null;
  const outcome: DailyIncidentOutcomeState | null =
    rawOutcome && choiceKey
      ? {
          data: finiteInt(rawOutcome.data, 0, MAX_INCIDENT_DATA),
          crypto: finiteInt(rawOutcome.crypto, 0, 1),
          rep: finiteInt(rawOutcome.rep, -20, 20),
          heat: finiteInt(rawOutcome.heat, -30, 30),
          summary: typeof rawOutcome.summary === 'string' ? rawOutcome.summary.slice(0, 240) : 'Инцидент закрыт.',
        }
      : null;

  return {
    version: DAILY_INCIDENT_VERSION,
    dayKey,
    incidentKey,
    choiceKey,
    resolvedAt,
    outcome,
  };
}

/** Создаёт один канонический сценарий на текущие московские сутки. */
export function ensureDailyIncident(
  stats: PlayerProgressStats,
  tgId: number,
  dayKey: string
): DailyIncidentState {
  const current = stats.dailyIncident;
  if (
    current &&
    current.version === DAILY_INCIDENT_VERSION &&
    current.dayKey === dayKey &&
    getDailyIncidentDefinition(current.incidentKey)
  ) {
    return current;
  }

  const definition = getDailyIncidentForPlayer(tgId, dayKey);
  const next: DailyIncidentState = {
    version: DAILY_INCIDENT_VERSION,
    dayKey,
    incidentKey: definition.key,
    choiceKey: null,
    resolvedAt: null,
    outcome: null,
  };
  stats.dailyIncident = next;
  return next;
}

export interface DailyIncidentResolvedOutcome extends DailyIncidentOutcomeState {
  choiceKey: string;
}

/**
 * Серверная таблица исходов. Клиент получает только текст выбора — он не
 * присылает Data/Heat/Crypto и не может выбрать награду вручную.
 */
export function resolveDailyIncidentOutcome(
  tgId: number,
  state: DailyIncidentState,
  level: number,
  choiceKey: string
): DailyIncidentResolvedOutcome {
  const definition = getDailyIncidentDefinition(state.incidentKey);
  if (!definition) throw new Error('Киберинцидент не найден');
  const choiceIndex = definition.choices.findIndex((choice) => choice.key === choiceKey);
  if (choiceIndex < 0) throw new Error('Этот выбор не относится к сегодняшнему инциденту');

  const safeLevel = Math.max(1, Math.min(100, Math.floor(Number(level) || 1)));
  const dataScale = Math.min(1.5, 1 + (safeLevel - 1) * 0.015);
  const cryptoFound = stableHash(`hk-incident-outcome:${tgId}:${state.dayKey}:${state.incidentKey}`) % 100 < 55;

  if (choiceIndex === 0) {
    return {
      choiceKey,
      data: 50,
      crypto: 0,
      rep: 3,
      heat: -10,
      summary: '+50 Data за чистый маршрут, +3 Rep, Heat снижен на 10.',
    };
  }

  if (choiceIndex === 1) {
    const data = Math.min(MAX_INCIDENT_DATA, Math.round((700 + safeLevel * 45) * dataScale));
    return {
      choiceKey,
      data,
      crypto: 0,
      rep: 0,
      heat: 5,
      summary: `Маршрут собран: +${data.toLocaleString('ru-RU')} Data, Heat вырос на 5.`,
    };
  }

  const data = Math.min(MAX_INCIDENT_DATA, Math.round((250 + safeLevel * 20) * dataScale));
  return {
    choiceKey,
    data,
    crypto: cryptoFound ? 1 : 0,
    rep: 1,
    heat: 12,
    summary: cryptoFound
      ? `Контрскан удался: +${data.toLocaleString('ru-RU')} Data и +1 Crypto, Heat вырос на 12.`
      : `Контрскан дал шум: +${data.toLocaleString('ru-RU')} Data, но Crypto не найден. Heat вырос на 12.`,
  };
}
