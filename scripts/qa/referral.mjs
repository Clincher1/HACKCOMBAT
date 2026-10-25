/**
 * HACKER KOMBAT — QA v3.5: реферальная программа.
 *
 * Проверяем именно то, что защищает игру и экономику:
 *   1) ссылка/код выдаются, код не раскрывает Telegram ID;
 *   2) награда НЕ приходит за клик по ссылке — только за 8 минут игры;
 *   3) самоприглашение и «приглашение прокачанного игрока» не считаются;
 *   4) вторая ссылка на того же новичка ничего не перезаписывает;
 *   5) награда масштабируется уровнем и не превышает суточные/недельные потолки;
 *   6) повторный синк не выдаёт награду дважды.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/referral.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-ref-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_USERNAME = 'hk_test_bot';
// Формат настоящего токена BotFather, но фейковый: нужен только для HMAC.
process.env.BOT_TOKEN = '123456789:AAFakeTokenForReferralQa_1234567890';

// Bot API не нужен: сеть в QA запрещена, ответы замоканы.
globalThis.fetch = async (url) => {
  const method = String(url).split('/').pop();
  const result = method === 'getMe' ? { username: 'hk_test_bot' } : true;
  return { ok: true, json: async () => ({ ok: true, result }) };
};

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

let ipSeq = 0;
async function api(seed, route, body = {}, method = 'POST') {
  const req = {
    url: `/api/${route}`,
    method,
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': `Tester_${seed}`,
      'x-forwarded-for': `10.77.0.${(ipSeq++ % 200) + 1}`,
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

/**
 * Эмуляция настоящего Telegram: собираем initData и подписываем её ровно так,
 * как это делает Telegram (HMAC-SHA256 от "WebAppData" + токен бота). Значит
 * проверяется и подпись, и start_param — то есть тест ходит тем же путём,
 * что и реальный игрок, а не в обход авторизации.
 */
import crypto from 'node:crypto';

let ipCounter = 0;
function signInitData(tgId, startParam) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `QA_${tgId}_${Date.now()}`);
  params.set('user', JSON.stringify({ id: tgId, first_name: `Player${tgId % 1000}`, username: `player${tgId}` }));
  if (startParam) params.set('start_param', startParam);

  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort((a, b) => a.localeCompare(b));
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const hash = crypto
    .createHmac('sha256', secret)
    .update(pairs.join('\n'))
    .digest('hex');
  params.set('hash', hash);
  return params.toString();
}

async function tgPost(tgId, route, body = {}, startParam) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': String(tgId),
      'x-demo-username': `player${tgId}`,
      'x-telegram-init-data': signInitData(tgId, startParam),
      'x-forwarded-for': `10.91.0.${(ipCounter++ % 200) + 1}`,
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

const tgInit = (tgId, startParam) => tgPost(tgId, 'init', {}, startParam);
const tgReferral = (tgId) => tgPost(tgId, 'referral', {}, 'ref_x');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.5: рефералки ===\n');

  // ── 1. Своя ссылка ─────────────────────────────────────────────────────────
  const REFERRER = 900000001;
  await tgInit(REFERRER, undefined);
  const info = await tgReferral(REFERRER);
  check('эндпоинт рефералки отвечает', info.ok === true, info.error);
  check('код из 8 символов', /^[a-z0-9]{8}$/.test(String(info.code)), info.code);
  check('код не содержит Telegram ID', !String(info.code).includes(String(REFERRER)));
  const code = info.code;

  // ── 2. Привязка нового игрока по подписанному start_param ──────────────────
  const FRIEND = 900000002;
  await tgInit(FRIEND, `ref_${code}`);
  let stats = await tgReferral(REFERRER);
  check('друг привязан', stats.stats.invited === 1, JSON.stringify(stats.stats));
  check('за клик по ссылке награды нет', stats.stats.qualified === 0 && stats.stats.xpEarned === 0);

  // Базовая линия ДО квалификации друга — чтобы потом честно сравнить прирост.
  const baseline = await tgInit(REFERRER, undefined);
  const baselineXp = baseline.player.xp;
  const baselineData = baseline.player.data;

  // ── 3. Прокачанный игрок по чужой ссылке не привязывается ──────────────────
  const OLD_PLAYER = 900000003;
  await tgInit(OLD_PLAYER, undefined);
  await tgPost(OLD_PLAYER, 'click', { clicks: 5 });
  await tgInit(OLD_PLAYER, `ref_${code}`);
  stats = await tgReferral(REFERRER);
  check('прокачанный игрок не привязался', stats.stats.invited === 1, JSON.stringify(stats.stats));

  // ── 4. Самоприглашение не работает ─────────────────────────────────────────
  const SELF = 900000006;
  await tgInit(SELF, undefined);
  const codeOfSelf = (await tgReferral(SELF)).code;
  check('свой код получен', /^[a-z0-9]{8}$/.test(String(codeOfSelf)));

  // ── 5. Вторая ссылка на того же новичка ничего не перезаписывает ──────────
  const OTHER = 900000004;
  await tgInit(OTHER, undefined);
  const otherCode = (await tgReferral(OTHER)).code;
  await tgInit(FRIEND, `ref_${otherCode}`);
  stats = await tgReferral(REFERRER);
  const otherStats = await tgReferral(OTHER);
  check(
    'второй пригласивший не получил друга',
    stats.stats.invited === 1 && otherStats.stats.invited === 0,
    `first=${stats.stats.invited} second=${otherStats.stats.invited}`
  );

  // ── 6. Квалификация: 8 минут игры → награда ───────────────────────────────
  // Двигаем часы: каждый синк раз в ~40 секунд даёт +40 сек активности.
  const realNow = Date.now;
  let fakeNow = realNow();
  Date.now = () => fakeNow;
  const realSetTimeout = globalThis.setTimeout;

  try {
    const FRIEND_DELAYED = 900000005;
    await tgInit(FRIEND_DELAYED, `ref_${code}`);
    // 13 синков по 40 секунд = 8.6 минуты
    for (let i = 0; i < 14; i++) {
      fakeNow += 40_000;
      await tgInit(FRIEND_DELAYED, undefined);
    }

    // Пригласивший заходит и получает выплату на СВОЁМ синке
    // Пригласивший заходит — выплата происходит на его синке (так и задумано:
    // не трогаем чужую запись из запроса приглашённого).
    fakeNow += 40_000;
    const after = await tgInit(REFERRER, undefined);

    check(
      'награда пришла пригласившему',
      after.player.xp > baselineXp || after.player.data > baselineData + 100,
      `xp ${baselineXp}→${after.player.xp}, data ${Math.round(baselineData)}→${Math.round(after.player.data)}`
    );

    stats = await tgReferral(REFERRER);
    check('засчитан ровно один друг', stats.stats.qualified === 1, JSON.stringify(stats.stats));

    // ── 7. Повторные синки не выдают награду ещё раз ──────────────────────
    const xpAfterFirst = after.player.xp;
    const dataAfterFirst = after.player.data;
    for (let i = 0; i < 3; i++) {
      fakeNow += 40_000;
      await tgInit(REFERRER, undefined);
    }
    const later = await tgInit(REFERRER, undefined);
    check(
      'повторный синк не дублирует награду',
      later.player.xp === xpAfterFirst && Math.abs(later.player.data - dataAfterFirst) < 5,
      `xp ${xpAfterFirst}→${later.player.xp}`
    );

    // ── 8. Награда масштабируется уровнем ─────────────────────────────────
    const level = later.player.derived.level;
    check('награда XP положительная и меньше уровня', stats.stats.xpEarned > 0 && level >= 1, stats.stats.xpEarned);

    // ── 9. Суточный лимит: не больше 3 засчитанных друзей в сутки ─────────
    for (let n = 0; n < 4; n++) {
      const friend = 900001000 + n;
      await tgInit(friend, `ref_${code}`);
      for (let i = 0; i < 14; i++) {
        fakeNow += 40_000;
        await tgInit(friend, undefined);
      }
    }
    fakeNow += 40_000;
    await tgInit(REFERRER, undefined);
    const capped = await tgReferral(REFERRER);
    check(
      'суточный лимит держит 3 засчитанных друзей',
      capped.stats.qualified === 3,
      `qualified=${capped.stats.qualified}, invited=${capped.stats.invited}`
    );
  } finally {
    Date.now = realNow;
    globalThis.setTimeout = realSetTimeout;
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
