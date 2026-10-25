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

  // Набираем Data кликами, как живой игрок: античит разрешает ≤30 кликов/сек,
  // поэтому пауза между пачками — 2 секунды (реальный клиент шлёт так же).
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    await api(A, 'click', { clicks: 50 });
  }
  r = await api(A, 'init');
  let p = r.player;
  check('клики зачлись', p.totalClicks >= 450, p.totalClicks);

  // Проверяем цену «Монитор IPS 240Hz» (пробный запрос без кликов не меняет баланс)
  const probe = await api(A, 'buy-card', { cardKey: 'monitor', clicks: 0 });
  const price = priceFromError(probe.error);
  check('цена карточки читается с сервера', price > 0, price || probe.ok);

  // Догоняем до «почти хватает»: нехватку в пару десятков Data закроет хвост кликов
  // (один запрос может привезти максимум 60 кликов).
  let data = p.data;
  let guard = 0;
  while (price - data > 18 && guard < 8) {
    await sleep(2000);
    await api(A, 'click', { clicks: 50 });
    data = (await api(A, 'init')).player.data;
    guard++;
  }

  const gap = Math.max(0, price - data);
  // Клиент прикладывает к покупке не больше 20 кликов (CLICK_MAX_BATCH).
  const clicksToSend = Math.min(20, Math.ceil(gap / clickPower) + 2);
  console.log(`  не хватает ${gap.toFixed(0)} Data → шлём ${clicksToSend} кликов вместе с покупкой`);

  const withTail = await api(A, 'buy-card', { cardKey: 'monitor', clicks: clicksToSend });
  check('покупка с хвостом кликов не отклонена', withTail.ok === true, withTail.error ?? '');
  check('сервер сообщил, сколько кликов зачёл', typeof withTail.appliedClicks === 'number', withTail.appliedClicks);
  check('хвост зачтён полностью', withTail.appliedClicks === clicksToSend, `${withTail.appliedClicks} из ${clicksToSend}`);
  check('карточка куплена', (withTail.player?.cards?.monitor ?? 0) === 1, withTail.player?.cards?.monitor);

  // ── Игрок Б: неудачная покупка не должна съедать клики
  const B = 'buy-fast-b';
  r = await api(B, 'init');
  await sleep(2000);
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
  await sleep(2000);
  const trimmed = await api(C, 'click', { clicks: 60 });
  check('античит не даёт 60 кликов подряд', (trimmed.appliedClicks ?? 0) < 60, trimmed.appliedClicks);
  await sleep(2000);
  const clk = await api(C, 'click', { clicks: 20 });
  check('/api/click отдаёт appliedClicks', clk.appliedClicks === 20, clk.appliedClicks);
  await sleep(2000);
  const huge = await api(C, 'click', { clicks: 1000 });
  check('сервер не принимает больше 60 кликов за раз', (huge.appliedClicks ?? 0) <= 60, huge.appliedClicks);

  console.log(`\n=== ИТОГО: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) console.log('Провалы: ' + failures.join(' | '));

  fs.rmSync(sandbox, { recursive: true, force: true });
  process.exitCode = fail > 0 ? 1 : 0;
})().catch((err) => {
  console.error('CRASH', err);
  process.exitCode = 1;
});
