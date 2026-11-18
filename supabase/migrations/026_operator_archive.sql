-- Independent archive, keyed to the stable Telegram identity, not a player
-- snapshot or cascading player row. No economy, inventory or mission writes.
CREATE TABLE IF NOT EXISTS public.operator_archive (
  tg_id bigint NOT NULL,
  entry_key text NOT NULL CHECK (length(entry_key) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (category IN ('story', 'city')),
  position integer NOT NULL CHECK (position > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  reply text CHECK (reply IS NULL OR reply IN ('careful', 'focused')),
  PRIMARY KEY (tg_id, entry_key)
);
ALTER TABLE public.operator_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operator_archive FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.operator_archive TO service_role;
