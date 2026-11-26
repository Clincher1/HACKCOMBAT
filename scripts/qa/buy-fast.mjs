/**
 * HACKER KOMBAT — QA v3.3: мгновенные покупки без ложных отказов.
 *
 * Проблема, которую закрывает этот тест (баг из скриншота «Операция отклонена.
 * Недостаточно Data», хотя деньги на экране есть):
 *   покупка уходила вторым запросом, обгоняла ещё летящую пачку кликов,
 *   и сервер видел устаревший баланс.
 *
 * Решение: клиент прикладывает остаток неотправленных кликов к самой покупке
 * (`clicks` в теле запроса), сервер применяет их ДО проверки цены и возвращает
 * `appliedClicks`, чтобы клиент дослал не зачтённое античитом.
 *
 * Запуск (нужна собранная функция: npm run build):
 *   node scripts/qa/buy-fast.mjs
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-buy-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);

// v6.4: тап-цикл ограничен 6 тапами/сек, поэтому «накопить Data честным темпом»
// в реальном времени заняло бы минуты. Игровое время ускоряем (Date.now), как в
// соседних серверных сьютах: логика остаётся серверной, ждать не нужно.
const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;
const advance = (ms) => {
  fakeNow += ms;
};

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(seed, route, body = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': `Tester_${seed}`,
      'x-forwarded-for': '10.44.0.1',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = {
    statusCode: 200,
    headers: {},
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

/** Достаёт число из текста ошибки вида «Недостаточно Data (нужно 1 015)». */
const priceFromError = (error) => Number(String(error ?? '').replace(/\D+/g, '')) || 0;

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.3: быстрые покупки ===\n');

  // ── Игрок А: проверяем покупку «с хвостом» кликов
  const A = 'buy-fast-a';
  let r = await api(A, 'init');
  check('игрок создан', r.ok === true, r.player?.id);
  const clickPower = r.player.derived.clickPower;

  // Цену читаем ДО накопления: пока Data не хватает, покупка отклоняется и
  // возвращает точную цену, ничего не списывая.
  const probe = await api(A, 'buy-card', { cardKey: 'keyboard', clicks: 0 });
  const price = priceFromError(probe.error);
  check('цена карточки читается с сервера', price > 0, price || probe.error);

  // v6.4: серверный темп тапа — 6/с (паритет с взломами). Копим Data пачками
  // по 12 тапов за 2 игровые секунды — ровно на пределе темпа, плюс ежедневный
  // бонус новичка.
  await api(A, 'daily');
  let taps = 0;
  let guard = 0;
  let player = (await api(A, 'init')).player;
  while (price - player.data > 18 && guard < 200) {
    advance(2000);
    await api(A, 'click', { clicks: 12 });
    taps += 12;
    player = (await api(A, 'init')).player;
    guard += 1;
  }
  check('клики зачлись на темпе 6/с', player.totalClicks >= 150, `${player.totalClicks} тапов за ${guard} пачек`);

  const gap = Math.max(0, price - player.data);
  // Клиент прикладывает к покупке не больше 20 кликов (CLICK_MAX_BATCH).
  const clicksToSend = Math.min(20, Math.ceil(gap / clickPower) + 2);
  console.log(`  не хватает ${gap.toFixed(0)} Data → шлём ${clicksToSend} кликов вместе с покупкой`);

  const withTail = await api(A, 'buy-card', { cardKey: 'keyboard', clicks: clicksToSend });
  check('покупка с хвостом кликов не отклонена', withTail.ok === true, withTail.error ?? '');
  check('сервер сообщил, сколько кликов зачёл', typeof withTail.appliedClicks === 'number', withTail.appliedClicks);
  check('хвост зачтён полностью', withTail.appliedClicks === clicksToSend, `${withTail.appliedClicks} из ${clicksToSend}`);
  check('карточка куплена', (withTail.player?.cards?.keyboard ?? 0) === 1, withTail.player?.cards?.keyboard);

  // ── Игрок Б: неудачная покупка не должна съедать клики
  const B = 'buy-fast-b';
  r = await api(B, 'init');
  advance(2000);
  await api(B, 'click', { clicks: 20 });
  r = await api(B, 'init');
  const beforeFail = r.player.data;
  const failed = await api(B, 'base', { upgradeKey: 'coffee_machine', clicks: 10 });
  check('дорогая покупка отклонена', failed.ok === false, failed.error ?? '');
  r = await api(B, 'init');
  check('клики из неудачной покупки сохранены', r.player.data > beforeFail, `${beforeFail} → ${r.player.data}`);
  check(
    'клики из неудачной покупки не начислены дважды',
    r.player.data <= beforeFail + 10 * r.player.derived.clickPower + 5,
    `${beforeFail} → ${r.player.data}`
  );

  // ── Игрок В: античит режет «хвост» и честно сообщает, сколько зачёл
  const C = 'buy-fast-c';
  await api(C, 'init');
  advance(2000);
  const trimmed = await api(C, 'click', { clicks: 60 });
  check('античит не даёт 60 кликов подряд', (trimmed.appliedClicks ?? 0) < 60, trimmed.appliedClicks);
  advance(2000);
  const clk = await api(C, 'click', { clicks: 20 });
  // v6.4: за 2 секунды простоя ведро токенов возвращает ровно 6 × 2 = 12 тапов.
  check('/api/click отдаёт appliedClicks', clk.appliedClicks === 12, clk.appliedClicks);
  advance(2000);
  const huge = await api(C, 'click', { clicks: 1000 });
  check('сервер не принимает больше 60 кликов за раз', (huge.appliedClicks ?? 0) <= 60, huge.appliedClicks);

  console.log(`\n=== ИТОГО: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) console.log('Провалы: ' + failures.join(' | '));

  Date.now = realNow;
  fs.rmSync(sandbox, { recursive: true, force: true });
  process.exitCode = fail > 0 ? 1 : 0;
})().catch((err) => {
  console.error('CRASH', err);
  process.exitCode = 1;
});
