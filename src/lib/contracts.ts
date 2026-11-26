/**
 * Контракты (v6.1) — клиентская часть.
 *
 * Здесь только нормализация серверного состояния в общий тип Quest: сервер
 * хранит прогресс и начисляет награду, клиент рисует. Никакой второй модели
 * карточки не появляется — контракт это тот же QuestCard, что и поручение дня.
 */
import {
  CONTRACT_METRIC_LABEL,
  MAX_ACTIVE_CONTRACTS,
  describeContractReward,
  getContractDefinition,
} from '../../shared/contracts.config';
import type { PlayerState } from '../../shared/types';
import type { Quest, QuestSection } from './quests';

export const CONTRACT_SECTION_TITLE = 'Контракты';

function clamp(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(current, target));
}

/**
 * Три контракта дня. Если сервер ещё не прислал набор (первый кадр после
 * деплоя), секция остаётся пустой и честно говорит об этом одной карточкой —
 * никаких «заглушечных» контрактов с фейковым прогрессом.
 */
export function buildContractSection(player: PlayerState): QuestSection {
  const state = player.stats.contracts;
  const quests: Quest[] = [];

  if (state) {
    for (const id of state.ids.slice(0, MAX_ACTIVE_CONTRACTS)) {
      const definition = getContractDefinition(id);
      if (!definition) continue;
      const current = clamp(state.progress[id] ?? 0, definition.target);
      const claimed = state.claimed.includes(id);
      const ready = current >= definition.target;
      quests.push({
        id: `contract:${definition.key}`,
        kind: 'contract',
        icon: definition.icon,
        title: definition.title,
        description: definition.description,
        rewardLabel: describeContractReward(definition.reward),
        current,
        target: definition.target,
        status: claimed ? 'closed' : ready ? 'ready' : current > 0 ? 'active' : 'available',
        claimKey: definition.key,
        claimId: `contract:${definition.key}`,
        hint: claimed
          ? 'Награда получена'
          : ready
            ? 'Готово к забору'
            : `Растёт от ${CONTRACT_METRIC_LABEL[definition.metric]}`,
      });
    }
  }

  return {
    id: 'contract',
    title: CONTRACT_SECTION_TITLE,
    subtitle: 'Цели дня: прогресс идёт сам от тапов, CPU Charge и Heat. Забирается одним тапом.',
    empty: 'Нет активных контрактов — новый набор придёт с новым днём.',
    quests,
  };
}
