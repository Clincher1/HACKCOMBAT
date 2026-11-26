/**
 * HACKER KOMBAT — QA: /api/track для воронки и клиентских ошибок (v5.3).
 *
 * Проверяет роут целиком в memory-режиме (без Supabase):
 *  • 6 шагов воронки и client_error проходят валидацию и отдают 204 без тела;
 *  • неизвестное событие и пустой event — 400;
 *  • client_error без meta.message — 400;
 *  • служебные поля (initData) не возвращаются клиенту;
 *  • legacy-телеметрия (tab:*, tutorial_open, session) по-прежнему отдаёт 200
 *    с синком игрока — на ней держатся ачивки;
 *  • GET → 405, мусорное тело → 400.
 *
 * SQL-часть (антифлуд 5 c, дедупликация воронки, маппинг ошибок) живёт в
 * supabase/migrations/019_client_events.sql и проверяется на живой базе
 * запросами к public.insert_client_event(...).
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-client-events-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VITE_SUPABASE_URL;

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
    payload: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      this.payload = chunk;
    },
  };
}

async function request(route, body, options = {}) {
  const method = options.method ?? 'POST';
  const seed = options.seed ?? 'client-events-qa';
  const req = {
    url: `/api/${route}`,
    method,
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': 'EventsTester',
      'x-forwarded-for': '10.51.0.1',
      'user-agent': 'QA/1.0 (client-events)',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = makeRes();
  await dispatchApiRequest(req, res);
  let parsed;
  try {
    parsed = res.payload === undefined || res.payload === '' ? undefined : JSON.parse(res.payload);
  } catch {
    parsed = undefined;
  }
  return { status: res.statusCode, payload: res.payload, json: parsed, headers: res.headers };
}

const FUNNEL = ['app_opened', 'init_ok', 'first_frame', 'first_tap', 'first_upgrade', 'first_mission_start'];

const init = await request('init', {});
check('игрок инициализируется', init.json?.ok === true, `status ${init.status}`);

for (const event of FUNNEL) {
  const res = await request('track', { event, timestamp: Date.now(), userAgent: 'QA/1.0', initData: '', meta: { level: 2 } });
  check(`шаг воронки принимается без тела: ${event}`, res.status === 204 && res.payload === undefined);
}

const errorEvent = await request('track', {
  event: 'client_error',
  timestamp: Date.now(),
  userAgent: 'QA/1.0',
  meta: {
    kind: 'unhandledrejection',
    message: 'Cannot read properties of undefined',
    url: 'https://hacker-kombat.vercel.app/hacks',
    line: 42,
    column: 7,
    stack: 'TypeError: x is undefined\n  at HacksPage',
  },
});
check('client_error принимается и отдаёт 204', errorEvent.status === 204 && errorEvent.payload === undefined);

const noBodyEcho = await request('track', { event: 'init_ok', initData: 'query_id=AAH...&hash=deadbeef' });
check('initData не возвращается клиенту', noBodyEcho.status === 204 && noBodyEcho.payload === undefined);

const noMessage = await request('track', { event: 'client_error', meta: { url: 'https://x' } });
check('client_error без message — 400', noMessage.status === 400 && noMessage.json?.ok === false);

const badMeta = await request('track', { event: 'client_error', meta: 'not-an-object' });
check('client_error с мусорным meta — 400', badMeta.status === 400);

const unknown = await request('track', { event: 'totally_unknown_event' });
check('неизвестное событие — 400', unknown.status === 400 && unknown.json?.error === 'event is not allowed');

const named = await request('track', { event: 'x'.repeat(120) });
check('слишком длинное имя события — 400', named.status === 400);

const empty = await request('track', {});
check('пустой event — 400', empty.status === 400);

const injection = await request('track', { event: "app_opened'; drop table players; --" });
check('SQL-подобное имя события не проходит whitelist', injection.status === 400);

const getRequest = await request('track', { event: 'app_opened' }, { method: 'GET' });
check('GET — 405', getRequest.status === 405);

const garbageBody = await request('track', 'not-json');
check('мусорное тело — 400', garbageBody.status === 400);

const legacyTab = await request('track', { event: 'tab:/hacks' });
check('legacy tab:* отдаёт синк игрока (200)', legacyTab.status === 200 && legacyTab.json?.player?.derived?.level >= 1);

const legacyTutorial = await request('track', { event: 'tutorial_open' });
check('legacy tutorial_open принимается (200)', legacyTutorial.status === 200 && legacyTutorial.json?.ok === true);

const legacySession = await request('track', { event: 'session', value: 12 });
check('legacy session принимается (200)', legacySession.status === 200 && legacySession.json?.ok === true);

const legacyBadArg = await request('track', { event: 'tab:/nope' });
check('legacy tab с чужим путём не ломает запрос', legacyBadArg.status === 200);

console.log(`\nClient events QA: ${pass} pass / ${fail} fail`);
if (fail > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
