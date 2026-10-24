-- ============================================================================
-- HACKER KOMBAT — Миграция 003: Растянутая прогрессия, Чипы, Питомцы, База
-- ----------------------------------------------------------------------------
-- Zero-Downtime: только аддитивные изменения. Ни одна строка игрока не удаляется
-- и не переписывается, все существующие уровни карточек (1..10) остаются валидными.
-- ============================================================================

-- 1. Снимаем прежний жёсткий потолок карточек (level <= 10) и ставим новый 25
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.cards'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%level%'
  LOOP
    EXECUTE format('ALTER TABLE public.cards DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_level_range_chk CHECK (level >= 1 AND level <= 25);

-- 2. Новые колонки игрока: Чипы, открытый Тир карточек, счётчики достижений
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS chips int NOT NULL DEFAULT 0;
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS card_tier int NOT NULL DEFAULT 1;
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_chips_non_negative_chk'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_chips_non_negative_chk CHECK (chips >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_card_tier_range_chk'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_card_tier_range_chk CHECK (card_tier >= 1 AND card_tier <= 4);
  END IF;
END;
$$;

-- 3. Питомцы-компаньоны (покупаются один раз, переживают Global Hack Престиж)
CREATE TABLE IF NOT EXISTS public.pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  pet_key text NOT NULL,
  hunger numeric NOT NULL DEFAULT 100 CHECK (hunger >= 0 AND hunger <= 100),
  last_fed_at timestamptz NOT NULL DEFAULT now(),
  feed_count int NOT NULL DEFAULT 0 CHECK (feed_count >= 0),
  bought_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, pet_key)
);

CREATE INDEX IF NOT EXISTS idx_pets_player_id ON public.pets (player_id);

-- 4. «База»: пассивные покупки игрока (10 улучшений × 10 уровней, переживают престиж)
CREATE TABLE IF NOT EXISTS public.base_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  upgrade_key text NOT NULL,
  level int NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
  UNIQUE (player_id, upgrade_key)
);

CREATE INDEX IF NOT EXISTS idx_base_upgrades_player_id ON public.base_upgrades (player_id);

-- 5. RLS: новые таблицы закрыты так же, как остальные
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_upgrades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players see own pets" ON public.pets;
CREATE POLICY "Players see own pets"
  ON public.pets FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Players see own base upgrades" ON public.base_upgrades;
CREATE POLICY "Players see own base upgrades"
  ON public.base_upgrades FOR SELECT
  USING (auth.uid() = player_id);

-- Примечание: политики выше намеренно строгие (auth.uid() никогда не совпадёт с uuid игрока,
-- потому что авторизация идёт по Telegram initData, а не через Supabase Auth), поэтому
-- прямые клиентские SELECT'ы фактически закрыты. Сервер работает через service_role.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.base_upgrades FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.players FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cards FROM anon, authenticated;

-- 6. Лидерборд без изменений структуры (совместим с прежним View)
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  username,
  level,
  data,
  rank,
  prestige_count
FROM public.players
WHERE tg_id > -10000000
ORDER BY data DESC
LIMIT 100;

GRANT SELECT ON public.leaderboard TO anon, authenticated;
