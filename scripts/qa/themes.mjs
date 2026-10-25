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

  // ── 6. Чистая функция композиции фильтра ─────────────────────────────────
  check('в конфиге две темы', themes.BASE_THEMES.length === 2, themes.BASE_THEMES.length);
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
  check('у женской темы есть маскот', Boolean(femme.mascotUrl), femme.mascotUrl ?? '');
  check('неизвестный ключ откатывается к классике', themes.getBaseTheme('nope').key === 'classic');

  // Ассеты существуют и не раздуты
  for (const [label, url] of [
    ['сцена', femme.sceneUrl],
    ['маскот', femme.mascotUrl],
  ]) {
    const file = path.join(REPO, 'public', url.replace(/^\//, ''));
    const exists = fs.existsSync(file);
    const kb = exists ? Math.round(fs.statSync(file).size / 1024) : 0;
    check(`${label} женской темы на месте`, exists, `${url} · ${kb} КБ`);
    check(`${label} не тяжелее 250 КБ`, exists && kb <= 250, `${kb} КБ`);
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
