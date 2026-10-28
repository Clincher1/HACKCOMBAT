-- 012 — numeric Data guard
--
-- JavaScript clients and the reward path use a finite safe integer boundary.
-- Normalize only impossible/unsafe stored values, then make the invariant
-- enforceable for future service-role writes as well.

BEGIN;

UPDATE public.players
SET data = LEAST(GREATEST(data, 0), 9007199254740991::numeric)
WHERE data < 0 OR data > 9007199254740991::numeric;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_data_finite_cap_chk;

ALTER TABLE public.players
  ADD CONSTRAINT players_data_finite_cap_chk
  CHECK (data >= 0 AND data <= 9007199254740991::numeric);

COMMIT;
