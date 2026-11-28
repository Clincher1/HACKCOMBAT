/**
 * HACKER KOMBAT — QA: «сцена стола = текущий этап игрока» (v1.4).
 *
 * Зачем отдельный сьют. До этого пакета границы этапов стола были if-цепочкой
 * внутри shared/mechanics.ts, а подписи — «Ур. 20 — Пентхаус». Игрок Ур. 2 читал
 * «Ур. 20» как свой уровень, а проверить, что сцена переключается ровно на
 * границе 4/5, 9/10, 14/15, 19/20, было нечем: сетки не существовало.
 *
 * Что проверяется:
 *   A. КОНФИГ. Семь этапов, непрерывные границы (1–4, 5–9, 10–14, 15–19,
 *      20–24, 25–29, 30+), арты на месте, 17 webp в public/assets/scenes.
 *   B. ЗАСЕЯННЫЕ ИГРОКИ. Игрок с XP ровно на границе получает этап границы:
 *      4 → этап 1, 5 → этап 2, 9 → этап 2, 10 → этап 3, … 19 → этап 4,
 *      20 → этап 5, 29 → этап 6, 30 → этап 7. Подпись «Этап N/7» без слова
 *      «Уровень», сцена — арт этого этапа.
 *   C. ЛОКАЦИИ. Кадр рабочего места меняется ровно на 20-м этапе, подписи
 *      берутся из конфига, пороги локаций идут по кривой XP, а вход самого
 *      дешёвого контракта в каждом пуле по карману свежему аккаунту.
 *   D. UI И СЕРВЕР. Сцена берёт арт из конфига, чипы этапов подписаны
 *      «Этап N/7», алерт эволюции стола больше не говорит «УР.».
 *
 * Запуск: npm run qa:scenes   (нужен только shared-код, сервер не требуется)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = process.cwd();

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS — ${name}${detail !== '' ? ` :: ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL — ${name}${detail !== '' ? ` :: ${detail}` : ''}`);
  }
}

// ── Сборка shared-конфигов в CJS: QA читает те же правила, что и игра ──────
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-scenes-build-'));
const entry = path.join(build, 'entry.ts');
const sharedPath = (name) => path.join(REPO, 'shared', name).replace(/\\/g, '/');
fs.writeFileSync(
  entry,
  [
    `export * from '${sharedPath('desk-stages.config.ts')}';`,
    `export { computeDeskStage, computeDerivedStats, getDeskStageInfo } from '${sharedPath('mechanics.ts')}';`,
    `export * from '${sharedPath('locations.ts')}';`,
    `export { LOCATIONS, filterMissionsForLocation } from '${sharedPath('world.config.ts')}';`,
    `export { getTotalXpForLevel, getMissionEntryCost, MISSION_ENTRY_MIN_DATA, MISSION_ENTRY_DATA_RATE } from '${sharedPath('hack.config.ts')}';`,
    `export { MISSIONS_CONFIG } from '${sharedPath('missions.config.ts')}';`,
    '',
  ].join('\n')
);
const bundle = path.join(build, 'scenes.cjs');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: REPO, stdio: 'inherit' }
);
const scenes = require(bundle);

console.log('=== HACKER KOMBAT — QA: сцена стола по уровню (v1.4) ===\n');

const sceneFileExists = (url) => {
  const relative = String(url).replace(/^\//, '');
  return fs.existsSync(path.join(REPO, 'public', relative));
};

// ── A. Конфиг этапов ───────────────────────────────────────────────────────
const STAGES = scenes.DESK_STAGES;
check('A1: этапов ровно семь', STAGES.length === 7 && scenes.DESK_STAGE_TOTAL === 7, `${STAGES.length}`);
check(
  'A2: номера этапов идут подряд 1..7',
  STAGES.every((stage, index) => stage.number === index + 1),
  STAGES.map((stage) => stage.number).join(',')
);
check(
  'A3: границы смежные (1–4, 5–9, 10–14, 15–19, 20–24, 25–29, 30+)',
  STAGES[0].fromLevel === 1 &&
    STAGES[STAGES.length - 1].toLevel === null &&
    STAGES.every((stage, index) => {
      if (index === STAGES.length - 1) return stage.toLevel === null;
      return stage.toLevel === STAGES[index + 1].fromLevel - 1;
    }),
  STAGES.map((stage) => `${stage.fromLevel}–${stage.toLevel ?? '∞'}`).join(', ')
);
check(
  'A4: у каждого этапа свой арт из public/assets/scenes',
  STAGES.every((stage) => sceneFileExists(stage.sceneUrl)) &&
    new Set(STAGES.map((stage) => stage.sceneUrl)).size === STAGES.length
);
const sceneFiles = fs.readdirSync(path.join(REPO, 'public/assets/scenes')).filter((file) => file.endsWith('.webp'));
check(
  'A5: в public/assets/scenes ровно 17 webp (7 этапов + 10 кадров локаций)',
  sceneFiles.length === 17,
  `${sceneFiles.length}`
);
check(
  'A6: подпись этапа — «Этап N/7 — Название», без слова «Уровень»',
  STAGES.every((stage) => {
    const title = scenes.deskStageTitle(stage.stage);
    return title.startsWith(`Этап ${stage.number}/7 — ${stage.title}`) && !/Ур(овень)?\./i.test(title);
  })
);

// ── B. Засеянные игроки на границах ───────────────────────────────────────
const BASE = {
  cards: {},
  team: [],
  rep: 0,
  heat: 0,
  data: 250,
  xp: 0,
  prestigeCount: 0,
  equippedSkin: 'default',
  equippedUi: 'default',
  equippedAvatar: 'default',
  baseUpgrades: {},
  cardTier: 1,
  pets: [],
};
const derivedAtLevel = (level) =>
  scenes.computeDerivedStats({ ...BASE, xp: scenes.getTotalXpForLevel(level), nowMs: Date.now() });

/** Ожидаемая сетка: уровень → ключ этапа (границы диапазонов — из ТЗ пакета). */
const EXPECTED = new Map([
  [1, 1],
  [4, 1],
  [5, 5],
  [9, 5],
  [10, 10],
  [14, 10],
  [15, 15],
  [19, 15],
  [20, 20],
  [24, 20],
  [25, 25],
  [29, 25],
  [30, 30],
  [31, 30],
  [50, 30],
]);

const mismatches = [];
for (const [level, expected] of EXPECTED) {
  const derived = derivedAtLevel(level);
  if (derived.level !== level) mismatches.push(`L${level}: кривая XP дала уровень ${derived.level}`);
  if (derived.deskStage !== expected) mismatches.push(`L${level}: этап ${derived.deskStage}, ждали ${expected}`);
}
check(
  'B1: засеянный игрок на границе получает этап этой границы (4/5, 9/10, 14/15, 19/20, 24/25, 29/30)',
  mismatches.length === 0,
  mismatches.join(' | ') || `${EXPECTED.size} уровней`
);

const boundarySwitch = [];
for (const [before, after] of [
  [4, 5],
  [9, 10],
  [14, 15],
  [19, 20],
  [24, 25],
  [29, 30],
]) {
  const a = derivedAtLevel(before);
  const b = derivedAtLevel(after);
  const sceneA = scenes.getDeskStageInfo(a.deskStage).sceneUrl;
  const sceneB = scenes.getDeskStageInfo(b.deskStage).sceneUrl;
  if (a.deskStage === b.deskStage || sceneA === sceneB) {
    boundarySwitch.push(`${before}/${after}: ${sceneA} → ${sceneB}`);
  }
}
check(
  'B2: сцена переключается ровно на границе (и ни на шаг раньше)',
  boundarySwitch.length === 0,
  boundarySwitch.join(' | ')
);

const labelDrift = [];
for (const [level, expected] of EXPECTED) {
  const derived = derivedAtLevel(level);
  const config = scenes.getDeskStageConfig(expected);
  const info = scenes.getDeskStageInfo(derived.deskStage);
  if (info.sceneUrl !== config.sceneUrl) labelDrift.push(`L${level}: сцена ${info.sceneUrl}`);
  if (!info.title.startsWith(`Этап ${config.number}/7`)) labelDrift.push(`L${level}: подпись «${info.title}»`);
}
check('B3: сцена и подпись этапа согласованы с конфигом', labelDrift.length === 0, labelDrift.join(' | '));

const nextLevels = STAGES.map((stage) => scenes.deskStageNextLevel(stage.stage));
check(
  'B4: «следующий этап с Ур. N» ведёт к началу следующего этапа (у 30+ — null)',
  JSON.stringify(nextLevels) === JSON.stringify([5, 10, 15, 20, 25, 30, null]),
  nextLevels.join(',')
);
check(
  'B5: нулевой и отрицательный XP не ломают этап (этап 1)',
  scenes.getDeskStageForLevel(0) === 1 && scenes.getDeskStageForLevel(-7) === 1
);

// ── C. Локации: кадр рабочего места по этапу ─────────────────────────────
const worlds = scenes.listLocationWorlds().filter((world) => world.deskScenes !== null);
const missingLocationArt = worlds.filter(
  (world) => !sceneFileExists(world.deskScenes.early) || !sceneFileExists(world.deskScenes.late)
);
check(
  'C1: у каждого мира с собственным рабочим местом оба кадра на месте',
  worlds.length === 5 && missingLocationArt.length === 0,
  missingLocationArt.map((world) => world.id).join(', ') || `${worlds.length} миров`
);

const tierDrift = [];
for (const world of worlds) {
  const early = scenes.locationDeskScene(world.id, 15);
  const late = scenes.locationDeskScene(world.id, 20);
  if (early?.tier !== 'early' || early?.label !== 'Ноутбук') tierDrift.push(`${world.id}@15: ${early?.tier}`);
  if (late?.tier !== 'late' || late?.label !== 'Полная станция') tierDrift.push(`${world.id}@20: ${late?.tier}`);
  if (scenes.locationDeskScene(world.id, 30)?.url !== late?.url) tierDrift.push(`${world.id}@30`);
}
check(
  'C2: «полная станция» включается ровно на 20-м этапе (этап 5/7)',
  tierDrift.length === 0 && scenes.DESK_LATE_FROM_STAGE === 20,
  tierDrift.join(' | ')
);
check(
  'C3: подписи тиров берутся из конфига, а не из компонента',
  scenes.LOCATION_DESK_TIERS.length === 2 &&
    scenes.LOCATION_DESK_TIERS[1].fromStage === scenes.DESK_LATE_FROM_STAGE &&
    scenes.LOCATION_DESK_TIERS[0].label === 'Ноутбук'
);

const locations = scenes.LOCATIONS;
const thresholds = locations.map((location) => location.minLevel);
const xpAtThresholds = thresholds.map((value) => scenes.getTotalXpForLevel(Math.max(1, value)));
check(
  'C4: пороги локаций растут вместе с кривой XP (0, 1, 5, 10, 20, 40)',
  JSON.stringify(thresholds) === JSON.stringify([0, 1, 5, 10, 20, 40]) &&
    thresholds.every((value, index) => index === 0 || value > thresholds[index - 1]) &&
    // Комната (0) и Улица (1) открыты с нуля XP — монотонность нестрогая.
    xpAtThresholds.every((xp, index) => Number.isFinite(xp) && xp >= 0 && (index === 0 || xp >= xpAtThresholds[index - 1])) &&
    xpAtThresholds[xpAtThresholds.length - 1] > xpAtThresholds[1],
  thresholds.map((value, index) => `Ур.${value}=${xpAtThresholds[index]} XP`).join(', ')
);

const STARTING_DATA = 250;
/**
 * Правило владельца: «на Ур. 2 в Улице игрок должен быть способен оплатить
 * вход и профит». Поэтому проверяем две вещи:
 *   1) вход самого дешёвого контракта каждого пула ≤ 20% его же награды
 *      (не каторга, но и не бесплатно);
 *   2) в стартовых пулах (Комната/Улица/Пляж — открыты до 5 уровня) вход
 *      оплачивается из стартовых 250 Data, без гринда.
 * Для Тех-хаба (Ур. 20) и Корп-квартала (Ур. 40) «свежие 250 Data» — не мера:
 * к этим уровням у игрока миллионы Data по кривой XP, и требовать 250 было бы
 * заведомо ложной проверкой.
 */
const STARTING_POOLS = new Set(['room', 'street', 'beach']);
const affordability = [];
const affordabilityDetails = [];
for (const location of locations) {
  const pool = scenes.filterMissionsForLocation(scenes.MISSIONS_CONFIG, location.id);
  const cheapest = pool.slice().sort((a, b) => a.baseDataReward - b.baseDataReward)[0];
  const entryCost = scenes.getMissionEntryCost(cheapest, cheapest.baseDataReward);
  const share = entryCost.data / cheapest.baseDataReward;
  affordabilityDetails.push(
    `${location.id}: ${entryCost.data}/${cheapest.baseDataReward} (${(share * 100).toFixed(1)}%)`
  );
  if (share > 0.2) affordability.push(`${location.id}: вход ${(share * 100).toFixed(1)}% от награды`);
  if (entryCost.data < scenes.MISSION_ENTRY_MIN_DATA - 1) {
    affordability.push(`${location.id}: вход ниже минимального порога`);
  }
  if (STARTING_POOLS.has(location.id) && entryCost.data > STARTING_DATA) {
    affordability.push(`${location.id}: вход ${entryCost.data} Data > стартовых ${STARTING_DATA}`);
  }
}
check(
  'C5: вход в самый дешёвый контракт ≤20% награды, стартовые пулы — из 250 Data',
  affordability.length === 0,
  affordability.join(' | ') || affordabilityDetails.join(', ')
);

// ── D. UI и сервер читают конфиг, а не хардкод ────────────────────────────
const deskSource = fs.readFileSync(path.join(REPO, 'src/components/DeskScene.tsx'), 'utf8');
const mechanicsSource = fs.readFileSync(path.join(REPO, 'shared/mechanics.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(REPO, 'api/_lib/gameEngine.ts'), 'utf8');

check(
  'D1: сцена берёт арт и подпись из конфига этапов',
  deskSource.includes('getDeskStageInfo(activeStage)') &&
    deskSource.includes('stageInfo.sceneUrl') &&
    deskSource.includes('locationDeskScene(activeLocation.id, activeStage)')
);
check(
  'D2: чипы «Этапы» подписаны номером этапа, а не «Ур.{st}»',
  deskSource.includes('deskStageLabel(st)') &&
    deskSource.includes('deskStageNumber(derived.deskStage)') &&
    !/\}Ур\.\{/.test(deskSource)
);
check(
  'D3: границы этапов не захардкожены в mechanics (делегирование в конфиг)',
  /export function computeDeskStage\(level: number\): DeskStage \{\s*return getDeskStageForLevel\(level\);/.test(
    mechanicsSource
  ) && !/if \(level >= 30\) return 30;/.test(mechanicsSource)
);
check(
  'D4: алерт эволюции стола говорит «Этап N/7», а не «УР.N»',
  engineSource.includes('deskStageLabel(newDerived.deskStage)') &&
    !engineSource.includes('ЭВОЛЮЦИЯ СТОЛА (УР.')
);
/**
 * v1.5 («Чистый стол»): поверх сцены не должно быть НИ ОДНОГО текста про
 * уровни — ни текущего этапа локации, ни требований будущего. Проверяем
 * structural: режем разметку по тап-поверхности и ищем там «Ур.», «До Ур.»,
 * «с Ур.» и тир рабочего места. Плюс отдельно — что чипы уровня не вернулись
 * в шапку сцены над артом.
 */
// Комментарии не интерфейс: историю правки писать можно, проверяем разметку.
const deskMarkup = deskSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => (line.trim().startsWith('//') ? '' : line))
  .join('\n');
const tapStart = deskMarkup.indexOf('data-qa="desk-tap"');
const sceneSurface = tapStart >= 0 ? deskMarkup.slice(tapStart) : '';
check(
  'D5: на сцене стола нет ни одного текста про уровни («Ур.», «До Ур. N», «с Ур. N»)',
  !deskMarkup.includes('До Ур.') &&
    !deskMarkup.includes('Станция: Ур.') &&
    !deskMarkup.includes('Полная станция с Ур.') &&
    !deskMarkup.includes('Следующий этап с Ур.') &&
    !/Ур\./.test(sceneSurface)
);
check(
  'D6: сцена не подписывает тир рабочего места («Ноутбук» / «Полная станция»)',
  !deskMarkup.includes('locationArt.label') && !deskMarkup.includes('± Ноутбук') && !deskMarkup.includes('Ноутбук'),
  'подпись = имя места или название этапа'
);

console.log(`\nQA: ${pass + fail} checks — PASS ${pass} / FAIL ${fail}`);
if (fail > 0) {
  console.log('Провалы: ' + failures.join('; '));
  process.exit(1);
}
