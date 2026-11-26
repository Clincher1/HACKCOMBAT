/**
 * HACKER KOMBAT — QA: событийная воронка и клиентские ошибки (v5.2).
 *
 * Проверяет серверную часть src/lib/analytics.ts:
 *  • шесть шагов воронки (app_opened → first_mission_start) доходят до сейва;
 *  • неизвестное событие по-прежнему отбрасывается (whitelist не сломан);
 *  • client_error сохраняет message/url/line/column/stack в агрегат;
 *  • meta мусорного типа не ломает запрос;
 *  • счётчики воронки инкрементальные и не сбрасывают другие поля stats.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-funnel-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);

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

async function api(route, body = {}, seed = 'funnel-qa') {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'FunnelTester',
      'x-forwarded-for': '10.47.0.1',
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

const FUNNEL = ['app_opened', 'init_ok', 'first_frame', 'first_tap', 'first_upgrade', 'first_mission_start'];

const init = await api('init', {});
check('игрок инициализируется', init.ok === true);

for (const event of FUNNEL) {
  const res = await api('track', { event, timestamp: 1, userAgent: 'qa', initData: '', meta: { level: 2 } });
  check(`событие воронки сохраняется: ${event}`, res.ok === true && res.player?.stats?.funnel?.[event] === 1);
}

const again = await api('track', { event: 'first_tap' });
check('повторный шаг инкрементит счётчик', again.player?.stats?.funnel?.first_tap === 2);

const unknown = await api('track', { event: 'totally_unknown_event' });
check(
  'неизвестное событие отбрасывается',
  unknown.ok === true && unknown.player?.stats?.funnel?.totally_unknown_event === undefined
);

const errorRes = await api('track', {
  event: 'client_error',
  meta: {
    kind: 'unhandledrejection',
    message: 'Cannot read properties of undefined',
    url: 'https://hacker-kombat.vercel.app/hacks',
    line: 42,
    column: 7,
    stack: 'TypeError: x is undefined\n  at HacksPage',
  },
});
const stored = errorRes.player?.stats?.lastClientError;
check('client_error сохраняет message', stored?.message === 'Cannot read properties of undefined');
check('client_error сохраняет координаты', stored?.line === 42 && stored?.['column'] === 7);
check('client_error сохраняет stack', typeof stored?.stack === 'string' && stored.stack.includes('HacksPage'));
check('client_error хранит ISO-время', typeof stored?.at === 'string' && !Number.isNaN(Date.parse(stored.at)));

const garbageMeta = await api('track', { event: 'client_error', meta: 'not-an-object' });
check('мусорный meta не ломает запрос', garbageMeta.ok === true);

const longName = 'x'.repeat(120);
const longRes = await api('track', { event: longName });
check('длинное имя события не ломает запрос', longRes.ok === true);
check('длинное имя не попадает в воронку', longRes.player?.stats?.funnel?.[longName] === undefined);

const other = await api('track', { event: 'app_opened' }, 'funnel-qa-2');
check('другой игрок получает свой счётчик', other.player?.stats?.funnel?.app_opened === 1);

console.log(`\nFunnel QA: ${pass} pass / ${fail} fail`);
if (fail > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
