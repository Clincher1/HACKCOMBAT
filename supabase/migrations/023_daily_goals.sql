-- 023_daily_goals.sql — «Цели дня»: сбор награды и источник дропа `daily`
--
-- Зачем миграция вообще нужна
--   • `item_drops.source` в 022 разрешает только ('hack','mission','level'), а
--     гарантированный предмет за полный сбор трёх целей дня пишется с
--     source='daily' — это осмысленный отдельный источник, по которому видно
--     происхождение предмета в журнале и в QA.
--   • сбор награды обязан быть атомарным (дата + готовность + claimed + выдача),
--     поэтому он живёт в RPC `claim_daily_goal`, а не в двух запросах из Lambda.
--
-- Строго аддитивно (README миграций):
--   • DROP CONSTRAINT + ADD CONSTRAINT с расширенным списком — данные не
--     читаются и не переписываются, существующие строки ('hack'/'mission'/
--     'level') по-прежнему проходят проверку;
--   • `grant_item` пересоздаётся через CREATE OR REPLACE с тем же контрактом,
--     добавлен лишь 'daily' в список разрешённых источников;
--   • таблиц, колонок и строк не удаляем, прогресс игроков не трогаем;
--   • состояние целей живёт в существующем `players.stats` jsonb, новых
--     колонок нет — старые сейвы читаются без правок.

BEGIN;

-- ── 1. Расширяем CHECK источника дропа ──────────────────────────────────────
-- Имя у inline-CHECK из 022 автогенерируемое (item_drops_source_check), но
-- DROP IF EXISTS страхует от ручного переименования в проде.
ALTER TABLE public.item_drops DROP CONSTRAINT IF EXISTS item_drops_source_check;
ALTER TABLE public.item_drops
  ADD CONSTRAINT item_drops_source_check
  CHECK (source IN ('hack', 'mission', 'level', 'daily'));

COMMENT ON CONSTRAINT item_drops_source_check ON public.item_drops IS
  'Источник дропа: взлом / контракт / уровень / полный сбор целей дня (daily, 023).';

-- ── 2. grant_item принимает 'daily' ─────────────────────────────────────────
-- Тело совпадает с 022 за исключением списка источников: одна транзакция,
-- upsert стопки + строка журнала.
CREATE OR REPLACE FUNCTION public.grant_item(
  p_player_id uuid,
  p_item_key text,
  p_source text,
  p_outcome text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty integer;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'GRANT_ITEM_NO_PLAYER';
  END IF;
  IF p_item_key IS NULL OR btrim(p_item_key) = '' OR char_length(p_item_key) > 120 THEN
    RAISE EXCEPTION 'GRANT_ITEM_INVALID_KEY';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('hack', 'mission', 'level', 'daily') THEN
    RAISE EXCEPTION 'GRANT_ITEM_INVALID_SOURCE';
  END IF;

  INSERT INTO public.player_items (player_id, item_key, qty)
  VALUES (p_player_id, p_item_key, 1)
  ON CONFLICT (player_id, item_key)
  DO UPDATE SET qty = public.player_items.qty + 1,
                updated_at = now()
  RETURNING qty INTO v_qty;

  INSERT INTO public.item_drops (player_id, item_key, source, outcome)
  VALUES (p_player_id, p_item_key, p_source, NULLIF(btrim(coalesce(p_outcome, '')), ''));

  RETURN v_qty;
END;
$$;

-- ── 3. Атомарный сбор награды за цель дня ───────────────────────────────────
-- Одна транзакция и блокировка строки игрока:
--   1) берём `players` FOR UPDATE — два параллельных claim сериализуются,
--      второй видит уже проставленный claimed и падает, награду не выдаёт;
--   2) проверяем дату доски (UTC), готовность и отсутствие отметки;
--   3) начисляем Chips/Crypto и помечаем цель забранной;
--   4) если остальные две цели уже забраны — выдаём предмет через grant_item
--      с source='daily' в ТОЙ ЖЕ транзакции (ошибка выдачи откатит и сбор).
-- Награда за конкретную цель передаётся из серверного кода (p_chips), но
-- ограничена сверху, чтобы скомпрометированный клиент не мог прислать 10^9.
CREATE OR REPLACE FUNCTION public.claim_daily_goal(
  p_player_id uuid,
  p_goal_index integer,
  p_chips integer,
  p_crypto integer,
  p_item_key text,
  p_day text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.players%ROWTYPE;
  v_goals jsonb;
  v_goal jsonb;
  v_new_goals jsonb;
  v_target integer;
  v_progress integer;
  v_key text;
  v_full boolean;
  v_qty integer := NULL;
  v_chips integer;
  v_crypto integer;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'DAILY_GOAL_NO_PLAYER';
  END IF;
  IF p_goal_index IS NULL OR p_goal_index < 0 OR p_goal_index > 2 THEN
    RAISE EXCEPTION 'DAILY_GOAL_INDEX';
  END IF;
  IF p_chips IS NULL OR p_chips < 0 OR p_chips > 10 THEN
    RAISE EXCEPTION 'DAILY_GOAL_CHIPS';
  END IF;
  IF p_crypto IS NULL OR p_crypto < 0 OR p_crypto > 5 THEN
    RAISE EXCEPTION 'DAILY_GOAL_CRYPTO';
  END IF;

  -- Блокировка строки: именно она делает «два параллельных claim» безопасными.
  SELECT * INTO v_row FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DAILY_GOAL_NO_PLAYER';
  END IF;

  IF v_row.stats IS NULL
     OR jsonb_typeof(v_row.stats -> 'dailyGoals') <> 'object'
     OR coalesce(v_row.stats -> 'dailyGoals' ->> 'version', '') <> '1' THEN
    RAISE EXCEPTION 'DAILY_GOAL_NO_BOARD';
  END IF;
  IF coalesce(v_row.stats -> 'dailyGoals' ->> 'date', '') <> coalesce(p_day, '') THEN
    RAISE EXCEPTION 'DAILY_GOAL_DAY_CHANGED';
  END IF;

  v_goals := v_row.stats -> 'dailyGoals' -> 'goals';
  IF v_goals IS NULL OR jsonb_typeof(v_goals) <> 'array' OR jsonb_array_length(v_goals) <> 3 THEN
    RAISE EXCEPTION 'DAILY_GOAL_NO_BOARD';
  END IF;

  v_goal := v_goals -> p_goal_index;
  IF v_goal IS NULL OR jsonb_typeof(v_goal) <> 'object' THEN
    RAISE EXCEPTION 'DAILY_GOAL_INDEX';
  END IF;
  IF coalesce((v_goal ->> 'claimed')::boolean, false) THEN
    RAISE EXCEPTION 'DAILY_GOAL_ALREADY_CLAIMED';
  END IF;

  v_target := coalesce((v_goal ->> 'target')::integer, 0);
  v_progress := coalesce((v_goal ->> 'progress')::integer, 0);
  IF v_target <= 0 OR v_progress < v_target THEN
    RAISE EXCEPTION 'DAILY_GOAL_NOT_READY';
  END IF;
  v_key := v_goal ->> 'key';

  -- Полный сбор = все остальные цели уже забраны (индекс массива 0-based).
  SELECT NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_goals) WITH ORDINALITY AS g(elem, idx)
     WHERE (idx - 1) <> p_goal_index
       AND coalesce((elem ->> 'claimed')::boolean, false) = false
  ) INTO v_full;

  v_new_goals := jsonb_set(v_goals, ARRAY[p_goal_index::text, 'claimed'], 'true'::jsonb, false);

  IF v_full AND p_item_key IS NOT NULL AND btrim(p_item_key) <> '' THEN
    -- Та же транзакция: если выдача упадёт, сбор цели тоже откатится.
    v_qty := public.grant_item(p_player_id, p_item_key, 'daily', 'full_collect');
  END IF;

  UPDATE public.players
     SET chips = coalesce(chips, 0) + p_chips,
         crypto = coalesce(crypto, 0) + p_crypto,
         stats = jsonb_set(stats, '{dailyGoals,goals}', v_new_goals, false)
   WHERE id = p_player_id
   RETURNING chips, crypto INTO v_chips, v_crypto;

  RETURN jsonb_build_object(
    'goal_index', p_goal_index,
    'goal_key', v_key,
    'chips_delta', p_chips,
    'crypto_delta', p_crypto,
    'chips', v_chips,
    'crypto', v_crypto,
    'goals', v_new_goals,
    'full_collect', v_full,
    'item_key', CASE WHEN v_qty IS NULL THEN NULL ELSE p_item_key END,
    'item_qty', v_qty
  );
END;
$$;

COMMENT ON FUNCTION public.claim_daily_goal(uuid, integer, integer, integer, text, text) IS
  'Атомарно забирает награду за цель дня: FOR UPDATE, проверка даты/готовности/claimed, Chips+Crypto, предмет за полный сбор.';

-- ── 4. Права: только серверный service-role ─────────────────────────────────
REVOKE ALL ON FUNCTION public.claim_daily_goal(uuid, integer, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_goal(uuid, integer, integer, integer, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.grant_item(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_item(uuid, text, text, text) TO service_role;

-- ── 5. Самопроверка ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.item_drops'::regclass
     AND conname = 'item_drops_source_check';
  IF v_def IS NULL OR position('daily' in v_def) = 0 THEN
    RAISE EXCEPTION 'MIGRATION_023_SOURCE_CHECK_MISSING';
  END IF;
  IF to_regprocedure('public.claim_daily_goal(uuid,integer,integer,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_023_CLAIM_MISSING';
  END IF;
  IF to_regprocedure('public.grant_item(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_023_GRANT_MISSING';
  END IF;
END;
$$;

COMMIT;
