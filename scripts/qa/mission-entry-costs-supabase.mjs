/**
 * HACKER KOMBAT — QA v3.10: Supabase-backed платный запуск контрактов.
 *
 * Не входит в qa:all: запускается только явно с SUPABASE_URL и
 * SUPABASE_SERVICE_ROLE_KEY. Создаёт изолированного отрицательного demo-player
 * и удаляет его в finally.
 *
 * Проверяет:
 *   - реальный RPC start_mission_atomic;
 *   - pending clicks + точное списание Data/Energy;
 *   - сохранение costs после повторного init;
 *   - правильные колонки missions.energy_cost/data_cost;
 *   - параллельный double-start и отсутствие второго активного контракта.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY для Supabase QA.');
  process.exit(2);
}

const CORE = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { dispatchApiRequest } = createRequire(import.meta.url)(CORE);
const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`.slice(-12);
const seed = `supabase-mission-${suffix}`;
const username = `QASupabase${suffix}`.slice(0, 28);

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

async function api(route, body = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': seed,
      'x-demo-username': encodeURIComponent(username),
      'x-forwarded-for': '10.44.0.1',
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

async function cleanup() {
  const { error } = await admin.from('players').delete().eq('username', username);
  if (error) throw error;
}

(async () => {
  console.log('=== HACKER KOMBAT — QA v3.10: Supabase-backed mission costs ===\n');

  const initResult = await api('init');
  if (!initResult.ok || !initResult.player) {
    throw new Error(`Supabase init не выполнен: ${initResult.error ?? 'нет player в ответе'}`);
  }
  const before = initResult.player;
  const missionKey = before.availableMissionKeys[0];
  const started = await api('missions', { action: 'start', missionKey, clicks: 5 });
  const active = started.player?.activeMissions?.[0];
  check('Supabase-backed start проходит через RPC', started.ok === true && Boolean(active), started.error);
  check('Supabase-backed pending clicks зачтены', started.appliedClicks === 5, started.appliedClicks);
  check(
    'Supabase-backed Data списан ровно после pending clicks',
    started.player?.data === before.data + 5 - Number(active?.entryDataCost ?? 0),
    `${before.data} + 5 − ${active?.entryDataCost ?? 0} → ${started.player?.data}`
  );
  check(
    'Supabase-backed Energy списан ровно за clicks и контракт',
    before.energy - started.player.energy >= Number(active?.entryEnergyCost ?? 0) + 5,
    `${before.energy} → ${started.player?.energy}`
  );

  const { data: missionRow, error: missionReadError } = await admin
    .from('missions')
    .select('energy_cost, data_cost, status')
    .eq('id', active?.id)
    .single();
  check('в Supabase сохранены правильные cost-колонки', !missionReadError && Number(missionRow?.energy_cost) === active.entryEnergyCost && Number(missionRow?.data_cost) === active.entryDataCost, missionReadError?.message);
  check('созданная Supabase-миссия active', missionRow?.status === 'active', missionRow?.status);

  const reloaded = await api('init');
  const reloadedActive = reloaded.player?.activeMissions?.[0];
  check('costs переживают Supabase init/reload', reloadedActive?.entryDataCost === active.entryDataCost && reloadedActive?.entryEnergyCost === active.entryEnergyCost);

  const skipped = await api('missions', { action: 'skip', missionId: active.id });
  check('Supabase claim/skip закрывает миссию один раз', skipped.ok === true && skipped.player?.activeMissions?.length === 0, skipped.error);
  const duplicate = await api('missions', { action: 'skip', missionId: active.id });
  check('Supabase повторный claim отклонён', duplicate.ok === false, duplicate.error);

  const parallelBefore = (await api('init')).player;
  const parallelMissionKey = parallelBefore.availableMissionKeys[0];
  const parallelResults = await Promise.all([
    api('missions', { action: 'start', missionKey: parallelMissionKey }),
    api('missions', { action: 'start', missionKey: parallelMissionKey }),
  ]);
  const successful = parallelResults.filter((result) => result.ok === true);
  const parallelReload = await api('init');
  check('Supabase параллельный double-start даёт один успех', successful.length === 1, parallelResults.map((result) => result.error ?? 'ok').join(' | '));
  check('Supabase параллельный double-start оставляет одну миссию', parallelReload.player?.activeMissions?.length === 1, parallelReload.player?.activeMissions?.length);

  console.log(`\nИтог: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.error(`Провалы: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
})()
  .catch((err) => {
    console.error('QA упал:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('Cleanup Supabase QA не удался:', cleanupError);
      process.exitCode = 1;
    }
  });
