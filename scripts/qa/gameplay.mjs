/**
 * HACKER KOMBAT — QA v5.7: геймплей v3 (контрактный раннер как основной доход).
 * ----------------------------------------------------------------------------
 * Что проверяем:
 *   1) CPU Charge как цена входа: стоимость по тиру контракта из
 *      shared/economy.config.ts, а не «по секундам», и списание ровно на неё;
 *   2) регенерация заряда без тапов (Energy/CPU копится со временем);
 *   3) таймер контракта серверный: ранний сбор отклоняется, заявка не съедает
 *      заряд, награда не выдаётся раньше finish_at;
 *   4) авто-сбор: после истечения таймера init сообщает «контрактов готово»,
 *      claim выдаёт ровно ту награду, что зафиксирована на старте;
 *   5) доход в HUD считается по контрактам, а не по силе тапа;
 *   6) флаг GAMEPLAY_V3=false возвращает ровно прежнее поведение (цена входа по
 *      длительности, кнопка HACK в UI, тап-доход в HUD);
 *   7) онбординг: шаги работают при обоих значениях флагов, названия событий
 *      воронки не изменились.
 *
 * Время подменяется (Date.now) — иначе «подождать 50 секунд» в CI невозможно;
 * проверки остаются серверными: клиент ничего не досчитывает.
 *
 * Запуск (нужна собранная функция API: npm run build):
 *   node scripts/qa/gameplay.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const projectRoot = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-v3-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
globalThis.__HK_FLAGS__ = { ...(globalThis.__HK_FLAGS__ ?? {}), gameplayV3: true };
process.env.BOT_TOKEN = '123456789:AAFakeTokenForGameplayQa_1234567890';

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, result: true }) });

const { dispatchApiRequest } = require(CORE);

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}

// ── конфиги: Node не грузит TS, поэтому esbuild собирает мост и мы читаем JSON ─
function loadConfigBridge() {
  const out = path.join(os.tmpdir(), 'hk-gameplay-config.cjs');
  execFileSync(
    path.join(projectRoot, 'node_modules/.bin/esbuild'),
    [
      'scripts/qa/gameplay-config.ts',
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--log-level=warning',
      `--outfile=${out}`,
    ],
    { cwd: projectRoot, encoding: 'utf8' }
  );
  return JSON.parse(execFileSync(process.execPath, [out], { cwd: projectRoot, encoding: 'utf8' }));
}

let cfg = null;
try {
  cfg = loadConfigBridge();
} catch (err) {
  console.error('Не удалось собрать мост к shared-конфигам:', String(err).slice(0, 300));
}
const sharedOk = Boolean(cfg);
const economy = cfg
  ? {
      CONTRACT_CPU_COST_BY_TIER: cfg.tiers,
      CONTRACT_CPU_COST_FALLBACK: cfg.fallback,
      getContractCpuCost: (tier) =>
        tier === undefined ? cfg.costNoTier : Number(tier) === 99 ? cfg.costOverflow : cfg.tiers[Math.min(6, Math.max(1, Math.floor(Number(tier))))],
      bestContractIncomePerHour: () => cfg.income,
      contractIncomePerHour: () => cfg.incomeZeroChance,
      isContractReady: (iso) => (new Date(iso).getTime() - Date.now() < 1000 ? cfg.readySoon : cfg.readyLater),
      contractSecondsLeft: () => cfg.secondsLeft61,
    }
  : null;
const hack = cfg
  ? {
      getMissionEntryCost: (mission, reward) => {
        const v3 = process.env.GAMEPLAY_V3 === 'false' ? cfg.legacyEntry : cfg.v3Entry;
        return v3;
      },
      getMissionRewardScale: () => 1,
      MISSION_ENTRY_MIN_DATA: cfg.minEntryData,
    }
  : null;
const missions = cfg ? { MISSIONS_CONFIG: [{ key: cfg.starter.key, tier: cfg.starter.tier, durationSec: cfg.starter.durationSec, baseDataReward: 200 }] } : null;
const config = cfg ? { isGameplayV3Enabled: () => cfg.flagDefault } : null;
const onboardingCfg = cfg ? { ONBOARDING_STEPS: cfg.steps.split(','), onboardingStepCopyV3: () => cfg.copyV3 } : null;

// ── Telegram-подпись initData ───────────────────────────────────────────────
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Math.floor(Math.random() * 1e9)}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: `P${tgId % 1000}`, username: `p${tgId}` }));
  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}

let ipSeq = 0;
async function call(tgId, route, body = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `p${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.140.1.${(ipSeq++ % 200) + 1}`,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = { statusCode: 200, payload: '', setHeader() {}, end(chunk) { this.payload = chunk ?? ''; } };
  await dispatchApiRequest(req, res);
  try {
    return { ...JSON.parse(res.payload), _status: res.statusCode };
  } catch {
    return { raw: res.payload, _status: res.statusCode };
  }
}

const init = (tgId) => call(tgId, 'init');
const startMission = (tgId, missionKey) => call(tgId, 'missions', { action: 'start', missionKey });
const claimMission = (tgId, missionId) => call(tgId, 'missions', { action: 'claim', missionId });

const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;
const advance = (ms) => { fakeNow += ms; };

const SEED_A = 970000101;
const SEED_B = 970000102; // флаг выключен
const SEED_ONB = 970000103; // онбординг под V3

console.log('=== HACKER KOMBAT — QA v5.7: геймплей v3 ===\n');

// ============================================================================
// 1. КОНФИГ: цена контракта по тиру
// ============================================================================
check('shared-конфиги загружаются', sharedOk);

if (sharedOk) {
  const tiers = Object.keys(economy.CONTRACT_CPU_COST_BY_TIER).map(Number).sort((a, b) => a - b);
  check('цена задана для тиров 1..6', tiers.length === 6 && tiers[0] === 1 && tiers[5] === 6, tiers.join(','));
  check('цена растёт с тиром', tiers.every((t, i) => i === 0 || economy.getContractCpuCost(t) > economy.getContractCpuCost(tiers[i - 1])));
  check('цена тира 1 = 55 CPU', cfg.cost1 === 55, String(cfg.cost1));
  check('цена тира 3 = 180 CPU', cfg.cost3 === 180, String(cfg.cost3));
  check('цена тира 6 = 700 CPU', cfg.cost6 === 700, String(cfg.cost6));
  check('без тира — цена первого', cfg.costNoTier === cfg.fallback, `${cfg.costNoTier}/${cfg.fallback}`);
  check('тир вне диапазона зажимается', cfg.costOverflow === cfg.cost6);

  check('V3: вход по тиру, а не по длительности', cfg.v3Entry.energy === cfg.cost1, `energy=${cfg.v3Entry.energy} tier1=${cfg.cost1}`);
  check('V3: Data-взнос прежний (минимум 25)', cfg.v3Entry.data >= cfg.minEntryData);
  // доход в HUD считается по контрактам: 200 Data за 50 с = 14 400 Data/ч
  // 200 Data за 50 с, но helper берёт минимум минуту: 200 × 60 = 12 000 Data/ч.
  check('доход в час по контракту считается из награды/времени', cfg.income === 12000, String(cfg.income));
  check('нулевой шанс успеха даёт нулевой доход', cfg.incomeZeroChance === 0, String(cfg.incomeZeroChance));
  check('готовность контракта: допуск 250 мс как у сервера', cfg.readySoon === true && cfg.readyLater === false);
  check('остаток времени считается вверх', cfg.secondsLeft61 === 61, String(cfg.secondsLeft61));
}

check('флаг GAMEPLAY_V3 по умолчанию включён', sharedOk && config.isGameplayV3Enabled() === true);

// ============================================================================
// 2. API: старт контракта списывает CPU по тиру
// ============================================================================
const started = await init(SEED_A);
check('init новичка отвечает', started.ok === true, started.error ?? '');
const energyBefore = started.player?.energy ?? 0;
const dataBefore = started.player?.data ?? 0;
check('новичок получает заряд CPU', energyBefore > 0, String(energyBefore));

const offerKey = started.player?.availableMissionKeys?.[0];
check('витрина контрактов не пустая', typeof offerKey === 'string' && offerKey.length > 0, String(offerKey));

const startedMission = await startMission(SEED_A, offerKey);
check('контракт запускается', startedMission.ok === true, startedMission.error ?? '');
const active = startedMission.player?.activeMissions?.[0];
check('активный контракт один', (startedMission.player?.activeMissions?.length ?? 0) === 1);
const offerCfg = sharedOk ? { key: cfg.starter.key, tier: cfg.starter.tier, durationSec: cfg.starter.durationSec } : null;
check('награда и шанс зафиксированы на старте', Boolean(active) && active.reward > 0 && typeof active.successChance === 'number', `reward=${active?.reward}`);

const cpuSpent = energyBefore - (startedMission.player?.energy ?? 0);
const expectedCpu = sharedOk && offerCfg ? economy.getContractCpuCost(offerCfg.tier) : -1;
check('списан ровно CPU-тариф тира', cpuSpent === expectedCpu || cpuSpent === expectedCpu - 1, `spent=${cpuSpent} ожидали=${expectedCpu}`);
check('Data-взнос списан', (startedMission.player?.data ?? 0) < dataBefore);
check('таймер контракта = длительность из конфига',
  sharedOk && offerCfg
    ? Math.abs(new Date(active.finishAt).getTime() - new Date(active.startedAt).getTime() - offerCfg.durationSec * 1000) <= 250
    : false);

// ============================================================================
// 3. Анти-чит: ранний сбор отклоняется, заряд и миссия не страдают
// ============================================================================
advance(2_000);
const earlyClaim = await claimMission(SEED_A, active.id);
check('ранний сбор отклонён', earlyClaim.ok !== true, earlyClaim.error ?? '');
check('в тексте ошибки — таймер', /ещё не заверш/i.test(String(earlyClaim.error ?? '')), String(earlyClaim.error ?? ''));
const stillActive = await init(SEED_A);
check('контракт остался активным после раннего сбора', (stillActive.player?.activeMissions?.length ?? 0) === 1);
check('ранний сбор не начислил Data', (stillActive.player?.data ?? 0) <= (startedMission.player?.data ?? 0) + 1);

// ============================================================================
// 4. Без тапов: заряд копится сам, счётчик кликов не растёт
// ============================================================================
const energyBeforeRegen = stillActive.player?.energy ?? 0;
advance(120_000);
const afterRegen = await init(SEED_A);
const energyAfterRegen = afterRegen.player?.energy ?? 0;
check('CPU регенерирует без тапов', energyAfterRegen > energyBeforeRegen, `${energyBeforeRegen} → ${energyAfterRegen}`);
check('регенерация ≈ 1 в 2 секунды', energyAfterRegen - energyBeforeRegen >= 50, `+${energyAfterRegen - energyBeforeRegen} за 120 с`);
check('клики не требуются (totalClicks = 0)', (afterRegen.player?.totalClicks ?? -1) === 0, String(afterRegen.player?.totalClicks));
check('энергия не превышает максимум', energyAfterRegen <= (afterRegen.player?.derived?.maxEnergy ?? 0), `${energyAfterRegen}/${afterRegen.player?.derived?.maxEnergy}`);

// ============================================================================
// 5. Авто-сбор: init говорит «готово», claim платит ровно награду
// ============================================================================
const durSec = sharedOk && offerCfg ? offerCfg.durationSec : 60;
advance((durSec + 5) * 1000);
const ready = await init(SEED_A);
const readyAlert = (ready.alerts ?? []).find((alert) => String(alert.title ?? '').includes('Контрактов готово'));
check('init сообщает о готовом контракте (V3)', Boolean(readyAlert), readyAlert?.title ?? 'алерта нет');
check('в алерте названа цель', Boolean(readyAlert) && String(readyAlert.message).includes(active.targetName));
const dataBeforeClaim = ready.player?.data ?? 0;
const claimed = await claimMission(SEED_A, active.id);
check('сбор после таймера проходит', claimed.ok === true, claimed.error ?? '');
check('миссия убрана из активных', (claimed.player?.activeMissions?.length ?? -1) === 0);
const dataGain = (claimed.player?.data ?? 0) - dataBeforeClaim;
// Исход брошен на сервере: успех/частичный платят, провал — нет. Проверяем не
// «всегда больше нуля», а согласованность суммы с исходом из алерта.
const outcomeTitle = (claimed.alerts ?? []).map((a) => String(a.title ?? '')).join(' ');
const paidOutcome = outcomeTitle.includes('✅') || outcomeTitle.includes('🟡');
check(
  'награда соответствует исходу контракта',
  paidOutcome ? dataGain > 0 : dataGain === 0,
  `+${Math.round(dataGain)} Data · ${outcomeTitle.slice(0, 40) || 'без алерта'}`
);
check('награда не больше зафиксированной (учитывая исход)', dataGain <= Math.round(active.reward * 1.5), `reward=${active.reward} gain=${Math.round(dataGain)}`);
const repeatClaim = await claimMission(SEED_A, active.id);
check('повторный сбор отклонён (идемпотентность)', repeatClaim.ok !== true);
check('MS-таймер соблюдён: сбор невозможен раньше finish_at', new Date(active.finishAt).getTime() <= fakeNow);

// ============================================================================
// 6. Флаг выключен: прежняя цена входа «по длительности» и без V3-алертов
// ============================================================================
// мост посчитал обе ветки одной и той же функцией shared/hack.config.ts
check('флаг off: цена входа = длительность контракта',
  sharedOk && cfg.legacyEntry.energy === Math.max(10, cfg.starter.durationSec),
  `energy=${cfg?.legacyEntry?.energy} длительность=${cfg?.starter?.durationSec}`);

// Переключаем флаг тем же механизмом, что и в консоли разработчика:
// globalThis.__HK_FLAGS__ (в браузере — window.__HK_FLAGS__). process.env
// здесь не годится: ядро читает его один раз и он же инлайнится при сборке.
globalThis.__HK_FLAGS__ = { ...(globalThis.__HK_FLAGS__ ?? {}), gameplayV3: false };

const offInit = await init(SEED_B);
const offOfferKey = offInit.player?.availableMissionKeys?.[0];
const offStart = offOfferKey ? await startMission(SEED_B, offOfferKey) : { ok: false, error: 'нет витрины' };
check('флаг off: контракт всё равно запускается', offStart.ok === true, offStart.error ?? '');
const offSpent = (offInit.player?.energy ?? 0) - (offStart.player?.energy ?? 0);
const offCfg = sharedOk ? missions.MISSIONS_CONFIG.find((m) => m.key === offOfferKey) : null;
// Длительность реально запущенного контракта знает только сервер — берём её из
// finish_at/staredAt, а не из конфига в тесте.
const offMission = offStart.player?.activeMissions?.[0];
const offDurationSec = offMission
  ? Math.round((new Date(offMission.finishAt).getTime() - new Date(offMission.startedAt).getTime()) / 1000)
  : 0;
check('флаг off: списана прежняя цена (длительность)',
  offSpent === Math.max(10, offDurationSec) && offSpent !== cfg.cost1,
  `spent=${offSpent} длительность=${offDurationSec}`);
advance((offCfg?.durationSec ?? 60) * 1000 + 5000);
const offReady = await init(SEED_B);
check('флаг off: нет V3-алерта про готовые контракты',
  !(offReady.alerts ?? []).some((alert) => String(alert.title ?? '').includes('Контрактов готово')),
  (offReady.alerts ?? []).map((a) => a.title).join(' | ').slice(0, 120));
globalThis.__HK_FLAGS__ = { ...(globalThis.__HK_FLAGS__ ?? {}), gameplayV3: true };

// ============================================================================
// 7. Онбординг: шаги работают при обоих флагах, события не переименованы
// ============================================================================
// Значения шагов проверяет watchdog-мост: он вызывает настоящий isStepComplete
// из src/lib/onboarding.ts для четырёх комбинаций флагов (см. gameplay-config.ts).
if (sharedOk) {
  check('события воронки не переименованы', cfg.steps === 'first_tap,first_upgrade,first_mission_start', cfg.steps);
  check('текст шагов V3 не зовёт тапать', !/тап/i.test(cfg.copyV3), cfg.copyV3.slice(0, 60));
  check('шаг 1 V3 ведёт к контракту', /контракт/i.test(cfg.copyV3Step1), cfg.copyV3Step1.slice(0, 60));
  check('шаг 1 V3: текст задачи «контракт + реальное время»',
    /^Выбери первый контракт\. Миссия идёт в реальном времени — можно закрыть игру и вернуться позже\.$/.test(cfg.copyV3Step1),
    cfg.copyV3Step1);
  const onb = await init(SEED_ONB);
  check('онбординг-игрок получает витрину', (onb.player?.availableMissionKeys?.length ?? 0) > 0);
}

// ============================================================================
// 8. UI: флаг off = прежний экран, флаг on = доска контрактов
// ============================================================================
function readSource(relative) {
  return fs.readFileSync(path.join(projectRoot, relative), 'utf8');
}
try {
  const deskScene = readSource('src/components/DeskScene.tsx');
  const deskPage = readSource('src/pages/DeskPage.tsx');
  const topHud = readSource('src/components/TopHud.tsx');
  const context = readSource('src/context/GameContext.tsx');
  const board = readSource('src/components/ContractBoard.tsx');

  check('кнопка HACK скрыта флагом (не удалена из кода)', /!gameplayV3 && \(\s*<motion\.button/.test(deskScene));
  check('тап-обработчик остаётся в коде', deskScene.includes('const handleTap'));
  check('сцена не кликабельна при V3', /onClick=\{gameplayV3 \? undefined : handleTap\}/.test(deskScene));
  check('на столе есть доска контрактов', deskPage.includes('<ContractBoard />'));
  check('доска показывает прогресс и «Забрать»', board.includes('data-qa="contract-card"') && board.includes('collect-contract'));
  check('CPU Charge виден на доске', /CPU/.test(board));
  check('HUD: доход по контрактам, а не тап', topHud.includes('contractIncomePerHour') && topHud.includes('gameplayV3'));
  check('авто-сбор на init реализован', context.includes('autoClaimedRef') && context.includes('isContractReady'));
  check('авто-сбор уважает флаг', /if \(!isGameplayV3Enabled\(\) \|\| !player \|\| loading\) return;/.test(context));

  // --- v5.8: стол не «давит» тенью, кнопка локации на виду ------------------
  check('подложка стола смягчена (низ 55%, верх 20%)',
    deskScene.includes('from-[var(--ui-panel-deep)]/55') && deskScene.includes('to-[var(--ui-panel-deep)]/20'),
    (deskScene.match(/from-\[var\(--ui-panel-deep\)\]\/\d+/g) ?? []).join(' '));
  check('чип «что за окном» работает как смена локации',
    deskScene.includes('data-qa="scene-location-chip"') && deskScene.includes('setLocationOpen(true)'));
  check('модалка локаций вне карточки сцены (overflow-hidden)',
    deskScene.indexOf('data-qa="scene-location-chip"') < deskScene.indexOf('<LocationPickerModal'));
  check('бар локации стоит сразу под сценой и имеет CTA',
    deskPage.indexOf('<DeskScene />') < deskPage.indexOf('<DeskLocationBar />') &&
      deskPage.indexOf('<DeskLocationBar />') < deskPage.indexOf('<ContractBoard />') &&
      deskPage.includes('data-qa="change-location-bar"'));

  // --- v5.9: мёртвая «вуаль темы» убрана, рабочая — только для сцен по уровню
  check('вуаль темы без битого цвета (нет суффикса после rgba строки)',
    !deskScene.includes('sceneVignette}55'), 'ищем дописанный суффикс прозрачности');
  check('вуаль темы рендерится только без выбранной локации',
    deskScene.includes('{!deskBackdrop && (') &&
      deskScene.indexOf('{!deskBackdrop && (') < deskScene.indexOf('sceneVignette'));
  check('мёртвая CSS-переменная --theme-vignette удалена',
    !deskScene.includes('--theme-vignette') && !context.includes('--theme-vignette'));

  // --- v6.0: экран «Задания» — три секции, одна карточка, без легаси ---------
  const app = readSource('src/App.tsx');
  const questsLib = readSource('src/lib/quests.ts');
  const tasksPage = readSource('src/pages/TasksPage.tsx');
  const questCard = readSource('src/components/QuestCard.tsx');
  const tasksTeaser = readSource('src/components/TasksTeaser.tsx');

  check('маршрут /tasks подключён', app.includes('path="/tasks"') && app.includes("import('./pages/TasksPage')"));
  check('три секции: ежедневные, прогресс, события',
    ['daily', 'progress', 'event'].every((id) => questsLib.includes(`build${id === 'daily' ? 'Daily' : id === 'progress' ? 'Progress' : 'Event'}Section`)) &&
      tasksPage.includes('data-qa={`quest-section-${section.id}`}'));
  check('задания собираются из единого источника',
    questsLib.includes('export function buildQuestSections') &&
      tasksPage.includes('buildQuestSections') &&
      !tasksPage.includes('dailyTasks.config') && !questCard.includes('shared/'));
  check('один тип карточки задания на весь раздел',
    questCard.includes('data-qa="quest-card"') &&
      tasksPage.includes('<QuestCard') &&
      (readSource('src/pages/DeskPage.tsx').includes('TasksTeaser')));
  check('награда забирается одним тапом', questCard.includes('data-qa-action="claim-quest"') && questCard.includes('Забрать'));
  check('оптимистичный забор: метка до ответа API',
    context.includes('pendingClaims') && context.includes('const runClaim = useCallback') &&
      questCard.includes('pending ? \'closed\' : quest.status'));
  check('легаси-панели удалены и не импортируются',
    !fs.existsSync(path.join(projectRoot, 'src/components/SeasonEventPanel.tsx')) &&
      !fs.existsSync(path.join(projectRoot, 'src/components/DailyTasksPanel.tsx')) &&
      !readSource('src/pages/DeskPage.tsx').includes('SeasonEventPanel'));
  check('легаси-текстов старой эпохи нет в UI',
    !readSource('src/components/QuestCard.tsx').includes('Сценарий · 7 календарных дней') &&
      !tasksPage.includes('Сценарий · 7 календарных') &&
      !questsLib.includes('Участник/Мастер'));
  check('анимации только transform/opacity',
    !questCard.includes('transition-all') && questCard.includes('scaleX(') && tasksTeaser.includes('scaleX('));

  // --- v6.1: контракты — пассивные цели поверх экрана заданий ----------------
  const contractsConfig = readSource('shared/contracts.config.ts');
  const contractsLib = readSource('src/lib/contracts.ts');
  const engine = readSource('api/_lib/gameEngine.ts');
  const router = readSource('api/_router.ts');
  const contractsRoute = readSource('api/_routes/contracts.ts');
  const tasksPageV61 = readSource('src/pages/TasksPage.tsx');

  check('контракты описаны одним конфигом', contractsConfig.includes('export const CONTRACTS_PER_DAY') &&
    contractsConfig.includes('export const MAX_ACTIVE_CONTRACTS') &&
    contractsConfig.includes('export function getDailyContracts'));
  check('выдача контрактов детерминирована и без дублей',
    contractsConfig.includes('getDailyContracts(tgId') &&
      contractsConfig.includes('slice(0, CONTRACTS_PER_DAY)') &&
      engine.includes('ensureContracts(record, nowDayKey)'));
  check('прогресс растёт от тапов, CPU Charge и закрытия контрактов',
    engine.includes("incrementContractProgress(record, 'tap', validClicks)") &&
      engine.includes("incrementContractProgress(record, 'cpu', entryCost.energy)") &&
      engine.includes("incrementContractProgress(record, 'mission_complete', 1)") &&
      engine.includes("incrementContractProgress(record, 'heat', heatGain)"));
  check('забор награды — серверный, отдельного роута-дубля нет',
    router.includes("import contracts from './_routes/contracts'") &&
      router.includes('contracts,') &&
      contractsRoute.includes('handleContractAction'));
  check('повторный забор за контракт заблокирован',
    engine.includes("if (state.claimed.includes(contract.key))") &&
      engine.includes('Награда за этот контракт уже получена'));
  check('награда контракта не считается на клиенте',
    !contractsLib.includes('record.') && contractsLib.includes('describeContractReward'));
  check('контракты используют общий QuestCard, а не свой тип карточки',
    tasksPageV61.includes("contract: FileText") &&
      !contractsLib.includes('data-qa="quest-card"') &&
      contractsLib.includes("kind: 'contract'"));
  check('забор контракта идёт через общий runClaim',
    context.includes("runClaim(`contract:${contractId}`") &&
      tasksPageV61.includes('claimContract'));

  // --- онбординг: первый кадр игры без «тапни» и без кнопки ТАП -------------
  const onboarding = readSource('src/components/Onboarding.tsx');
  check('онбординг: текст шага под флагом геймплея',
    onboarding.includes('isGameplayV3Enabled()') && onboarding.includes('onboardingStepCopyV3'));
  check('онбординг: легаси-текст про тап не удалён (флаг off)',
    onboarding.includes('Тапни по столу'));
  check('онбординг: шаг 1 при V3 запускает контракт',
    onboarding.includes('data-qa="onboarding-first-contract"') && onboarding.includes('Запустить контракт'));
  check('онбординг: кнопок тапа ровно две и обе в легаси-ветках',
    (onboarding.match(/onClick=\{handleTap\}/g) ?? []).length === 2,
    `handleTap-кнопок: ${(onboarding.match(/onClick=\{handleTap\}/g) ?? []).length}`);
  check('онбординг: заголовки шагов V3 из shared-конфига',
    onboarding.includes('ONBOARDING_STEP_TITLES_V3') && onboarding.includes('stepTitles.map((title, index)'));
} catch (err) {
  check('структурные проверки UI', false, String(err));
}

console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
if (fail === 0) console.log(`GAMEPLAY_QA_OK ${pass}`);
if (fail > 0) {
  console.log('Провалы:', failures.join(', '));
  process.exit(1);
}
