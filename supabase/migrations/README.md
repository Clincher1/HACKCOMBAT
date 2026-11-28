# Миграции базы — правила (обязательно к прочтению)

Файлы `supabase/migrations/*.sql` применяются к **живой** базе, где уже лежит прогресс
реальных игроков. Ошибка в миграции = потерянный XP, купленные карточки и скины.

## Главное правило: прогресс игроков не сбрасывается

С версии v3.1 (октябрь 2026) действует железное правило:

> **Ни одна миграция не удаляет и не обнуляет прогресс игроков.**

Запрещено:

- `TRUNCATE` по любым таблицам игрока (`players`, `cards`, `base_upgrades`,
  `missions`, `achievements`, `player_pets`, `skins` и т.д.);
- `DELETE FROM players ...`, `DROP TABLE players`, `DROP COLUMN xp/level/...`;
- «пересчёт» уровней и опыта через `UPDATE players SET xp = 0`;
- любые изменения, из-за которых старый сейв перестаёт читаться.

Разрешено и является нормой:

- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS ... DEFAULT ...`;
- расширение `CHECK`-констрейнтов (сначала снять старый, затем добавить новый);
- обратно совместимые изменения RPC (`CREATE OR REPLACE FUNCTION`);
- новые таблицы/индексы, бэкфилл значений «по месту» без потери существующих полей.

## Почему

Ребаланс не должен ломать прогресс. Если экономика кажется слишком лёгкой — это
исправляется **контентом и коэффициентами** (цены, кривые, награды), а не вайпом.
Игрок, который прокачался вчера, обязан увидеть свои данные сегодня.

`004_v3_rebalance_wipe.sql` — **единственное исключение** за всю историю проекта:
полный вайп был явно разрешён и требовался для перехода на новую XP-экономику v3.
Повторять его нельзя.

## Чек-лист перед новой миграцией

1. Миграция **аддитивная**: старые колонки/строки остаются на месте.
2. Существующий сейв читается новой версией кода без ошибок (все новые поля имеют
   `DEFAULT` или обрабатываются как `undefined` в API).
3. Прогнать локально: `rm -f .local-db.json && npm run dev` → `/api/init` →
   сделать пару действий → перезапустить → прогресс на месте.
4. Проверить, что число игроков и суммарный XP до/после совпадают:

```sql
-- до и после миграции значения должны совпасть
select count(*) as players, coalesce(sum(xp), 0) as total_xp,
       coalesce(sum(data), 0) as total_data
from public.players;
```

## 010–015: текущая целостность прогресса

- `010_progression_integrity.sql` меняет defaults новых аккаунтов на `250 Data / 1500 Energy`,
  один раз поднимает только полностью неигравшие старые записи с `0 / 1000`, зажимает
  старые значения `prestige_count` и пересчитывает **только хранимые** `level/rank` из неизменённого
  lifetime `xp`, делает старый `distribute_passive_income()` no-op и снимает известный
  `pg_cron` job. XP, Data активных игроков, карточки и скины не обнуляются.
- В той же миграции `claim_mission_atomic(...)` в одной транзакции переводит mission
  `active → completed` и обновляет reward snapshot с CAS по валютам, XP, Heat и счётчику
  миссий. Повторный claim и конфликт баланса откатывают всю транзакцию.
- `011_atomic_purchases.sql` добавляет `commit_purchase_atomic(...)` для карточек, Тиров,
  «Базы», команды, питомцев и косметических покупок. Списание валюты и owned-row теперь
  проходят через один CAS-транзакционный вызов; клиентский `savePlayerCore` не является
  заменой транзакции.
- `012_data_finite_cap.sql` нормализует только отрицательные/unsafe Data и ставит
  PostgreSQL CHECK `0..9007199254740991`, чтобы числовое переполнение не вернулось.
- `013_atomic_prestige.sql` делает Global Hack reset транзакционным: CAS по cycle и
  удаление cards/team/active missions откатываются вместе при ошибке.
- `014_purchase_card_cap.sql` исправляет guard атомарной покупки карточки до
  текущего Tier IV потолка `60` уровней (а не исторических `25`).
- `015_open_ended_progression.sql` переводит `level`, `rank` и `prestige_count` в `bigint`,
  убирает конечный prestige-check и оставляет XP-прогрессию открытой. Первые пять
  Global Hack сохраняют множитель ×2, следующие циклы дают безопасный +10% бонус.
- После применения 010–015 проверить `to_regprocedure(...)` RPC, Data CHECK и
  убедиться, что ручной вызов legacy passive возвращает `0`. Для production-проекта
  `llciyqawfbeabkkdsnmc` миграция `open_ended_progression` применена 28.10.2026;
  live-проверка подтвердила `bigint` для `level/rank/prestige_count/xp`, отсутствие
  prestige-cap constraint и сигнатуры bigint для `global_prestige_atomic`.
- `016_player_inventory_showcase.sql` аддитивно выдаёт существующим игрокам
  памятный `reward:first_donut` и создаёт закрытую по умолчанию витрину в `stats`.
  Runtime-нормализация повторяет эту выдачу для новых игроков и старых записей,
  если миграция ещё не была применена.
- `017_personal_inventory_gifts.sql` по стабильным Telegram ID выдаёт
  `reward:gift_cola`, `reward:gift_whiskey` и `reward:gift_snus` игрокам
  `SolidPegasus` (`296857803`) и `pohoronyat_menya` (`495832433`). Backfill
  идемпотентен, сохраняет остальные ключи `inventoryOwned`, а витрина остаётся
  закрытой до добровольного действия владельца. Runtime-реестр повторяет
  назначение для этих игроков при каждом серверном sync.
- `018_personal_inventory_gift_useryou2202.sql` тем же идемпотентным способом
  выдаёт набор подарков игроку `useryou2202` (`6623819182`).

## 022: «Инвентарь оживает»

- `022_inventory.sql` создаёт `player_items` (стопки расходников, PK `player_id + item_key`,
  `ON DELETE CASCADE` на `players`) и `item_drops` (журнал выдачи: `source` только
  `hack | mission | level`). Существующие таблицы, `players.stats` и прогресс не меняются:
  аддитивная миграция, старые сейвы читаются без правок.
- `grant_item(p_player_id, p_item_key, p_source, p_outcome)` — одна транзакция:
  upsert `qty + 1` и строка журнала. `ON CONFLICT DO UPDATE` берёт блокировку строки,
  поэтому параллельные вызовы сериализуются и количество не теряется.
- `consume_item(p_player_id, p_item_key, p_qty)` — один `UPDATE ... WHERE qty >= p_qty`
  и `DELETE` при нуле; `NULL` означает «предмета не хватает», двойного применения нет.
- Обе функции `SECURITY DEFINER SET search_path = public`; `anon`/`authenticated` не имеют
  прав ни на таблицы, ни на функции (`REVOKE ALL` + `GRANT ... TO service_role`).
  RLS включён, политик нет: доступ только серверным service-role.
- После применения проверить `to_regclass('public.player_items')`,
  `to_regclass('public.item_drops')` и `to_regprocedure('public.grant_item(uuid,text,text,text)')`.
  Вайп сносит обе таблицы каскадом — они объявлены в `PLAYER_TABLES` (`scripts/lib/wipe-core.mjs`).

## 023: «Цели дня»

- `023_daily_goals.sql` расширяет CHECK `item_drops.source` до
  `hack | mission | level | daily` (DROP CONSTRAINT + ADD CONSTRAINT: старые строки
  проверку по-прежнему проходят, данные не читаются и не переписываются) и
  пересоздаёт `grant_item` с тем же контрактом, добавив `daily` в список разрешённых
  источников. Состояние доски живёт в существующем `players.stats.dailyGoals`,
  новых колонок и таблиц нет — старый сейв читается как «доски ещё нет» и получает
  свежую при первом синке.
- `claim_daily_goal(p_player_id, p_goal_index, p_chips, p_crypto, p_item_key, p_day)` —
  одна транзакция: `SELECT ... FOR UPDATE` по игроку (параллельные сборы
  сериализуются, второй получает `DAILY_GOAL_ALREADY_CLAIMED` без награды),
  проверка UTC-даты доски, готовности (`progress >= target`) и отметки `claimed`,
  начисление Chips/Crypto, а на третьей цели — выдача предмета через `grant_item`
  с `source='daily'` в той же транзакции. Суммы Чипов/Crypto ограничены сверху
  (`p_chips <= 10`, `p_crypto <= 5`), чтобы клиент не мог прислать свою награду.
- Функция `SECURITY DEFINER SET search_path = public`; `anon`/`authenticated` не
  имеют ни прав на таблицы (как в 022), ни `EXECUTE` на функции.
- После применения проверить `pg_get_constraintdef` для
  `item_drops_source_check` (в определении есть `daily`) и
  `to_regprocedure('public.claim_daily_goal(uuid,integer,integer,integer,text,text)')`.
  Число игроков, суммарные XP/Data и `item_drops` до/после совпадают — миграция
  ничего не пересчитывает.
