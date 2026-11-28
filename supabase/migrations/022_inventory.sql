-- 022_inventory.sql — «Инвентарь оживает»
-- Новые таблицы: player_items (стопки предметов игрока) и item_drops (журнал дропа).
-- Строго аддитивно: существующие таблицы и данные не меняются, прогресс не сбрасывается.
-- Выдача предметов — только сервер: RPC grant_item / consume_item под SECURITY DEFINER,
-- anon и authenticated не имеют прав ни на таблицы, ни на функции.

BEGIN;

-- ── 1. Стопки предметов ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_items (
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  item_key text NOT NULL,
  qty integer NOT NULL DEFAULT 1 CHECK (qty >= 0),
  first_acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_key)
);

COMMENT ON TABLE public.player_items IS 'Выпавшие расходники игрока: ключ предмета, количество, время первого получения.';
COMMENT ON COLUMN public.player_items.qty IS 'Количество в стопке. Ноль не хранится: строка удаляется в consume_item.';

CREATE INDEX IF NOT EXISTS player_items_player_updated_idx
  ON public.player_items (player_id, updated_at DESC);

-- ── 2. Журнал дропа ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.item_drops (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  item_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('hack', 'mission', 'level')),
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.item_drops IS 'Журнал выдачи предметов: источник (взлом/контракт/уровень) и исход. Только для аудита и QA.';
COMMENT ON COLUMN public.item_drops.outcome IS 'Исход, за который выдан предмет: success / partial / milestone и т.п.';

CREATE INDEX IF NOT EXISTS item_drops_player_created_idx
  ON public.item_drops (player_id, created_at DESC);

-- ── 3. Доступ: только service role ──────────────────────────────────────────
ALTER TABLE public.player_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_drops ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.player_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.item_drops FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.player_items TO service_role;
GRANT ALL ON TABLE public.item_drops TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.item_drops_id_seq TO service_role;

-- ── 4. Атомарная выдача ─────────────────────────────────────────────────────
-- Один вызов = одна транзакция: upsert стопки + строка журнала.
-- ON CONFLICT DO UPDATE берёт блокировку строки, поэтому параллельные вызовы
-- сериализуются и количество не теряется (нет lost update и нет дублей журнала).
CREATE OR REPLACE FUNCTION public.grant_item(
  p_player_id uuid,
  p_item_key text,
  p_source text,
  p_outcome text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty integer;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'GRANT_ITEM_NO_PLAYER';
  END IF;
  IF p_item_key IS NULL OR btrim(p_item_key) = '' OR char_length(p_item_key) > 120 THEN
    RAISE EXCEPTION 'GRANT_ITEM_INVALID_KEY';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('hack', 'mission', 'level') THEN
    RAISE EXCEPTION 'GRANT_ITEM_INVALID_SOURCE';
  END IF;

  INSERT INTO public.player_items (player_id, item_key, qty)
  VALUES (p_player_id, p_item_key, 1)
  ON CONFLICT (player_id, item_key)
  DO UPDATE SET qty = public.player_items.qty + 1,
                updated_at = now()
  RETURNING qty INTO v_qty;

  INSERT INTO public.item_drops (player_id, item_key, source, outcome)
  VALUES (p_player_id, p_item_key, p_source, NULLIF(btrim(coalesce(p_outcome, '')), ''));

  RETURN v_qty;
END;
$$;

COMMENT ON FUNCTION public.grant_item(uuid, text, text, text) IS
  'Атомарно выдаёт 1 предмет: qty+1 в player_items и строка в item_drops. Возвращает новое количество.';

-- ── 5. Атомарное списание ───────────────────────────────────────────────────
-- Возвращает остаток (>= 0) при успехе и NULL, если предмета не хватает.
-- Проверка qty >= p_qty и списание — одним UPDATE, поэтому двойного
-- применения одного и того же предмета при гонке быть не может.
CREATE OR REPLACE FUNCTION public.consume_item(
  p_player_id uuid,
  p_item_key text,
  p_qty integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left integer;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'CONSUME_ITEM_NO_PLAYER';
  END IF;
  IF p_item_key IS NULL OR btrim(p_item_key) = '' THEN
    RAISE EXCEPTION 'CONSUME_ITEM_INVALID_KEY';
  END IF;
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 999 THEN
    RAISE EXCEPTION 'CONSUME_ITEM_INVALID_QTY';
  END IF;

  UPDATE public.player_items
     SET qty = qty - p_qty,
         updated_at = now()
   WHERE player_id = p_player_id
     AND item_key = p_item_key
     AND qty >= p_qty
  RETURNING qty INTO v_left;

  IF v_left IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_left = 0 THEN
    DELETE FROM public.player_items
     WHERE player_id = p_player_id
       AND item_key = p_item_key
       AND qty = 0;
  END IF;

  RETURN v_left;
END;
$$;

COMMENT ON FUNCTION public.consume_item(uuid, text, integer) IS
  'Атомарно списывает предметы. NULL — предмета не хватает, иначе остаток в стопке.';

-- ── 6. Права на функции ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.grant_item(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_item(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_item(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_item(uuid, text, integer) TO service_role;

-- ── 7. Самопроверка ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tables integer;
  v_funcs integer;
BEGIN
  SELECT count(*) INTO v_tables
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('player_items', 'item_drops');
  SELECT count(*) INTO v_funcs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('grant_item', 'consume_item');
  IF v_tables <> 2 OR v_funcs <> 2 THEN
    RAISE EXCEPTION 'MIGRATION_022_INCOMPLETE tables=% functions=%', v_tables, v_funcs;
  END IF;
END;
$$;

COMMIT;
