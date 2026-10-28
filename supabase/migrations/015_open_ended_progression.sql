-- 015 — open-ended career progression.
--
-- Level 200 and five prestige cycles were safety stops, not good player
-- experience. This migration keeps existing saves intact, changes the stored
-- integer fields to bigint and lets the server continue the career forever.
-- The first five prestige cycles retain their ×2 arc; later cycles use a
-- controlled +10% bonus so the economy stays finite instead of overflowing.

BEGIN;

-- PostgreSQL views retain the old column type dependency, so recreate the
-- public leaderboard around the bigint conversion.
DROP VIEW IF EXISTS public.leaderboard;

ALTER TABLE public.players
  ALTER COLUMN level TYPE bigint USING level::bigint,
  ALTER COLUMN rank TYPE bigint USING rank::bigint,
  ALTER COLUMN prestige_count TYPE bigint USING prestige_count::bigint;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_prestige_count_max_chk;

-- Recompute the stored snapshot for existing saves without a hard L200 stop.
DO $$
DECLARE
  row_data record;
  remaining bigint;
  current_level bigint;
  need bigint;
  current_rank bigint;
BEGIN
  FOR row_data IN
    SELECT id, GREATEST(0, COALESCE(xp, 0))::bigint AS xp
    FROM public.players
  LOOP
    remaining := row_data.xp;
    current_level := 1;

    WHILE current_level < 10000000 LOOP
      need := GREATEST(
        50,
        (round((140::numeric * current_level * current_level) / 10) * 10)::bigint
      );
      EXIT WHEN remaining < need;
      remaining := remaining - need;
      current_level := current_level + 1;
    END LOOP;

    current_rank := CASE
      WHEN current_level >= 155 THEN 12 + ((current_level - 155) / 25)
      WHEN current_level >= 125 THEN 11
      WHEN current_level >= 100 THEN 10
      WHEN current_level >= 85 THEN 9
      WHEN current_level >= 70 THEN 8
      WHEN current_level >= 50 THEN 7
      WHEN current_level >= 35 THEN 6
      WHEN current_level >= 26 THEN 5
      WHEN current_level >= 18 THEN 4
      WHEN current_level >= 10 THEN 3
      WHEN current_level >= 5 THEN 2
      ELSE 1
    END;

    UPDATE public.players
    SET level = current_level,
        rank = current_rank
    WHERE id = row_data.id;
  END LOOP;
END;
$$;

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

-- Replace the old integer/finite prestige RPC rather than leaving an overload
-- that could still reject a valid post-cap cycle.
DROP FUNCTION IF EXISTS public.global_prestige_atomic(
  uuid, integer, integer, integer, timestamptz, text[], text, jsonb
);

CREATE OR REPLACE FUNCTION public.global_prestige_atomic(
  p_player_id uuid,
  p_expected_prestige bigint,
  p_new_prestige bigint,
  p_energy integer,
  p_energy_updated timestamptz,
  p_unlocked_skins text[],
  p_equipped_skin text,
  p_stats jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_new_prestige < 1 OR p_new_prestige <> p_expected_prestige + 1 THEN
    RAISE EXCEPTION 'PRESTIGE_INVALID_CYCLE';
  END IF;

  UPDATE public.players
  SET prestige_count = p_new_prestige,
      data = 0,
      energy = GREATEST(0, p_energy),
      energy_updated = COALESCE(p_energy_updated, now()),
      heat = 0,
      unlocked_skins = COALESCE(p_unlocked_skins, unlocked_skins),
      equipped_skin = COALESCE(p_equipped_skin, equipped_skin),
      stats = COALESCE(p_stats, stats)
  WHERE id = p_player_id
    AND prestige_count = p_expected_prestige;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'PRESTIGE_CONFLICT';
  END IF;

  DELETE FROM public.cards WHERE player_id = p_player_id;
  DELETE FROM public.team WHERE player_id = p_player_id;
  DELETE FROM public.missions WHERE player_id = p_player_id AND status = 'active';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.global_prestige_atomic(
  uuid, bigint, bigint, integer, timestamptz, text[], text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.global_prestige_atomic(
  uuid, bigint, bigint, integer, timestamptz, text[], text, jsonb
) TO service_role;

-- The atomic purchase RPC must preserve a post-five prestige count as well.
CREATE OR REPLACE FUNCTION public.commit_purchase_atomic(
  p_player_id uuid,
  p_expected jsonb,
  p_snapshot jsonb,
  p_operation text,
  p_item_key text DEFAULT NULL,
  p_item_level integer DEFAULT NULL,
  p_hunger numeric DEFAULT NULL,
  p_last_fed_at timestamptz DEFAULT NULL,
  p_feed_count integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_operation NOT IN ('player', 'card', 'base', 'team', 'pet_buy', 'pet_feed') THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_OPERATION';
  END IF;

  UPDATE public.players
  SET username = COALESCE(p_snapshot->>'username', username),
      rank = GREATEST(1, (p_snapshot->>'rank')::bigint),
      data = GREATEST(0, (p_snapshot->>'data')::numeric),
      crypto = GREATEST(0, (p_snapshot->>'crypto')::integer),
      energy = GREATEST(0, (p_snapshot->>'energy')::integer),
      energy_updated = COALESCE((p_snapshot->>'energy_updated')::timestamptz, energy_updated),
      heat = GREATEST(0, (p_snapshot->>'heat')::integer),
      rep = GREATEST(0, (p_snapshot->>'rep')::integer),
      level = GREATEST(1, (p_snapshot->>'level')::bigint),
      data_per_hour = GREATEST(0, (p_snapshot->>'data_per_hour')::numeric),
      prestige_count = GREATEST(0, (p_snapshot->>'prestige_count')::bigint),
      click_blocked_until = (p_snapshot->>'click_blocked_until')::timestamptz,
      daily_streak = GREATEST(0, (p_snapshot->>'daily_streak')::integer),
      last_daily_claim = (p_snapshot->>'last_daily_claim')::timestamptz,
      equipped_skin = COALESCE(p_snapshot->>'equipped_skin', equipped_skin),
      unlocked_skins = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'unlocked_skins')),
        unlocked_skins
      ),
      total_clicks = GREATEST(0, (p_snapshot->>'total_clicks')::bigint),
      total_missions = GREATEST(0, (p_snapshot->>'total_missions')::integer),
      last_passive_claim = COALESCE((p_snapshot->>'last_passive_claim')::timestamptz, last_passive_claim),
      chips = GREATEST(0, (p_snapshot->>'chips')::integer),
      xp = GREATEST(0, (p_snapshot->>'xp')::bigint),
      card_tier = GREATEST(1, LEAST(4, (p_snapshot->>'card_tier')::integer)),
      stats = COALESCE(p_snapshot->'stats', stats)
  WHERE id = p_player_id
    AND data = (p_expected->>'data')::numeric
    AND energy = (p_expected->>'energy')::integer
    AND crypto = (p_expected->>'crypto')::integer
    AND chips = (p_expected->>'chips')::integer
    AND xp = (p_expected->>'xp')::bigint
    AND rep = (p_expected->>'rep')::integer
    AND heat = (p_expected->>'heat')::integer
    AND total_clicks = (p_expected->>'total_clicks')::bigint
    AND total_missions = (p_expected->>'total_missions')::integer
    AND prestige_count = (p_expected->>'prestige_count')::bigint
    AND card_tier = (p_expected->>'card_tier')::integer;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'PURCHASE_CONFLICT';
  END IF;

  IF p_operation = 'card' THEN
    IF p_item_key IS NULL OR p_item_level IS NULL OR p_item_level < 1 OR p_item_level > 60 THEN
      RAISE EXCEPTION 'PURCHASE_INVALID_CARD';
    END IF;
    INSERT INTO public.cards (player_id, card_key, level)
    VALUES (p_player_id, p_item_key, p_item_level)
    ON CONFLICT (player_id, card_key)
    DO UPDATE SET level = EXCLUDED.level
      WHERE public.cards.level < EXCLUDED.level;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'PURCHASE_CARD_ALREADY_PROCESSED';
    END IF;
  ELSIF p_operation = 'base' THEN
    IF p_item_key IS NULL OR p_item_level IS NULL OR p_item_level < 1 OR p_item_level > 15 THEN
      RAISE EXCEPTION 'PURCHASE_INVALID_BASE';
    END IF;
    INSERT INTO public.base_upgrades (player_id, upgrade_key, level)
    VALUES (p_player_id, p_item_key, p_item_level)
    ON CONFLICT (player_id, upgrade_key)
    DO UPDATE SET level = EXCLUDED.level
      WHERE public.base_upgrades.level < EXCLUDED.level;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'PURCHASE_BASE_ALREADY_PROCESSED';
    END IF;
  ELSIF p_operation = 'team' THEN
    IF p_item_key IS NULL THEN RAISE EXCEPTION 'PURCHASE_INVALID_TEAM'; END IF;
    INSERT INTO public.team (player_id, npc_key)
    VALUES (p_player_id, p_item_key)
    ON CONFLICT (player_id, npc_key) DO NOTHING;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'PURCHASE_TEAM_ALREADY_PROCESSED'; END IF;
  ELSIF p_operation = 'pet_buy' THEN
    IF p_item_key IS NULL THEN RAISE EXCEPTION 'PURCHASE_INVALID_PET'; END IF;
    INSERT INTO public.pets (player_id, pet_key, hunger, last_fed_at, feed_count)
    VALUES (p_player_id, p_item_key, 100, COALESCE(p_last_fed_at, now()), 0)
    ON CONFLICT (player_id, pet_key) DO NOTHING;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'PURCHASE_PET_ALREADY_PROCESSED'; END IF;
  ELSIF p_operation = 'pet_feed' THEN
    IF p_item_key IS NULL OR p_hunger IS NULL OR p_last_fed_at IS NULL OR p_feed_count IS NULL THEN
      RAISE EXCEPTION 'PURCHASE_INVALID_FEED';
    END IF;
    UPDATE public.pets
    SET hunger = GREATEST(0, LEAST(100, p_hunger)),
        last_fed_at = p_last_fed_at,
        feed_count = GREATEST(0, p_feed_count)
    WHERE player_id = p_player_id
      AND pet_key = p_item_key;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'PURCHASE_PET_NOT_FOUND'; END IF;
  END IF;

  RETURN true;
END;
$$;

COMMIT;
