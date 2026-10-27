-- v3.10 hotfix: сохраняем стоимость в правильных колонках missions.
-- Исправляет первую версию RPC, где значения energy_cost и data_cost
-- были переданы в обратном порядке. Балансы игроков всегда списывались
-- правильными аргументами; исправляется только историческая запись миссии.

CREATE OR REPLACE FUNCTION public.start_mission_atomic(
  p_player_id uuid,
  p_expected_data numeric,
  p_expected_energy integer,
  p_data_cost numeric,
  p_energy_cost integer,
  p_energy_updated timestamptz,
  p_mission_key text,
  p_target_type text,
  p_target_name text,
  p_started_at timestamptz,
  p_finish_at timestamptz,
  p_reward numeric,
  p_rep_delta integer,
  p_heat_delta integer,
  p_crypto_reward integer,
  p_xp_reward integer,
  p_success_chance numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id uuid;
  v_mission_id uuid;
BEGIN
  IF p_data_cost < 0 OR p_energy_cost < 0 THEN
    RAISE EXCEPTION 'MISSION_START_INVALID_COST';
  END IF;

  IF p_success_chance < 0 OR p_success_chance > 1 THEN
    RAISE EXCEPTION 'MISSION_START_INVALID_CHANCE';
  END IF;

  UPDATE public.players
  SET
    data = data - p_data_cost,
    energy = energy - p_energy_cost,
    energy_updated = COALESCE(p_energy_updated, energy_updated)
  WHERE id = p_player_id
    AND data = p_expected_data
    AND energy = p_expected_energy
    AND data >= p_data_cost
    AND energy >= p_energy_cost
  RETURNING id INTO v_player_id;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'MISSION_START_CONFLICT';
  END IF;

  INSERT INTO public.missions (
    player_id,
    mission_key,
    target_type,
    target_name,
    status,
    started_at,
    finish_at,
    reward,
    rep_delta,
    heat_delta,
    crypto_reward,
    xp_reward,
    energy_cost,
    data_cost,
    success_chance,
    outcome
  )
  VALUES (
    p_player_id,
    p_mission_key,
    p_target_type,
    p_target_name,
    'active',
    p_started_at,
    p_finish_at,
    p_reward,
    p_rep_delta,
    p_heat_delta,
    p_crypto_reward,
    p_xp_reward,
    p_energy_cost,
    p_data_cost,
    p_success_chance,
    'partial'
  )
  RETURNING id INTO v_mission_id;

  RETURN v_mission_id;
END;
$$;
