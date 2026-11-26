/**
 * HACKER KOMBAT — QA: онбординг первого сеанса (v5.4).
 *
 * Покрывает:
 *  • новый игрок видит онбординг (видимость считается из реальных счётчиков);
 *  • шаги идут строго по порядку: тап → улучшение → контракт;
 *  • после третьего шага оверлей закрывается и отметка сохраняется в stats
 *    (onboarding_done), а не только в памяти клиента;
 *  • фича-флаг onboardingV2 реально гасит гейт;
 *  • залоченные вкладки: гейт активен у новичка и снимается после прогресса;
 *  • защита новичка: Heat > 100 не даёт штрафа, блокировки кликов и потери Data,
 *    а у игрока с карточкой старый штраф работает как раньше;
 *  • первый контракт действительно запускается и длится ≤ 90 секунд.
 *
 * Клиентская логика (src/lib/onboarding.ts) проверяется напрямую: скрипт
 * собирает её esbuild-ом в /tmp и импортирует — без React и без DOM.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const CORE = path.join(ROOT, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

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

// ---------------------------------------------------------------------------
// 1. Клиентская вью-модель: собираем src/lib/onboarding.ts в ESM-модуль.
// ---------------------------------------------------------------------------
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-onboarding-'));
const entryFile = path.join(sandbox, 'entry.ts');
const bundleFile = path.join(sandbox, 'onboarding.mjs');
fs.writeFileSync(
  entryFile,
  [
    `export * from ${JSON.stringify(path.join(ROOT, 'src/lib/onboarding.ts'))};`,
    `export * from ${JSON.stringify(path.join(ROOT, 'shared/config.ts'))};`,
    `export * from ${JSON.stringify(path.join(ROOT, 'shared/onboarding.config.ts'))};`,
    `export * from ${JSON.stringify(path.join(ROOT, 'shared/missions.config.ts'))};`,
  ].join('\n'),
  'utf8'
);
const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: [entryFile],
  outfile: bundleFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'error',
});
const lib = await import(pathToFileURL(bundleFile).href);

function makePlayer(overrides = {}) {
  const base = {
    data: 250,
    crypto: 5,
    chips: 0,
    energy: 1500,
    heat: 0,
    rep: 0,
    cardTier: 1,
    totalClicks: 0,
    totalMissions: 0,
    cards: {},
    activeMissions: [],
    availableMissionKeys: ['scam_shop', 'fake_lottery'],
    stats: {},
    derived: {
      level: 1,
      totalCardLevels: 0,
      clickPower: 3,
      maxCardLevel: 60,
      cardPriceDiscountPct: 0,
    },
  };
  const merged = { ...base, ...overrides };
  merged.derived = { ...base.derived, ...(overrides.derived ?? {}) };
  merged.stats = { ...base.stats, ...(overrides.stats ?? {}) };
  return merged;
}

const fresh = makePlayer();
const tapped = makePlayer({ totalClicks: 1 });
const upgraded = makePlayer({ totalClicks: 1, cards: { monitor: 1 }, derived: { totalCardLevels: 1 } });
const missionStarted = makePlayer({
  totalClicks: 1,
  cards: { monitor: 1 },
  derived: { totalCardLevels: 1 },
  totalMissions: 1,
  activeMissions: [{ missionKey: 'scam_shop' }],
});

check('новый игрок: снимок пустой', JSON.stringify(lib.newPlayerSnapshot(fresh)) === JSON.stringify({ totalCardLevels: 0, totalMissions: 0, totalClicks: 0 }));
check('новый игрок видит онбординг шагом 1', lib.onboardingViewState(fresh).visible === true && lib.onboardingViewState(fresh).step === 1);
check('после первого тапа шаг 2', lib.onboardingViewState(tapped).step === 2 && lib.onboardingViewState(tapped).visible === true);
check('после первой карточки шаг 3 и гейт ещё держится', lib.onboardingViewState(upgraded).step === 3 && lib.onboardingViewState(upgraded).visible === true);
check(
  'после второй карточки гейт снимается сам',
  lib.onboardingViewState(makePlayer({ totalClicks: 2, cards: { monitor: 1, keyboard: 1 }, derived: { totalCardLevels: 2 } })).visible === false
);
check('после старта миссии оверлей закрыт', lib.onboardingViewState(missionStarted).visible === false);
check('шаги не перескакивают: 5 тапов без карточки — всё ещё шаг 2', lib.onboardingViewState(makePlayer({ totalClicks: 5 })).step === 2);

const dismissed = makePlayer({ stats: { onboardingV2Completed: true } });
check('отметка onboardingV2Completed гасит оверлей', lib.onboardingViewState(dismissed).visible === false);

lib.configureFeatureFlags({ onboardingV2: false });
check('флаг onboardingV2=false выключает гейт', lib.onboardingViewState(fresh).visible === false);
lib.configureFeatureFlags({ onboardingV2: true });
check('флаг onboardingV2=true возвращает гейт', lib.onboardingViewState(fresh).visible === true);
check('порог разблокировки вкладок — 2 уровень', lib.ONBOARDING_UNLOCK_LEVEL === 2);

const suggestion = lib.pickUpgradeSuggestion(fresh);
check('подсказка улучшения существует', suggestion !== null && typeof suggestion.card.key === 'string');
check('без денег подсказка — самая дешёвая карточка', suggestion !== null && suggestion.affordable === false, suggestion ? `${suggestion.card.key} · ${suggestion.price}` : '');
const richSuggestion = lib.pickUpgradeSuggestion(makePlayer({ data: 1_000_000 }));
check('с деньгами подсказка доступна по цене', richSuggestion !== null && richSuggestion.affordable === true, richSuggestion ? `${richSuggestion.card.key} · ${richSuggestion.price}` : '');
check(
  'подсказка не дороже самой дешёвой доступной',
  richSuggestion !== null && suggestion !== null && richSuggestion.price <= suggestion.price
);
check(
  'два разных билда дают одну и ту же первую карточку',
  suggestion !== null && richSuggestion !== null && suggestion.card.key === richSuggestion.card.key
);

const starterKey = lib.pickStarterMissionKey(fresh);
const starterDuration = lib.starterMissionDuration(fresh);
check(
  'стартовый контракт ≤ 90 секунд',
  typeof starterKey === 'string' && starterDuration !== null && starterDuration <= 90,
  `${starterKey} · ${starterDuration}s`
);
check('есть конфиг-миссия укладывающаяся в 90 секунд', lib.MISSIONS_CONFIG.some((m) => m.durationSec <= 90 && (m.minLevel ?? 1) <= 1));

// ---------------------------------------------------------------------------
// 2. Сервер: API в memory-режиме.
// ---------------------------------------------------------------------------
const apiSandbox = path.join(sandbox, 'api');
fs.mkdirSync(apiSandbox, { recursive: true });
process.chdir(apiSandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;

const { dispatchApiRequest } = require(CORE);

function makeRes() {
  return {
    statusCode: 200,
    payload: '',
    setHeader() {},
    end(chunk) {
      this.payload = chunk ?? '';
    },
  };
}

async function api(route, body = {}, seed = 'onboarding-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'OnboardingTester',
      'x-forwarded-for': '10.61.0.1',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = makeRes();
  await dispatchApiRequest(req, res);
  try {
    return { ...JSON.parse(res.payload), _status: res.statusCode };
  } catch {
    return { ok: false, error: String(res.payload), _status: res.statusCode };
  }
}

const init = await api('init', {});
check('сервер: новый игрок создан без отметки онбординга', init.ok === true && init.player.stats.onboardingV2Completed !== true);
check('сервер: у нового игрока нет карточек и миссий', init.player.derived.totalCardLevels === 0 && init.player.totalMissions === 0);

const doneRes = await api('track', { event: 'onboarding_done' });
check('сервер: onboarding_done сохраняется в stats', doneRes._status === 200 && doneRes.player.stats.onboardingV2Completed === true);

const doneAgain = await api('init', {});
check('сервер: отметка переживает повторный init', doneAgain.player.stats.onboardingV2Completed === true);

const startRes = await api('missions', { action: 'start', missionKey: starterKey });
check('сервер: стартовый контракт запускается', startRes._status === 200 && Array.isArray(startRes.player.activeMissions));

// ---------------------------------------------------------------------------
// 3. Защита новичка: Heat > 100 в изолированном процессе с заранее засеянной базой.
//    Ядро держит .local-db.json в памяти, поэтому каждую «сценку» поднимаем
//    отдельным процессом: файл пишется ДО первого require(_core.cjs).
// ---------------------------------------------------------------------------
const dbFile = path.join(apiSandbox, '.local-db.json');
const templateDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const templateKey = Object.keys(templateDb.playersByTgId)[0];

const CASE_CODE = `
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;
const { dispatchApiRequest } = require(process.env.HK_CORE);
const req = {
  url: '/api/init',
  method: 'POST',
  headers: {
    host: 'localhost:5173',
    'x-demo-user-id': process.env.HK_SEED,
    'x-demo-username': 'OnboardingTester',
    'x-forwarded-for': '10.61.0.2',
  },
  body: {},
  socket: { remoteAddress: '127.0.0.1' },
  on() {},
};
const res = { statusCode: 200, payload: '', setHeader() {}, end(chunk) { this.payload = chunk ?? ''; } };
dispatchApiRequest(req, res)
  .then(() => process.stdout.write(String(res.payload)))
  .catch((err) => process.stdout.write(JSON.stringify({ ok: false, error: String(err) })));
`;

function runSeededCase(mutate) {
  const dir = fs.mkdtempSync(path.join(sandbox, 'case-'));
  const db = JSON.parse(JSON.stringify(templateDb));
  const record = db.playersByTgId[templateKey];
  record.heat = 0;
  record.data = 1000;
  record.cards = {};
  record.totalMissions = 0;
  record.activeMissions = [];
  record.clickBlockedUntil = null;
  record.stats = { ...record.stats, heatPenalties: 0, onboardingV2Completed: true };
  mutate(record);
  fs.writeFileSync(path.join(dir, '.local-db.json'), JSON.stringify(db));
  const output = execFileSync(process.execPath, ['-e', CASE_CODE], {
    cwd: dir,
    env: { ...process.env, HK_CORE: CORE, HK_SEED: 'onboarding-qa' },
    encoding: 'utf8',
  });
  try {
    return JSON.parse(output);
  } catch {
    return { ok: false, error: output };
  }
}

const newbieCase = runSeededCase((record) => {
  record.heat = 150;
});
check('защита: ответ получен', newbieCase.ok === true, newbieCase.error ?? '');
check('защита: Heat срезан до порога', newbieCase.player?.heat === 100, `heat=${newbieCase.player?.heat}`);
check('защита: клики не заблокированы', newbieCase.player?.clickBlockedUntil === null);
check('защита: штраф не засчитан', newbieCase.player?.stats?.heatPenalties === 0);
check('защита: Data не списана', newbieCase.player?.data === 1000, `data=${newbieCase.player?.data}`);

const punishedCase = runSeededCase((record) => {
  record.heat = 150;
  record.cards = { monitor: 1 };
});
check('контроль: с карточкой штраф срабатывает', punishedCase.player?.stats?.heatPenalties === 1, `penalties=${punishedCase.player?.stats?.heatPenalties}`);
check('контроль: Heat сброшен до 50', punishedCase.player?.heat === 50, `heat=${punishedCase.player?.heat}`);
check('контроль: клики заблокированы', typeof punishedCase.player?.clickBlockedUntil === 'string');
check('контроль: -10% Data', punishedCase.player?.data === 900, `data=${punishedCase.player?.data}`);

const missionedCase = runSeededCase((record) => {
  record.heat = 150;
  record.totalMissions = 1;
});
check('после первой миссии защита снята', missionedCase.player?.stats?.heatPenalties === 1, `penalties=${missionedCase.player?.stats?.heatPenalties}`);

console.log(`\nOnboarding QA: ${pass} pass / ${fail} fail`);
if (fail > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
