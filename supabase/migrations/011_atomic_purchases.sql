-- ============================================================================
-- 011 — atomic player purchases and owned-item writes
--
-- A purchase changes the currency snapshot and an owned row in one transaction.
-- The JSON snapshot keeps this RPC forward-compatible with cosmetic/stat fields;
-- the expected JSON is a compare-and-swap guard against duplicate POSTs.
-- ============================================================================

BEGIN;

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
      rank = GREATEST(1, (p_snapshot->>'rank')::integer),
      data = GREATEST(0, (p_snapshot->>'data')::numeric),
      crypto = GREATEST(0, (p_snapshot->>'crypto')::integer),
      energy = GREATEST(0, (p_snapshot->>'energy')::integer),
      energy_updated = COALESCE((p_snapshot->>'energy_updated')::timestamptz, energy_updated),
      heat = GREATEST(0, (p_snapshot->>'heat')::integer),
      rep = GREATEST(0, (p_snapshot->>'rep')::integer),
      level = GREATEST(1, (p_snapshot->>'level')::integer),
      data_per_hour = GREATEST(0, (p_snapshot->>'data_per_hour')::numeric),
      prestige_count = GREATEST(0, LEAST(5, (p_snapshot->>'prestige_count')::integer)),
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
    AND prestige_count = (p_expected->>'prestige_count')::integer
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

REVOKE ALL ON FUNCTION public.commit_purchase_atomic(
  uuid, jsonb, jsonb, text, text, integer, numeric, timestamptz, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commit_purchase_atomic(
  uuid, jsonb, jsonb, text, text, integer, numeric, timestamptz, integer
) TO service_role;

COMMIT;
