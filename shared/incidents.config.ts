import type { DailyIncidentDefinition } from './types';

/**
 * Ежедневные киберинциденты — короткий выбор между стилями игры, а не новая
 * валюта или обязательный гринд. Сервер выдаёт ровно один сценарий на
 * московские сутки и фиксирует выбор навсегда до следующего дня.
 */
export const DAILY_INCIDENTS: readonly DailyIncidentDefinition[] = [
  {
    key: 'corp_scanner',
    title: 'Корпоративный сканер',
    brief: 'Внешний сенсор заметил всплеск трафика. У тебя есть несколько секунд, чтобы выбрать протокол.',
    system: 'СИСТЕМА · уровень угрозы растёт',
    choices: [
      {
        key: 'cover_tracks',
        title: 'Спрятать следы',
        description: 'Получить небольшой Data-бонус, снизить Heat и тихо укрепить репутацию.',
        icon: '🫥',
      },
      {
        key: 'route_noise',
        title: 'Пустить шум по маршруту',
        description: 'Забрать немного Data, но оставить заметный след.',
        icon: '📡',
      },
      {
        key: 'counter_scan',
        title: 'Контрсканирование',
        description: 'Рискнуть Heat ради шанса найти редкий Crypto-пакет.',
        icon: '⚔️',
      },
    ],
  },
  {
    key: 'lost_packet',
    title: 'Потерянный пакет',
    brief: 'В relay застрял пакет с чужими ключами. Можно вернуть его владельцу, продать маршрут или изучить находку.',
    system: 'СИСТЕМА · пакет без владельца',
    choices: [
      {
        key: 'return_packet',
        title: 'Вернуть пакет',
        description: 'Получить небольшой Data-бонус и Rep, убрать часть Heat за честный маршрут.',
        icon: '📦',
      },
      {
        key: 'sell_packet',
        title: 'Продать маршрут',
        description: 'Быстрый Data-бонус с небольшим ростом Heat.',
        icon: '💠',
      },
      {
        key: 'decode_packet',
        title: 'Расшифровать находку',
        description: 'Малый Data-бонус и шанс на Crypto, но след станет горячее.',
        icon: '🔐',
      },
    ],
  },
  {
    key: 'ghost_login',
    title: 'Призрачный логин',
    brief: 'В старом терминале появился активный сеанс. Он может быть ловушкой, а может — коротким путём в закрытый узел.',
    system: 'СИСТЕМА · неизвестный оператор',
    choices: [
      {
        key: 'close_session',
        title: 'Закрыть сеанс',
        description: 'Небольшой Data-бонус, меньше Heat и немного Rep за безопасный выход.',
        icon: '🚪',
      },
      {
        key: 'borrow_session',
        title: 'Взять сеанс напрокат',
        description: 'Получить Data, приняв умеренный риск.',
        icon: '🛰️',
      },
      {
        key: 'trace_operator',
        title: 'Отследить оператора',
        description: 'Проверить неизвестного хакера ради Crypto-пакета.',
        icon: '🕵️',
      },
    ],
  },
  {
    key: 'decoy_signal',
    title: 'Ложный сигнал',
    brief: 'Сеть подбрасывает три одинаковых маяка. Только один ведёт к чистому маршруту.',
    system: 'СИСТЕМА · доверие канала 41%',
    choices: [
      {
        key: 'clean_channel',
        title: 'Выбрать чистый канал',
        description: 'Небольшой Data-бонус, погасить Heat и получить Rep-бонус.',
        icon: '🟢',
      },
      {
        key: 'harvest_signal',
        title: 'Собрать сигнал',
        description: 'Превратить шум в Data, но оставить цифровой отпечаток.',
        icon: '📶',
      },
      {
        key: 'break_beacon',
        title: 'Сломать маяк',
        description: 'Попытаться выбить Crypto с повышенным риском.',
        icon: '💥',
      },
    ],
  },
  {
    key: 'quiet_backdoor',
    title: 'Тихий бэкдор',
    brief: 'В обновлении старого роутера обнаружен незакрытый вход. Решение повлияет на Heat и репутацию команды.',
    system: 'СИСТЕМА · окно закрывается',
    choices: [
      {
        key: 'patch_backdoor',
        title: 'Закрыть дыру',
        description: 'Получить небольшой Data-бонус, укрепить репутацию и снизить Heat.',
        icon: '🛡️',
      },
      {
        key: 'use_backdoor',
        title: 'Использовать окно',
        description: 'Забрать Data до того, как маршрут исчезнет.',
        icon: '🕳️',
      },
      {
        key: 'map_backdoor',
        title: 'Составить карту',
        description: 'Разведать сеть и рискнуть ради Crypto.',
        icon: '🗺️',
      },
    ],
  },
  {
    key: 'blackout_window',
    title: 'Окно блэкаута',
    brief: 'На несколько минут район ушёл в тень. Можно переждать, заработать на тишине или проверить периметр.',
    system: 'СИСТЕМА · видимость почти нулевая',
    choices: [
      {
        key: 'wait_blackout',
        title: 'Переждать',
        description: 'Получить небольшой Data-бонус, снизить Heat и сохранить чистые руки.',
        icon: '🌑',
      },
      {
        key: 'work_blackout',
        title: 'Работать в тени',
        description: 'Повысить Data с небольшим риском обнаружения.',
        icon: '🌐',
      },
      {
        key: 'scan_perimeter',
        title: 'Проверить периметр',
        description: 'Искать Crypto в темноте, принимая повышенный Heat.',
        icon: '🔦',
      },
    ],
  },
] as const;

function stableHash(value: string): number {
  // FNV-1a: одинаковый результат в браузере, Node и тестах без crypto API.
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function getDailyIncidentDefinition(key: string): DailyIncidentDefinition | undefined {
  return DAILY_INCIDENTS.find((incident) => incident.key === key);
}

/** Сценарий зависит от Telegram ID и дня, но не пересобирается при reload. */
export function getDailyIncidentForPlayer(tgId: number, dayKey: string): DailyIncidentDefinition {
  const index = stableHash(`hk-daily-incident:${tgId}:${dayKey}`) % DAILY_INCIDENTS.length;
  return DAILY_INCIDENTS[index];
}
