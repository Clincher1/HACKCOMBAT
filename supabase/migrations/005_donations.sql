-- ============================================================================
-- 005 — ДОНАТЫ ЗА TELEGRAM STARS (v3.4)
-- ----------------------------------------------------------------------------
-- Миграция СТРОГО АДДИТИВНАЯ: только CREATE TABLE / INDEX / POLICY.
-- Прогресс игроков не трогается, существующие таблицы не изменяются.
--
-- Зачем таблица:
--   1) telegram_payment_charge_id UNIQUE — это идемпотентность. Telegram может
--      прислать successful_payment повторно; повтор не должен ничего начислять.
--   2) храним charge_id, чтобы можно было сделать возврат (refundStarPayment).
--   3) донат НЕ влияет на игровой баланс — это отдельный леджер.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  tg_id bigint NOT NULL,
  stars integer NOT NULL,
  currency text NOT NULL DEFAULT 'XTR',
  charge_id text NOT NULL,
  provider_charge_id text,
  payload text,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donations_stars_positive_chk CHECK (stars > 0),
  CONSTRAINT donations_currency_xtr_chk CHECK (currency = 'XTR')
);

-- Идемпотентность: один платёж = одна строка. Повторный вебхук получит конфликт
-- и не создаст дубль (сервер это корректно обрабатывает).
CREATE UNIQUE INDEX IF NOT EXISTS donations_charge_id_uniq
  ON public.donations (charge_id);

CREATE INDEX IF NOT EXISTS donations_tg_id_created_idx
  ON public.donations (tg_id, created_at DESC);

-- RLS: включаем и НЕ создаём политик для anon/authenticated.
-- Значит, напрямую из браузера таблицу прочитать нельзя — только service_role
-- на сервере (как и остальные служебные таблицы после 002_security_hardening).
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.donations FROM anon, authenticated;

COMMENT ON TABLE public.donations IS
  'Добровольные донаты в Telegram Stars (v3.4). Не влияет на игровой прогресс.';

COMMIT;
