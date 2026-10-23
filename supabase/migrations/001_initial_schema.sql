-- ============================================================================
-- HACKER KOMBAT — Миграция 001: полная схема БД, RLS, функции и pg_cron
-- Стек: Supabase PostgreSQL (Free Tier)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Игроки
CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint UNIQUE NOT NULL,
  username text NOT NULL DEFAULT 'AnonHacker',
  rank int NOT NULL DEFAULT 1,
  data numeric NOT NULL DEFAULT 0,
  crypto int NOT NULL DEFAULT 5, -- DEFAULT: стартовый бонус 5 Crypto
  energy int NOT NULL DEFAULT 1000,
  energy_updated timestamptz NOT NULL DEFAULT now(),
  heat int NOT NULL DEFAULT 0,
  rep int NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 1,
  data_per_hour numeric NOT NULL DEFAULT 0, -- DEFAULT: кэш пассивного дохода для pg_cron
  prestige_count int NOT NULL DEFAULT 0, -- DEFAULT: счётчик Global Hack престижей
  click_blocked_until timestamptz DEFAULT NULL, -- DEFAULT: блокировка кликов на 60 сек при Heat > 100
  daily_streak int NOT NULL DEFAULT 0, -- DEFAULT: серия ежедневных входов
  last_daily_claim timestamptz DEFAULT NULL, -- DEFAULT: время последнего ежедневного бонуса
  equipped_skin text NOT NULL DEFAULT 'default', -- DEFAULT: активный скин стола
  unlocked_skins text[] NOT NULL DEFAULT ARRAY['default'], -- DEFAULT: купленные скины
  total_clicks bigint NOT NULL DEFAULT 0, -- DEFAULT: статистика для ачивок
  total_missions int NOT NULL DEFAULT 0, -- DEFAULT: статистика взломов
  last_passive_claim timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_data_desc ON public.players (data DESC);
CREATE INDEX IF NOT EXISTS idx_players_tg_id ON public.players (tg_id);

-- 2. Купленные карточки улучшений
CREATE TABLE IF NOT EXISTS public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  card_key text NOT NULL,
  level int NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
  UNIQUE (player_id, card_key)
);

CREATE INDEX IF NOT EXISTS idx_cards_player_id ON public.cards (player_id);

-- 3. Нанятая команда (NPC)
CREATE TABLE IF NOT EXISTS public.team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  npc_key text NOT NULL,
  hired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, npc_key)
);

CREATE INDEX IF NOT EXISTS idx_team_player_id ON public.team (player_id);

-- 4. Миссии (активные и завершённые логи)
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  mission_key text NOT NULL DEFAULT 'scam_shop', -- DEFAULT: ключ миссии из конфига
  target_type text NOT NULL CHECK (target_type IN ('bad', 'good', 'neutral', 'grey')),
  target_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finish_at timestamptz NOT NULL,
  reward numeric NOT NULL DEFAULT 0,
  rep_delta int NOT NULL DEFAULT 0, -- DEFAULT: изменение репутации
  heat_delta int NOT NULL DEFAULT 0, -- DEFAULT: изменение розыска
  crypto_reward int NOT NULL DEFAULT 0 -- DEFAULT: редкий дроп Crypto в серых миссиях
);

CREATE INDEX IF NOT EXISTS idx_missions_player_status ON public.missions (player_id, status);

-- 5. Достижения (ачивки)
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  key text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, key)
);

CREATE INDEX IF NOT EXISTS idx_achievements_player_id ON public.achievements (player_id);

-- 6. Лидерборд (View топ-100 игроков по Data)
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  username,
  level,
  data,
  rank,
  prestige_count
FROM public.players
ORDER BY data DESC
LIMIT 100;

-- ============================================================================
-- Row Level Security (RLS) — игрок видит только собственные строки
-- Backend (/api/*) обращается через service_role после HMAC-проверки initData
-- ============================================================================

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players see own profile" ON public.players;
CREATE POLICY "Players see own profile"
  ON public.players FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Players see own cards" ON public.cards;
CREATE POLICY "Players see own cards"
  ON public.cards FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Players see own team" ON public.team;
CREATE POLICY "Players see own team"
  ON public.team FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Players see own missions" ON public.missions;
CREATE POLICY "Players see own missions"
  ON public.missions FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Players see own achievements" ON public.achievements;
CREATE POLICY "Players see own achievements"
  ON public.achievements FOR SELECT
  USING (auth.uid() = player_id);

GRANT SELECT ON public.leaderboard TO anon, authenticated;

-- ============================================================================
-- Функция init_player(tg_id, username) — вызывается при первом и повторном входе
-- ============================================================================

CREATE OR REPLACE FUNCTION public.init_player(
  p_tg_id bigint,
  p_username text DEFAULT 'AnonHacker'
)
RETURNS public.players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player public.players;
BEGIN
  INSERT INTO public.players (tg_id, username)
  VALUES (p_tg_id, COALESCE(NULLIF(TRIM(p_username), ''), 'Hacker_' || p_tg_id::text))
  ON CONFLICT (tg_id) DO UPDATE
    SET username = COALESCE(NULLIF(TRIM(EXCLUDED.username), ''), public.players.username)
  RETURNING * INTO v_player;

  RETURN v_player;
END;
$$;

-- ============================================================================
-- Пассивный доход раз в минуту (pg_cron + вызов из Supabase Edge Function)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.distribute_passive_income()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  WITH updated_rows AS (
    UPDATE public.players
    SET
      data = data + GREATEST(0, (data_per_hour / 3600.0) * EXTRACT(EPOCH FROM (now() - last_passive_claim))),
      last_passive_claim = now()
    WHERE data_per_hour > 0
      AND last_passive_claim < now() - interval '30 seconds'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM updated_rows;

  RETURN v_updated;
END;
$$;

-- Опциональное автоподключение pg_cron, если расширение включено в Dashboard Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'hacker-kombat-passive-income',
      '* * * * *',
      'SELECT public.distribute_passive_income();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron ещё не активирован в Dashboard -> Extensions. Функция distribute_passive_income() готова к ручному расписанию.';
END;
$$;
