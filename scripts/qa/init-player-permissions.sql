-- Run as a privileged database role against a test project or in a rollback.
-- This verifies that only the backend can initialize an isolated test player.
BEGIN;
INSERT INTO public.players (tg_id, username)
VALUES (-899990012345678901, 'audit_temporary_player');
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.init_player(-899990012345678901, 'anonymous_attempt');
    RAISE EXCEPTION 'ANON_ACCESS_NOT_BLOCKED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.init_player(-899990012345678901, 'authenticated_attempt');
    RAISE EXCEPTION 'AUTH_ACCESS_NOT_BLOCKED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE p public.players; BEGIN
  SELECT * INTO p FROM public.init_player(-899990012345678901, 'server_test');
  IF p.username <> 'server_test' THEN RAISE EXCEPTION 'SERVICE_ROLE_FAILED'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
