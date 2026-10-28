-- ============================================================================
-- 010 — progression integrity, finite endgame and atomic mission claims
--
-- Non-destructive migration. It normalizes existing player snapshots to the
-- current XP/rank/prestige contract, fixes defaults for new players and removes
-- the obsolete passive cron path. It does not wipe player progress.
-- ============================================================================

BEGIN;

-- New players must start identically in memory/QA and Supabase production.
ALTER TABLE public.players
  ALTER COLUMN data SET DEFAULT 250,
  ALTER COLUMN energy SET DEFAULT 1500;

-- Accounts that were created by the old defaults but never played receive the
-- current onboarding package. Active players are never overwritten here.
UPDATE public.players
SET data = 250,
    energy = 1500,
    energy_updated = now()
WHERE xp = 0
  AND total_clicks = 0
  AND total_missions = 0
  AND data = 0
  AND energy = 1000;

-- Current design has five finite 50→60→70→80→90 prestige cycles. Players
-- created by the old uncapped endpoint are normalized to the final cycle.
UPDATE public.players
SET prestige_count = LEAST(5, GREATEST(0, prestige_count));

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_prestige_count_max_chk;

ALTER TABLE public.players
  ADD CONSTRAINT players_prestige_count_max_chk
  CHECK (prestige_count >= 0 AND prestige_count <= 5);

-- Recompute stored level/rank from lifetime XP so existing leaderboard rows do
-- not remain on a stale pre-fix snapshot. The formula mirrors shared/hack.config.ts.
DO $$
DECLARE
  row_data record;
  remaining bigint;
  current_level integer;
  need bigint;
  current_rank integer;
BEGIN
  FOR row_data IN SELECT id, COALESCE(xp, 0)::bigint AS xp FROM public.players LOOP
    remaining := GREATEST(0, row_data.xp);
    current_level := 1;

    WHILE current_level < 200 LOOP
      need := GREATEST(
        50,
        (round((140::numeric * current_level * current_level) / 10) * 10)::bigint
      );
      EXIT WHEN remaining < need;
      remaining := remaining - need;
      current_level := current_level + 1;
    END LOOP;

    current_rank := CASE
      WHEN current_level >= 155 THEN 12
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

-- The old cron pays a legacy full-rate passive and conflicts with the current
-- server-side qualification/cap/half-rate rules. API/gameEngine is now the
-- single source of truth. Keep the old SQL entry point harmless even if an
-- operator invokes it manually or a duplicate legacy schedule remains.
CREATE OR REPLACE FUNCTION public.distribute_passive_income()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

-- If cron is enabled, unschedule only this known legacy job.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('hacker-kombat-passive-income');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'legacy passive cron was not scheduled: %', SQLERRM;
    END;
  END IF;
END;
$$;

-- ============================================================================
-- Atomic mission claim.
--
-- The API rolls the outcome and computes the final snapshot. This function
-- atomically changes mission status and the player reward snapshot. Expected
-- balances are compare-and-swap guards for requests from different instances.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_mission_atomic(
  p_player_id uuid,
  p_mission_id uuid,
  p_expected_data numeric,
  p_expected_energy integer,
  p_expected_crypto integer,
  p_expected_chips integer,
  p_expected_xp bigint,
  p_expected_rep integer,
  p_expected_heat integer,
  p_expected_total_missions integer,
  p_outcome text,
  p_data numeric,
  p_energy integer,
  p_energy_updated timestamptz,
  p_crypto integer,
  p_chips integer,
  p_xp bigint,
  p_rep integer,
  p_heat integer,
  p_total_missions integer,
  p_stats jsonb,
  p_last_passive_claim timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission_id uuid;
BEGIN
  IF p_outcome NOT IN ('success', 'partial', 'fail') THEN
    RAISE EXCEPTION 'MISSION_CLAIM_INVALID_OUTCOME';
  END IF;

  UPDATE public.missions
  SET status = 'completed',
      outcome = p_outcome
  WHERE id = p_mission_id
    AND player_id = p_player_id
    AND status = 'active'
  RETURNING id INTO v_mission_id;

  IF v_mission_id IS NULL THEN
    RAISE EXCEPTION 'MISSION_CLAIM_ALREADY_PROCESSED';
  END IF;

  UPDATE public.players
  SET data = GREATEST(0, p_data),
      energy = GREATEST(0, p_energy),
      energy_updated = COALESCE(p_energy_updated, energy_updated),
      crypto = GREATEST(0, p_crypto),
      chips = GREATEST(0, p_chips),
      xp = GREATEST(0, p_xp),
      rep = GREATEST(0, p_rep),
      heat = GREATEST(0, p_heat),
      total_missions = GREATEST(0, p_total_missions),
      stats = COALESCE(p_stats, stats),
      last_passive_claim = COALESCE(p_last_passive_claim, last_passive_claim)
  WHERE id = p_player_id
    AND data = p_expected_data
    AND energy = p_expected_energy
    AND crypto = p_expected_crypto
    AND chips = p_expected_chips
    AND xp = p_expected_xp
    AND rep = p_expected_rep
    AND heat = p_expected_heat
    AND total_missions = p_expected_total_missions;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MISSION_CLAIM_CONFLICT';
  END IF;

  RETURN v_mission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mission_atomic(
  uuid, uuid, numeric, integer, integer, integer, bigint, integer, integer,
  integer, text, numeric, integer, timestamptz, integer, integer, bigint,
  integer, integer, integer, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_mission_atomic(
  uuid, uuid, numeric, integer, integer, integer, bigint, integer, integer,
  integer, text, numeric, integer, timestamptz, integer, integer, bigint,
  integer, integer, integer, jsonb, timestamptz
) TO service_role;

COMMIT;
