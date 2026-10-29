-- One server-owned gift per player, with three uses. Kept separately from
-- players.stats so stale gameplay snapshots cannot replenish or erase it.
CREATE TABLE IF NOT EXISTS public.new_year_candy (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  uses_remaining integer NOT NULL DEFAULT 3 CHECK (uses_remaining BETWEEN 0 AND 3),
  boost_until timestamptz,
  request_ids uuid[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.new_year_candy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.new_year_candy FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_year_candy TO service_role;

CREATE OR REPLACE FUNCTION public.give_new_year_candy_to_new_player()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.new_year_candy(player_id) VALUES (NEW.id)
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.give_new_year_candy_to_new_player() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS give_new_year_candy_to_new_player ON public.players;
CREATE TRIGGER give_new_year_candy_to_new_player AFTER INSERT ON public.players
FOR EACH ROW EXECUTE FUNCTION public.give_new_year_candy_to_new_player();

-- All existing players; re-running the migration must not restore used charges.
INSERT INTO public.new_year_candy(player_id)
SELECT id FROM public.players ON CONFLICT (player_id) DO NOTHING;

-- Lock a single row, extend remaining time rather than stacking the multiplier,
-- and make retries with the same idempotency key safe across server instances.
CREATE OR REPLACE FUNCTION public.use_new_year_candy(p_player_id uuid, p_request_id uuid)
RETURNS public.new_year_candy LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candy public.new_year_candy;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'CANDY_REQUEST_ID_REQUIRED'; END IF;
  SELECT * INTO candy FROM public.new_year_candy WHERE player_id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANDY_NOT_FOUND'; END IF;
  IF p_request_id = ANY(candy.request_ids) THEN RETURN candy; END IF;
  IF candy.uses_remaining <= 0 THEN RAISE EXCEPTION 'CANDY_EXHAUSTED'; END IF;
  UPDATE public.new_year_candy
  SET uses_remaining = uses_remaining - 1,
      boost_until = GREATEST(COALESCE(boost_until, now()), now()) + interval '1 hour',
      request_ids = array_append(request_ids, p_request_id)
  WHERE player_id = p_player_id RETURNING * INTO candy;
  RETURN candy;
END $$;
REVOKE ALL ON FUNCTION public.use_new_year_candy(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_new_year_candy(uuid, uuid) TO service_role;
