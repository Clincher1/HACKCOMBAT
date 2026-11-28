#!/usr/bin/env node
/**
 * HACKER KOMBAT — v1: вайп прогресса игроков.
 * ----------------------------------------------------------------------------
 * Одна команда, два режима:
 *
 *   node scripts/wipe-players.mjs                  # DRY-RUN: статистика, ноль записей
 *   node scripts/wipe-players.mjs --backup-only    # только бэкап в файл
 *   node scripts/wipe-players.mjs --confirm        # бэкап → вайп → сверка
 *
 * Ничего не происходит «само»: вайп запускается только этой командой с явным
 * флагом --confirm. На старте приложения автосброса нет (и не будет).
 *
 * Что удаляется (см. scripts/lib/wipe-core.mjs): players и все каскадные дети
 * (уровень, XP, Data, Crypto, чипы, карточки, команда, питомцы, база, миссии,
 * достижения, престиж, Heat, стрики, сюжет, косметика — всё это поля players и
 * строки детей), плюс tg-keyed хвосты (operator_archive, operator_legacy_cutoff,
 * referral_codes, referrals). Админский аккаунт вайпается наравне со всеми.
 *
 * Что остаётся: client_events (телеметрия по дням) — только отвязывается от
 * игрока.
 *
 * v1.1: таблица donations к игре не относится (донат живёт в боте, в Telegram
 * Stars), поэтому в план вайпа не входит вообще — ни шагом, ни флагом. Её
 * единственное касание — FK ON DELETE SET NULL у игрока, который БД делает сама
 * при удалении записи игрока. Строки и таблицу не трогаем.
 *
 * Окружение: SUPABASE_URL (+ VITE_SUPABASE_URL как запасной) и
 * SUPABASE_SERVICE_ROLE_KEY. В Vercel они уже есть — тем же ключом пользуется API.
 *
 * Коды выхода: 0 — успех, 1 — вайп/сверка провалились, 2 — нет окружения,
 * 3 — бэкап не создан (вайп не начинался).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  PLAYER_TABLES,
  PRESERVED_TABLES,
  assertPlanSafe,
  buildPlan,
  renderSummary,
  summarize,
  verifyAfterWipe,
} from './lib/wipe-core.mjs';

const PAGE = 1000;
/** Порядок выборки: по pk, чтобы страницы не «плясали». */
const ORDER_BY = {
  players: 'id',
  achievements: 'id',
  base_upgrades: 'id',
  cards: 'id',
  missions: 'id',
  pets: 'id',
  team: 'id',
  client_events: 'id',
  new_year_candy: 'player_id',
  operator_archive: 'tg_id',
  operator_legacy_cutoff: 'tg_id',
  referral_codes: 'tg_id',
  referrals: 'invitee_tg',
};

function usage() {
  return [
    'HACKER KOMBAT — вайп прогресса игроков (v1)',
    '',
    '  node scripts/wipe-players.mjs                dry-run: показать статистику, ничего не писать',
    '  node scripts/wipe-players.mjs --backup-only  сделать бэкап в backups/ и выйти',
    '  node scripts/wipe-players.mjs --confirm      бэкап → вайп → сверка',
    '',
    '  --out <file>         путь бэкапа (по умолчанию backups/players-<дата>.json)',
    '  --json               машинный вывод статистики (dry-run)',
    '',
    'Окружение: SUPABASE_URL (или VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY',
    'Приоритет URL: GAMEPLAY_DB_URL > SUPABASE_URL > VITE_SUPABASE_URL',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { confirm: false, backupOnly: false, out: null, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm') args.confirm = true;
    else if (arg === '--backup-only') args.backupOnly = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--out') {
      args.out = argv[i + 1] ?? null;
      i += 1;
    } else {
      throw new Error(`Неизвестный флаг: ${arg}`);
    }
  }
  return args;
}

function resolveEnv() {
  const url = process.env.GAMEPLAY_DB_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url: url.replace(/\/+$/, ''), key };
}

const dateStamp = () => new Date().toISOString().slice(0, 10);

/** Счётчики по всем таблицам плана + сохранённым. */
async function readCounts(client, tables, filterColumns = {}) {
  const counts = {};
  for (const table of tables) {
    const column = filterColumns[table];
    let query = client.from(table).select('*', { count: 'exact', head: true });
    if (column) query = query.not(column, 'is', null);
    const { count, error } = await query;
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

/** Все строки таблицы страницами (PostgREST режет выдачу на 1000). */
async function readTable(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = client.from(table).select('*').range(from, from + PAGE - 1);
    const order = ORDER_BY[table];
    if (order) query = query.order(order, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(`select ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Схема из OpenAPI PostgREST: настоящие типы колонок, а не догадки по JSON. */
async function readSchema(url, key, tables) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) throw new Error(`schema: HTTP ${res.status}`);
  const spec = await res.json();
  const definitions = spec.definitions ?? spec.components?.schemas ?? {};
  const schema = {};
  for (const table of tables) {
    schema[table] = definitions[table] ?? null;
  }
  return schema;
}

async function writeBackup(client, { url, key }, plan, outPathArg) {
  const tables = [...new Set([...plan.map((step) => step.table), ...PLAYER_TABLES, ...PRESERVED_TABLES])];
  const outPath = path.resolve(outPathArg ?? `backups/players-${dateStamp()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const data = {};
  const rows = {};
  for (const table of tables) {
    data[table] = await readTable(client, table);
    rows[table] = data[table].length;
    console.log(`  · бэкап ${table}: ${rows[table]} строк`);
  }
  const schema = await readSchema(url, key, tables).catch((error) => {
    console.warn(`  ! схема не получена (${error.message}) — дамп содержит только данные`);
    return null;
  });

  const payload = {
    meta: {
      kind: 'hacker-kombat/players-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      project: url.replace(/^https?:\/\//, '').split('.')[0],
      tables: rows,
      note:
        'Восстановление: вставить data[<table>] через PostgREST (service role) в том же порядке, ' +
        'что и в meta.tables; типы колонок — в schema (OpenAPI PostgREST).',
    },
    schema,
    data,
  };
  const body = JSON.stringify(payload);
  fs.writeFileSync(outPath, body);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');

  // Читаемость копии: файл должен парситься и совпадать по количеству строк.
  const reread = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  for (const table of tables) {
    if ((reread.data?.[table]?.length ?? -1) !== rows[table]) {
      throw new Error(`бэкап не читается: ${table} (${reread.data?.[table]?.length} ≠ ${rows[table]})`);
    }
  }
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`Бэкап: ${outPath} (${sizeMb} MB, sha256 ${sha256.slice(0, 16)}…), чтение подтверждено`);
  return { outPath, sha256, rows, sizeMb };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const plan = assertPlanSafe(buildPlan());
  const env = resolveEnv();
  if (!env.url || !env.key) {
    console.error('Нет окружения: нужны SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY.');
    console.error(usage());
    return 2;
  }
  const client = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = [...new Set([...plan.map((step) => step.table), ...PLAYER_TABLES, ...PRESERVED_TABLES])];
  const filterColumns = Object.fromEntries(plan.map((step) => [step.table, step.filterColumn]));
  const counts = await readCounts(client, tables, filterColumns);
  const summary = summarize(counts, plan);

  if (args.json) {
    console.log(JSON.stringify({ mode: args.confirm ? 'wipe' : 'dry-run', counts, summary }, null, 2));
  } else {
    console.log(renderSummary(summary, { confirmed: args.confirm }));
  }

  if (!args.confirm && !args.backupOnly) {
    console.log('\nDRY-RUN: записей не было. Для вайпа повторите с --confirm.');
    return 0;
  }

  // 1) БЭКАП. Если он не создан — вайп не начинается (нет копии, нет вайпа).
  console.log('\nБэкап перед вайпом:');
  let backup;
  try {
    backup = await writeBackup(client, env, plan, args.out);
  } catch (error) {
    console.error(`Бэкап НЕ создан: ${error.message}. Вайп не выполнен.`);
    return 3;
  }

  if (args.backupOnly) {
    console.log('Готово: бэкап создан, вайп не запускался (--backup-only).');
    return 0;
  }

  // 2) ВАЙП. Отвязка телеметрии — до удаления игроков, иначе CASCADE снесёт её.
  console.log('\nВайп:');
  for (const step of plan) {
    const query =
      step.action === 'detach'
        ? client.from(step.table).update(step.set).not(step.filterColumn, 'is', null).select(step.filterColumn)
        : client.from(step.table).delete().not(step.filterColumn, 'is', null).select(step.filterColumn);
    const { data, error } = await query;
    if (error) {
      console.error(`  ✗ ${step.table}: ${error.message}`);
      return 1;
    }
    console.log(`  ✓ ${step.table} (${step.action}): ${data?.length ?? 0} строк`);
  }

  // 3) СВЕРКА.
  const after = await readCounts(client, tables, filterColumns);
  const { count: detachedLeft, error: detachedError } = await client
    .from('client_events')
    .select('*', { count: 'exact', head: true })
    .not('player_id', 'is', null);
  if (detachedError) {
    console.error(`Сверка: ${detachedError.message}`);
    return 1;
  }
  const problems = verifyAfterWipe(after, plan, detachedLeft ?? 0);
  console.log('\nСверка после вайпа:');
  console.log(`  players: ${counts.players} → ${after.players}`);
  console.log(`  client_events: ${after.client_events} строк, привязано к игрокам: ${detachedLeft ?? 0}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }
  console.log('  ✓ чисто: игроков 0, каскад закрыт, телеметрия без привязок');
  console.log(`\nБэкап для отката: ${backup.outPath}`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`Ошибка: ${error.message}`);
    process.exitCode = 1;
  });
