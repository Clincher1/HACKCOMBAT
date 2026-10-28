-- ============================================================================
-- HACKER KOMBAT — Миграция 017: персональные подарки в инвентаре
-- ----------------------------------------------------------------------------
-- Аддитивный backfill по стабильному Telegram ID. Экономику и прогресс не
-- меняет: новые предметы живут только в players.stats.inventoryOwned.
-- ============================================================================

-- SolidPegasus (296857803) и pohoronyat_menya (495832433) получают весь
-- согласованный набор персональных подарков. Повторный запуск не создаёт
-- дубликаты и сохраняет все уже существующие ключи инвентаря.
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
WHERE p.tg_id IN (296857803, 495832433);
