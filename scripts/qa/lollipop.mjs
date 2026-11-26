/**
 * HACKER KOMBAT — QA v6.3: сезонный леденец (×2 Data).
 *
 * Проверяет:
 *   1) активация открывает окно ровно на час и запоминает игровые сутки;
 *   2) повторная активация в тот же день и при активном окне отклоняется;
 *   3) тапы реально удваиваются (сравнение «до/после» на одном игроке);
 *   4) итог взлома удваивается тем же множителем;
 *   5) окно живёт по абсолютному времени: после часа множитель гаснет сам,
 *      накоплений не остаётся, а новая активация доступна только в новые сутки.
 *
 * Ожидания берутся из настоящих shared/season.config.ts и shared/hacks.config.ts
 * через esbuild-мост.
 *
 * Запуск: npm run qa:lollipop
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const CORE = path.join(REPO_ROOT, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-lollipop-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);
const esbuild = require('esbuild');

async function bridge(relative, outName) {
  const outfile = path.join(sandbox, outName);
  esbuild.buildSync({
    entryPoints: [path.join(REPO_ROOT, relative)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
  });
  return import(pathToFileURL(outfile).href);
}

const SEASON = await bridge('shared/season.config.ts', 'season.config.mjs');
const HACKS = await bridge('shared/hacks.config.ts', 'hacks.config.mjs');
const { durationMs, LOLLIPOP_BOOST_MS, LOLLIPOP_MULTIPLIER, isLollipopActive, isSeasonActive } = SEASON;
const { getHackDifficulty, hackDataReward } = HACKS;

const realNow = Date.now;
let fakeNow = Date.parse('2026-11-26T09:00:00Z');
Date.now = () => fakeNow;

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

async function api(route, body = {}, seed = 'lollipop-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'SweetTester',
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

(async () => {
  console.log('=== HACKER KOMBAT — QA v6.3: леденец ×2 ===\n');

  check('сезон включён флагом isSeasonActive', isSeasonActive === true);
  check('сезонное окно — сутки', durationMs === 86_400_000, String(durationMs));

  let player = (await api('init')).player;
  check('у нового игрока леденца нет', !player.stats.lollipop || !player.stats.lollipop.activeUntil);

  // --- базовый тап без буста -------------------------------------------------
  const clickBase = await api('click', { clicks: 20 });
  const baseDelta = clickBase.player.data - player.data;
  // Античит темпа может урезать пачку — сравниваем доход на ОДИН принятый тап.
  const basePerClick = baseDelta / Math.max(1, clickBase.appliedClicks ?? 20);
  check('тапы без леденца начисляются', baseDelta > 0, `+${baseDelta.toFixed(2)} Data за ${clickBase.appliedClicks ?? 20} тапов`);

  // --- активация -------------------------------------------------------------
  const activation = await api('lollipop', { action: 'activate' });
  player = activation.player;
  const state = player.stats.lollipop;
  check('активация проходит', activation.ok === true, activation.error);
  check('окно открыто ровно на час',
    new Date(state.activeUntil).getTime() - fakeNow === LOLLIPOP_BOOST_MS,
    state.activeUntil);
  check('запомнены текущие игровые сутки', /^\d{4}-\d{2}-\d{2}$/.test(state.lastActivatedDayKey), state.lastActivatedDayKey);
  check('сервер считает буст активным', isLollipopActive(state, fakeNow) === true);

  const secondActivation = await api('lollipop', { action: 'activate' });
  check('повторная активация при активном окне отклонена', secondActivation.ok === false, secondActivation.error);

  // --- ×2 на тапах -----------------------------------------------------------
  const boostedClicks = await api('click', { clicks: 20 });
  const boostedDelta = boostedClicks.player.data - player.data;
  const boostedPerClick = boostedDelta / Math.max(1, boostedClicks.appliedClicks ?? 20);
  const clickRatio = boostedPerClick / basePerClick;
  check(
    'тапы во время леденца дают ×2 Data',
    Math.abs(clickRatio - LOLLIPOP_MULTIPLIER) < 0.05,
    `${basePerClick.toFixed(2)} → ${boostedPerClick.toFixed(2)} за тап (×${clickRatio.toFixed(2)})`
  );
  player = boostedClicks.player;

  // --- ×2 на взломе ----------------------------------------------------------
  const easy = getHackDifficulty('easy');
  const startHack = await api('hacks', { action: 'start', difficulty: 'easy' });
  const session = startHack.player?.stats?.hackSession;
  check('сессия взлома открывается для проверки буста', startHack.ok === true && Boolean(session?.id), startHack.error);
  if (session) {
    fakeNow = Math.max(fakeNow, new Date(session.endsAt).getTime()) + 1_000;
    const beforeHack = player.data;
    const finished = await api('hacks', {
      action: 'finish',
      sessionId: session.id,
      safeHits: 2,
      trapHits: 0,
    });
    player = finished.player ?? player;
    const hackDelta = player.data - beforeHack;
    const expected = hackDataReward(easy, 2) * LOLLIPOP_MULTIPLIER;
    check(
      'итог взлома удвоен сервером',
      hackDelta >= expected && hackDelta <= expected + 200,
      `+${hackDelta.toFixed(2)} vs ожидание +${expected}`
    );
    check('в состоянии сессии лежит удвоенная награда',
      (player.stats.hackSession?.dataGained ?? 0) === expected,
      String(player.stats.hackSession?.dataGained));
  }

  // --- истечение -------------------------------------------------------------
  fakeNow += LOLLIPOP_BOOST_MS + 1_000;
  const afterExpiry = await api('init');
  player = afterExpiry.player;
  check('после часа буст гаснет сам', isLollipopActive(player.stats.lollipop, fakeNow) === false);

  const expiredClicks = await api('click', { clicks: 20 });
  const expiredDelta = expiredClicks.player.data - player.data;
  const expiredPerClick = expiredDelta / Math.max(1, expiredClicks.appliedClicks ?? 20);
  check(
    'после истечения тапы снова обычные',
    Math.abs(expiredPerClick / basePerClick - 1) < 0.05,
    `${expiredPerClick.toFixed(2)} vs ${basePerClick.toFixed(2)} за тап`
  );
  check('накоплений не осталось',
    Object.keys(player.stats.lollipop).sort().join(',') === 'activeUntil,lastActivatedDayKey',
    Object.keys(player.stats.lollipop).join(','));

  const sameDayActivation = await api('lollipop', { action: 'activate' });
  check('в те же сутки второй леденец не дают', sameDayActivation.ok === false, sameDayActivation.error);

  // --- новые сутки -----------------------------------------------------------
  fakeNow += durationMs;
  const nextDay = await api('lollipop', { action: 'activate' });
  check('в новые сутки леденец снова доступен', nextDay.ok === true, nextDay.error);
  check('новое окно снова на час',
    new Date(nextDay.player.stats.lollipop.activeUntil).getTime() - fakeNow === LOLLIPOP_BOOST_MS);

  Date.now = realNow;
  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})().finally(() => {
  Date.now = realNow;
});
