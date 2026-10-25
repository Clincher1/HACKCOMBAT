-- ============================================================================
-- 006 — РЕФЕРАЛЬНАЯ ПРОГРАММА (v3.5)
-- ----------------------------------------------------------------------------
-- Миграция СТРОГО АДДИТИВНАЯ: только CREATE TABLE / INDEX / POLICY.
-- Прогресс, донаты и остальные таблицы не трогаются.
--
-- Зачем две таблицы:
--   referral_codes  — постоянный код игрока. Хранится отдельно, чтобы
--                     «кто позвал» можно было найти по коду, не светя tg_id
--                     в ссылке (код — хэш, обратно Telegram ID не восстановить).
--   referrals       — сами приглашения. invitee_tg — ПЕРВИЧНЫЙ КЛЮЧ: один
--                     игрок привязывается к пригласившему навсегда, повторный
--                     клик по чужой ссылке ничего не перезаписывает.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  tg_id bigint PRIMARY KEY,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_shape_chk CHECK (code ~ '^[a-z0-9]{8}$')
);

CREATE TABLE IF NOT EXISTS public.referrals (
  invitee_tg bigint PRIMARY KEY,
  referrer_tg bigint NOT NULL,
  code text NOT NULL,
  -- attributed → друг привязан; qualified → наиграл 8 минут, ждёт выплаты;
  -- rewarded  → награда выдана; flagged → задержана проверкой (лимиты/сеть).
  status text NOT NULL DEFAULT 'attributed',
  reward_xp integer NOT NULL DEFAULT 0,
  reward_data bigint NOT NULL DEFAULT 0,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  CONSTRAINT referrals_status_chk CHECK (status IN ('attributed', 'qualified', 'rewarded', 'flagged')),
  CONSTRAINT referrals_no_self_chk CHECK (referrer_tg <> invitee_tg)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON public.referrals (referrer_tg, status, qualified_at DESC);

CREATE INDEX IF NOT EXISTS referrals_ip_idx
  ON public.referrals (ip_hash, created_at DESC);

-- Служебные таблицы: читаются только сервером через service_role.
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.referral_codes FROM anon, authenticated;
REVOKE ALL ON public.referrals FROM anon, authenticated;

COMMENT ON TABLE public.referrals IS
  'Реферальные привязки (v3.5). Награда — за 8 минут игры приглашённого, не за клик.';

COMMIT;
