-- Freeze eligibility once at cutover so old chapters never continue unlocking.
-- No FK: reset/prestige cannot erase eligibility. Snapshots remain untouched.
DO $$
BEGIN
  IF to_regclass('public.operator_legacy_cutoff') IS NULL THEN
    CREATE TABLE public.operator_legacy_cutoff (
      tg_id bigint PRIMARY KEY,
      total_missions integer NOT NULL CHECK (total_missions >= 0)
    );
    INSERT INTO public.operator_legacy_cutoff (tg_id, total_missions)
    SELECT p.tg_id,
      CASE WHEN p.xp >= 700 AND p.total_missions >= 2 AND
        (EXISTS (SELECT 1 FROM public.achievements a WHERE a.player_id=p.id AND a.key='first_upgrade') OR
         EXISTS (SELECT 1 FROM public.cards c WHERE c.player_id=p.id AND c.level > 0))
      THEN GREATEST(p.total_missions, 0) ELSE 0 END
    FROM public.players p;
  END IF;
END $$;
ALTER TABLE public.operator_legacy_cutoff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operator_legacy_cutoff FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.operator_legacy_cutoff TO service_role;
