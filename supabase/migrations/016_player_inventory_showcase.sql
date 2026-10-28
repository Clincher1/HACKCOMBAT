-- ============================================================================
-- HACKER KOMBAT — Миграция 016: постоянный инвентарь и витрина профиля
-- ----------------------------------------------------------------------------
-- Zero-Downtime: инвентарь хранится в уже существующем players.stats jsonb.
-- Приз не влияет на экономику и не требует отдельной таблицы или RLS-пути.
-- ============================================================================

-- Первый памятный приз выдаётся каждому существующему игроку ровно один раз.
-- Дубликат не добавляется, а все остальные поля stats остаются без изменений.
UPDATE public.players
SET stats = jsonb_set(
  COALESCE(stats, '{}'::jsonb),
  '{inventoryOwned}',
  COALESCE(stats->'inventoryOwned', '[]'::jsonb) || '["reward:first_donut"]'::jsonb,
  true
)
WHERE NOT (COALESCE(stats->'inventoryOwned', '[]'::jsonb) @> '["reward:first_donut"]'::jsonb);

-- Витрина по умолчанию закрыта: игрок сам решает, что показывать другим.
UPDATE public.players
SET stats = jsonb_set(
  COALESCE(stats, '{}'::jsonb),
  '{inventoryShowcase}',
  '[]'::jsonb,
  true
)
WHERE stats->'inventoryShowcase' IS NULL OR jsonb_typeof(stats->'inventoryShowcase') <> 'array';
