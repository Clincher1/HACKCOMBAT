-- Remove only the retired snus gift, including stale snapshots from old app
-- instances. Other gifts, ordering, profile data and balances are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.remove_retired_snus_from_player()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  field text;
BEGIN
  IF jsonb_typeof(NEW.stats) = 'object' THEN
    FOREACH field IN ARRAY ARRAY['inventoryOwned', 'inventoryShowcase'] LOOP
      IF jsonb_typeof(NEW.stats -> field) = 'array'
         AND (NEW.stats -> field) ? 'reward:gift_snus' THEN
        NEW.stats := jsonb_set(NEW.stats, ARRAY[field], (NEW.stats -> field) - 'reward:gift_snus', false);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_retired_snus_from_player() FROM PUBLIC, anon, authenticated;

-- The late name makes it run after preservation triggers on the same event.
DROP TRIGGER IF EXISTS zzz_remove_retired_snus ON public.players;
CREATE TRIGGER zzz_remove_retired_snus
BEFORE INSERT OR UPDATE OF stats ON public.players
FOR EACH ROW EXECUTE FUNCTION public.remove_retired_snus_from_player();

-- UPDATE evaluates the current row under its row lock, rather than applying
-- an old application snapshot; the trigger removes the two occurrences.
UPDATE public.players
SET stats = stats
WHERE (stats -> 'inventoryOwned') @> '["reward:gift_snus"]'::jsonb
   OR (stats -> 'inventoryShowcase') @> '["reward:gift_snus"]'::jsonb;
COMMIT;
