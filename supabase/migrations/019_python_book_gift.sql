-- Постоянный подарок всем существующим игрокам. Витрина и остальные поля не меняются.
-- Новым игрокам подарок обеспечивает серверная нормализация.
UPDATE public.players AS p
SET stats = jsonb_set(
  CASE WHEN jsonb_typeof(p.stats) = 'object' THEN p.stats ELSE '{}'::jsonb END,
  '{inventoryOwned}',
  (CASE WHEN jsonb_typeof(p.stats->'inventoryOwned') = 'array'
        THEN p.stats->'inventoryOwned' ELSE '[]'::jsonb END)
    || '["reward:gift_python_book"]'::jsonb,
  true
)
WHERE NOT (
  CASE WHEN jsonb_typeof(p.stats->'inventoryOwned') = 'array'
       THEN p.stats->'inventoryOwned' ELSE '[]'::jsonb END
  @> '["reward:gift_python_book"]'::jsonb
);
