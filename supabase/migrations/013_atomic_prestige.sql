-- 013 — atomic Global Hack prestige reset
--
-- The prestige reset deletes owned rows and resets the player wallet. Keep the
-- whole reset in one transaction so a failed child-row delete cannot leave a
-- player with zero Data but a stale deck/team/active mission.

BEGIN;

CREATE OR REPLACE FUNCTION public.global_prestige_atomic(
  p_player_id uuid,
  p_expected_prestige integer,
  p_new_prestige integer,
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
  IF p_new_prestige < 1 OR p_new_prestige > 5 OR p_new_prestige <> p_expected_prestige + 1 THEN
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
  uuid, integer, integer, integer, timestamptz, text[], text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.global_prestige_atomic(
  uuid, integer, integer, integer, timestamptz, text[], text, jsonb
) TO service_role;

COMMIT;
