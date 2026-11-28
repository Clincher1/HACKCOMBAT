/**
 * HACKER KOMBAT — семь этапов рабочего стола (v1.4, пакет «Правки прогона»).
 * ----------------------------------------------------------------------------
 * Зачем отдельный файл. До этого границы этапов жили в `computeDeskStage`
 * (if-цепочка внутри shared/mechanics.ts), а подписи — в `getDeskStageInfo`.
 * Из-за этого «этап стола» в интерфейсе назывался «Ур. 20», и игрок Ур. 2
 * читал «Ур. 20 — Пентхаус» как свой уровень: одно слово означало две разные
 * вещи. Теперь слово «уровень» принадлежит игроку, а стол подписан
 * «Этап N/7», и границы этапов заданы одним списком в конфиге.
 *
 * Правила файла:
 *  • только данные и чистые функции, без DOM/React: импортируют и клиент, и
 *    сервер (gameEngine пишет алерт эволюции стола), и QA;
 *  • ключ этапа (`stage`) — это УРОВЕНЬ ИГРОКА, на котором этап начинается:
 *    так уже устроены ключи коллекции (`stage:10`) и иконки этапов, и ломать
 *    их ради косметики нельзя. Номер в цепочке (`number`) — отдельное поле;
 *  • сцена этапа — ровно тот арт, который открыт на этом уровне. Никакого
 *    «превью будущего» вместо текущего: превью живёт отдельным флагом UI и
 *    включается только для уже открытых этапов.
 */

/** Ключ этапа = уровень игрока, с которого этап начинается. */
export type DeskStage = 1 | 5 | 10 | 15 | 20 | 25 | 30;

/** Сколько всего этапов стола — цифра в подписи «Этап 3/7». */
export const DESK_STAGE_TOTAL = 7;

export interface DeskStageConfig {
  /** Ключ этапа (уровень начала). */
  stage: DeskStage;
  /** Номер этапа в цепочке 1..7. */
  number: number;
  /** С какого уровня игрока этап текущий (включительно). */
  fromLevel: number;
  /** Последний уровень, на котором этап ещё текущий; null — верхней границы нет. */
  toLevel: number | null;
  /** Название стола без слова «уровень». */
  title: string;
  /** Одна строка про то, что изменилось. */
  subtitle: string;
  /** Арт из public/assets/scenes (17 webp: 7 этапов дома + 10 кадров локаций). */
  sceneUrl: string;
}

const SCENE_BASE = '/assets/scenes';

/**
 * Семь этапов. Границы — ровно те, что были в computeDeskStage, но теперь
 * они написаны явно (1–4, 5–9, 10–14, 15–19, 20–24, 25–29, 30+), поэтому их
 * можно проверять сеткой, а не читать if-цепочку.
 */
export const DESK_STAGES: readonly DeskStageConfig[] = [
  {
    stage: 1,
    number: 1,
    fromLevel: 1,
    toLevel: 4,
    title: 'Подпольный Старт',
    subtitle: 'Один монитор, закат за окном и первый заказ',
    sceneUrl: `${SCENE_BASE}/stage-01.webp`,
  },
  {
    stage: 5,
    number: 2,
    fromLevel: 5,
    toLevel: 9,
    title: 'Второй Монитор',
    subtitle: 'Второй монитор и бирюзовый неон под столом',
    sceneUrl: `${SCENE_BASE}/stage-05.webp`,
  },
  {
    stage: 10,
    number: 3,
    fromLevel: 10,
    toLevel: 14,
    title: 'Локальный Кластер',
    subtitle: 'Своя серверная стойка у окна с видом на залив',
    sceneUrl: `${SCENE_BASE}/stage-10.webp`,
  },
  {
    stage: 15,
    number: 4,
    fromLevel: 15,
    toLevel: 19,
    title: 'Тихая Веранда',
    subtitle: 'Второй монитор на веранде, закат над водой',
    sceneUrl: `${SCENE_BASE}/stage-15.webp`,
  },
  {
    stage: 20,
    number: 5,
    fromLevel: 20,
    toLevel: 24,
    title: 'Пентхаус',
    subtitle: 'Три монитора, кресло и панорама залива',
    sceneUrl: `${SCENE_BASE}/stage-20.webp`,
  },
  {
    stage: 25,
    number: 6,
    fromLevel: 25,
    toLevel: 29,
    title: 'Серверный Бункер',
    subtitle: 'Бункер под городом: свой дата-центр',
    sceneUrl: `${SCENE_BASE}/stage-25.webp`,
  },
  {
    stage: 30,
    number: 7,
    fromLevel: 30,
    toLevel: null,
    title: 'Командный Зал',
    subtitle: 'Панорамный зал, закат над бухтой и вся команда рядом',
    sceneUrl: `${SCENE_BASE}/stage-30.webp`,
  },
] as const;

/** Ключи этапов в порядке эволюции — единственный источник для UI-перечислений. */
export const DESK_STAGE_KEYS: readonly DeskStage[] = DESK_STAGES.map((item) => item.stage);

function safeLevel(level: unknown): number {
  const raw = Math.floor(Number(level));
  return Number.isFinite(raw) && raw > 1 ? raw : 1;
}

/** Текущий этап по уровню игрока. Сцена отражает этап, а не желаемое будущее. */
export function getDeskStageForLevel(level: unknown): DeskStage {
  const safe = safeLevel(level);
  let current: DeskStage = 1;
  for (const item of DESK_STAGES) {
    if (safe >= item.fromLevel) current = item.stage;
  }
  return current;
}

/** Конфиг этапа по ключу (неизвестный ключ → первый этап). */
export function getDeskStageConfig(stage: unknown): DeskStageConfig {
  return DESK_STAGES.find((item) => item.stage === stage) ?? DESK_STAGES[0];
}

/** Номер этапа в цепочке 1..7. */
export function deskStageNumber(stage: unknown): number {
  return getDeskStageConfig(stage).number;
}

/** Подпись «Этап 3/7» — без слова «уровень». */
export function deskStageLabel(stage: unknown): string {
  const config = getDeskStageConfig(stage);
  return `Этап ${config.number}/${DESK_STAGE_TOTAL}`;
}

/** Подпись сцены: «Этап 3/7 — Локальный Кластер». */
export function deskStageTitle(stage: unknown): string {
  const config = getDeskStageConfig(stage);
  return `${deskStageLabel(config.stage)} — ${config.title}`;
}

/** Уровень игрока, на котором откроется следующий этап; null — это последний. */
export function deskStageNextLevel(stage: unknown): number | null {
  const config = getDeskStageConfig(stage);
  const next = DESK_STAGES.find((item) => item.number === config.number + 1);
  return next ? next.fromLevel : null;
}
