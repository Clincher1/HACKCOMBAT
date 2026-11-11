-- Restore the server-only boundary for init_player. Migration 004 granted
-- anonymous access again; this SECURITY DEFINER function returns a complete
-- player row and can change a player's username, so it must not be public.
-- The game backend uses service_role; no player data is modified here.
REVOKE ALL ON FUNCTION public.init_player(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.init_player(bigint, text) TO service_role;
