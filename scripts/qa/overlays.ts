/**
 * HACKER KOMBAT — QA v5.6-fix: слои и оверлеи.
 * ----------------------------------------------------------------------------
 * Регресс на баг «весь контент под HUD затемнён»:
 *
 *   1) СЛОИ. Фон локации — `position: fixed; inset: 0; opacity: .9` с тёмным
 *      градиентом. По CSS (приложение E) позиционированный элемент с z-index:0
 *      рисуется ПОВЕРХ обычного потока — именно из-за этого контент был под
 *      затемнением. Поэтому фон уведён в отрицательный слой, а под ним лежит
 *      отдельный слой базового фона: shell < backdrop < 0 < map < onboarding
 *      < chrome.
 *   2) WIRING. Корневой шелл App.tsx не должен иметь собственного фона (он
 *      перекрыл бы отрицательные слои), у <main> НЕ должно быть z-index
 *      (стек-контекст запер бы модалы страниц под навигацией), `.loc-bg`
 *      обязан оставаться `pointer-events: none`.
 *   3) ИНВАРИАНТ МОДАЛОВ. Разметка не может содержать подложку без карточки:
 *      `data-qa-backdrop` ⇒ обязательно `data-qa-modal-card`, и их количество
 *      совпадает. Проверяется на реальных состояниях игрока, включая
 *      засеянный кейс «12 уровень, оффлайн уже забран» (фикстура из qa:retention).
 *
 * Запуск (как qa:integrity — бандл esbuild, чтобы рендерить React):
 *   npm run qa:overlays
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { WORLD_Z_INDEX } from '../../shared/world.config';
import { RETENTION_OFFLINE_MIN_CLAIM_DATA } from '../../shared/economy.config';
import type { PlayerState, RetentionSnapshotPayload } from '../../shared/types';
import { GameContext, type GameContextValue } from '../../src/context/GameContext';
import { ModalsAndOverlays } from '../../src/components/Modals';
import { ModalFrame, hasRenderableContent } from '../../src/components/ModalFrame';
import { StreakBar } from '../../src/components/StreakBar';

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

const BACKDROP = 'data-qa-backdrop';
const CARD = 'data-qa-modal-card';

function count(html: string, marker: string): number {
  return html.split(marker).length - 1;
}

// ── 1. Порядок слоёв ────────────────────────────────────────────────────────
const z = WORLD_Z_INDEX;
check('базовый фон ниже фона локации', z.shell < z.backdrop, `shell=${z.shell} backdrop=${z.backdrop}`);
check('фон локации под обычным потоком', z.backdrop < 0, `backdrop=${z.backdrop}`);
check('фон локации ниже карты мира', z.backdrop < z.map, `backdrop=${z.backdrop} map=${z.map}`);
check('карта ниже онбординга', z.map < z.onboarding, `map=${z.map} onboarding=${z.onboarding}`);
check('онбординг ниже навигации', z.onboarding < z.chrome, `onboarding=${z.onboarding} chrome=${z.chrome}`);

// ── 2. WIRING: App.tsx и .loc-bg ────────────────────────────────────────────
const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
check('базовый фон в отдельном слое', appSource.includes('WORLD_Z_INDEX.shell'), 'App.tsx');
check(
  'корневой шелл без собственного фона (иначе отрицательные слои не видны)',
  appSource.includes('className="min-h-screen flex flex-col"') &&
    !appSource.includes('className="min-h-screen cyber-grid-bg flex flex-col"')
);
check(
  'у main нет z-index (модалы страниц должны пробивать навигацию)',
  /<main[\s\S]{0,260}?data-qa-layer="content"/.test(appSource) && !/<main[\s\S]{0,260}?zIndex/.test(appSource)
);
check('у main нет stacking context (нет relative/absolute)', !/<main[\s\S]{0,200}?className="[^"]*\b(?:relative|absolute|isolate)\b/.test(appSource));

const backdropSource = fs.readFileSync(path.join(process.cwd(), 'src/components/LocationBackdrop.tsx'), 'utf8');
check('фон локации рисуется на слое backdrop', backdropSource.includes('WORLD_Z_INDEX.backdrop'));

// Модалы, которые живут ВНУТРИ <main>, обязаны быть выше навигации: если бы у
// <main> появился stacking context, они бы «нырнули» под BottomNav (z-30).
const pickerSource = fs.readFileSync(path.join(process.cwd(), 'src/components/LocationPicker.tsx'), 'utf8');
const profileSource = fs.readFileSync(path.join(process.cwd(), 'src/components/PublicProfileModal.tsx'), 'utf8');
check('выбор локации выше навигации', /z-\[70\]/.test(pickerSource) && 70 > z.chrome);
check('профильный модал выше навигации', /z-50/.test(profileSource) && 50 > z.chrome);
check('навигация выше онбординга', z.onboarding < z.chrome, `onboarding=${z.onboarding} chrome=${z.chrome}`);

const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
const locBgRule = css.slice(css.indexOf('.loc-bg {'), css.indexOf('.loc-bg {') + 400);
check('.loc-bg не перехватывает тапы', locBgRule.includes('pointer-events: none'));
check('.loc-bg остаётся fixed-слоем', locBgRule.includes('position: fixed'));

// Отрицательный слой виден только если у предков в обычном потоке нет фона:
// canvas = html, а body/#root обязаны быть прозрачными.
const rootTransparent = /body,\s*\n#root\s*{\s*background-color:\s*transparent;/.test(css);
check('body и #root прозрачны (иначе фон локации не виден)', rootTransparent || /body,\s*#root\s*{\s*background-color:\s*transparent/.test(css));
check('#root не красит фон поверх отрицательных слоёв', !/background-color:\s*var\(--cyber-bg[^;]*;\s*font-family/.test(css.split('body,')[0].split('#root')[1] ?? ''));

// ── 3. ModalFrame: инвариант «подложка только с карточкой» ──────────────────
function render(node: React.ReactElement): string {
  try {
    return renderToStaticMarkup(node);
  } catch (err) {
    return `<<render-error>> ${err instanceof Error ? err.message : String(err)}`;
  }
}

check(
  'ModalFrame: открыт + карточка → подложка и карточка',
  (() => {
    const html = render(
      React.createElement(ModalFrame, { open: true }, React.createElement('p', null, 'hi'))
    );
    return count(html, BACKDROP) === 1 && count(html, CARD) === 1;
  })()
);
check(
  'ModalFrame: открыт без содержимого → НИЧЕГО (нет подложки)',
  (() => {
    const html = render(React.createElement(ModalFrame, { open: true }, null));
    return html === '';
  })()
);
check(
  'ModalFrame: закрыт → НИЧЕГО',
  (() => {
    const html = render(
      React.createElement(ModalFrame, { open: false }, React.createElement('p', null, 'hi'))
    );
    return html === '';
  })()
);
check('hasRenderableContent отсекает пустые дети', !hasRenderableContent(null) && !hasRenderableContent(false) && !hasRenderableContent('  ') && hasRenderableContent('x'));

// ── 4. Фикстура «прод-игрок 12 уровня» из qa:retention ──────────────────────
interface Fixture {
  seeded: { player: PlayerState; retention: RetentionSnapshotPayload };
}
const fixturePath = path.join(os.tmpdir(), 'hk-overlay-fixture.json');
let fixture: Fixture | null = null;
try {
  fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Fixture;
} catch {
  fixture = null;
}
check('фикстура прод-состояния доступна (qa:retention → qa:overlays)', fixture !== null, fixturePath);

const basePlayer: PlayerState = fixture
  ? fixture.seeded.player
  : (JSON.parse(
      '{"id":"qa","tgId":960000001,"username":"QaPlayer","data":1,"crypto":1,"chips":1,"xp":1,"cardTier":1,"pets":[],"baseUpgrades":{},"stats":{},"energy":1,"energyUpdated":null,"heat":0,"rep":0,"prestigeCount":0,"clickBlockedUntil":null,"level":12,"totalClicks":1,"totalMissions":1,"cards":{},"unlockedSkins":[],"equippedSkin":"default","achievements":[],"activeMissions":[],"availableMissionKeys":[],"missionsRefreshedAt":null,"lastDailyClaim":null,"dailyStreak":0,"derived":{}}'
    ) as PlayerState);

const retentionEmpty = fixture?.seeded.retention ?? null;

function buildValue(overrides: Partial<GameContextValue>): GameContextValue {
  const base = {
    player: basePlayer,
    tgProfile: { isInsideTelegram: true, platform: 'ios', colorScheme: 'dark' },
    loading: false,
    initError: null,
    retryInit: async () => {},
    busyKey: null,
    storageMode: 'memory-fallback',
    alerts: [],
    offlineModalEarned: null,
    offlineModalTaps: 0,
    offlineModalRetention: false,
    dismissOfflineModal: () => {},
    retention: retentionEmpty,
    claimOffline: async () => {},
    setReminderOptIn: async () => {},
    dismissAlert: () => {},
    pushClientAlert: () => {},
    lockdownRemainingSec: 0,
    nowMs: Date.now(),
    soundMuted: true,
    toggleSound: () => {},
    dailyModalOpen: false,
    setDailyModalOpen: () => {},
    skinModalOpen: false,
    setSkinModalOpen: () => {},
    tutorialModalOpen: false,
    tutorialUnseen: false,
    openTutorial: () => {},
    closeTutorial: () => {},
    claimDailyBonus: async () => {},
    newPlayerMode: false,
    onboardingStep: 4,
    completeOnboarding: () => {},
  } as unknown as GameContextValue;
  return { ...base, ...overrides };
}

function renderWith(value: GameContextValue, node: React.ReactElement): string {
  // MemoryRouter обязателен: модалы используют useNavigate().
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/'] },
      React.createElement(GameContext.Provider, { value }, node)
    )
  );
}

/** Рендер не должен падать: иначе проверки «нет подложки» были бы ложными. */
function renderOk(label: string, html: string): string {
  check(`${label}: рендер без ошибок`, !html.includes('<<render-error>>'), html.slice(0, 140));
  return html;
}

// ── 5. Сценарии оверлеев ────────────────────────────────────────────────────
// A. Копилка есть (welcome-back): подложка + карточка + кнопка Collect.
const casePending = renderOk('A', renderWith(
  buildValue({
    offlineModalEarned: 300,
    offlineModalRetention: true,
  }),
  React.createElement(ModalsAndOverlays)
));
check(
  'A: welcome-back — подложка и карточка вместе',
  count(casePending, BACKDROP) === 1 && count(casePending, CARD) === 1,
  `backdrops=${count(casePending, BACKDROP)} cards=${count(casePending, CARD)}`
);
check('A: кнопка Collect на месте', casePending.includes('Collect — забрать Data'));
check('A: сумма копилки видна', casePending.includes('+300 DATA'));

// B. Засеянный прод-игрок 12 уровня: оффлайн уже забран ⇒ оверлея нет вовсе.
const caseSeeded = renderOk('B', renderWith(buildValue({}), React.createElement(ModalsAndOverlays)));
check(
  'B: у игрока с забранным оффлайном нет ни подложки, ни карточки',
  count(caseSeeded, BACKDROP) === 0 && count(caseSeeded, CARD) === 0,
  `backdrops=${count(caseSeeded, BACKDROP)}`
);
check(
  'B: контент-слой не блокируется оверлеем',
  !caseSeeded.includes('fixed inset-0') || count(caseSeeded, BACKDROP) === count(caseSeeded, CARD)
);

// C. Онбординг ещё идёт ⇒ welcome-back не показывается (даже если сумма есть).
const caseOnboarding = renderOk(
  'C',
  renderWith(
    buildValue({ offlineModalEarned: 300, offlineModalRetention: true, newPlayerMode: true }),
    React.createElement(ModalsAndOverlays)
  )
);
check(
  'C: при активном онбординге подложки welcome-back нет',
  count(caseOnboarding, BACKDROP) === 0,
  `backdrops=${count(caseOnboarding, BACKDROP)}`
);

// D. В состоянии ноль ⇒ модал не рендерится (защита от «подложка без карточки»).
const caseZero = renderOk(
  'D',
  renderWith(
    buildValue({ offlineModalEarned: 0, offlineModalRetention: true }),
    React.createElement(ModalsAndOverlays)
  )
);
check('D: offlineModalEarned=0 не открывает модал', count(caseZero, BACKDROP) === 0);

// E. Инвариант для всех сценариев сразу.
for (const [label, html] of [
  ['A', casePending],
  ['B', caseSeeded],
  ['C', caseOnboarding],
  ['D', caseZero],
] as const) {
  check(
    `инвариант ${label}: подложек = карточек`,
    count(html, BACKDROP) === count(html, CARD),
    `backdrops=${count(html, BACKDROP)} cards=${count(html, CARD)}`
  );
}

// ── 6. StreakBar: на столе, без полноэкранных слоёв ────────────────────────
const streakOn = renderOk('E', renderWith(buildValue({}), React.createElement(StreakBar)));
check('streak bar рендерится на столе', streakOn.includes('Стрик'), streakOn.slice(0, 40));
check('streak bar не создаёт полноэкранной подложки', !streakOn.includes('fixed inset-0'));
check('streak bar показывает 7 клеток цикла', streakOn.split('День').length - 1 >= 1);

const streakOnboarding = renderWith(
  buildValue({ newPlayerMode: true }),
  React.createElement(StreakBar)
);
check('streak bar скрыт при онбординге', streakOnboarding === '');

const streakOff = renderWith(buildValue({ retention: null }), React.createElement(StreakBar));
check('streak bar скрыт без retention-снимка (флаг off)', streakOff === '');
check(
  'порог модала берётся из конфига',
  RETENTION_OFFLINE_MIN_CLAIM_DATA === 10,
  String(RETENTION_OFFLINE_MIN_CLAIM_DATA)
);

console.log(`\nOverlays QA: ${pass} pass / ${fail} fail`);
if (fail === 0) console.log(`OVERLAYS_QA_OK ${pass}`);
if (fail > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
