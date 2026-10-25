/**
 * HACKER KOMBAT — QA v3.6: турнирная таблица.
 *
 * Что проверяем:
 *   1) каждая строка отдаёт и XP, и Data — игрок видит оба числа;
 *   2) сортировка работает по трём метрикам (data / xp / level) и не врёт;
 *   3) мусорный ?sort= не ломает API, а откатывается к data;
 *   4) своё место («Ты #N») приходит и согласовано с таблицей;
 *   5) в локальном рейтинге NPC тоже с опытом, а не с нулём.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/leaderboard.mjs
 */
import crypto from 'node:crypto';
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-lb-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.BOT_TOKEN = '123456789:AAFakeTokenForLeaderboardQa_123456789';

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
  params.set('user', JSON.stringify({ id: tgId, first_name: 'LbTester', username: `lb${tgId}` }));
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
      'x-demo-username': `lb${tgId}`,
      'x-telegram-init-data': signInitData(tgId),
      'x-forwarded-for': `10.94.0.${(ipCounter++ % 200) + 1}`,
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

const TG = 920000001;

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.6: турнирная таблица ===\n');

  // Создаём несколько «игроков», чтобы таблица была не из одного NPC-списка.
  for (let i = 0; i < 3; i++) {
    await call(TG + i, 'init');
  }

  const byData = await call(TG, 'leaderboard?sort=data');
  const byXp = await call(TG, 'leaderboard?sort=xp');
  const byLevel = await call(TG, 'leaderboard?sort=level');

  check('таблица отвечает ok', byData.ok === true);
  check('в ответе есть метрика', byData.sort === 'data', byData.sort);
  check('строки непустые', Array.isArray(byData.entries) && byData.entries.length > 0, byData.entries?.length);

  const sample = byData.entries?.[0] ?? {};
  check('строка содержит xp', Number.isFinite(sample.xp), sample.xp);
  check('строка содержит data', Number.isFinite(sample.data), sample.data);
  check(
    'у каждого игрока есть опыт (не undefined)',
    (byData.entries ?? []).every((e) => Number.isFinite(e.xp) && e.xp >= 0)
  );

  const monotonic = (list, key) =>
    (list ?? []).every((e, i) => i === 0 || Number(list[i - 1][key]) >= Number(e[key]));
  check('по Data отсортировано верно', monotonic(byData.entries, 'data'));
  check('по XP отсортировано верно', monotonic(byXp.entries, 'xp'));
  check('по уровню отсортировано верно', monotonic(byLevel.entries, 'level'));
  check('метрика xp вернулась', byXp.sort === 'xp', byXp.sort);
  check('метрика level вернулась', byLevel.sort === 'level', byLevel.sort);

  const garbage = await call(TG, 'leaderboard?sort=hackme');
  check('мусорный sort откатывается к data', garbage.sort === 'data', garbage.sort);

  check('своё место приходит', !!byData.me);
  if (byData.me) {
    check('место — положительное число', byData.me.rank >= 1, byData.me.rank);
    check('всего игроков не меньше места', byData.me.total >= byData.me.rank, `${byData.me.rank}/${byData.me.total}`);
    check('в своём месте есть xp', Number.isFinite(byData.me.xp), byData.me.xp);

    const myRowIdx = (byData.entries ?? []).findIndex((e) => e.isCurrentUser);
    if (myRowIdx >= 0 && myRowIdx < 100) {
      check('место совпадает с позицией в таблице', byData.me.rank === myRowIdx + 1, `${byData.me.rank} vs ${myRowIdx + 1}`);
    }
    check('место по XP считается в метрике xp', byXp.me?.metric === 'xp', byXp.me?.metric);
  }

  // NPC в локальном рейтинге должны иметь осмысленный опыт по кривой уровней
  const npc = (byXp.entries ?? []).find((e) => e.username === 'CipherQueen');
  if (npc) {
    check('у NPC есть опыт по кривой уровня', npc.xp > 0, `${npc.username}: ${npc.xp} XP, ур. ${npc.level}`);
    check('опыт NPC согласован с уровнем', npc.xp >= (npc.level - 1) * 100, npc.xp);
  } else {
    check('NPC присутствует в локальном рейтинге', false);
  }

  // Смена метрики не ломает данные игрока
  check(
    'смена метрики не теряет XP/Data в строках',
    (byXp.entries ?? []).every((e) => Number.isFinite(e.xp) && Number.isFinite(e.data))
  );

  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.log('Провалы:', failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('QA упал:', err);
  process.exit(1);
});
