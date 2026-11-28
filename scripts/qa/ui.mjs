/**
 * HACKER KOMBAT — QA v6.9: визуальная дисциплина (HUD, палитра, иконки, шрифт).
 *
 * Проверяет то, что легко «сломать обратно» одним коммитом:
 *   A. ПАЛИТРА. В .tsx нет ни одного hex: цвет берётся только токеном темы
 *      (var(--ui-*)) и смешивается через withAlpha — иначе hex снова начнёт
 *      протекать поверх тем и скинов.
 *   B. ИКОНКИ. Эмодзи не используются как иконки (локации, валюты, статусы,
 *      леденец). В тексте сообщений/алертов/комментариев они допустимы —
 *      сканер их не трогает.
 *   C. ТИПОГРАФИКА. Размеры подписей — только 11/13/16/20/28 px. Никаких
 *      9/10/12 вперемешку и никаких text-xs/sm/base: одна шкала на весь UI.
 *   D. ШРИФТЫ. Russo One — заголовки, Share Tech Mono — числа/код, тело —
 *      системный sans. Оба веб-шрифта поддерживают кириллицу.
 *   E. HUD И НАВИГАЦИЯ. До первого контента не больше 5 интерактивных
 *      элементов, нижнее меню — 5 вкладок с тап-таргетом ≥ 44 px.
 *   F. CSS. Размер файла под контролем, мёртвых правил и «вторых» блоков
 *      prefers-reduced-motion нет.
 *
 * Запуск: npm run qa:ui
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const SRC = path.join(REPO, 'src');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const tsxFiles = walk(SRC).filter((file) => file.endsWith('.tsx'));
const read = (file) => fs.readFileSync(path.join(REPO, file), 'utf8');
const rel = (file) => path.relative(REPO, file);

/** Комментарии не считаются интерфейсом: снимаем их перед сканами. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line.replace(/\s\/\/\s[^'"`]*$/, '')))
    .join('\n');
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{2705}\u{274C}\u{26A0}]/u;
/** Символы-«иконки», которые нельзя оставлять текстом ни в каком виде. */
const ICON_ONLY = /[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}\u{26A0}\u{2713}\u{2714}\u{2718}\u{2611}\u{25CF}\u{25CB}\u{2726}\u{2727}]/u;

console.log('=== HACKER KOMBAT — QA v6.9: визуальная дисциплина ===\n');

// ── A. Палитра ─────────────────────────────────────────────────────────────
const hexOffenders = [];
for (const file of tsxFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  const matches = text.match(HEX);
  if (matches) hexOffenders.push(`${rel(file)}: ${matches.join(', ')}`);
}
check(
  'в .tsx нет ни одного хардкод-hex (только токены темы)',
  hexOffenders.length === 0,
  hexOffenders.slice(0, 4).join(' | ')
);

const cssSrc = read('src/index.css');
const REQUIRED_TOKENS = [
  '--ui-primary',
  '--ui-secondary',
  '--ui-success',
  '--ui-purple',
  '--ui-danger',
  '--ui-warn',
  '--ui-magic',
  '--ui-track',
  '--ui-border-muted',
  '--ui-text-faint',
  '--ui-on-primary',
  '--ui-panel',
  '--ui-panel-deep',
];
check(
  'в теме объявлены все семантические токены',
  REQUIRED_TOKENS.every((token) => cssSrc.includes(`${token}:`)),
  REQUIRED_TOKENS.filter((token) => !cssSrc.includes(`${token}:`)).join(', ')
);

const alphaOffenders = [];
for (const file of tsxFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  // `${color}55` превращается в `var(--x)55` — невалидный цвет. Только withAlpha.
  if (/\$\{[a-zA-Z_.]+\}[0-9a-fA-F]{2}\b/.test(text)) alphaOffenders.push(rel(file));
}
check('прозрачность акцентов считается через withAlpha, а не склейкой hex', alphaOffenders.length === 0, alphaOffenders.join(', '));
const colorsHelper = read('src/lib/colors.ts');
check(
  'helper withAlpha покрывает и конфиг-hex, и токены темы',
  colorsHelper.includes('-rgb)') && colorsHelper.includes('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i')
);

// ── B. Иконки ──────────────────────────────────────────────────────────────
const emojiIconOffenders = [];
for (const file of tsxFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // 1) эмодзи как единственный ребёнок JSX-элемента
    if (new RegExp(`>\\s*${EMOJI.source}+\\s*<`, 'u').test(trimmed)) {
      emojiIconOffenders.push(`${rel(file)}:${index + 1} (jsx-child)`);
      return;
    }
    // 2) иконка в иконочном пропсе (glyph/icon/emoji/symbol)
    const propMatch = trimmed.match(/\b(glyph|icon|emoji|symbol)\s*[:=]\s*['"`]([^'"`]*)['"`]/);
    if (propMatch && ICON_ONLY.test(propMatch[2])) {
      emojiIconOffenders.push(`${rel(file)}:${index + 1} (icon-prop)`);
      return;
    }
    // 3) строковый литерал, состоящий только из эмодзи
    for (const literal of trimmed.match(/['"`]([^'"`]{1,4})['"`]/g) ?? []) {
      const inner = literal.slice(1, -1).trim();
      if (inner && ICON_ONLY.test(inner) && !/[a-zA-Zа-яА-Я0-9]/.test(inner)) {
        emojiIconOffenders.push(`${rel(file)}:${index + 1} (emoji-literal)`);
        return;
      }
    }
  });
}
check(
  'эмодзи не используются в роли иконок (текст сообщений — можно)',
  emojiIconOffenders.length === 0,
  emojiIconOffenders.slice(0, 5).join(' | ')
);

const iconHub = read('src/components/ui-icons.tsx');
check(
  'иконки идут из одного набора (lucide) через один хаб',
  iconHub.includes("from 'lucide-react'") && iconHub.includes('export const LocationIcon') && iconHub.includes('export const StageIcon')
);
check(
  'хаб не плодит компонент-обёртку на каждую иконку',
  (iconHub.match(/const icon =/g) ?? []).length === 0 && /export \{\s*\n?\s*BookOpen as BookIcon/.test(iconHub),
  `${(iconHub.match(/export const \w+ = icon\(/g) ?? []).length} обёрток`
);
const locationConfig = read('shared/world.config.ts');
check(
  'локации: glyph остаётся в данных, но интерфейс рисует иконку',
  iconHub.includes('room: Armchair') &&
    iconHub.includes('beach: Palmtree') &&
    read('src/components/LocationStrip.tsx').includes('LocationIcon') &&
    locationConfig.includes('glyph:')
);

// ── C. Типографика ─────────────────────────────────────────────────────────
const SCALE = new Set(['11', '13', '16', '20', '28']);
const sizeOffenders = [];
const legacyTextClasses = [];
for (const file of tsxFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const match of text.match(/text-\[(\d+(?:\.\d+)?)px\]/g) ?? []) {
    const size = match.match(/(\d+(?:\.\d+)?)px/)[1];
    if (!SCALE.has(size)) sizeOffenders.push(`${rel(file)}:${size}`);
  }
  for (const match of text.match(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl)\b/g) ?? []) {
    legacyTextClasses.push(`${rel(file)}:${match}`);
  }
}
check(
  'все размеры подписей внутри шкалы 11/13/16/20/28 px',
  sizeOffenders.length === 0,
  Array.from(new Set(sizeOffenders)).slice(0, 5).join(', ')
);
check('дефолтных текстовых классов Tailwind в UI нет', legacyTextClasses.length === 0, legacyTextClasses.slice(0, 5).join(', '));

const tooSmall = [];
for (const file of tsxFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  if (/text-\[(8|9|10)px\]/.test(text)) tooSmall.push(rel(file));
}
check('подписей меньше 11 px нет нигде', tooSmall.length === 0, tooSmall.join(', '));

// ── D. Шрифты ──────────────────────────────────────────────────────────────
const html = read('index.html');
check(
  'подключены ровно два веб-шрифта: Russo One (заголовки) и Share Tech Mono (числа)',
  html.includes('family=Russo+One') &&
    html.includes('family=Share+Tech+Mono') &&
    !html.includes('family=Manrope') &&
    !html.includes('family=Inter')
);
check('Russo One — только font-display', /\.font-display \{ font-family: 'Russo One'/.test(cssSrc));
check('Share Tech Mono — только font-num (числа и код)', /\.font-num \{[\s\S]{0,160}Share Tech Mono/.test(cssSrc));
check(
  'тело интерфейса — системный sans (без веб-шрифта)',
  /font-family: ui-sans-serif, system-ui/.test(cssSrc)
);
const cyrillicFonts = read('src/index.css');
check(
  'кириллица: заголовки в Russo One (есть кириллица), числа — цифры/латиница',
  /font-family: 'Russo One'/.test(cyrillicFonts) &&
    !/font-num[^}]*Кириллица-заглушка/.test(cyrillicFonts)
);
const cyrillicInNum = [];
for (const file of tsxFiles) {
  const text = fs.readFileSync(file, 'utf8');
  // в font-num попадают только цифры/латиница: кириллические подписи — рядом, не внутри
  const matches = text.match(/font-num[^"'`>]*>[^<]*[а-яА-Я][^<]*</g) ?? [];
  matches.forEach((fragment) => {
    if (!/[а-яА-Я]/.test(fragment.replace(/font-num[^>]*>/, ''))) return;
    cyrillicInNum.push(`${rel(file)}: ${fragment.slice(0, 40)}`);
  });
}
check(
  'внутри font-num нет кириллицы (у Share Tech Mono её нет — был бы фолбэк)',
  cyrillicInNum.length === 0,
  cyrillicInNum.slice(0, 3).join(' | ')
);

// ── E. HUD и навигация ─────────────────────────────────────────────────────
const hud = read('src/components/TopHud.tsx');
/** Интерактив в HUD = кнопки и ссылки; плитки валют — чтение, а не навигация. */
const hudInteractive = (hud.match(/<(button|Link)\b/g) ?? []).length;
check('HUD: не больше 5 интерактивных элементов до контента', hudInteractive <= 5, `${hudInteractive}`);
check(
  'HUD: валюты — один блок чтения, а не четыре кнопки',
  hud.includes('data-qa="hud-currencies"') && !/currencies\.map\([\s\S]{0,400}<button/.test(hud)
);
check(
  'HUD: скины и звук уехали в профиль',
  !hud.includes('setSkinModalOpen') && !hud.includes('toggleSound') &&
    read('src/pages/ProfilePage.tsx').includes('data-qa="profile-skins"') &&
    read('src/pages/ProfilePage.tsx').includes('data-qa="profile-sound"')
);

const nav = read('src/components/BottomNav.tsx');
const tabCount = (nav.match(/\{ to: '/g) ?? []).length;
check('нижнее меню: ровно 5 вкладок (инвентарь живёт в профиле)', tabCount === 5, `${tabCount}`);
check('нижнее меню: тап-таргет ≥ 44 px и 5 колонок', nav.includes('min-h-[44px]') && nav.includes('grid-cols-5'));
check(
  'вкладки «Инвентарь» нет — вторая дверь в тот же экран убрана',
  // В коде остаются только комментарии-истории (почему убрали), но не вкладка.
  !/to: '\/profile\?tab=inventory'/.test(nav) && !nav.includes('Backpack')
);

const desk = read('src/pages/DeskPage.tsx');
check(
  'стол открывается контентом: сцена → доска → входы → мир',
  desk.indexOf('<DeskScene />') < desk.indexOf('<ContractBoard />') &&
    desk.indexOf('<ContractBoard />') < desk.indexOf('<DeskQuickLinks />') &&
    desk.indexOf('<DeskQuickLinks />') < desk.indexOf('<LocationStrip />')
);
check(
  'входы на столе — две компактные плитки в одном ряду',
  read('src/components/DeskQuickLinks.tsx').includes('grid grid-cols-2') &&
    !fs.existsSync(path.join(SRC, 'components/TasksTeaser.tsx')) &&
    !fs.existsSync(path.join(SRC, 'components/StoryStrip.tsx'))
);

// ── G. Узкие экраны: карточки тем без обрезанного текста ───────────────────
/**
 * Геометрия онбординга и магазина тем считается той же арифметикой, что видит
 * браузер: 3 колонки в модале max-w-lg, p-3/p-5 снаружи, p-3.5/p-5 внутри,
 * p-2.5/p-3 в карточке. Ширины 320–390 px — самые узкие реальные телефоны.
 * Проверяем две вещи, которые заказчик видел срезанными:
 *   1) плашка «бесплатно» — теперь на всю ширину карточки, обязана влезать;
 *   2) «HACKER KOMBAT» — SVG с viewBox, обязан масштабироваться, а не обрезаться.
 */
function themeCardInner(viewport) {
  const narrow = viewport < 640;
  const modalW = Math.min(viewport, 512) - (narrow ? 12 : 20) * 2; // p-3 / sm:p-5
  const contentW = modalW - (narrow ? 14 : 20) * 2; // p-3.5 / sm:p-5
  const gap = narrow ? 8 : 10; // gap-2 / sm:gap-2.5
  const cardW = (contentW - gap * 2) / 3;
  return cardW - (narrow ? 8 : 12) * 2; // p-2 / sm:p-3
}

/** Ширина строки: консервативная оценка (0.62em на символ + трекинг). */
const textWidth = (text, fontSize, letterSpacing = 0) => {
  const perChar = /[А-ЯA-Z]/.test(text[0]) ? 0.72 : 0.62;
  return text.length * fontSize * perChar + Math.max(0, text.length - 1) * letterSpacing;
};

const onboardingSource = read('src/components/ThemeOnboardingModal.tsx');
const shopSource = read('src/components/Modals.tsx');

check(
  'темы: плашка цены — на всю ширину карточки (не может срезаться справа)',
  (onboardingSource.match(/data-qa="theme-price"/g) ?? []).length === 1 &&
    onboardingSource.includes('mt-2 w-full truncate rounded-md px-0.5 py-0.5 text-center') &&
    (shopSource.match(/data-qa="theme-price"/g) ?? []).length === 1 &&
    shopSource.includes('mt-1.5 w-full truncate rounded-md px-1 py-0.5 text-center')
);
check(
  'темы: в верхней строке карточки нет текстового бейджа (только глиф и отметка)',
  !/justify-between gap-1">\s*<span className="text-\[20px\]/.test(onboardingSource) &&
    !onboardingSource.includes('rounded-md bg-black/35 px-1.5 py-0.5 text-[11px] font-bold text-white/85')
);

const priceLabels = ['бесплатно', 'ВЫБРАНО', 'СОХРАНЯЮ', 'ВКЛЮЧЕНО'];
const priceOverflow = [];
for (const viewport of [320, 360, 390, 414]) {
  const inner = themeCardInner(viewport);
  for (const label of priceLabels) {
    // 11 px — минимальный размер шкалы; px-0.5 = 4 px горизонтальных отступов.
    // Заглавные статусы шире строчной «бесплатно» — считаем их по 0.72em.
    const width = textWidth(label, 11, 0) * (label === label.toUpperCase() ? 1 : 1) + 4;
    if (width > inner) priceOverflow.push(`${label}@${viewport}: ${width.toFixed(1)} > ${inner.toFixed(1)}`);
  }
}
check(
  'темы: «бесплатно» и статусы влезают в карточку на 320–414 px',
  priceOverflow.length === 0,
  priceOverflow.join(' | ') || `карточка на 320 px: ${themeCardInner(320).toFixed(1)} px`
);

const logoMatch = onboardingSource.match(/viewBox="0 0 (\d+) (\d+)"/);
const fontSizeMatches = (onboardingSource.match(/fontSize="(\d+(?:\.\d+)?)"/g) ?? []).map((m) => m.match(/[\d.]+/)[0]);
const letterSpacingMatches = (onboardingSource.match(/letterSpacing="(\d+(?:\.\d+)?)"/g) ?? []).map((m) => m.match(/[\d.]+/)[0]);
check(
  'темы: логотип в превью — SVG с viewBox и w-full (масштабируется, а не обрезается)',
  !!logoMatch &&
    onboardingSource.includes('data-qa="theme-preview-logo"') &&
    onboardingSource.includes('className="mx-auto block h-auto w-full"') &&
    onboardingSource.includes('preserveAspectRatio="xMidYMid meet"') &&
    !/text-\[20px\] font-black leading-none tracking/.test(onboardingSource)
);
const logoOverflow = [];
if (logoMatch) {
  const viewBoxWidth = Number(logoMatch[1]);
  const lines = [
    { text: 'HACKER', fontSize: Number(fontSizeMatches[0] ?? 0), letterSpacing: Number(letterSpacingMatches[0] ?? 0) },
    { text: 'KOMBAT', fontSize: Number(fontSizeMatches[1] ?? 0), letterSpacing: Number(letterSpacingMatches[1] ?? 0) },
  ];
  for (const line of lines) {
    // 0.72em на заглавную — запас под Russo One и системный фолбэк.
    const width = line.text.length * line.fontSize * 0.72 + (line.text.length - 1) * line.letterSpacing;
    if (width > viewBoxWidth) logoOverflow.push(`${line.text}: ${width.toFixed(1)} > ${viewBoxWidth}`);
  }
}
check(
  'темы: «HACKER KOMBAT» вписан в viewBox (не выходит за превью)',
  !!logoMatch && logoOverflow.length === 0,
  logoOverflow.join(' | ')
);
check(
  'темы: превью логотипа обрезает по своей рамке, а не по краю карточки',
  /mt-4 min-w-0 overflow-hidden rounded-xl border border-white\/15 bg-black\/25/.test(onboardingSource)
);

// ── H. Инвентарь: заметная кнопка и экран-заготовка ────────────────────────
const hudSource = read('src/components/TopHud.tsx');
const inventorySource = read('src/components/InventoryScreen.tsx');
check(
  'инвентарь: кнопка в HUD рядом с блоком уровня',
  hudSource.includes('data-qa="hud-inventory"') &&
    hudSource.indexOf('data-qa="hud-profile"') < hudSource.indexOf('data-qa="hud-inventory"') &&
    hudSource.indexOf('data-qa="hud-inventory"') < hudSource.indexOf('setDailyModalOpen(true)')
);
check(
  'инвентарь: кнопка ≥ 44 px и иконка из хаба',
  hudSource.includes('inventory-glow grid h-11 w-11 place-items-center') &&
    hudSource.includes('<PackageIcon') &&
    hudSource.includes('aria-label="Инвентарь"')
);
check(
  'инвентарь: подсветка на токенах темы (класс в CSS + prefers-reduced-motion)',
  cssSrc.includes('.inventory-glow') &&
    /@keyframes inventoryGlowPulse/.test(cssSrc) &&
    /--ui-primary-rgb/.test(cssSrc.slice(cssSrc.indexOf('.inventory-glow'))) &&
    /\.inventory-glow \{ animation: none; \}/.test(cssSrc)
);
check(
  'инвентарь: экран открывается через ModalFrame (подложка без карточки невозможна)',
  inventorySource.includes('<ModalFrame') && hudSource.includes('<InventoryScreen open={inventoryOpen}')
);
check(
  'инвентарь: пустая заготовка с понятной заглушкой',
  inventorySource.includes('data-qa="inventory-empty"') &&
    inventorySource.includes("'Инвентарь пуст'") &&
    /Предметы появятся позже/.test(inventorySource)
);
check(
  'инвентарь: механики нет — экран не читает игрока, инвентарь и API',
  !inventorySource.includes('useGame') &&
    !inventorySource.includes('gameApi') &&
    !/inventory\.ownedKeys|player\./.test(inventorySource)
);
check('инвентарь: кнопка закрытия ≥ 44 px', inventorySource.includes('min-h-[44px] min-w-[44px]'));

// ── I. Вне игрового контура: демо-витрины и donations ──────────────────────
check(
  'демо-витрины нет: страница, каталог и QA удалены',
  !fs.existsSync(path.join(SRC, 'pages/DemoPage.tsx')) &&
    !fs.existsSync(path.join(SRC, 'demo')) &&
    !fs.existsSync(path.join(REPO, 'scripts/qa/demo.ts'))
);
const appSource = read('src/App.tsx');
check(
  'демо-роут недоступен: в App нет ни страницы, ни маршрута, ни build-флага',
  !/DemoPage|__HK_DEMO__|'\/demo'|"\/demo"/.test(appSource)
);
const demoMentions = tsxFiles.filter((file) => {
  // Комментарии не считаются интерфейсом (как и в остальных сканах этого сьюта).
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  return /Демо-версия|демо-витрин|все открытия/i.test(text);
});
check(
  'профиль и UI не упоминают демо-версию',
  demoMentions.length === 0 && !read('src/pages/ProfilePage.tsx').includes('to="/demo"'),
  demoMentions.map((file) => rel(file)).join(', ')
);
check(
  'в vite.config нет билд-флага витрины',
  !read('vite.config.mts').includes('__HK_DEMO__') && !read('src/vite-env.d.ts').includes('__HK_DEMO__')
);

// Игровой клиент не знает про таблицу пожертвований бота (v1.1).
const clientDonationRefs = walk(SRC)
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => /donations/i.test(fs.readFileSync(file, 'utf8')));
check(
  'игровой клиент не ссылается на таблицу donations',
  clientDonationRefs.length === 0,
  clientDonationRefs.map((file) => rel(file)).join(', ')
);
// Единственный, кто вправе ходить в таблицу — бот-слой оплаты Stars.
const apiFiles = walk(path.join(REPO, 'api')).filter((file) => file.endsWith('.ts'));
const tableReaders = apiFiles.filter((file) => /\.from\(\s*['"]donations['"]\s*\)/.test(fs.readFileSync(file, 'utf8')));
check(
  'таблицу donations читает только бот-слой (api/_lib/donations.ts)',
  tableReaders.length === 1 && rel(tableReaders[0]) === path.join('api', '_lib', 'donations.ts'),
  tableReaders.map((file) => rel(file)).join(', ')
);

// ── F. CSS ─────────────────────────────────────────────────────────────────
const cssLines = cssSrc.split('\n').length;
check('index.css не разросся (≤ 900 строк после ревизии)', cssLines <= 900, `${cssLines} строк`);
const rmBlocks = (cssSrc.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? []).length;
check('один блок prefers-reduced-motion вместо восьми', rmBlocks === 1, `${rmBlocks}`);
check(
  'мёртвые правила удалены (matrix-column, muse-idle)',
  !cssSrc.includes('matrix-column') && !cssSrc.includes('muse-idle') && !cssSrc.includes('@keyframes matrixFall')
);
const cssWithoutComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
const declaredClasses = new Set((cssWithoutComments.match(/\.([a-zA-Z][\w-]*)/g) ?? []).map((cls) => cls.slice(1)));
const dynamicPrefixes = ['loc-bg-', 'matrix-avatar__', 'rooster-burst', 'fish-burst', 'daily-incident', 'bd-', 'hud-'];
const allSource = tsxFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const deadClasses = Array.from(declaredClasses).filter(
  (cls) =>
    !allSource.includes(cls) &&
    !dynamicPrefixes.some((prefix) => cls.startsWith(prefix)) &&
    !['font-display', 'font-num', 'cyber-grid-bg', 'scanline-overlay', 'no-scrollbar', 'alert-drop', 'loc-bg'].includes(cls)
);
check('в CSS нет классов, которых нет в разметке', deadClasses.length === 0, deadClasses.slice(0, 6).join(', '));

console.log(`\nQA: ${pass + fail} checks — PASS ${pass} / FAIL ${fail}`);
if (fail > 0) {
  console.log('Провалы: ' + failures.join('; '));
  process.exit(1);
}
