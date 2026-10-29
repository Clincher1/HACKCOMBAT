/**
 * HACKER KOMBAT — QA v3.6.5: слоты косметики (стол / интерфейс / аватар).
 *
 * Что проверяем:
 *   1) три слота НЕЗАВИСИМЫ: надел интерфейс — стол и аватар остались;
 *   2) слоты переживают перезагрузку (уходят в stats и возвращаются);
 *   3) старые сейвы раскладываются по слотам (миграция equipped_skin);
 *   4) суммарный бонус к тапу режется потолком 22% (иначе три скина = +49%);
 *   5) скин интерфейса больше НЕ влияет на арт стола (фильтр берётся только
 *      из категории «рабочий стол»);
 *   6) у всех UI-скинов есть токены цвета, иначе снова «ничего не меняется».
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/cosmetics.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const REPO = process.cwd();
const CORE = path.join(REPO, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

// Чистые функции конфигов и механики проверяем как есть, собрав TS в CJS.
const esbuild = require('esbuild');
const probePath = path.join(os.tmpdir(), `hk-cosmetics-probe-${process.pid}.cjs`);
esbuild.buildSync({
  entryPoints: [path.join(REPO, 'shared/mechanics.ts')],
  outfile: probePath,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});
const mechanics = require(probePath);
const skins = require(
  esbuild.buildSync({
    entryPoints: [path.join(REPO, 'shared/skins.config.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  }).outputFiles[0].text
    ? (() => {
        const p = path.join(os.tmpdir(), `hk-skins-probe-${process.pid}.cjs`);
        esbuild.buildSync({
          entryPoints: [path.join(REPO, 'shared/skins.config.ts')],
          outfile: p,
          bundle: true,
          format: 'cjs',
          platform: 'node',
          logLevel: 'silent',
        });
        return p;
      })()
    : ''
);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-cosmetics-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForCosmeticsQa_12345678';

/**
 * ВАЖНО: движок кэширует локальную БД в памяти модуля, поэтому файл надо
 * подготовить ДО первого require(api/_core.cjs). Иначе правки файла не видны
 * и игрок остаётся 1 уровня без Crypto — купить скины нельзя.
 */
const TG = 950000001;
const LEGACY_UI = 950000002;
const LEGACY_AVATAR = 950000003;

function makeRecord(tgId, { crypto: cr = 5, xp = 0, equippedSkin = 'default', unlockedSkins = ['default'] } = {}) {
  const nowIso = new Date().toISOString();
  return {
    id: `${tgId}-qa`,
    tgId,
    username: `sk${tgId}`,
    data: 250,
    crypto: cr,
    chips: 0,
    xp,
    energy: 100,
    energyUpdated: nowIso,
    heat: 0,
    rep: 0,
    prestigeCount: 0,
    cardTier: 1,
    clickBlockedUntil: null,
    dailyStreak: 0,
    lastDailyClaim: null,
    equippedSkin,
    unlockedSkins,
    totalClicks: 0,
    totalMissions: 0,
    lastPassiveClaim: nowIso,
    lastClickBatchAt: 0,
    cards: {},
    team: [],
    pets: [],
    baseUpgrades: {},
    stats: {
      tutorialTabs: [],
      tutorialOpens: 0,
      tabsVisited: [],
      petFeedings: 0,
      petHungrySeen: 0,
      missionFails: 0,
      missionTypes: [],
      greyMissions: 0,
      nightSessions: 0,
      earlySessions: 0,
      idleSessions: 0,
      maxSessionMinutes: 0,
      bestHeatEscape: 0,
      heatPenalties: 0,
      shopFreezeMinutes: 0,
      petFeedingStreakDays: 0,
      lastPetFeedDay: null,
      trackEventsToday: 0,
      trackEventsDay: null,
      hackSuccessByType: {},
      hackFailByType: {},
      totalXpEarned: 0,
      lastTapClaimAt: null,
      activeDayKey: null,
      activeSecondsToday: 0,
      chipsDayKey: null,
      chipsToday: 0,
      chipsCapNotifiedDay: null,
      lastQualifiedDayKey: null,
      lastActiveAt: null,
      offlineGraceUsed: false,
    },
    activeMissions: [],
    availableMissionKeys: [],
    missionsRefreshedAt: nowIso,
    achievements: [],
  };
}

fs.writeFileSync(
  path.join(sandbox, '.local-db.json'),
  JSON.stringify({
    playersByTgId: {
      // Богатый сейв: хватает Crypto и уровня на все тестовые покупки.
      [String(TG)]: makeRecord(TG, { crypto: 5000, xp: 5_000_000 }),
      // «Старые» сейвы: скин интерфейса и аватар лежат в общем поле стола.
      [String(LEGACY_UI)]: makeRecord(LEGACY_UI, {
        equippedSkin: 'ui_grape',
        unlockedSkins: ['default', 'ui_grape'],
      }),
      [String(LEGACY_AVATAR)]: makeRecord(LEGACY_AVATAR, {
        equippedSkin: 'avatar_ronin',
        unlockedSkins: ['default', 'avatar_ronin'],
      }),
    },
  })
);

// Только ПОСЛЕ подкладки сейва — движок кэширует БД в памяти модуля.
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

let ipCounter = 0;
function signInitData(tgId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Date.now()}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: 'SkinTester', username: `sk${tgId}` }));
  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}

async function call(tgId, route, body = undefined) {
  const req = {
    url: `/api/${route}`,
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `sk${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.96.0.${(ipCounter++ % 200) + 1}`,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = {
    statusCode: 200,
    payload: '',
    setHeader() {},
    end(chunk) {
      this.payload = chunk ?? '';
    },
  };
  await dispatchApiRequest(req, res);
  try {
    return { ...JSON.parse(res.payload), _status: res.statusCode };
  } catch {
    return { raw: res.payload, _status: res.statusCode };
  }
}

const equip = (tgId, key) => call(tgId, 'skin', { action: 'buy_or_equip', skinKey: key });

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.6.5: слоты косметики ===\n');

  let r = await call(TG, 'init');
  check('игрок создан', r.ok === true, r.player?.id);
  check('по умолчанию слот интерфейса пуст', !r.player.stats.equippedUi, String(r.player.stats.equippedUi));
  check('по умолчанию слот аватара пуст', !r.player.stats.equippedAvatar, String(r.player.stats.equippedAvatar));

  check('уровень достаточен для покупок', r.player.derived.level >= 25, `ур. ${r.player.derived.level}`);
  check('Crypto хватает на покупки', r.player.crypto >= 100, `${r.player.crypto} 💎`);

  // ── 1. Стол ──────────────────────────────────────────────────────────────
  const deskRes = await equip(TG, 'sakura');
  check('скин стола надевается', deskRes.ok === true, deskRes.error ?? '');
  r = await call(TG, 'init');
  check('стол записался в свой слот', r.player.equippedSkin === 'sakura', r.player.equippedSkin);

  // ── 2. Интерфейс НЕ сбрасывает стол (главный баг) ────────────────────────
  const uiRes = await equip(TG, 'ui_amber');
  check('скин интерфейса надевается', uiRes.ok === true, uiRes.error ?? '');
  r = await call(TG, 'init');
  check('интерфейс записался в свой слот', r.player.stats.equippedUi === 'ui_amber', r.player.stats.equippedUi);
  check('стол НЕ слетел от скина интерфейса', r.player.equippedSkin === 'sakura', r.player.equippedSkin);

  // ── 3. Аватар не сбрасывает ни стол, ни интерфейс ────────────────────────
  const avRes = await equip(TG, 'avatar_ghost');
  check('аватар надевается', avRes.ok === true, avRes.error ?? '');
  r = await call(TG, 'init');
  check('аватар записался в свой слот', r.player.stats.equippedAvatar === 'avatar_ghost', r.player.stats.equippedAvatar);
  check('стол остался', r.player.equippedSkin === 'sakura', r.player.equippedSkin);
  check('интерфейс остался', r.player.stats.equippedUi === 'ui_amber', r.player.stats.equippedUi);

  // ── 4. Смена одного слота не трогает остальные ───────────────────────────
  await equip(TG, 'ui_mint');
  r = await call(TG, 'init');
  check('смена интерфейса применяется', r.player.stats.equippedUi === 'ui_mint', r.player.stats.equippedUi);
  check('стол при этом цел', r.player.equippedSkin === 'sakura', r.player.equippedSkin);
  check('аватар при этом цел', r.player.stats.equippedAvatar === 'avatar_ghost', r.player.stats.equippedAvatar);

  // Светлая тема меняет только внешний вид: надетые скины, их бонус и баланс остаются.
  const beforeTheme = r.player;
  const lightResult = await call(TG, 'skin', { action: 'set_theme', skinKey: 'light_mist' });
  const lightReload = await call(TG, 'init');
  check('светлая тема сохраняется со всеми тремя слотами', lightResult.ok &&
    lightReload.player.stats.baseTheme === 'light_mist' && lightReload.player.equippedSkin === 'sakura' &&
    lightReload.player.stats.equippedUi === 'ui_mint' && lightReload.player.stats.equippedAvatar === 'avatar_ghost');
  check('скины остаются полученными, балансы и бонус не меняются',
    lightReload.player.unlockedSkins.includes('ui_mint') && lightReload.player.crypto === beforeTheme.crypto &&
    lightReload.player.derived.clickPower === beforeTheme.derived.clickPower);
  const winterResult = await call(TG, 'skin', { action: 'set_theme', skinKey: 'new_year' });
  const winterReload = await call(TG, 'init');
  check('новогодняя тема сохраняет все скины и выбранный интерфейс', winterResult.ok &&
    winterReload.player.stats.baseTheme === 'new_year' && winterReload.player.equippedSkin === 'sakura' &&
    winterReload.player.stats.equippedUi === 'ui_mint' && winterReload.player.stats.equippedAvatar === 'avatar_ghost');
  check('в новогодней теме прежний бонус скина и баланс сохраняются', winterReload.player.derived.clickPower === beforeTheme.derived.clickPower && winterReload.player.crypto === beforeTheme.crypto && winterReload.player.unlockedSkins.includes('ui_mint'));
  await call(TG, 'skin', { action: 'set_theme', skinKey: 'classic' });
  r = await call(TG, 'init');
  check('после возврата к классике UI-скин всё ещё надет', r.player.stats.baseTheme === 'classic' && r.player.stats.equippedUi === 'ui_mint');

  // ── 5. Повторная экипировка не списывает Crypto ──────────────────────────
  const beforeCrypto = r.player.crypto;
  await equip(TG, 'ui_mint');
  r = await call(TG, 'init');
  check(
    'повторное «надеть» бесплатно',
    r.player.crypto === beforeCrypto,
    `${beforeCrypto} → ${r.player.crypto}`
  );

  // Снимаем каждую категорию отдельно, не теряя покупки и чужие слоты.
  const unequip = (key) => call(TG, 'skin', { action: 'unequip', skinKey: key });
  const initialSlots = r.player;
  const uiOff = await unequip('ui_mint');
  r = await call(TG, 'init');
  check('интерфейс снят и остаётся снятым после перезагрузки', uiOff.ok && !r.player.stats.equippedUi);
  check('снятие интерфейса не трогает стол, аватар и тему', r.player.equippedSkin === 'sakura' &&
    r.player.stats.equippedAvatar === 'avatar_ghost' && r.player.stats.baseTheme === 'classic');
  check('купленный интерфейс и баланс сохранены', r.player.unlockedSkins.includes('ui_mint') && r.player.crypto === beforeCrypto);
  const stale = await unequip('ui_amber');
  check('нельзя снять другой, ненадетый скин', stale._status === 400);
  const deskOff = await unequip('sakura');
  r = await call(TG, 'init');
  check('снятие стола возвращает стандартный вид', deskOff.ok && r.player.equippedSkin === 'default');
  check('снятие стола не снимает аватар и не удаляет покупку', r.player.stats.equippedAvatar === 'avatar_ghost' && r.player.unlockedSkins.includes('sakura'));
  const avatarOff = await unequip('avatar_ghost');
  r = await call(TG, 'init');
  check('аватар можно снять, все три слота теперь стандартные', avatarOff.ok && !r.player.stats.equippedAvatar &&
    !r.player.stats.equippedUi && r.player.equippedSkin === 'default');
  check('снятые скины сохраняются, бонус к тапу отключается', r.player.unlockedSkins.includes('avatar_ghost') &&
    r.player.derived.clickPower < initialSlots.derived.clickPower);
  check('стандартный стол нельзя снять', (await unequip('default'))._status === 400);
  await equip(TG, 'sakura');
  await equip(TG, 'ui_mint');
  await equip(TG, 'avatar_ghost');
  r = await call(TG, 'init');
  check('все три скина можно повторно надеть без оплаты', r.player.equippedSkin === 'sakura' &&
    r.player.stats.equippedUi === 'ui_mint' && r.player.stats.equippedAvatar === 'avatar_ghost' &&
    r.player.crypto === beforeCrypto && r.player.derived.clickPower === initialSlots.derived.clickPower);

  // ── 6. Чужая категория не подсовывается в слот ───────────────────────────
  check('UI-ключ не попал в слот стола', r.player.equippedSkin !== 'ui_mint', r.player.equippedSkin);
  check('стол не попал в слот интерфейса', r.player.stats.equippedUi !== 'sakura', r.player.stats.equippedUi);

  // ── 7. Миграция старых сейвов ────────────────────────────────────────────
  // Сейвы LEGACY_* подготовлены заранее: там UI-скин и аватар лежат в общем
  // поле equipped_skin, как было до v3.6.5.
  let legacy = await call(LEGACY_UI, 'init');
  check(
    'старый UI-скин переехал в свой слот',
    legacy.player.stats.equippedUi === 'ui_grape',
    legacy.player.stats.equippedUi
  );
  check(
    'вместо пустого стола подставлен дефолтный',
    legacy.player.equippedSkin === 'default',
    legacy.player.equippedSkin
  );
  legacy = await call(LEGACY_AVATAR, 'init');
  check(
    'старый аватар переехал в свой слот',
    legacy.player.stats.equippedAvatar === 'avatar_ronin',
    legacy.player.stats.equippedAvatar
  );
  check(
    'после миграции стол не пустой',
    legacy.player.equippedSkin === 'default',
    legacy.player.equippedSkin
  );

  // ── 8. Потолок бонуса к тапу ─────────────────────────────────────────────
  const base = {
    cards: {},
    team: [],
    rep: 0,
    heat: 0,
    data: 0,
    xp: 0,
    prestigeCount: 0,
    pets: [],
    baseUpgrades: {},
    cardTier: 1,
  };
  const one = mechanics.computeDerivedStats({ ...base, equippedSkin: 'prestige_omega' });
  const three = mechanics.computeDerivedStats({
    ...base,
    equippedSkin: 'void_phantom', // +18%
    equippedUi: 'ui_crimson', //    +12%
    equippedAvatar: 'avatar_zero', // +15%  → сумма 45%
  });
  check('потолок бонуса равен 22%', skins.SKIN_CLICK_BONUS_CAP === 0.22, String(skins.SKIN_CLICK_BONUS_CAP));
  check(
    'три скина не пробивают потолок одного',
    three.clickPower === one.clickPower,
    `${three.clickPower} против ${one.clickPower}`
  );
  const solarOnly = mechanics.computeDerivedStats({ ...base, equippedSkin: 'solar' }); // +12%
  const solarPlusUi = mechanics.computeDerivedStats({
    ...base,
    equippedSkin: 'solar', //      +12%
    equippedUi: 'ui_crimson', //   +12%  → 24%, режется до 22%
  });
  check(
    'бонусы слотов складываются',
    solarPlusUi.clickPower > solarOnly.clickPower,
    `${solarOnly.clickPower} → ${solarPlusUi.clickPower}`
  );

  // ── 9. Фильтр сцены берётся только из «рабочего стола» ───────────────────
  const onlyUi = skins.resolveEquippedSkins({ equippedSkin: 'default', stats: { equippedUi: 'ui_amber' } });
  check('UI-скин не даёт фильтра сцене', onlyUi.desk.cssFilter === 'none', onlyUi.desk.cssFilter);
  check('UI-скин при этом выбран', onlyUi.ui?.key === 'ui_amber', onlyUi.ui?.key ?? '—');
  const deskOnly = skins.resolveEquippedSkins({ equippedSkin: 'sakura', stats: {} });
  check('скин стола даёт свой фильтр', deskOnly.desk.cssFilter.includes('hue-rotate'), deskOnly.desk.cssFilter);

  // ── 10. Токены цвета у всех UI-скинов ────────────────────────────────────
  const uiSkins = skins.SKINS_CONFIG.filter((s) => s.category === 'ui');
  check('UI-скинов восемь', uiSkins.length === 8, String(uiSkins.length));
  check(
    'у каждого UI-скина есть токены цвета',
    uiSkins.every((s) => s.uiTokens?.accent && s.uiTokens?.accent2 && s.uiTokens?.panel),
    uiSkins.map((s) => s.key).join(', ')
  );
  check(
    'палитры UI-скинов различаются',
    new Set(uiSkins.map((s) => s.uiTokens.accent)).size === uiSkins.length,
    `${new Set(uiSkins.map((s) => s.uiTokens.accent)).size} из ${uiSkins.length}`
  );

  // ── 11. Пустой слот отдаёт дефолт, а не падает ───────────────────────────
  const empty = skins.resolveEquippedSkins({ equippedSkin: undefined, stats: {} });
  check('пустые слоты дают дефолтный стол', empty.desk.key === 'default', empty.desk.key);
  check('пустой слот интерфейса = undefined', empty.ui === undefined);
  check('пустой слот аватара = undefined', empty.avatar === undefined);

  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.log('Провалено:', failures.join(' | '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('QA упал с ошибкой:', err);
  process.exit(1);
});
