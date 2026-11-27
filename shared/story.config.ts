/**
 * HACKER KOMBAT — сюжет (v6.8).
 *
 * Единственный источник правды для глав, шагов и реплик мира: ни компонент, ни
 * движок не пишут названия руками. Экран «История» импортирует этот файл
 * (ленивый чанк), а сервер считает по нему же награды, поэтому UI не может
 * разойтись с начислениями.
 *
 * Правила файла:
 *  • шаг не вводит новой механики: требование — это факт уже существующей
 *    прогрессии (уровень, тапы, контракты, серые взломы, уровни карточек,
 *    команда, петы, достижения, побег от Heat);
 *  • факты монотонны, а награда выдаётся один раз по списку claimed — значит
 *    старый сейв получает корректный прогресс без миграции и без потерь;
 *  • Data-награда задана в ЧАСАХ дохода и пересчитывается через pricing.config,
 *    чтобы награда за главу не устаревала при ребалансе цен.
 *
 * Хранение: players.stats.storyClaimed / storyChaptersPaid / storySeen — обычный
 * jsonb, новой таблицы и миграции не требуется.
 */
import { expectedHourlyIncome } from './pricing.config';
import type { PlayerState } from './types';

/** Факт прогрессии, который может требовать шаг. */
export type StoryFactKey =
  | 'level'
  | 'clicks'
  | 'missions'
  | 'greyMissions'
  | 'cardLevels'
  | 'teamSize'
  | 'pets'
  | 'petFeedings'
  | 'achievements'
  | 'bestHeatEscape';

export interface StoryFacts {
  level: number;
  clicks: number;
  missions: number;
  greyMissions: number;
  cardLevels: number;
  teamSize: number;
  pets: number;
  petFeedings: number;
  achievements: number;
  bestHeatEscape: number;
}

export interface StoryRequirement {
  key: StoryFactKey;
  value: number;
  /** Что видит игрок: «200 тапов», «3 контракта». */
  label: string;
}

/**
 * Награда шага/главы. Data — в часах дохода уровня главы: при ребалансе цен
 * (v6.6) награда остаётся «полчаса-два часа игры», а не случайным числом.
 */
export interface StoryReward {
  dataHours?: number;
  crypto?: number;
  chips?: number;
}

export interface StoryStep {
  /** Глобально уникальный id вида `<arc>:<n>` — он же ключ в stats.storyClaimed. */
  id: string;
  title: string;
  /** Короткая сцена: 2–4 предложения хакерского нуара. */
  scene: string;
  requirement: StoryRequirement;
  reward: StoryReward;
}

export interface StoryArc {
  id: string;
  /** 0 — Пролог, дальше по порядку. */
  order: number;
  title: string;
  subtitle: string;
  cover: string;
  /** Уровень, с которого глава открывается. */
  requiredLevel: number;
  /** Одна строка «состояние мира» после прохождения главы. */
  flavor: string;
  steps: StoryStep[];
  /** Награда за всю главу — выдаётся вместе с последним шагом, один раз. */
  reward: StoryReward;
}

/** Строка мира до первой закрытой главы. */
export const STORY_OPENING_LINE = 'Город ещё не знает твоего имени. Пока.';

export const STORY_ARCS: StoryArc[] = [
  {
    id: 'prologue',
    order: 0,
    title: 'Пролог · Холодный старт',
    subtitle: 'Первое железо, первый след, первый шум в сети',
    cover: '🧊',
    requiredLevel: 1,
    flavor: 'Терминал собран, след оставлен. Сеть запомнила твой почерк.',
    steps: [
      {
        id: 'prologue:1',
        title: 'Собери терминал',
        scene:
          'Первое железо пахнет пылью и припоем. Собирай не для красоты — для дела: без рабочей станции город тебя не услышит. Потом будет поздно объяснять, что ты просто мимо шёл.',
        requirement: { key: 'cardLevels', value: 1, label: '1 уровень карточки' },
        reward: { dataHours: 0.25, crypto: 2 },
      },
      {
        id: 'prologue:2',
        title: 'Оставь первый след',
        scene:
          'Сеть полна мелких целей: поддельные витрины, фальшивые лотереи, форумы, где торгуют чужими паролями. Возьми одну и уйди тихо. Первый след не должен стать последним.',
        requirement: { key: 'missions', value: 1, label: '1 контракт' },
        reward: { dataHours: 0.25, crypto: 2 },
      },
      {
        id: 'prologue:3',
        title: 'Услышь шум в сети',
        scene:
          'Между строк служебного трафика — ритм. Он не случайный: кто-то уже слушает твой канал. Дорасти до третьего уровня и пойми, чей это почерк.',
        requirement: { key: 'level', value: 3, label: '3 уровень' },
        reward: { dataHours: 0.3, crypto: 3 },
      },
    ],
    reward: { dataHours: 0.5, crypto: 5 },
  },
  {
    id: 'first-contact',
    order: 1,
    title: 'Глава 1 · Первый контакт',
    subtitle: 'В сети появился второй голос',
    cover: '📡',
    requiredLevel: 2,
    flavor: 'В сети есть второй голос. Он знает, что ты здесь, и пока молчит.',
    steps: [
      {
        id: 'first-contact:1',
        title: 'Разомни руки',
        scene:
          'Шестьдесят тапов — это не работа, это разминка. Пальцы должны помнить клавиши раньше, чем голова решит, что устала.',
        requirement: { key: 'clicks', value: 60, label: '60 тапов' },
        reward: { dataHours: 0.25, crypto: 2 },
      },
      {
        id: 'first-contact:2',
        title: 'Три заказа подряд',
        scene:
          'Заказы приходят по одному, чтобы ты не почувствовал ритма. Возьми три — и почувствуй. Ритм важнее денег: деньги уходят, ритм остаётся.',
        requirement: { key: 'missions', value: 3, label: '3 контракта' },
        reward: { dataHours: 0.3, crypto: 3 },
      },
      {
        id: 'first-contact:3',
        title: 'Пять уровней железа',
        scene:
          'Железо растёт медленнее, чем надежда. Пять уровней в карточках — это первый раз, когда стол начинает отвечать тебе взаимностью.',
        requirement: { key: 'cardLevels', value: 5, label: '5 уровней карточек' },
        reward: { dataHours: 0.35, crypto: 3 },
      },
      {
        id: 'first-contact:4',
        title: 'Пятый уровень',
        scene:
          'Пятый уровень открывает район, где контракты пахнут деньгами, а не пылью. Не оборачивайся, когда услышишь шаги за спиной: это могут быть свои.',
        requirement: { key: 'level', value: 5, label: '5 уровень' },
        reward: { dataHours: 0.4, crypto: 4 },
      },
    ],
    reward: { dataHours: 0.75, crypto: 8 },
  },
  {
    id: 'signal-noise',
    order: 2,
    title: 'Глава 2 · Шум в эфире',
    subtitle: 'Relay передаёт привет короткими пакетами',
    cover: '📶',
    requiredLevel: 8,
    flavor: 'Relay отвечает короткими пакетами. Кто-то передаёт тебе привет из эфира.',
    steps: [
      {
        id: 'signal-noise:1',
        title: 'Четыре сотни тапов',
        scene:
          'Четыреста ударов по клавишам — это уже не разминка, это разговор. Сеть слушает, как ты дышишь, и делает выводы.',
        requirement: { key: 'clicks', value: 400, label: '400 тапов' },
        reward: { dataHours: 0.3, crypto: 3 },
      },
      {
        id: 'signal-noise:2',
        title: 'Десять контрактов',
        scene:
          'Десять закрытых контрактов — первый рубеж, после которого тебя начинают узнавать не по нику, а по почерку. Дальше слухи работают быстрее, чем твой терминал.',
        requirement: { key: 'missions', value: 10, label: '10 контрактов' },
        reward: { dataHours: 0.35, crypto: 4 },
      },
      {
        id: 'signal-noise:3',
        title: 'Двадцать пять уровней',
        scene:
          'Двадцать пять уровней в карточках — это уже станция, а не ноутбук на коленях. Такие вещи замечают даже корпоративные сканеры.',
        requirement: { key: 'cardLevels', value: 25, label: '25 уровней карточек' },
        reward: { dataHours: 0.4, crypto: 4 },
      },
      {
        id: 'signal-noise:4',
        title: 'Серый контракт',
        scene:
          'Серые заказы — не преступление и не подвиг, а тест на аккуратность. Никто не спросит, зачем ты это сделал. Спросят, почему оставил след.',
        requirement: { key: 'greyMissions', value: 1, label: '1 серый взлом' },
        reward: { dataHours: 0.45, crypto: 5 },
      },
      {
        id: 'signal-noise:5',
        title: 'Девятый уровень',
        scene:
          'Relay молчит ровно столько, сколько нужно, чтобы ты начал сомневаться. Девятый уровень — и ты снова слышишь его между пакетами.',
        requirement: { key: 'level', value: 9, label: '9 уровень' },
        reward: { dataHours: 0.5, crypto: 6 },
      },
    ],
    reward: { dataHours: 1, crypto: 12 },
  },
  {
    id: 'people-in-shadow',
    order: 3,
    title: 'Глава 3 · Люди в тени',
    subtitle: 'Первый человек, которому можно звонить в три ночи',
    cover: '🕶️',
    requiredLevel: 15,
    flavor: 'У тебя есть человек, которому можно звонить в три ночи. Это дороже любого канала.',
    steps: [
      {
        id: 'people-in-shadow:1',
        title: 'Найми специалиста',
        scene:
          'Один человек в команде — это уже не одиночество, а обязательство. Платить придётся не только Data: доверием тоже.',
        requirement: { key: 'teamSize', value: 1, label: '1 специалист в команде' },
        reward: { dataHours: 0.4, crypto: 4 },
      },
      {
        id: 'people-in-shadow:2',
        title: 'Двадцать пять контрактов',
        scene:
          'Двадцать пять контрактов — это репутация, которую нельзя купить. Её можно только испортить одной поспешной ночью.',
        requirement: { key: 'missions', value: 25, label: '25 контрактов' },
        reward: { dataHours: 0.4, crypto: 5 },
      },
      {
        id: 'people-in-shadow:3',
        title: 'Шестьдесят уровней',
        scene:
          'Шестьдесят уровней в карточках. Твой стол уже похож на пункт управления, а не на мебель.',
        requirement: { key: 'cardLevels', value: 60, label: '60 уровней карточек' },
        reward: { dataHours: 0.5, crypto: 5 },
      },
      {
        id: 'people-in-shadow:4',
        title: 'Накорми пета',
        scene:
          'Питомец не помогает в взломе, он помогает не сойти с ума. Покорми его — и заметишь, что мир стал на один шум тише.',
        requirement: { key: 'petFeedings', value: 1, label: '1 кормление пета' },
        reward: { dataHours: 0.35, crypto: 4 },
      },
      {
        id: 'people-in-shadow:5',
        title: 'Шестнадцатый уровень',
        scene:
          'Люди в тени не любят громких. Шестнадцатый уровень — тот порог, где тебя начинают приглашать, а не находить.',
        requirement: { key: 'level', value: 16, label: '16 уровень' },
        reward: { dataHours: 0.6, crypto: 7 },
      },
    ],
    reward: { dataHours: 1.25, crypto: 18 },
  },
  {
    id: 'data-market',
    order: 4,
    title: 'Глава 4 · Рынок данных',
    subtitle: 'Тишина тоже товар — и у неё есть цена',
    cover: '💾',
    requiredLevel: 22,
    flavor: 'Ты научился продавать тишину. Осторожно: тишина — тоже товар.',
    steps: [
      {
        id: 'data-market:1',
        title: 'Две тысячи тапов',
        scene:
          'Две тысячи тапов ночью, когда город спит, а лента не заканчивается. Монотонность — это отдельный навык, и он у тебя появляется.',
        requirement: { key: 'clicks', value: 2000, label: '2 000 тапов' },
        reward: { dataHours: 0.4, crypto: 5 },
      },
      {
        id: 'data-market:2',
        title: 'Пятьдесят контрактов',
        scene:
          'Пятьдесят закрытых заказов. В этом бизнесе цифра «пятьдесят» открывает двери, а цифра «пятьдесят один» — счета.',
        requirement: { key: 'missions', value: 50, label: '50 контрактов' },
        reward: { dataHours: 0.5, crypto: 6 },
      },
      {
        id: 'data-market:3',
        title: 'Пять серых',
        scene:
          'Серые взломы — про аккуратность. Пять штук без провала — почерк, по которому тебя начнут узнавать заказчики.',
        requirement: { key: 'greyMissions', value: 5, label: '5 серых взломов' },
        reward: { dataHours: 0.55, crypto: 6 },
      },
      {
        id: 'data-market:4',
        title: 'Двадцать достижений',
        scene:
          'Достижения — это не трофеи, а чек-пойнты. Двадцать штук — и ты сам можешь рассказать свою историю без вранья.',
        requirement: { key: 'achievements', value: 20, label: '20 достижений' },
        reward: { dataHours: 0.5, crypto: 6 },
      },
      {
        id: 'data-market:5',
        title: 'Сто двадцать уровней',
        scene:
          'Сто двадцать уровней в карточках — станция, которую уже сдают в аренду. Главное — не забудь, где ты сам живёшь.',
        requirement: { key: 'cardLevels', value: 120, label: '120 уровней карточек' },
        reward: { dataHours: 0.7, crypto: 8 },
      },
    ],
    reward: { dataHours: 1.5, crypto: 24 },
  },
  {
    id: 'quiet-week',
    order: 5,
    title: 'Глава 5 · Тихая неделя',
    subtitle: 'Неделя без сирен — значит, кто-то готовит счёт',
    cover: '🌫️',
    requiredLevel: 30,
    flavor: 'Неделя без сирен. Слишком тихо: значит, кто-то уже готовит счёт.',
    steps: [
      {
        id: 'quiet-week:1',
        title: 'Девяносто контрактов',
        scene:
          'Девяносто заказов — это привычка. Привычки опасны тем, что перестаёшь проверять зеркало заднего вида.',
        requirement: { key: 'missions', value: 90, label: '90 контрактов' },
        reward: { dataHours: 0.5, crypto: 6 },
      },
      {
        id: 'quiet-week:2',
        title: 'Три специалиста',
        scene:
          'Трое в команде — и появляется то, чего не было: чужое мнение. Иногда оно спасает рейд, иногда срывает его.',
        requirement: { key: 'teamSize', value: 3, label: '3 специалиста' },
        reward: { dataHours: 0.55, crypto: 7 },
      },
      {
        id: 'quiet-week:3',
        title: 'Двести двадцать уровней',
        scene:
          'Двести двадцать уровней в карточках. Ты давно не считаешь вентиляторы: ты считаешь, сколько выдержит сеть.',
        requirement: { key: 'cardLevels', value: 220, label: '220 уровней карточек' },
        reward: { dataHours: 0.6, crypto: 7 },
      },
      {
        id: 'quiet-week:4',
        title: 'Десять серых',
        scene:
          'Десять серых взломов — это уже не тест, а профессия. Серый город платит ровно столько, сколько стоит твоя тишина.',
        requirement: { key: 'greyMissions', value: 10, label: '10 серых взломов' },
        reward: { dataHours: 0.7, crypto: 8 },
      },
      {
        id: 'quiet-week:5',
        title: 'Тридцать первый уровень',
        scene:
          'Тридцать первый уровень — и тишина лопается: кто-то снова включил сирены. Готовься, но не спеши.',
        requirement: { key: 'level', value: 31, label: '31 уровень' },
        reward: { dataHours: 0.8, crypto: 9 },
      },
    ],
    reward: { dataHours: 2, crypto: 32 },
  },
  {
    id: 'night-market',
    order: 6,
    title: 'Глава 6 · Ночной рынок',
    subtitle: 'Рынок знает твой ник; утро делает вид, что нет',
    cover: '🌙',
    requiredLevel: 38,
    flavor: 'Ночной рынок знает твой ник. Утро делает вид, что не знает.',
    steps: [
      {
        id: 'night-market:1',
        title: 'Сто пятьдесят контрактов',
        scene:
          'Сто пятьдесят заказов. Ты уже не спрашиваешь «зачем», ты спрашиваешь «сколько времени на подготовку».',
        requirement: { key: 'missions', value: 150, label: '150 контрактов' },
        reward: { dataHours: 0.6, crypto: 7 },
      },
      {
        id: 'night-market:2',
        title: 'Два питомца',
        scene:
          'Два питомца — это уже маленький зоопарк на ставке. Они не помогают взламывать, они помогают возвращаться домой.',
        requirement: { key: 'pets', value: 2, label: '2 питомца' },
        reward: { dataHours: 0.6, crypto: 8 },
      },
      {
        id: 'night-market:3',
        title: 'Триста восемьдесят уровней',
        scene:
          'Триста восемьдесят уровней в карточках. Соседи думают, что у тебя серверная. Соседи правы.',
        requirement: { key: 'cardLevels', value: 380, label: '380 уровней карточек' },
        reward: { dataHours: 0.7, crypto: 8 },
      },
      {
        id: 'night-market:4',
        title: 'Сорок достижений',
        scene:
          'Сорок достижений — и биография пишется сама. Осталось решить, кому её показывать.',
        requirement: { key: 'achievements', value: 40, label: '40 достижений' },
        reward: { dataHours: 0.7, crypto: 9 },
      },
      {
        id: 'night-market:5',
        title: 'Тридцать девятый уровень',
        scene:
          'Тридцать девятый уровень. Ночной рынок закрывается ровно перед рассветом — но у тебя есть ключ от чёрного хода.',
        requirement: { key: 'level', value: 39, label: '39 уровень' },
        reward: { dataHours: 0.9, crypto: 10 },
      },
    ],
    reward: { dataHours: 2.5, crypto: 45 },
  },
  {
    id: 'corp-perimeter',
    order: 7,
    title: 'Глава 7 · Корпоративный периметр',
    subtitle: 'Город переписывает тебя в свои схемы — на равных',
    cover: '🏙️',
    requiredLevel: 45,
    flavor: 'Периметр взят. Город переписал тебя в свои схемы — теперь на равных.',
    steps: [
      {
        id: 'corp-perimeter:1',
        title: 'Двести двадцать контрактов',
        scene:
          'Двести двадцать заказов. В корпоративном квартале такие числа обсуждают шёпотом — и записывают в отчёт.',
        requirement: { key: 'missions', value: 220, label: '220 контрактов' },
        reward: { dataHours: 0.7, crypto: 8 },
      },
      {
        id: 'corp-perimeter:2',
        title: 'Двадцать серых',
        scene:
          'Двадцать серых взломов — это уже статистика, а статистику корпорации уважают больше, чем людей. Кто-то в башне начал считать тебя строкой в отчёте.',
        requirement: { key: 'greyMissions', value: 20, label: '20 серых взломов' },
        reward: { dataHours: 0.8, crypto: 9 },
      },
      {
        id: 'corp-perimeter:3',
        title: 'Шестьсот уровней',
        scene:
          'Шестьсот уровней в карточках. Терминал гудит ровно, как хороший кондиционер в чужом кабинете.',
        requirement: { key: 'cardLevels', value: 600, label: '600 уровней карточек' },
        reward: { dataHours: 0.9, crypto: 10 },
      },
      {
        id: 'corp-perimeter:4',
        title: 'Уйти от погони',
        scene:
          'Хороший оператор не тот, кто не палится, а тот, кто уходит на восьмидесятом Heat и не теряет шаг. Проверь себя.',
        requirement: { key: 'bestHeatEscape', value: 80, label: 'уйти от Heat 80' },
        reward: { dataHours: 1, crypto: 11 },
      },
      {
        id: 'corp-perimeter:5',
        title: 'Шесть специалистов',
        scene:
          'Шесть специалистов — это уже не команда, а маленькая фирма. Фирмы не взламывают, фирмы договариваются.',
        requirement: { key: 'teamSize', value: 6, label: '6 специалистов' },
        reward: { dataHours: 1.1, crypto: 12 },
      },
      {
        id: 'corp-perimeter:6',
        title: 'Пятидесятый уровень',
        scene:
          'Пятидесятый уровень — ворота Global Hack. За ними город сбрасывает старые правила, но не забывает долги. Смотри, что останется после.',
        requirement: { key: 'level', value: 50, label: '50 уровень' },
        reward: { dataHours: 1.5, crypto: 15 },
      },
    ],
    reward: { dataHours: 3, crypto: 60 },
  },
];

/** Быстрый доступ по id (сервер ищет шаг по нему, а не перебором в цикле). */
const STEP_INDEX = new Map<string, { arc: StoryArc; step: StoryStep }>();
for (const arc of STORY_ARCS) {
  for (const step of arc.steps) STEP_INDEX.set(step.id, { arc, step });
}

export function findStoryStep(stepId: string): { arc: StoryArc; step: StoryStep } | null {
  return STEP_INDEX.get(stepId) ?? null;
}

export function getStoryArc(arcId: string): StoryArc | null {
  return STORY_ARCS.find((arc) => arc.id === arcId) ?? null;
}

export function storyStepIds(arc: StoryArc): string[] {
  return arc.steps.map((step) => step.id);
}

export const STORY_TOTAL_STEPS = STEP_INDEX.size;

/**
 * Факты берём только из серверного состояния: клиент не может «прислать»
 * прогресс, он присылает лишь id шага.
 */
export function storyFactsFromPlayer(
  player: Pick<PlayerState, 'derived' | 'totalClicks' | 'totalMissions' | 'team' | 'pets' | 'stats' | 'achievements'>
): StoryFacts {
  return {
    level: player.derived.level,
    clicks: player.totalClicks,
    missions: player.totalMissions,
    greyMissions: player.stats.greyMissions,
    cardLevels: player.derived.totalCardLevels,
    teamSize: player.team.length,
    pets: player.pets.length,
    petFeedings: player.stats.petFeedings,
    achievements: player.achievements.length,
    bestHeatEscape: player.stats.bestHeatEscape,
  };
}

export function isStoryStepMet(step: StoryStep, facts: StoryFacts): boolean {
  return facts[step.requirement.key] >= step.requirement.value;
}

/** Data-награда из «часов дохода» уровня главы (см. pricing.config). */
export function storyDataReward(reward: StoryReward, arcLevel: number): number {
  if (!reward.dataHours || reward.dataHours <= 0) return 0;
  return Math.max(0, Math.round(expectedHourlyIncome(arcLevel) * reward.dataHours));
}

/** Подпись награды для карточки шага: без выдуманных чисел — считаем по той же формуле. */
export function describeStoryReward(reward: StoryReward, arcLevel: number): string {
  const parts: string[] = [];
  const data = storyDataReward(reward, arcLevel);
  if (data > 0) parts.push(`+${data.toLocaleString('ru-RU')} Data`);
  if (reward.crypto) parts.push(`+${reward.crypto} 💎`);
  if (reward.chips) parts.push(`+${reward.chips} ⚙️`);
  return parts.join(' · ');
}

export interface StoryStepView extends StoryStep {
  met: boolean;
  claimed: boolean;
  /** Прогресс факта: 200/400 — чтобы UI не считал сам. */
  progress: number;
}

export interface StoryArcView extends Omit<StoryArc, 'steps'> {
  open: boolean;
  steps: StoryStepView[];
  doneCount: number;
  complete: boolean;
  bonusPaid: boolean;
  claimableIds: string[];
}

/**
 * Полная картина сюжета для одного игрока. Чистая функция: одинаково работает
 * на клиенте (экран «История») и на сервере (проверка награды).
 */
export function buildStoryViews(facts: StoryFacts, claimed: string[], bonusPaid: string[]): StoryArcView[] {
  const claimedSet = new Set(claimed);
  const paidSet = new Set(bonusPaid);
  return STORY_ARCS.map((arc) => {
    const steps: StoryStepView[] = arc.steps.map((step) => ({
      ...step,
      met: isStoryStepMet(step, facts),
      claimed: claimedSet.has(step.id),
      progress: Math.min(step.requirement.value, facts[step.requirement.key]),
    }));
    const open = facts.level >= arc.requiredLevel;
    const doneCount = steps.filter((step) => step.claimed).length;
    return {
      ...arc,
      open,
      steps,
      doneCount,
      complete: doneCount === steps.length,
      bonusPaid: paidSet.has(arc.id),
      claimableIds: steps.filter((step) => step.met && !step.claimed).map((step) => step.id),
    };
  });
}

/** Что писать на столе: флавор последней закрытой главы (мир отвечает на прогресс). */
export function getStoryWorldLine(views: StoryArcView[]): string {
  const closed = views.filter((arc) => arc.complete);
  if (closed.length === 0) return STORY_OPENING_LINE;
  return closed[closed.length - 1].flavor;
}

/** Текущая глава: первая открытая и незакрытая, иначе последняя. */
export function getCurrentStoryArc(views: StoryArcView[]): StoryArcView {
  return (
    views.find((arc) => arc.open && !arc.complete) ??
    views.filter((arc) => arc.open).slice(-1)[0] ??
    views[0]
  );
}

export interface StorySnapshot {
  /** Текущая глава и её состояние. */
  arcId: string;
  title: string;
  subtitle: string;
  cover: string;
  requiredLevel: number;
  flavor: string;
  done: number;
  total: number;
  /** Игрок уже дошёл до уровня главы. */
  open: boolean;
  /** Сколько шагов можно забрать прямо сейчас (для бейджа на столе). */
  claimable: number;
  completedArcs: number;
  totalArcs: number;
}

export function buildStorySnapshot(facts: StoryFacts, claimed: string[], bonusPaid: string[]): StorySnapshot {
  const views = buildStoryViews(facts, claimed, bonusPaid);
  const current = getCurrentStoryArc(views);
  return {
    arcId: current.id,
    title: current.title,
    subtitle: current.subtitle,
    cover: current.cover,
    requiredLevel: current.requiredLevel,
    flavor: getStoryWorldLine(views),
    done: current.doneCount,
    total: current.steps.length,
    open: current.open,
    claimable: views.reduce((sum, arc) => sum + (arc.open ? arc.claimableIds.length : 0), 0),
    completedArcs: views.filter((arc) => arc.complete).length,
    totalArcs: views.length,
  };
}
