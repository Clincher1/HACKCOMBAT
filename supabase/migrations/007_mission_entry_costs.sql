-- v3.10: запуск контракта требует оборотный Data-взнос и Energy.
-- Старые активные миссии получают нулевые costs и завершаются по прежним правилам.
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS energy_cost integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_cost numeric NOT NULL DEFAULT 0;

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_energy_cost_non_negative_chk;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_energy_cost_non_negative_chk
  CHECK (energy_cost >= 0 AND data_cost >= 0);
