-- ============================================================================
-- HACKER KOMBAT — Миграция 002: Усиление безопасности БД (Zero-Downtime)
-- Безопасно применяется поверх работающей БД без малейшей потери прогресса игроков!
-- ============================================================================

-- 1. Закрываем прямой вызов SECURITY DEFINER RPC-функций через публичный anon-ключ PostgREST!
-- Вызывать init_player и distribute_passive_income теперь может ТОЛЬКО серверный бэкенд (service_role)
REVOKE ALL ON FUNCTION public.init_player(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.init_player(bigint, text) TO service_role;

REVOKE ALL ON FUNCTION public.distribute_passive_income() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_passive_income() TO service_role;

-- 2. Запрещаем любые прямые клиентские INSERT / UPDATE / DELETE через anon/authenticated ключи
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.players FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cards FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.missions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.achievements FROM anon, authenticated;

-- 3. Исключаем изолированных гостей браузерного превью (tg_id <= -10000000) из публичного View лидерборда
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  username,
  level,
  data,
  rank,
  prestige_count
FROM public.players
WHERE tg_id > -10000000
ORDER BY data DESC
LIMIT 100;

GRANT SELECT ON public.leaderboard TO anon, authenticated;

-- 4. Мягкие проверочные ограничения целостности валют (не затрагивают существующие валидные строки)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_non_negative_balances_chk'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_non_negative_balances_chk
      CHECK (data >= 0 AND crypto >= 0 AND energy >= 0 AND heat >= 0 AND rep >= 0 AND prestige_count >= 0);
  END IF;
END;
$$;
