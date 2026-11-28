/**
 * HACKER KOMBAT — v1: план вайпа игроков (чистая логика, без сети).
 * ----------------------------------------------------------------------------
 * Зачем отдельный модуль: сам скрипт вайпа — тонкая обвязка над PostgREST, а
 * вот РЕШЕНИЕ «что именно обнуляем» должно быть проверяемым без базы. Поэтому
 * здесь живёт только план и арифметика ожиданий; `scripts/qa/wipe.mjs` гоняет
 * их на in-memory адаптере, а `scripts/wipe-players.mjs` — на реальной БД.
 *
 * Модель данных на 28.11.2026 (public, 14 таблиц):
 *
 *   players (uuid pk)  ──CASCADE──▶ achievements, base_upgrades, cards, missions,
 *                                   new_year_candy, pets, team
 *                      ──CASCADE──▶ client_events    → отвязываем ДО удаления,
 *                                                      чтобы телеметрия осталась
 *   tg-keyed (FK нет):  operator_archive, operator_legacy_cutoff,
 *                       referral_codes, referrals — удаляем полностью.
 *
 * Системных таблиц (конфиги, события, счётчики) в public нет — конфиги живут в
 * shared/*.config.ts. Отвязка (а не удаление) client_events — единственное
 * «системное» действие: статистика по дням остаётся, привязки к игрокам нет.
 *
 * v1.1: таблица donations — НЕ игровая. Доната в игре нет и не будет (игра
 * бесплатная), пожертвование автору живёт в боте и в Telegram Stars. Вайп
 * игроков её не касается вообще: нет шага в плане, нет флага, нет упоминания в
 * сверках. Строку и саму таблицу не трогаем — это история пожертвований бота.
 * QA (qa/wipe.mjs) отдельно проверяет, что игровой код её не читает.
 *
 * Требование к базе: player_id в client_events должен быть nullable
 * (supabase/migrations/021_client_events_player_detach.sql). В 019 он NOT NULL,
 * и тогда «отвязать, потом удалить» физически невозможно, а «удалить, потом
 * отвязать» уносит события каскадом.
 */

/** Таблицы, которые после вайпа обязаны быть пустыми (данные игроков). */
export const PLAYER_TABLES = [
  'players',
  'achievements',
  'base_upgrades',
  'cards',
  'missions',
  'new_year_candy',
  'pets',
  'team',
  'operator_archive',
  'operator_legacy_cutoff',
  'referral_codes',
  'referrals',
];

/**
 * Таблицы, которые обязаны ВЫЖИТЬ и остаются в статистике вайпа.
 * Только телеметрия: она game-side, но обезличивается, а не удаляется.
 */
export const PRESERVED_TABLES = ['client_events'];

/**
 * Таблицы вне игрового контура (бот): вайп игроков не трогает их никогда.
 * donations — история пожертвований автору в Telegram Stars, к игре не
 * относится; в плане вайпа её быть не может (гард ниже).
 */
export const BOT_TABLES = ['donations'];

/**
 * Шаги вайпа. Порядок важен:
 *   1) отвязать телеметрию (иначе CASCADE снесёт события вместе с игроком);
 *   2) удалить игроков — детей забирает CASCADE;
 *   3) удалить tg-keyed хвосты, где внешних ключей нет.
 */
export function buildPlan() {
  const plan = [
    {
      table: 'client_events',
      action: 'detach',
      filterColumn: 'player_id',
      set: { player_id: null },
      note: 'телеметрия остаётся, привязка к игроку обнуляется',
    },
    {
      table: 'players',
      action: 'delete',
      filterColumn: 'id',
      note: 'каскад заберёт achievements, base_upgrades, cards, missions, new_year_candy, pets, team',
    },
    { table: 'operator_archive', action: 'delete', filterColumn: 'tg_id', note: 'архив оператора по tg' },
    { table: 'operator_legacy_cutoff', action: 'delete', filterColumn: 'tg_id', note: 'легаси-метки по tg' },
    { table: 'referral_codes', action: 'delete', filterColumn: 'tg_id', note: 'коды приглашений' },
    { table: 'referrals', action: 'delete', filterColumn: 'invitee_tg', note: 'связки «кто позвал»' },
  ];

  return plan;
}

/** Гарды: план не должен внезапно начать трогать то, чего не объявляли. */
export function assertPlanSafe(plan) {
  const allowed = new Set([...PLAYER_TABLES, ...PRESERVED_TABLES]);
  const seen = new Set();
  for (const step of plan) {
    if (!allowed.has(step.table)) {
      throw new Error(`Вайп: таблица «${step.table}» не объявлена в плане — отказ.`);
    }
    if (seen.has(step.table)) {
      throw new Error(`Вайп: таблица «${step.table}» встречается в плане дважды — отказ.`);
    }
    seen.add(step.table);
    if (step.action === 'detach' && step.table !== 'client_events') {
      throw new Error(`Вайп: detach разрешён только для client_events (а не «${step.table}»).`);
    }
    if (!step.filterColumn) throw new Error(`Вайп: у шага «${step.table}» нет filterColumn.`);
  }
  // Игроки обязаны удаляться всегда: без этого вайпа нет.
  if (!plan.some((step) => step.table === 'players' && step.action === 'delete')) {
    throw new Error('Вайп: в плане нет удаления players — отказ.');
  }
  // v1.1: денежные/ботовые таблицы в плане вайпа запрещены в принципе.
  for (const botTable of BOT_TABLES) {
    if (plan.some((step) => step.table === botTable)) {
      throw new Error(`Вайп: «${botTable}» — таблица бота, а не игры. В плане вайпа её быть не может.`);
    }
  }
  return plan;
}

/**
 * Сводка по счётчикам. `counts` — { table: number } ДО вайпа.
 * Возвращает то, что показываем в dry-run, и то, что потом сверяем.
 */
export function summarize(counts, plan) {
  const rows = plan.map((step) => ({
    table: step.table,
    action: step.action,
    rows: counts[step.table] ?? 0,
    note: step.note,
  }));
  const deletions = rows
    .filter((row) => row.action === 'delete')
    .reduce((sum, row) => sum + row.rows, 0);
  const detached = rows
    .filter((row) => row.action === 'detach')
    .reduce((sum, row) => sum + row.rows, 0);
  return {
    rows,
    deletions,
    detached,
    playerRows: counts.players ?? 0,
    preserved: PRESERVED_TABLES.map((table) => ({ table, rows: counts[table] ?? 0 })),
  };
}

/**
 * Проверка ПОСЛЕ вайпа. Возвращает массив проблем (пусто = всё чисто).
 * `counts` — счётчики после, `detachedLeft` — сколько строк client_events ещё
 * привязано к игроку.
 */
export function verifyAfterWipe(counts, plan, detachedLeft = 0) {
  const problems = [];
  for (const step of plan) {
    const left = counts[step.table] ?? 0;
    if (step.action === 'delete' && left !== 0) {
      problems.push(`${step.table}: осталось ${left} строк (ожидалось 0)`);
    }
  }
  // Каскадные дети не входят в план (их забирает players), но проверить надо.
  for (const table of ['achievements', 'base_upgrades', 'cards', 'missions', 'new_year_candy', 'pets', 'team']) {
    const left = counts[table];
    if (typeof left === 'number' && left !== 0) {
      problems.push(`${table}: каскад не сработал — осталось ${left} строк`);
    }
  }
  if (detachedLeft !== 0) {
    problems.push(`client_events: ${detachedLeft} строк всё ещё привязаны к игроку`);
  }
  return problems;
}

/** Человеческий отчёт для dry-run / лога. */
export function renderSummary(summary, options = {}) {
  const lines = [];
  const mode = options.confirmed ? 'WIPE (--confirm)' : 'DRY-RUN (ничего не удаляется)';
  lines.push(`Режим: ${mode}`);
  lines.push(`Игроков к удалению: ${summary.playerRows}`);
  lines.push('');
  lines.push('Таблица                    действие   строк   что делаем');
  lines.push('-------------------------- ---------- ------- ----------------------------------------');
  for (const row of summary.rows) {
    lines.push(
      `${row.table.padEnd(26)} ${row.action.padEnd(10)} ${String(row.rows).padStart(7)}   ${row.note ?? ''}`,
    );
  }
  lines.push('');
  lines.push(`Итого строк к удалению: ${summary.deletions}`);
  lines.push(`Строк телеметрии к отвязке: ${summary.detached}`);
  lines.push(
    `Сохраняем как есть: ${summary.preserved.map((row) => `${row.table} (${row.rows})`).join(', ')}`,
  );
  return lines.join('\n');
}
