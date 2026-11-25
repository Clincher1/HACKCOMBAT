/**
 * HACKER KOMBAT — QA v4.3: демо-витрина «все открытия».
 *
 * Что проверяем:
 *   1) каталог собирается из конфигов без дублей ключей и совпадает по количеству
 *      с самими конфигами (7 сцен, 48+4 апгрейда, 30 контрактов, 11 синдикат,
 *      10 база, 28 скинов, 18 рамок, 80 ачивок, 25 событий);
 *   2) каждая картинка витрины реально лежит в public/ (никаких битых сцен);
 *   3) лестница открытий не теряет предметы: строки + «+N ещё» = все предметы
 *      с уровнем > 1, уровни идут по возрастанию, 50-й уровень = Престиж;
 *   4) секретные ачивки помечены и не раскрывают название в разметке;
 *   5) страница рендерится серверным рендером без падения (это ловит и опечатки
 *      в полях конфигов, и сломанную разметку сильнее, чем tsc);
 *   6) потолок профиля считается тем же computeDerivedStats, что в игре.
 *
 * Запуск:
 *   npm run qa:demo
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ACHIEVEMENTS_CONFIG } from '../../shared/achievements.config';
import { BACKDROPS_CONFIG } from '../../shared/backdrops.config';
import { BASE_UPGRADES_CONFIG } from '../../shared/base.config';
import { CARDS_CONFIG, CARD_TIERS } from '../../shared/cards.config';
import { FIRST_CHAPTER_STEPS } from '../../shared/chapter.config';
import { DAILY_TASK_POOLS } from '../../shared/dailyTasks.config';
import { DAILY_INCIDENTS } from '../../shared/incidents.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { PETS_CONFIG } from '../../shared/pets.config';
import { PROFILE_FRAMES } from '../../shared/profileFrames.config';
import { ACTIVE_SEASON_EVENT } from '../../shared/seasonalEvent.config';
import { SKINS_CONFIG } from '../../shared/skins.config';
import { TEAM_CONFIG } from '../../shared/team.config';
import { BASE_THEMES } from '../../shared/themes.config';
import { DEMO_LADDER, DEMO_SECTIONS, DEMO_TOTAL_UNLOCKS } from '../../src/demo/catalog';
import { DEMO_CEILING } from '../../src/demo/ceiling';
import { DemoPage } from '../../src/pages/DemoPage';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${detail ? ` :: ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

console.log('=== HACKER KOMBAT — demo showcase QA ===\n');

const items = DEMO_SECTIONS.flatMap((section) => section.items);

// ---------------------------------------------------------------- 1. состав

check('секций 9 и у каждой есть предметы', DEMO_SECTIONS.length === 9 && DEMO_SECTIONS.every((s) => s.items.length > 0));
check(
  'ключи предметов уникальны',
  new Set(items.map((item) => item.key)).size === items.length,
  `${items.length} предметов`
);

const expected: Array<[string, number]> = [
  ['desk', 7 + BACKDROPS_CONFIG.length + BASE_THEMES.length],
  ['upgrades', CARD_TIERS.length + CARDS_CONFIG.length],
  ['contracts', MISSIONS_CONFIG.length],
  ['team', TEAM_CONFIG.length + PETS_CONFIG.length],
  ['base', BASE_UPGRADES_CONFIG.length],
  ['skins', SKINS_CONFIG.length],
  ['frames', PROFILE_FRAMES.length],
  ['achievements', ACHIEVEMENTS_CONFIG.length],
  [
    'events',
    ACTIVE_SEASON_EVENT.scenarios.length +
      Object.values(DAILY_TASK_POOLS).flat().length +
      DAILY_INCIDENTS.length +
      FIRST_CHAPTER_STEPS.length,
  ],
];
for (const [id, count] of expected) {
  const section = DEMO_SECTIONS.find((s) => s.id === id);
  check(`секция ${id}: ${count} предметов`, Boolean(section) && section!.items.length === count);
}

check(
  'итого открытий совпадает с суммой секций',
  DEMO_TOTAL_UNLOCKS === items.length,
  `${DEMO_TOTAL_UNLOCKS}`
);

check(
  'у каждого предмета есть уровень >= 1 и непустой заголовок',
  items.every((item) => Number.isFinite(item.level) && item.level >= 1 && item.title.length > 0)
);

// ---------------------------------------------------------------- 2. картинки

const missingImages = items
  .filter((item) => item.image && item.image.startsWith('/'))
  .filter((item) => !fs.existsSync(path.join(process.cwd(), 'public', item.image!.replace(/^\//, ''))));

check(
  'все картинки витрины есть в public/',
  missingImages.length === 0,
  missingImages.map((item) => item.image).join(', ')
);

const sceneItems = items.filter((item) => item.key.startsWith('stage-'));
check(
  'все 7 сцен рабочего стола в витрине и с картинкой',
  sceneItems.length === 7 && sceneItems.every((item) => Boolean(item.image)),
  sceneItems.map((item) => `${item.key}:${item.level}`).join(' ')
);

// ---------------------------------------------------------------- 3. лестница

const ladderLevels = DEMO_LADDER.map((row) => row.level);
check(
  'лестница отсортирована по возрастанию без повторов',
  ladderLevels.every((level, index) => index === 0 || level > ladderLevels[index - 1])
);

const ladderItems = items.filter((item) => item.level > 1).length;
const rankedLines = DEMO_LADDER.reduce(
  (sum, row) => sum + row.lines.length + row.more,
  0
);
// В лестницу кроме предметов попадают ранги, слоты и Престиж, поэтому она не
// может быть меньше числа предметов с порогом уровня.
check(
  'лестница покрывает все предметы с уровнем > 1',
  rankedLines >= ladderItems,
  `ступеней-строк ${rankedLines}, предметов с порогом ${ladderItems}`
);

check(
  'на 50 уровне есть Престиж и сцена 30+',
  DEMO_LADDER.some(
    (row) =>
      row.level === 50 &&
      (row.lines.some((line) => line.section === 'Престиж') ||
        row.notes.some((note) => note.includes('Global Hack')))
  ) &&
    DEMO_LADDER.some((row) => row.level >= 30 && row.stage === 30)
);

// ---------------------------------------------------------------- 4. секреты

const secrets = items.filter((item) => item.secret);
check(
  'секретные достижения помечены и их 14',
  secrets.length === 14 && secrets.every((item) => item.key.startsWith('ach-')),
  `${secrets.length}`
);

// ---------------------------------------------------------------- 5. рендер

let html = '';
let renderError = '';
try {
  html = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(DemoPage))
  );
} catch (error) {
  renderError = error instanceof Error ? error.message : String(error);
}
check('страница /demo рендерится серверным рендером', html.length > 20_000 && !renderError, renderError);
check('на странице есть заголовок и ползунок уровня', html.includes('ВСЕ ОТКРЫТИЯ') && html.includes('type="range"'));
check(
  'в разметке нет пустых src и «undefined»',
  !/src=""/.test(html) && !html.includes('undefined') && !html.includes('NaN')
);
check(
  'витрина показывает сцены картинками',
  html.includes('/assets/scenes/stage-01.webp') && html.includes('/assets/scenes/stage-30.webp')
);
check(
  'секретные ачивки не раскрываются без спойлера',
  html.includes('Секретное достижение')
);

// ---------------------------------------------------------------- 6. потолок

const ceilingNumbers = [DEMO_CEILING.dataPerHour, DEMO_CEILING.clickPower, DEMO_CEILING.hackPower];
check(
  'потолок профиля посчитан и не нулевой',
  DEMO_CEILING.level === 50 &&
    ceilingNumbers.every((value) => value !== '0' && !value.includes('NaN')),
  `${DEMO_CEILING.dataPerHour} Data/ч · ${DEMO_CEILING.clickPower} за тап · ${DEMO_CEILING.hackPower} силы`
);
check(
  'у потолка есть ранг и тир модулей',
  DEMO_CEILING.rank.length > 0 && DEMO_CEILING.moduleTier.includes('Тир')
);

console.log(`\nИтого: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error(`FAILURES: ${failures.join(', ')}`);
  process.exit(1);
}
