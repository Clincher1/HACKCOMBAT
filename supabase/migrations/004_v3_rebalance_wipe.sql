-- ============================================================================
-- 004 — РЕБАЛАНС v3 (XP-прогрессия, шанс успеха взлома, потолки прокачки)
-- ----------------------------------------------------------------------------
-- ВНИМАНИЕ: миграция ПОЛНОСТЬЮ ОБНУЛЯЕТ игровые данные всех игроков.
-- Это осознанное требование нового ТЗ: старая экономика (уровень = уровни
-- карточек, таймеры 5–30 сек, гарантированные награды) несовместима с новой.
-- Сбрасываются: игроки и всё, что на них ссылается. Не трогаются: схема,
-- функции, RLS, storage-ассеты.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ГЛОБАЛЬНЫЙ WIPE
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  public.achievements,
  public.missions,
  public.cards,
  public.team,
  public.pets,
  public.base_upgrades,
  public.players
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 2. ОПЫТ ИГРОКА
--    Уровень больше не выводится из уровней карточек: он зарабатывается
--    взломами. xp — суммарный накопленный опыт (уровень считается в коде
--    одинаково на сервере и в UI, см. shared/hack.config.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_xp_non_negative_chk'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_xp_non_negative_chk CHECK (xp >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. ЗАВИСИМОСТЬ ВЗЛОМА ОТ ПОДГОТОВКИ
--    success_chance фиксируется на СТАРТЕ миссии (подкрутить нельзя),
--    outcome пишется в момент завершения: success / partial / fail.
-- ---------------------------------------------------------------------------
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS xp_reward integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_chance numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'partial';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'missions_outcome_chk'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_outcome_chk
      CHECK (outcome IN ('success', 'partial', 'fail'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'missions_success_chance_range_chk'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_success_chance_range_chk
      CHECK (success_chance >= 0 AND success_chance <= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'missions_xp_reward_non_negative_chk'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_xp_reward_non_negative_chk CHECK (xp_reward >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. НОВЫЕ ПОТОЛКИ ПРОКАЧКИ
--    Карточки: 4 Тира × 15/30/45/60 уровней (было 25).
--    База:    15 уровней на улучшение (было 10).
-- ---------------------------------------------------------------------------
-- Снимаем все прежние CHECK-и на level (имена автогенерируются по-разному)
DO $$
DECLARE c record;
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

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.base_upgrades'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%level%'
  LOOP
    EXECUTE format('ALTER TABLE public.base_upgrades DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_level_range_chk CHECK (level >= 1 AND level <= 60);

ALTER TABLE public.base_upgrades
  ADD CONSTRAINT base_upgrades_level_range_chk CHECK (level >= 1 AND level <= 15);

-- ---------------------------------------------------------------------------
-- 5. ПЕРЕСОЗДАЁМ init_player, чтобы RETURNING * отдавал новую колонку xp
-- ---------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.init_player(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.init_player(bigint, text) TO anon, authenticated, service_role;

COMMIT;

-- ============================================================================
-- ПОСЛЕ ПРИМЕНЕНИЯ: все игроки начинают с 1 уровня, 250 Data, 5 Crypto и
-- 0 XP. Уровень 12 (найм Coder), 20 (третий слот) и 26 (Тир VI) теперь
-- зарабатываются взломами, а не покупкой карточек.
-- ============================================================================
