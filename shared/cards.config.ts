import type { CardCategory, CardConfig, CardTierConfig } from './types';

export const CARD_CATEGORIES: {
  id: CardCategory;
  label: string;
  subtitle: string;
  accentColor: string;
  iconUrl: string;
}[] = [
  {
    id: 'hardware',
    label: 'Hardware',
    subtitle: 'Железо, кластеры и квантовые узлы (тап + пассив)',
    accentColor: '#00f0ff',
    iconUrl: '/assets/cards/hardware.svg',
  },
  {
    id: 'software',
    label: 'Software',
    subtitle: 'Софт, ИИ-алгоритмы и автономный фарм Data/час',
    accentColor: '#7dff00',
    iconUrl: '/assets/cards/software.svg',
  },
  {
    id: 'comfort',
    label: 'Comfort',
    subtitle: 'Запас CPU Energy (до 5000) + фокус оператора',
    accentColor: '#ff00a0',
    iconUrl: '/assets/cards/comfort.svg',
  },
  {
    id: 'darknet',
    label: 'Darknet',
    subtitle: 'Экстремальный доход Data + рост розыска (Heat)',
    accentColor: '#ff3b6b',
    iconUrl: '/assets/cards/darknet.svg',
  },
];

// 48 карточек (по 12 в каждой категории = сетка 2×6, макс. уровень карточки = 10 -> 100% совместимость с БД!)
// Сумма макс. уровней = 480 -> до 97 уровня игрока за один цикл + многоступенчатый Global Hack Престиж!
// ВАЖНО: Все 32 базовых ключа (key) полностью сохранены — ни у одного текущего игрока не пропадёт ни один уровень!
export const CARDS_CONFIG: CardConfig[] = [
  // ===================== HARDWARE (12) =====================
  {
    key: 'monitor',
    name: 'Монитор IPS 240Hz',
    description: 'Больше окон терминала — выше поток данных.',
    category: 'hardware',
    basePrice: 20,
    dataPerHourPerLevel: 120,
    clickBonusPerLevel: 0.25,
    iconGlyph: '🖥️',
  },
  {
    key: 'keyboard',
    name: 'Мех. Клавиатура',
    description: 'Кастомные оптические свитчи увеличивают мощь каждого тапа.',
    category: 'hardware',
    basePrice: 15,
    dataPerHourPerLevel: 80,
    clickBonusPerLevel: 0.6,
    iconGlyph: '⌨️',
  },
  {
    key: 'gpu',
    name: 'Видеокарта CyberGPU',
    description: 'Параллельные вычисления разгоняют пассивный майнинг Data.',
    category: 'hardware',
    basePrice: 75,
    dataPerHourPerLevel: 340,
    clickBonusPerLevel: 0.4,
    iconGlyph: '🎛️',
  },
  {
    key: 'server_rack',
    name: 'Серверная стойка',
    description: 'Собственный кластер 42U прямо у рабочего стола.',
    category: 'hardware',
    basePrice: 260,
    dataPerHourPerLevel: 950,
    iconGlyph: '🗄️',
  },
  {
    key: 'scout_drone',
    name: 'Дрон-разведчик',
    description: 'Сканирует беспроводные эфиры мегаполиса 24/7.',
    category: 'hardware',
    basePrice: 700,
    dataPerHourPerLevel: 2200,
    clickBonusPerLevel: 1.0,
    iconGlyph: '🛸',
  },
  {
    key: 'quantum_cooler',
    name: 'Крио-охлаждение',
    description: 'Держит частоты процессора на пике без троттлинга.',
    category: 'hardware',
    basePrice: 1600,
    dataPerHourPerLevel: 4600,
    iconGlyph: '❄️',
  },
  {
    key: 'fiber_uplink',
    name: 'Оптический канал 100G',
    description: 'Прямой гигабитный аплинк в магистральную сеть.',
    category: 'hardware',
    basePrice: 3800,
    dataPerHourPerLevel: 9800,
    clickBonusPerLevel: 1.8,
    iconGlyph: '⚡',
  },
  {
    key: 'neural_chip',
    name: 'Нейро-сопроцессор',
    description: 'Тензорный модуль нового поколения.',
    category: 'hardware',
    basePrice: 8500,
    dataPerHourPerLevel: 19500,
    clickBonusPerLevel: 3.0,
    iconGlyph: '🧠',
  },
  {
    // DEFAULT: Эндгейм-линейка Hardware (Ур. 18–50+)
    key: 'asic_blade_array',
    name: 'Блейд-ферма ASIC X9',
    description: 'Стойка промышленных вычислителей для мидгейма.',
    category: 'hardware',
    basePrice: 42000,
    dataPerHourPerLevel: 64000,
    clickBonusPerLevel: 6.5,
    minLevel: 15,
    iconGlyph: '🧱',
  },
  {
    key: 'photonic_core',
    name: 'Фотонный Процессор',
    description: 'Световые затворы обрабатывают терабайты без нагрева.',
    category: 'hardware',
    basePrice: 185000,
    dataPerHourPerLevel: 215000,
    clickBonusPerLevel: 14.0,
    minLevel: 25,
    iconGlyph: '💎',
  },
  {
    key: 'subsea_datacenter',
    name: 'Подводный Дата-Бункер',
    description: 'Автономная капсула серверов на дне северного океана.',
    category: 'hardware',
    basePrice: 820000,
    dataPerHourPerLevel: 740000,
    clickBonusPerLevel: 32.0,
    minLevel: 38,
    iconGlyph: '🌊',
  },
  {
    key: 'orbital_quantum_ring',
    name: 'Орбитальное Кванто-Кольцо',
    description: 'Финальный мегапроект Hardware: планетарная вычислительная сеть.',
    category: 'hardware',
    basePrice: 3600000,
    dataPerHourPerLevel: 2650000,
    clickBonusPerLevel: 75.0,
    minLevel: 52,
    iconGlyph: '🪐',
  },

  // ===================== SOFTWARE (12) =====================
  {
    key: 'vpn',
    name: 'Мульти-VPN Цепь',
    description: 'Маршрутизация трафика через 7 виртуальных узлов.',
    category: 'software',
    basePrice: 25,
    dataPerHourPerLevel: 140,
    iconGlyph: '🛡️',
  },
  {
    key: 'antidetect',
    name: 'Антидетект Стек',
    description: 'Маскировка цифровых отпечатков для мультизадачности.',
    category: 'software',
    basePrice: 65,
    dataPerHourPerLevel: 310,
    clickBonusPerLevel: 0.35,
    iconGlyph: '🎭',
  },
  {
    key: 'botnet',
    name: 'Симулятор Ботнета',
    description: 'Вициальный рой воркеров генерирует Data каждую минуту.',
    category: 'software',
    basePrice: 220,
    dataPerHourPerLevel: 880,
    iconGlyph: '🕸️',
  },
  {
    key: 'exploit_pack',
    name: 'Эксплойт-пак v4',
    description: 'Автоматизированный набор игровых скриптов прорыва.',
    category: 'software',
    basePrice: 620,
    dataPerHourPerLevel: 2100,
    clickBonusPerLevel: 1.2,
    iconGlyph: '🧩',
  },
  {
    key: 'ai_assistant',
    name: 'ИИ-ассистент Кода',
    description: 'Автономный ко-пилот пишет скрипты со скоростью мысли.',
    category: 'software',
    basePrice: 1500,
    dataPerHourPerLevel: 4800,
    clickBonusPerLevel: 2.0,
    iconGlyph: '🤖',
  },
  {
    key: 'poly_compiler',
    name: 'Полиморф-движок',
    description: 'Динамическая пересборка модулей на лету.',
    category: 'software',
    basePrice: 3400,
    dataPerHourPerLevel: 9400,
    iconGlyph: '🧬',
  },
  {
    key: 'packet_sniffer',
    name: 'Спектральный Анализатор',
    description: 'Извлекает ценные пакеты из фонового шума сети.',
    category: 'software',
    basePrice: 7600,
    dataPerHourPerLevel: 18200,
    iconGlyph: '📡',
  },
  {
    key: 'quantum_decryptor',
    name: 'Квантовый Дешифратор',
    description: 'Мгновенный подбор ключей в игровом симуляторе.',
    category: 'software',
    basePrice: 16500,
    dataPerHourPerLevel: 36000,
    clickBonusPerLevel: 4.5,
    iconGlyph: '🔮',
  },
  {
    // DEFAULT: Эндгейм-линейка Software
    key: 'autonomous_agents',
    name: 'Рой ИИ-Агентов',
    description: 'Самообучающиеся агенты фармят синтетические узлы круглосуточно.',
    category: 'software',
    basePrice: 68000,
    dataPerHourPerLevel: 105000,
    clickBonusPerLevel: 9.0,
    minLevel: 16,
    iconGlyph: '🧠',
  },
  {
    key: 'zero_knowledge_os',
    name: 'Ядро Zero-Knowledge OS',
    description: 'Операционная система криптографической невидимости.',
    category: 'software',
    basePrice: 290000,
    dataPerHourPerLevel: 340000,
    clickBonusPerLevel: 20.0,
    minLevel: 28,
    iconGlyph: '💠',
  },
  {
    key: 'synthetic_metaverse',
    name: 'Синтетический Мета-Узел',
    description: 'Собственная виртуальная вселенная, генерирующая потоки Data.',
    category: 'software',
    basePrice: 1250000,
    dataPerHourPerLevel: 1150000,
    clickBonusPerLevel: 45.0,
    minLevel: 40,
    iconGlyph: '🌌',
  },
  {
    key: 'agi_singularity_kernel',
    name: 'Сверхразум «Сингулярность»',
    description: 'Венец ветки Software — автономное цифровое сознание.',
    category: 'software',
    basePrice: 5400000,
    dataPerHourPerLevel: 4100000,
    clickBonusPerLevel: 110.0,
    minLevel: 55,
    iconGlyph: '👁️',
  },

  // ===================== COMFORT (12 — буст Energy Max до 5000 + стабильный пассив!) =====================
  {
    key: 'gamer_chair',
    name: 'Кибер-кресло Pro',
    description: 'Анатомическая посадка: +50 к макс. энергии CPU за уровень.',
    category: 'comfort',
    basePrice: 30,
    dataPerHourPerLevel: 90,
    energyMaxPerLevel: 50,
    iconGlyph: '💺',
  },
  {
    key: 'coffee_machine',
    name: 'Нео-Кофеварка',
    description: 'Двойной эспрессо: +50 Energy Max и прирост Data/час.',
    category: 'comfort',
    basePrice: 55,
    dataPerHourPerLevel: 210,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 0.3,
    iconGlyph: '☕',
  },
  {
    key: 'neon_light',
    name: 'Неоновая Подсветка',
    description: 'Киберпанк-вайб #ff00a0: +50 Energy Max и бонус к тапу.',
    category: 'comfort',
    basePrice: 130,
    dataPerHourPerLevel: 450,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 0.65,
    iconGlyph: '🌈',
  },
  {
    key: 'smart_desk',
    name: 'Смарт-стол с приводом',
    description: 'Идеальная эргономика для марафонов: +50 Energy Max.',
    category: 'comfort',
    basePrice: 320,
    dataPerHourPerLevel: 960,
    energyMaxPerLevel: 50,
    iconGlyph: '🛸',
  },
  {
    key: 'synth_audio',
    name: 'Акустика Synthwave',
    description: 'Ритм ночного города ускоряет печать: +50 Energy Max.',
    category: 'comfort',
    basePrice: 800,
    dataPerHourPerLevel: 2250,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 1.1,
    iconGlyph: '🎧',
  },
  {
    key: 'energy_fridge',
    name: 'Мини-холодильник',
    description: 'Запас кибер-тоника у руки: +50 Energy Max.',
    category: 'comfort',
    basePrice: 1900,
    dataPerHourPerLevel: 4900,
    energyMaxPerLevel: 50,
    iconGlyph: '🧊',
  },
  {
    key: 'air_ionizer',
    name: 'Климат-капсула',
    description: 'Чистый озон в серверной комнате: +50 Energy Max.',
    category: 'comfort',
    basePrice: 4400,
    dataPerHourPerLevel: 10500,
    energyMaxPerLevel: 50,
    iconGlyph: '🌀',
  },
  {
    key: 'holo_projector',
    name: 'Голо-проектор Сцены',
    description: 'Парящие 3D-виджеты над столом: +50 Energy Max.',
    category: 'comfort',
    basePrice: 9800,
    dataPerHourPerLevel: 22000,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 2.5,
    iconGlyph: '💠',
  },
  {
    // DEFAULT: Эндгейм-линейка Comfort
    key: 'bionic_gloves',
    name: 'Тактильные Перчатки',
    description: 'Мгновенный нейро-отклик клавиш: мощный буст тапа и +50 Energy Max.',
    category: 'comfort',
    basePrice: 46000,
    dataPerHourPerLevel: 72000,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 8.5,
    minLevel: 15,
    iconGlyph: '🧤',
  },
  {
    key: 'penthouse_loft',
    name: 'Кибер-Пентхаус 88 Этаж',
    description: 'Панорамный штаб над неоновым мегаполисом.',
    category: 'comfort',
    basePrice: 210000,
    dataPerHourPerLevel: 245000,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 18.0,
    minLevel: 26,
    iconGlyph: '🏙️',
  },
  {
    key: 'neural_sleep_pod',
    name: 'Капсула Нейро-Фокуса',
    description: 'Полное восстановление концентрации оператора.',
    category: 'comfort',
    basePrice: 940000,
    dataPerHourPerLevel: 860000,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 42.0,
    minLevel: 38,
    iconGlyph: '🛸',
  },
  {
    key: 'orbital_penthouse_station',
    name: 'Станция «Небесный Штаб»',
    description: 'Личный командный модуль на низкой орбите.',
    category: 'comfort',
    basePrice: 4100000,
    dataPerHourPerLevel: 3100000,
    energyMaxPerLevel: 50,
    clickBonusPerLevel: 95.0,
    minLevel: 52,
    iconGlyph: '🚀',
  },

  // ===================== DARKNET (12 — максимальный доход Data, но +Heat при покупке!) =====================
  {
    key: 'scam_exploits',
    name: 'Скам-эксплойты',
    description: 'Агрессивные теневые модули: много Data, +8 Heat при покупке.',
    category: 'darknet',
    basePrice: 95,
    dataPerHourPerLevel: 560,
    clickBonusPerLevel: 0.9,
    heatOnBuy: 8,
    iconGlyph: '☣️',
  },
  {
    key: 'zero_day',
    name: 'Zero-Day Архив',
    description: 'Редчайший пакет уязвимостей симулятора: огромный доход, +12 Heat.',
    category: 'darknet',
    basePrice: 380,
    dataPerHourPerLevel: 1850,
    clickBonusPerLevel: 1.7,
    heatOnBuy: 12,
    iconGlyph: '💀',
  },
  {
    key: 'phantom_proxy',
    name: 'Теневой Шлюз Onion',
    description: 'Скрытая маршрутизация чёрного рынка: +10 Heat.',
    category: 'darknet',
    basePrice: 920,
    dataPerHourPerLevel: 3900,
    heatOnBuy: 10,
    iconGlyph: '🕷️',
  },
  {
    key: 'shadow_market',
    name: 'Даркнет-биржа Дампов',
    description: 'Оптовая торговля синтетическими базами: +14 Heat.',
    category: 'darknet',
    basePrice: 2300,
    dataPerHourPerLevel: 8600,
    clickBonusPerLevel: 2.6,
    heatOnBuy: 14,
    iconGlyph: '🏴‍☠️',
  },
  {
    key: 'crypto_tumbler',
    name: 'Миксер Протоколов',
    description: 'Высокодоходный теневой пул ликвидности: +12 Heat.',
    category: 'darknet',
    basePrice: 5400,
    dataPerHourPerLevel: 17500,
    heatOnBuy: 12,
    iconGlyph: '🎲',
  },
  {
    key: 'black_ice',
    name: 'Вирус «Чёрный Лёд»',
    description: 'Пробивает корпоративные периметры: +16 Heat.',
    category: 'darknet',
    basePrice: 12000,
    dataPerHourPerLevel: 34000,
    clickBonusPerLevel: 4.0,
    heatOnBuy: 16,
    iconGlyph: '🩸',
  },
  {
    key: 'sat_hijack',
    name: 'Орбитальный Перехват',
    description: 'Подключение к вымышленному спутнику связи: +18 Heat.',
    category: 'darknet',
    basePrice: 26000,
    dataPerHourPerLevel: 68000,
    heatOnBuy: 18,
    iconGlyph: '🛰️',
  },
  {
    key: 'red_mercury_core',
    name: 'Ядро «Омега-Дарк»',
    description: 'Запрещённый ИИ-кластер максимальной мощности: +22 Heat.',
    category: 'darknet',
    basePrice: 58000,
    dataPerHourPerLevel: 145000,
    clickBonusPerLevel: 8.0,
    heatOnBuy: 22,
    iconGlyph: '🔥',
  },
  {
    // DEFAULT: Эндгейм-линейка Darknet (колоссальный доход за высокий риск!)
    key: 'ghost_submarine_cable',
    name: 'Врезка в Донный Кабель',
    description: 'Перехват межконтинентального трафика симулятора: +20 Heat.',
    category: 'darknet',
    basePrice: 195000,
    dataPerHourPerLevel: 360000,
    clickBonusPerLevel: 18.0,
    heatOnBuy: 20,
    minLevel: 20,
    iconGlyph: '⚓',
  },
  {
    key: 'shadow_central_ledger',
    name: 'Теневой Центробанк',
    description: 'Подпольный клиринговый узел мегаполиса: +24 Heat.',
    category: 'darknet',
    basePrice: 780000,
    dataPerHourPerLevel: 1080000,
    clickBonusPerLevel: 44.0,
    heatOnBuy: 24,
    minLevel: 32,
    iconGlyph: '🏦',
  },
  {
    key: 'eclipse_satellite_swarm',
    name: 'Рой Спутников «Затмение»',
    description: 'Скрытая теневая группировка ретрансляторов: +26 Heat.',
    category: 'darknet',
    basePrice: 3200000,
    dataPerHourPerLevel: 3400000,
    clickBonusPerLevel: 105.0,
    heatOnBuy: 26,
    minLevel: 44,
    iconGlyph: '🌑',
  },
  {
    key: 'leviathan_protocol',
    name: 'Протокол «Левиафан»',
    description: 'Абсолютная вершина Даркнета — максимальный доход в игре (+30 Heat)!',
    category: 'darknet',
    basePrice: 11500000,
    dataPerHourPerLevel: 9800000,
    clickBonusPerLevel: 260.0,
    heatOnBuy: 30,
    minLevel: 58,
    iconGlyph: '🐉',
  },
];

// ============================================================================
// ПРОГРЕССИЯ КАРТОЧЕК: 4 ГЛОБАЛЬНЫХ ТИРА × ДО 60 УРОВНЕЙ
// ----------------------------------------------------------------------------
// Было (v2): 10 уровней, всё скупалось за вечер.
// v2.1:    25 уровней в 4 Тирах + глобальный индекс цен (исторический потолок).
// v3 (ТЗ):  15/30/45/60 уровней, цена растёт ×1.30 за уровень при базовом
//           множителе ×40, но и вклад уровня в доход растёт геометрически (×1.16).
//           Итог: чтобы дойти до 30–60 уровня, нужны дни и недели.
// Совместимость: все прежние уровни (1..25) читаются как есть, MAX_CARD_LEVEL только вырос.
// ============================================================================
export const MAX_CARD_LEVEL = 60;

export const CARD_TIERS: CardTierConfig[] = [
  {
    tier: 1,
    title: 'Тир I — Подвальный Стенд',
    maxLevel: 15,
    requiredPlayerLevel: 1,
    chipCost: 0,
    dataCost: 0,
    description: 'Базовое железо: до 15 уровней каждого модуля. Дальше нужны Чипы.',
  },
  {
    tier: 2,
    title: 'Тир II — Промышленный Разгон',
    maxLevel: 30,
    requiredPlayerLevel: 10,
    chipCost: 60,
    dataCost: 120_000,
    description: 'Открывает уровни 16–30. Чипы падают только за завершённые взломы.',
  },
  {
    tier: 3,
    title: 'Тир III — Квантовый Арсенал',
    maxLevel: 45,
    requiredPlayerLevel: 22,
    chipCost: 150,
    dataCost: 1_500_000,
    description: 'Уровни 31–45. Требует дисциплины: контракты, а не просто фарм.',
  },
  {
    tier: 4,
    title: 'Тир IV — Теневой Арсенал',
    maxLevel: 60,
    requiredPlayerLevel: 36,
    chipCost: 320,
    dataCost: 12_000_000,
    description: 'Максимальные 60 уровней модулей — вершина инженерной мысли.',
  },
];

export function getCardTierConfig(tier: number): CardTierConfig {
  const safe = Math.max(1, Math.min(CARD_TIERS.length, Math.floor(Number(tier) || 1)));
  return CARD_TIERS[safe - 1];
}

export function getMaxCardLevel(tier: number): number {
  return getCardTierConfig(tier).maxLevel;
}

// Базовая цена за уровень модуля (ТЗ v3: экспоненциальный рост, «моментальных» покупок нет)
export const CARD_PRICE_GROWTH = 1.24;
// Вклад уровня в доход тоже растёт — иначе глубокие уровни (30–60) были бы бессмысленны.
// Итоговый доход карточки = dataPerHourPerLevel * сумма геометрической прогрессии.
export const CARD_LEVEL_INCOME_GROWTH = 1.18;
// Глобальный индекс: чем больше суммарных уровней у игрока, тем дороже следующий уровень ЛЮБОЙ карточки
export const CARD_GLOBAL_INDEX_DIVISOR = 50;
export const CARD_GLOBAL_INDEX_POWER = 1.2;
// Глобальный множитель цен: растягивает всю кривую прогресса.
// ВАЖНО: править цену безопасно — уже купленные уровни и доход игроков не меняются.
export const CARD_PRICE_SCALE = 40;

/**
 * Вес глобального индекса для конкретной карточки.
 * Дешёвое стартовое железо дорожает максимально (нельзя «раскачаться» на копеечных модулях),
 * дорогие эндгейм-модули почти не задевает — иначе топ-карточки стали бы недостижимы навсегда.
 */
function getCardIndexWeight(basePrice: number): number {
  const safe = Math.max(1, Number(basePrice) || 1);
  return Math.max(0, Math.min(1, 1 - Math.log10(safe / 20) / 6));
}

/**
 * Множитель вклада уровня: сумма геометрической прогрессии.
 * Уровень 1 = 1.0, 10 ≈ 4.4, 25 ≈ 60, 60 ≈ 39 000.
 * Благодаря этому прокачка на 40–60 уровень остаётся осмысленной, хотя и дорогой.
 */
export function getCardLevelIncomeMultiplier(level: number): number {
  const safe = Math.max(0, Math.min(MAX_CARD_LEVEL, Math.floor(Number(level) || 0)));
  if (safe <= 0) return 0;
  const growth = CARD_LEVEL_INCOME_GROWTH;
  return (Math.pow(growth, safe) - 1) / (growth - 1);
}

/** Во сколько раз глобальный индекс раздул цену конкретной карточки (для UI). */
export function getCardIndexMultiplier(card: CardConfig, totalCardLevels: number): number {
  const safeTotal = Math.max(0, Number(totalCardLevels) || 0);
  const rawIndex = Math.pow(1 + safeTotal / CARD_GLOBAL_INDEX_DIVISOR, CARD_GLOBAL_INDEX_POWER);
  return 1 + (rawIndex - 1) * getCardIndexWeight(card.basePrice);
}

/**
 * Цена следующего уровня карточки.
 * @param totalCardLevels суммарные уровни всех карточек (глобальный индекс прогресса)
 * @param discountPct скидка от пассивного апгрейда «Термопласта» (0..0.25)
 */
export function getCardPrice(
  card: CardConfig,
  currentLevel: number,
  totalCardLevels = 0,
  discountPct = 0
): number {
  const safeLevel = Math.max(0, Math.min(MAX_CARD_LEVEL, Math.floor(Number(currentLevel) || 0)));
  const safeTotal = Math.max(0, Number(totalCardLevels) || 0);
  const weight = getCardIndexWeight(card.basePrice);
  // Глобальный множитель цен применяется только к дешёвому железу: топовые модули
  // (от миллионов Data) уже стоят дорого, умножать их на 40 — значит сделать недостижимыми.
  const priceScale = 1 + (CARD_PRICE_SCALE - 1) * weight;
  const base = card.basePrice * Math.pow(CARD_PRICE_GROWTH, safeLevel) * priceScale;
  const rawIndex = Math.pow(1 + safeTotal / CARD_GLOBAL_INDEX_DIVISOR, CARD_GLOBAL_INDEX_POWER);
  const globalIndex = 1 + (rawIndex - 1) * weight;
  const safeDiscount = Math.max(0, Math.min(0.25, Number(discountPct) || 0));
  return Math.max(1, Math.floor(base * globalIndex * (1 - safeDiscount)));
}
