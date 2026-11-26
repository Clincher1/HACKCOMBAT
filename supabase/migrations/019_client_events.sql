-- ============================================================================
-- HACKER KOMBAT — Миграция 019: client_events (воронка + клиентские ошибки)
-- ----------------------------------------------------------------------------
-- Аддитивная миграция: создаёт новую таблицу аналитики и одну RPC. Прогресс
-- игроков (players/cards/missions/...) не читается и не меняется.
--
-- Приватность: сырой initData здесь НЕ хранится. Идентичность подтверждается
-- HMAC-подписью Telegram в api/_lib/telegramAuth.ts, в таблицу попадает только
-- player_id (uuid игрока), событие, время, user-agent, безопасный meta-jsonb и
-- разобранные поля ошибки.
--
-- Производительность: одна RPC = один roundtrip. Внутри неё же живёт антифлуд
-- (5 секунд на игрока), дедупликация шагов воронки (один раз за жизнь аккаунта
-- через частичный уникальный индекс) и сам INSERT. Гонок нет: проверка и запись
-- идут в одной транзакции.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  event text NOT NULL,
  "timestamp" timestamptz NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_kind text,
  error_message text,
  error_url text,
  error_line integer,
  error_column integer,
  error_stack text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_events_event_len CHECK (char_length(event) BETWEEN 1 AND 64),
  CONSTRAINT client_events_ts_sane
    CHECK ("timestamp" >= timestamptz '2000-01-01' AND "timestamp" <= timestamptz '2100-01-01'),
  CONSTRAINT client_events_error_shape
    CHECK (error_kind IS NULL OR error_message IS NOT NULL)
);

-- Воронка: «что делал конкретный игрок и в каком порядке».
CREATE INDEX IF NOT EXISTS idx_client_events_player_time
  ON public.client_events (player_id, "timestamp" DESC);

-- Глобальные метрики: «сколько раз за сутки случился шаг».
CREATE INDEX IF NOT EXISTS idx_client_events_event_time
  ON public.client_events (event, "timestamp" DESC);

-- Ошибки: отдельный частичный индекс, чтобы не сканировать всю таблицу.
CREATE INDEX IF NOT EXISTS idx_client_events_errors
  ON public.client_events (player_id)
  WHERE error_kind IS NOT NULL;

-- Ретеншн: чистка старых событий по created_at.
CREATE INDEX IF NOT EXISTS idx_client_events_created_at
  ON public.client_events (created_at);

-- Шаг воронки пишется один раз за жизнь аккаунта: частичный уникальный индекс
-- делает это гарантией БД, а не договорённостью клиента. INSERT ... ON CONFLICT
-- DO NOTHING ниже опирается именно на него.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_events_funnel_once
  ON public.client_events (player_id, event)
  WHERE event IN (
    'app_opened',
    'init_ok',
    'first_frame',
    'first_tap',
    'first_upgrade',
    'first_mission_start'
  );

ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_events FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.client_events TO service_role;

-- ============================================================================
-- insert_client_event: антифлуд + дедупликация + вставка за один вызов.
-- Возвращает 'inserted' | 'duplicate' | 'throttled' | 'invalid'.
-- ============================================================================
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
    'app_opened', 'init_ok', 'first_frame', 'first_tap', 'first_upgrade', 'first_mission_start'
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

-- Ретеншн: держим 90 дней событий (вызывать по pg_cron или вручную).
CREATE OR REPLACE FUNCTION public.prune_client_events(p_keep_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.client_events
  WHERE created_at < now() - make_interval(days => GREATEST(1, COALESCE(p_keep_days, 90)));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_client_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_client_events(integer) TO service_role;
