-- ============================================================================
-- HACKER KOMBAT — Миграция 020: шаг воронки мира first_move (v5.5)
-- ----------------------------------------------------------------------------
-- Аддитивная миграция: расширяет существующие объекты 019_client_events.sql,
-- ничего не удаляя из данных.
--
--  1. uq_client_events_funnel_once — уникальный частичный индекс дедупликации.
--     Добавляем 'first_move' рядом с прежними шестью шагами: «вышел в город»
--     пишется один раз за жизнь аккаунта, как и первый тап.
--  2. insert_client_event() — массив v_funnel. Шаги воронки не режутся
--     пятисекундным антифлудом; без правки массива первый first_move,
--     пришедший сразу после app_opened, получил бы 'throttled' и потерялся.
--
-- Совместимость: старые клиенты продолжают присылать first_tap, новые (при
-- включённом WORLD_V2) — first_move. Оба имени живут в одном индексе, поэтому
-- воронка не «склеивается» и не дублируется.
-- ============================================================================

-- 1. Индекс дедупликации шагов воронки ---------------------------------------
DROP INDEX IF EXISTS public.uq_client_events_funnel_once;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_events_funnel_once
  ON public.client_events (player_id, event)
  WHERE event IN (
    'app_opened',
    'init_ok',
    'first_frame',
    'first_tap',
    'first_move',
    'first_upgrade',
    'first_mission_start'
  );

-- 2. RPC приёма события: v_funnel = шаги без антифлуда ------------------------
CREATE OR REPLACE FUNCTION public.insert_client_event(
  p_player_id uuid,
  p_event text,
  p_timestamp timestamptz,
  p_user_agent text DEFAULT '',
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_error_kind text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_error_url text DEFAULT NULL,
  p_error_line integer DEFAULT NULL,
  p_error_column integer DEFAULT NULL,
  p_error_stack text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funnel constant text[] := ARRAY[
    'app_opened', 'init_ok', 'first_frame', 'first_tap', 'first_move',
    'first_upgrade', 'first_mission_start'
  ];
  v_inserted integer := 0;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN 'invalid';
  END IF;
  IF p_event IS NULL OR char_length(p_event) = 0 OR char_length(p_event) > 64 THEN
    RETURN 'invalid';
  END IF;

  -- Шаги воронки не режем антифлудом: они и так пишутся один раз за жизнь
  -- аккаунта, а жёсткий 5-секундный лимит «съел» бы init_ok и first_frame.
  IF NOT (p_event = ANY (v_funnel)) THEN
    IF p_event = 'client_error' THEN
      -- У ошибок свой лимит: одна ошибка в 5 секунд, чтобы не залить таблицу
      -- повторами одного и того же сломанного рендера.
      IF EXISTS (
        SELECT 1 FROM public.client_events c
        WHERE c.player_id = p_player_id
          AND c.event = 'client_error'
          AND c.created_at > now() - interval '5 seconds'
      ) THEN
        RETURN 'throttled';
      END IF;
    ELSIF EXISTS (
      SELECT 1 FROM public.client_events c
      WHERE c.player_id = p_player_id
        AND c.created_at > now() - interval '5 seconds'
    ) THEN
      RETURN 'throttled';
    END IF;
  END IF;

  INSERT INTO public.client_events (
    player_id, event, "timestamp", user_agent, meta,
    error_kind, error_message, error_url, error_line, error_column, error_stack
  )
  VALUES (
    p_player_id,
    p_event,
    COALESCE(p_timestamp, now()),
    COALESCE(p_user_agent, ''),
    COALESCE(p_meta, '{}'::jsonb),
    p_error_kind,
    p_error_message,
    p_error_url,
    p_error_line,
    p_error_column,
    p_error_stack
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN CASE WHEN v_inserted > 0 THEN 'inserted' ELSE 'duplicate' END;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_client_event(
  uuid, text, timestamptz, text, jsonb, text, text, text, integer, integer, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_client_event(
  uuid, text, timestamptz, text, jsonb, text, text, text, integer, integer, text
) TO service_role;

-- Проверка после применения:
--   select indexdef from pg_indexes where indexname = 'uq_client_events_funnel_once';
--   select pg_get_functiondef('public.insert_client_event(uuid,text,timestamptz,text,jsonb,text,text,text,integer,integer,text)'::regprocedure);
