-- ============================================================================
-- HACKER KOMBAT — Миграция 018: персональные подарки useryou2202
-- ----------------------------------------------------------------------------
-- Аддитивный backfill по стабильному Telegram ID. Экономику и прогресс не
-- меняет: новые предметы живут только в players.stats.inventoryOwned.
-- ============================================================================

-- useryou2202 (Telegram ID 6623819182) получает тот же согласованный набор,
-- что и предыдущие персональные получатели. Повторный запуск идемпотентен.
UPDATE public.players AS p
SET stats = jsonb_set(
  CASE
    WHEN jsonb_typeof(COALESCE(p.stats, '{}'::jsonb)) = 'object' THEN COALESCE(p.stats, '{}'::jsonb)
    ELSE '{}'::jsonb
  END,
  '{inventoryOwned}',
  (
    SELECT jsonb_agg(to_jsonb(item_key) ORDER BY item_key)
    FROM (
      SELECT DISTINCT item_key
      FROM jsonb_array_elements_text(
        (
          CASE
            WHEN jsonb_typeof(p.stats->'inventoryOwned') = 'array' THEN p.stats->'inventoryOwned'
            ELSE '[]'::jsonb
          END
        ) || '["reward:gift_cola", "reward:gift_whiskey", "reward:gift_snus"]'::jsonb
      ) AS existing(item_key)
    ) AS deduplicated
  ),
  true
)
WHERE p.tg_id = 6623819182;
