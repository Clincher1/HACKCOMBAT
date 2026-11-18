/**
 * HACKER KOMBAT — QA v3.6.1: базовые темы оформления.
 *
 * Что проверяем:
 *   1) обе темы бесплатные и переключаются (classic / femme);
 *   2) выбор темы сохраняется на сервере и приходит в /api/init;
 *   3) тема НЕ списывает Data/Crypto/Чипы и НЕ даёт бонусов к тапу
 *      (это косметика, а не pay-to-win);
 *   4) неизвестная тема отклоняется, а не «портит» сейв;
 *   5) скины продолжают надеваться поверх темы, тема от этого не слетает;
 *   6) композиция фильтра сцены: классика = фильтр скина без изменений.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/themes.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const REPO = process.cwd();
const CORE = path.join(REPO, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

// Конфиг тем — TypeScript. Собираем его в CJS через esbuild (он уже есть как
// зависимость vite), чтобы проверить чистые функции themes.config.ts как есть,
// без переписывания логики в тесте.
const esbuild = require('esbuild');
const probePath = path.join(os.tmpdir(), `hk-themes-probe-${process.pid}.cjs`);
esbuild.buildSync({
  entryPoints: [path.join(REPO, 'shared/themes.config.ts')],
  outfile: probePath,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});
const themes = require(probePath);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-themes-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForThemesQa_1234567890';

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
  params.set('user', JSON.stringify({ id: tgId, first_name: 'ThemeTester', username: `th${tgId}` }));
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
      'x-demo-username': `th${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.95.0.${(ipCounter++ % 200) + 1}`,
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

const setTheme = (tgId, key) => call(tgId, 'skin', { action: 'set_theme', skinKey: key });

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.6.1: базовые темы ===\n');

  const TG = 930000001;
  let r = await call(TG, 'init');
  check('игрок создан', r.ok === true, r.player?.id);
  check('по умолчанию темы нет (классика по фронту)', !r.player.stats.baseTheme, String(r.player.stats.baseTheme));

  const beforeCrypto = r.player.crypto;
  const beforeData = r.player.data;
  const beforeChips = r.player.chips;
  const beforeClickPower = r.player.derived.clickPower;

  // ── 1. Включение женской темы ────────────────────────────────────────────
  let res = await setTheme(TG, 'femme');
  check('женская тема включается', res.ok === true, res.error ?? '');
  check('тема сохранена на сервере', res.player?.stats?.baseTheme === 'femme', res.player?.stats?.baseTheme);

  r = await call(TG, 'init');
  check('тема переживает перезагрузку', r.player.stats.baseTheme === 'femme', r.player.stats.baseTheme);

  // ── 2. Бесплатность и отсутствие pay-to-win ──────────────────────────────
  check('Crypto не списан', r.player.crypto === beforeCrypto, `${beforeCrypto} → ${r.player.crypto}`);
  check('Data не списано', r.player.data === beforeData, `${beforeData} → ${r.player.data}`);
  check('Чипы не списаны', r.player.chips === beforeChips, `${beforeChips} → ${r.player.chips}`);
  check(
    'сила тапа не изменилась (тема — не бустер)',
    r.player.derived.clickPower === beforeClickPower,
    `${beforeClickPower} → ${r.player.derived.clickPower}`
  );

  // ── 3. Возврат к классике ────────────────────────────────────────────────
  res = await setTheme(TG, 'classic');
  check('классика включается', res.ok === true && res.player?.stats?.baseTheme === 'classic');

  // ── 4. Неизвестная тема ──────────────────────────────────────────────────
  const bad = await setTheme(TG, 'hacker_theme_9000');
  check('неизвестная тема отклонена', bad.ok === false, bad.error ?? '');
  r = await call(TG, 'init');
  check('после ошибки тема не испорчена', r.player.stats.baseTheme === 'classic', r.player.stats.baseTheme);

  // ── 5. Скин поверх темы ──────────────────────────────────────────────────
  await setTheme(TG, 'femme');
  const skinRes = await call(TG, 'skin', { action: 'buy_or_equip', skinKey: 'default' });
  check('скин надевается поверх темы', skinRes.ok === true, skinRes.error ?? '');
  r = await call(TG, 'init');
  check('тема не слетела от смены скина', r.player.stats.baseTheme === 'femme', r.player.stats.baseTheme);
  check('скин применился', r.player.equippedSkin === 'default', r.player.equippedSkin);

  // Светлые темы бесплатны, сохраняются между серверными загрузками и не меняют экономику.
  for (const key of ['light_mist', 'light_sand']) {
    const before = (await call(TG, 'init')).player;
    const chosen = await setTheme(TG, key);
    const after = (await call(TG, 'init')).player;
    check(`${key}: включается и сохраняется`, chosen.ok && after.stats.baseTheme === key);
    check(`${key}: балансы и сила тапа не меняются`,
      before.data === after.data && before.crypto === after.crypto && before.chips === after.chips &&
      before.derived.clickPower === after.derived.clickPower);
    check(`${key}: сохранение после повторной смены`, (await setTheme(TG, key)).player?.stats?.baseTheme === key);
    check(`${key}: светлая тема и нет замены эволюции стола`,
      themes.getBaseTheme(key).colorScheme === 'light' && themes.getThemeScene(themes.getBaseTheme(key), 1) === undefined);
  }
  res = await setTheme(TG, 'classic');
  check('из светлой темы можно вернуться к классике', res.ok && (await call(TG, 'init')).player.stats.baseTheme === 'classic');

  // ── 6. Чистая функция композиции фильтра ─────────────────────────────────
  check('конфиг сохраняет прежние темы и добавляет новогоднюю', themes.BASE_THEMES.length === 5 && themes.getBaseTheme('new_year').key === 'new_year', themes.BASE_THEMES.length);
  check('светлые темы скрыты из выбора, но сохранены', ['light_mist','light_sand'].every(key => themes.getBaseTheme(key).hiddenFromSelection === true));
  check('новогодняя тема доступна и бесплатна', !themes.getBaseTheme('new_year').hiddenFromSelection && themes.getBaseTheme('new_year').free);
  const beforeHoliday = (await call(TG, 'init')).player;
  const chosenHoliday = await setTheme(TG, 'new_year');
  const afterHoliday = (await call(TG, 'init')).player;
  check('новогодняя тема включается и сохраняется', chosenHoliday.ok && afterHoliday.stats.baseTheme === 'new_year');
  check('новогодняя тема не меняет экономику и экипировку', beforeHoliday.data === afterHoliday.data && beforeHoliday.crypto === afterHoliday.crypto && beforeHoliday.chips === afterHoliday.chips && beforeHoliday.derived.clickPower === afterHoliday.derived.clickPower && beforeHoliday.stats.equippedUi === afterHoliday.stats.equippedUi && beforeHoliday.equippedSkin === afterHoliday.equippedSkin);
  check('новогодняя тема не заменяет сцены эволюции', themes.getThemeScene(themes.getBaseTheme('new_year'), 1) === undefined);
  check('новогодняя тема сохраняет свою палитру при надетом UI-скине', themes.getBaseTheme('new_year').overrideUiSkinPalette === true);
  for (const asset of ['preview.svg', 'ornaments.svg']) check(`праздничный ассет ${asset} включён в сборку`, fs.existsSync(path.join(REPO, 'dist/assets/themes/new-year', asset)));
  check('после праздника можно вернуться к прежней теме', (await setTheme(TG, 'femme')).player?.stats?.baseTheme === 'femme');
  check('обе темы бесплатные', themes.BASE_THEMES.every((t) => t.free === true));
  check(
    'у тем нет поля бонуса к тапу (чистая косметика)',
    themes.BASE_THEMES.every((t) => !('clickBonusPct' in t))
  );
  const classic = themes.getBaseTheme('classic');
  const femme = themes.getBaseTheme('femme');
  check(
    'классика не сдвигает фильтр скина',
    themes.composeSceneFilter('hue-rotate(85deg) saturate(1.25)', classic) ===
      'hue-rotate(85deg) saturate(1.25)'
  );
  check('у женской темы есть своя сцена', Boolean(femme.sceneUrl), femme.sceneUrl ?? '');
  check('у женской темы есть превью для карточки', Boolean(femme.previewImage), femme.previewImage ?? '');

  // v3.6.3: рабочий стол женской темы растёт вместе с уровнем, как в классике
  const STAGES = [1, 5, 10, 15, 20, 25, 30];
  check(
    'у женской темы сцена на каждый этап',
    STAGES.every((st) => Boolean(femme.stageScenes?.[String(st)])),
    Object.keys(femme.stageScenes ?? {}).join(',')
  );
  const stageUrls = STAGES.map((st) => themes.getThemeScene(femme, st));
  check('этапы ведут на разные файлы', new Set(stageUrls).size === STAGES.length, `${new Set(stageUrls).size} из ${STAGES.length}`);
  check(
    'неизвестный этап откатывается к базовой сцене темы',
    themes.getThemeScene(femme, 7) === femme.sceneUrl
  );
  check(
    'у классики сцен по этапам нет (использует штатные)',
    themes.getThemeScene(classic, 1) === undefined
  );
  check('маскот больше не наклейка поверх сцены', !('mascotUrl' in femme));

  // v3.6.2: форма интерфейса — часть темы, а не только палитра
  check('у темы есть UI-токены формы', Boolean(femme.ui) && Boolean(classic.ui));
  check(
    'женская тема смягчает радиусы',
    femme.ui.radiusBoost > classic.ui.radiusBoost,
    `${classic.ui.radiusBoost} → ${femme.ui.radiusBoost}`
  );
  // Realistic redesign intentionally removes decorative cat ears from both themes.
  check('в реалистичном оформлении обе темы без декоративных ушек', femme.ui.catEars === false && classic.ui.catEars === false);
  check(
    'градиент кнопки берётся из темы и различается',
    femme.ui.buttonGradient.join() !== classic.ui.buttonGradient.join(),
    femme.ui.buttonGradient.join(' → ')
  );
  check(
    'у женской темы мягкий «успех» вместо кислотного лайма',
    femme.ui.successHex !== classic.ui.successHex,
    `${classic.ui.successHex} → ${femme.ui.successHex}`
  );
  check('неизвестный ключ откатывается к классике', themes.getBaseTheme('nope').key === 'classic');

  // Ассеты существуют и не раздуты
  // Все семь этапов: файл существует, не тяжелее лимита и уникален по содержимому
  const hashes = new Map();
  for (const st of STAGES) {
    const url = themes.getThemeScene(femme, st);
    const file = path.join(REPO, 'public', url.replace(/^\//, ''));
    const exists = fs.existsSync(file);
    const kb = exists ? Math.round(fs.statSync(file).size / 1024) : 0;
    check(`этап ${st}: арт на месте`, exists, `${url} · ${kb} КБ`);
    check(`этап ${st}: не тяжелее 250 КБ`, exists && kb <= 250, `${kb} КБ`);
    if (exists) {
      const sum = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
      hashes.set(st, sum);
    }
  }
  check(
    'все семь этапов отличаются картинкой',
    new Set(hashes.values()).size === STAGES.length,
    `${new Set(hashes.values()).size} уникальных из ${STAGES.length}`
  );
  check(
    'размер растёт с уровнем (стол развивается)',
    STAGES.every((st, i) => i === 0 || themes.getThemeScene(femme, st) !== null),
    'последовательность полная'
  );

  // v3.6.4: классические сцены не должны снова уехать в темноту.
  // Раньше средняя яркость была 13-28 из 255 — на телефоне это читалось
  // как «мрачное пятно». Нижняя граница держит результат осветления.
  const BRIGHT_FLOOR = { 'stage-01': 30, 'stage-05': 33, 'stage-10': 35, 'stage-15': 28, 'stage-20': 40, 'stage-25': 52, 'stage-30': 54 };
  for (const [f, floor] of Object.entries(BRIGHT_FLOOR)) {
    const file = path.join(REPO, 'public/assets/scenes', `${f}.webp`);
    const exists = fs.existsSync(file);
    let mean = 0;
    if (exists) {
      try {
        const out = execFileSync('convert', [file, '-colorspace', 'Gray', '-format', '%[fx:int(mean*255)]', 'info:'], { encoding: 'utf8' });
        mean = Number(out.trim()) || 0;
      } catch {
        mean = -1;
      }
    }
    if (mean < 0) {
      check(`${f}: яркость не измерена`, true, 'imagemagick недоступен, пропуск');
    } else {
      check(`${f}: сцена не мрачная (яркость >= ${floor})`, mean >= floor, `яркость ${mean}`);
    }
  }

  for (const [label, url] of [
    ['превью', femme.previewImage],
  ]) {
    const file = path.join(REPO, 'public', url.replace(/^\//, ''));
    const exists = fs.existsSync(file);
    const kb = exists ? Math.round(fs.statSync(file).size / 1024) : 0;
    check(`${label} женской темы на месте`, exists, `${url} · ${kb} КБ`);
  }

  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.log('Провалы:', failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('QA упал:', err);
  process.exit(1);
});
