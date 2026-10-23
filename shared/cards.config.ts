import type { CardCategory, CardConfig } from './types';

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
    subtitle: 'Железо и вычислительные узлы',
    accentColor: '#00f0ff',
    iconUrl: '/assets/cards/hardware.svg',
  },
  {
    id: 'software',
    label: 'Software',
    subtitle: 'Софт, автоматизация и ИИ',
    accentColor: '#7dff00',
    iconUrl: '/assets/cards/software.svg',
  },
  {
    id: 'comfort',
    label: 'Comfort',
    subtitle: 'Бусты CPU Energy (до 5000) и фокуса',
    accentColor: '#ff00a0',
    iconUrl: '/assets/cards/comfort.svg',
  },
  {
    id: 'darknet',
    label: 'Darknet',
    subtitle: 'Сверхдоход Data + рост розыска (Heat)',
    accentColor: '#ff3b6b',
    iconUrl: '/assets/cards/darknet.svg',
  },
];

// 32 карточки (по 8 в каждой категории = сетка 2×4, макс. уровень карточки = 10)
// Сумма макс. уровней = 320 -> макс. уровень игрока = 65 (позволяет комфортно достичь 50 ур. для Global Hack Престижа)
export const CARDS_CONFIG: CardConfig[] = [
  // ===================== HARDWARE (8) =====================
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
    // DEFAULT: расширение линейки Hardware для сетки 2x4 и прогрессии до 50 уровня
    key: 'quantum_cooler',
    name: 'Крио-охлаждение',
    description: 'Держит частоты процессора на пике без троттлинга.',
    category: 'hardware',
    basePrice: 1600,
    dataPerHourPerLevel: 4600,
    iconGlyph: '❄️',
  },
  {
    // DEFAULT
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
    // DEFAULT
    key: 'neural_chip',
    name: 'Нейро-сопроцессор',
    description: 'Тензорный модуль нового поколения.',
    category: 'hardware',
    basePrice: 8500,
    dataPerHourPerLevel: 19500,
    clickBonusPerLevel: 3.0,
    iconGlyph: '🧠',
  },

  // ===================== SOFTWARE (8) =====================
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
    description: 'Виртуальный рой воркеров генерирует Data каждую минуту.',
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
    // DEFAULT
    key: 'poly_compiler',
    name: 'Полиморф-движок',
    description: 'Динамическая пересборка модулей на лету.',
    category: 'software',
    basePrice: 3400,
    dataPerHourPerLevel: 9400,
    iconGlyph: '🧬',
  },
  {
    // DEFAULT
    key: 'packet_sniffer',
    name: 'Спектральный Анализатор',
    description: 'Извлекает ценные пакеты из фонового шума сети.',
    category: 'software',
    basePrice: 7600,
    dataPerHourPerLevel: 18200,
    iconGlyph: '📡',
  },
  {
    // DEFAULT
    key: 'quantum_decryptor',
    name: 'Квантовый Дешифратор',
    description: 'Мгновенный подбор ключей в игровом симуляторе.',
    category: 'software',
    basePrice: 16500,
    dataPerHourPerLevel: 36000,
    clickBonusPerLevel: 4.5,
    iconGlyph: '🔮',
  },

  // ===================== COMFORT (8 — дают +50 Energy Max за уровень => ровно до 5000!) =====================
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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

  // ===================== DARKNET (8 — огромный доход Data, но +Heat при покупке!) =====================
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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
    // DEFAULT
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
];

export const MAX_CARD_LEVEL = 10;

// Формула цены строго по разделу 4.2 ТЗ: base_price * 1.5^level
export function getCardPrice(card: CardConfig, currentLevel: number): number {
  return Math.floor(card.basePrice * Math.pow(1.5, currentLevel));
}
