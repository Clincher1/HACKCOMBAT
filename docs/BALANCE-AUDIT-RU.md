# HACKER KOMBAT — системный аудит игровой механики

**Дата аудита:** 27.10.2026 (локальная таймзона пользователя: Europe/Moscow)
**Исходный commit аудита:** `63b43502ebc5f6ed984c7d64d9f15075b123893d`
**Область:** конфигурация `shared/*`, серверный `api/_lib/gameEngine.ts`, API-обвязка, Supabase migrations, клиентские страницы и QA-сценарии.
**Статус документа:** исторические findings ниже сохранены для трассируемости; раздел 0.1 фиксирует реализованные исправления на ветке `arena/34603a72-hackcombat`.

### 0.1. Реализованный remediation-checklist (27.10.2026)

| Риск аудита | Реализация | Проверка |
|---|---|---|
| `Infinity`/переполнение XP и Data | L200 возвращает finite `xpToNext=0`, mission/referral XP = 0; Data reward после L90 имеет soft-cap; persistence зажимает Data | `npm run build`, `npm run qa:all`, finite assertions в integrity QA |
| Бесконечный prestige | `MAX_PRESTIGE_COUNT=5`, уровни 50/60/70/80/90, серверный отказ после cap, multiplier единой функцией | memory QA + migration CHECK |
| Double mission claim | `claim_mission_atomic` меняет mission и player snapshot в одной CAS-транзакции | staging RPC smoke-test: success + повторный claim |
| Double purchase/частичное сохранение | `commit_purchase_atomic` для card/tier/base/team/pet/cosmetics; owned row и баланс в одной транзакции | memory QA + staging card RPC smoke-test |
| Старые Supabase defaults/passive cron | migration 010–014: defaults 250/1500, безопасный backfill только неигравших, level/rank из lifetime XP, finite Data CHECK, legacy passive no-op/unschedule, atomic prestige reset и guard карточек до L60 | staging: defaults, RPC existence, Data CHECK, prestige/claim/purchase smoke |
| Telemetry reward exploit | client telemetry оставлена для badge/progress, resource rewards отключены для недоказуемых событий | `scripts/qa/api.mjs` и full QA |
| Разные игровые сутки | daily, pets, chips, telemetry, donations используют `getGameDayKey()` | full QA + source audit |
| Grey drop/reroll/UI | tier `cryptoDropChance` используется; refresh cooldown проверяется сервером и отображается как `Скан свежий`; XP cap в UI показывает `MAX` | mission QA + build |

**Staging smoke-test 27.10.2026:** проект `hacker-kombat` (`llciyqawfbeabkkdsnmc`) получил миграции `progression_integrity`, `atomic_purchases`, `data_finite_cap`, `atomic_prestige` и `purchase_card_cap`; проверены defaults `250/1500`, три RPC, Data/prestige constraints, no-op passive, атомарные claim/card purchase/prestige в rollback-очистке и исправленный card cap L60. Production apply требует отдельного backup/snapshot и не выполняется автоматически.

---

## 0. Короткий вывод

Текущая версия уже имеет хороший скелет игры: сервер фиксирует шанс контракта на старте, старт миссии защищён PostgreSQL-CAS, провал не обнуляет игрока, оффлайн-доход ограничен, есть несколько разных валют и долгие цели, а Neon Relay теперь построен как семидневный персональный маршрут, а не как старая модель с тремя глобальными целями.

Однако до того, как считать баланс готовым для широкого запуска, нужно закрыть четыре класса рисков:

| Приоритет | Что блокирует готовность | Почему это важно |
|---|---|---|
| **P0** | Престиж после 90 уровня не имеет конечного правила; максимальный уровень 200 даёт `Infinity` XP | Нельзя гарантировать конечное состояние экономики и корректное сохранение в `bigint`; после нескольких престижей ежедневный бонус и сообщения используют неограниченный `2^prestigeCount` |
| **P0/P1** | Несколько критических операций не являются одной транзакцией с наградой и списанием | Распределённые Vercel-инстансы не защищены локальным `withPlayerLock`; возможны потеря награды, бесплатная покупка или потеря валюты при сбое между записями |
| **P1** | Supabase defaults расходятся с игровой конфигурацией; старая `pg_cron`-функция пассива не соблюдает текущие правила оффлайна | Новый игрок в Supabase получает `0 Data` и `1000 Energy`, хотя код и UI рассчитывают на `250 Data` и `1500 Energy`; при включённом cron возможны неправильные оффлайн-выплаты |
| **P1** | Клиентская telemetry может открывать достижения с Crypto-наградами поддельными событиями | `session:240`, `local_hour:3`, `shop_freeze_30` и `idle_15` принимаются без доказательства факта; это прямой путь к одноразовым ресурсным наградам |
| **P1** | Время и суточные окна не унифицированы | Основной день — Москва, pet-streak и telemetry — UTC, `local_hour` — значение клиента, daily login — rolling 20/48 часов |
| **P1** | Free reroll контрактов делает витрину почти детерминированным магазином | Игрок может перебирать предложения без цены и cooldown; выбор риска перестаёт быть выбором |
| **P2** | Сильный дрейф документации, UI и достижений от конфигурации | Игроку показываются старые `+1 Energy / 3 сек`, `1000` стартовой энергии и «25 уровней», а фактическая модель уже другая |

**Главная рекомендация:** сначала сделать систему конечной, атомарной и наблюдаемой; только затем менять коэффициенты. Сейчас преждевременно «чинить» тап, XP, шанс или цены одним числом: часть наблюдаемого дисбаланса вызвана багами состояния, несогласованными часами и неполной симуляцией.

---

## 1. Методика и границы достоверности

Проверены:

- `shared/mechanics.ts` — время, энергия, Heat, оффлайн, prestige, ранг и derived stats;
- `shared/hack.config.ts` и `shared/missions.config.ts` — XP, шанс, исходы, длительность, entry и 30 контрактов;
- `cards.config.ts`, `base.config.ts`, `team.config.ts`, `pets.config.ts` — источники дохода, стоимость, бонусы и долгие инвестиции;
- daily tasks, Neon Relay, referrals, achievements, skins/profile frames, donation и leaderboard;
- `api/_lib/gameEngine.ts` — нормализация, синхронизация, действия, persistence и античит;
- Supabase migrations 001–011 — типы столбцов, defaults, RPC и переход от старого passive cron;
- клиентский `GameContext`, основные страницы и текстовые подсказки;
- QA в memory/local режиме.

Результат проверки кода:

- `npm run qa:all`: **14 сценариев, 408 pass / 0 fail** (включая finite/progression и временную рамку QA);
- live memory API QA: **50 pass / 0 fail**, click/anti-cheat QA: **6 pass / 0 fail**;
- build, TypeScript, Vite и API bundle прошли;
- остаётся только warning о production chunk примерно 519 KB;
- staging Supabase smoke-test после миграций 010–014 прошёл: defaults, RPC existence, no-op legacy passive, Data/prestige constraints и транзакционные claim/card purchase/prestige проверены через connector; production ещё требует отдельного backup/snapshot.

`scripts/balance-sim.ts` теперь учитывает entry Data/Energy, Energy regen, шанс/исходы, 15-минутный offer cooldown, Chip cap, offline qualification и prestige 0–5. Это всё ещё верхняя граница для идеального бота, а не обещание темпа для casual-игрока.

---

## 2. Карта прогрессии

### 2.1. Основные ступени

| Система | Точки открытия / максимум | Комментарий |
|---|---|---|
| Уровень игрока | 1–200 | Выдаётся только за XP контрактов, daily tasks и referrals; тап и passive XP не дают |
| Слоты контрактов | 1 → 2 на L10 → 3 на L20 | Это карьерная награда, но слот не увеличивает скорость XP без учёта Energy |
| Контрактные тиры | L1, L3, L7, L12, L18, L26 | Это **не** то же самое, что тир карточек |
| Тиры карточек | L1, L10, L22, L36 | 15 / 30 / 45 / 60 уровней карточки; 60 — реальный максимум |
| Команда | Coder L12 + 25 миссий; далее L14–36 и requirements по миссиям | 8 NPC, без upkeep после найма |
| Питомцы | L14, L17, L20 | 3 питомца, hunger/кормление/affection |
| База | requirements L1, 3, 5, 8, 10, 13, 17, 21, 25, 30 | 10 улучшений × 15 уровней, переживает prestige |
| Prestige | L50, 60, 70, 80, 90; затем снова L90 | Сбрасывает Data, карты, команду, active missions, Energy и Heat; сохраняет XP/level, Base, pets, Crypto, Chips, Rep и косметику |
| Neon Relay | фиксированное окно 27.10 09:00 → 03.11 09:00 MSK | 7 дневных наборов, награды — профильные рамки |

### 2.2. Контрактные и карточные «тиры» нужно различать в UI

Контрактный T6 доступен уже на L26, а карточный Tier IV — только на L36. При этом в тексте UI и достижений встречаются старые формулировки о других границах. Это создаёт ложное ожидание: игрок может увидеть «тир 6» и считать, что близок к последнему уровню карточек, хотя это независимые оси.

Рекомендация: в интерфейсе использовать разные термины — например, `Контракты T1–T6` и `Арсенал I–IV`; везде показывать одновременно `minLevel`, `requiredPower` и стоимость открытия.

---

## 3. Время, игровые сутки и окна

### 3.1. Канонические правила текущего сервера

| Механика | Фактическое правило | Риск / UX-эффект |
|---|---|---|
| Основные игровые сутки | `getGameDayKey()` = UTC+3, граница 00:00 MSK | Это правильная единая база для daily tasks, Chips и active time |
| Heartbeat | клиент обращается примерно раз в 30 сек; gap до 45 сек считается непрерывной активностью | Сетевые задержки после 45 сек обнуляют полезный интервал |
| Offline qualification | нужно 8 минут активной игры именно в текущих игровых сутках | Игрок, сыгравший 7:59, не получает копилку за день |
| Offline cap | 8 часов базово; ИБП добавляет 40 минут за уровень, до 18 часов на max | Кап зависит от Base, но UI не всегда показывает, сколько реально накоплено |
| Offline tap | 0.1 tap/sec, максимум 8 часов, результат умножается на click power | Offline даёт только Data, не XP/Crypto/Chips |
| Offline passive | 50% от `dataPerHour` | Неактивность не должна заменять игру, но старый cron это правило не соблюдает |
| Daily tasks / Chip cap | сброс в 00:00 MSK | Серверная часть согласована с основной моделью |
| Daily login | новый claim через 20 часов; streak сбрасывается после gap более 48 часов | Это rolling-таймер, а не «раз в календарные сутки»; это нужно явно написать в UI |
| Mission offer | автообновление каждые 15 минут | Ручной `refresh` сейчас не имеет цены и cooldown |
| Contract duration | T1: 40–65 сек; T2: 95–120; T3: 150–210; T4: 240–330; T5: 400–480; T6: 600–780 | От 40 секунд до 13 минут, но Energy списывается как полная длительность при старте |
| Pet feed | cooldown 4/4/5 часов, отдельный streak | Код streak использует UTC-день, в отличие от основной MSK-модели |
| Telemetry day | `new Date().toISOString().slice(0,10)` = UTC | Суточный cap telemetry меняется в 03:00 MSK, не в полночь игры |
| Donation invoice cap | in-memory UTC bucket | Лимит и cooldown сбрасываются при смене инстанса; это антиспам, не игровая валюта |

### 3.2. Оффлайн-логика корректна по замыслу, но требует интеграционного теста

Сервер оплачивает только интервал внутри последнего квалифицированного дня. Если игрок не набрал 8 минут, долг на следующие дни не переносится. Это хорошее ограничение против бесконечной копилки и должно сохраниться.

Проблемы:

1. В Supabase migration 001 сохранена функция `distribute_passive_income()`, которая начисляет полный `data_per_hour` через `pg_cron`, не проверяя 8-минутную qualification, 50% offline multiplier и cap. Если cron реально включён в проекте, одновременно существуют две несовместимые модели пассива.
2. `last_passive_claim` обновляется и старым cron, и API. Это может привести к гонкам, пропущенной части выплаты или оплате по неправильному тарифу.
3. Нужна проверка именно на deployed staging: активен ли `pg_cron`, есть ли расписание `hacker-kombat-passive-income`, и кто является единственным владельцем passive settlement.

**Решение до балансировки:** отключить старый cron или заменить его вызовом единой серверной функции, а не вводить третий вариант правил.

### 3.3. Neon Relay: текущая семидневная модель

В конфигурации зафиксировано окно **27 октября 09:00 MSK — 3 ноября 09:00 MSK**. Номер дня вычисляется по московской календарной дате, но само окно стартует не в полночь:

- день 1 длится с 09:00 27 октября до полуночи — около 15 часов;
- день 2–6 привязаны к календарной дате;
- день 7 начинается 2 ноября в 00:00, но окно продолжается до 09:00 3 ноября — примерно 33 часа.

Это не обязательно ошибка: оно позволяет не обрывать последний пакет ровно в полночь. Но это должно быть показано пользователю как «день 7 доступен до 09:00 3 ноября», а не как семь равных 24-часовых дней.

Дополнительное ограничение: сложность задач фиксируется при создании дня и масштабируется только до уровня 100. Игроки L101–L200 получают ту же цель, что и L100. Для текущего cosmetic-only события это допустимо, но для повторяемых сезонов нужен отдельный endgame-scale.

---

## 4. XP, уровни, ранги и prestige

### 4.1. XP-кривая

Формула следующего уровня:

```text
XP_to_next(L) = round_to_10(140 × L²), минимум 50
```

Уровень 200 — специальная граница, где `getXpToNext(200)` возвращает `Infinity`. Суммарные XP до ключевых уровней:

| Уровень | XP с начала до уровня | XP следующего уровня | `1.14^(L-1)` — scale Data-контрактов |
|---:|---:|---:|---:|
| 1 | 0 | 140 | 1.00× |
| 5 | 4 200 | 3 500 | 1.689× |
| 10 | 39 900 | 14 000 | 3.252× |
| 12 | 70 840 | 20 160 | 4.226× |
| 18 | 249 900 | 45 360 | 9.276× |
| 20 | 345 800 | 56 000 | 12.056× |
| 26 | 773 500 | 94 640 | 26.462× |
| 30 | 1 197 700 | 126 000 | 44.693× |
| 36 | 2 087 400 | 181 440 | 98.100× |
| 40 | 2 875 600 | 224 000 | 165.687× |
| 50 | 5 659 500 | 350 000 | 614.239× |
| 70 | 15 665 300 | 686 000 | 8 441.794× |
| 90 | 33 455 100 | 1 134 000 | 116 019.708× |
| 100 | 45 969 000 | 1 400 000 | 430 110.735× |
| 125 | 90 055 000 | 2 187 500 | 11 381 554.065× |
| 155 | 172 102 700 | 3 363 500 | 579 891 984.527× |
| 199 | 364 993 860 | 5 544 140 | 184 995 244 533.123× |
| 200 | 370 538 000 | **Infinity** | 210 894 578 768× |

Кривая сама по себе не является главным P0: до L199 она конечна и предсказуема. P0 — отсутствие корректного поведения на максимальном уровне и экспоненциальное масштабирование Data рядом с ним.

### 4.2. XP контрактов и реальный темп

`getMissionXpAward()` масштабирует базовый XP по отношению текущего `XP_to_next` к референсному уровню тира с экспонентой 0.9. Поэтому XP за доступный игроку контракт растёт, но не строго пропорционально всей кривой.

Санити-таблица для базового `hackPower=10`, Heat 0, без истории успехов/провалов, с выбором контракта с наибольшим ожидаемым XP/minute:

| Уровень | Лучший контракт в модели | Chance | XP за контракт | Ожидаемый XP/min |
|---:|---|---:|---:|---:|
| 1 | `retro_blog` | 75.0% | 18 | 22.5 |
| 3 | `retro_blog` | 84.0% | 130 | 174.1 |
| 7 | `retro_blog` | 84.0% | 312 | 417.8 |
| 10 | `retro_blog` | 84.0% | 364 | 487.5 |
| 12 | `drone_racing_hub` | 55.4% | 2 156 | 604.9 |
| 18 | `holo_cinema_grid` | 55.4% | 5 905 | 1 035.5 |
| 20 | `phantom_ponzi_core` | 49.9% | 9 570 | 908.3 |
| 26 | `phantom_ponzi_core` | 54.2% | 15 347 | 1 519.8 |
| 30 | `shadow_ai_collective` | 50.5% | 25 189 | 1 402.7 |
| 36 | `shadow_ai_collective` | 53.6% | 34 973 | 2 008.6 |
| 50 | `shadow_ai_collective` | 54.2% | 63 174 | 3 649.3 |

Это **не прогноз времени до уровня**. Таблица предполагает бесконечные Data/Energy, идеальный выбор предложения, отсутствие downtime и не учитывает слоты. Она нужна для обнаружения скачков и доминирующих контрактов.

Для ориентировочного energy-neutral расчёта важно следующее: каждый активный слот тратит 1 Energy/sec длительности, а базовое восстановление даёт 0.5 Energy/sec. При трёх одновременно активных миссиях чистый расход равен примерно 2.5 Energy/sec; даже Coffee max увеличивает regen только до примерно 0.60/sec. Поэтому 3 слота не означают автоматически 3× реальный XP/hour: сначала нужно проверить Energy throughput.

### 4.3. Проблема максимального уровня и типов данных

На L200:

- `getXpToNext(200) = Infinity`;
- `getMissionXpAward(...) = Infinity`, потому что в ratio участвует `Infinity`;
- старт миссии передаёт `p_xp_reward` типа PostgreSQL `integer`, поэтому корректное сохранение невозможно;
- referrals используют ту же функцию для `getReferrerXpReward()` и `getInviteeXpReward()`, значит на L200 возможна `Infinity` XP-награда;
- для `orbital_bank_ring` reward при L200 около `6.201e15 Data`, entry около `7.442e14 Data` ещё без prestige;
- при prestige multiplier ×1 048 576 значения становятся порядка `1e21–1e22`, далеко за пределами безопасной целочисленной точности JavaScript `Number`.

**Обязательное решение:** определить конечную семантику L200. Минимальный безопасный вариант — не запускать XP-награды и referral XP после max level, вернуть конечный `xpToNext=0` только в UI-слое и явно помечать уровень как capped. Для Data нужен decimal/BigInt-подход либо жёсткий cap. Нельзя оставлять `Infinity` в payload, JSON, RPC и reward ledger.

### 4.4. Ранги

В `RANK_TITLES` есть одновременно `minLevel` и `minData`, но `computeDerivedStats()` проверяет только `minLevel`. В результате:

- игрок после prestige может иметь уровень для высокого ранга, но 0 Data — и всё равно получает титул;
- таблица рангов обещает два условия, сервер реализует одно;
- `rank` в БД фактически является копией карьерного уровня.

Нужно выбрать один из двух контрактов:

1. оставить rank = level и удалить/переименовать `minData` из конфигурации; или
2. действительно требовать `level` **и** lifetime/текущий Data, но тогда определить, сбрасывается ли Data prestige-ом и как игрок не теряет ранг.

Текущий вариант хуже обоих: он создаёт ложное ожидание и усложняет баланс рейтинга.

### 4.5. Prestige

Текущая формула:

```text
required level = min(90, 50 + prestigeCount × 10)
prestige multiplier = 2^min(prestigeCount, 20)
```

Prestige #1–#5 требует L50/L60/L70/L80/L90. Начиная с #6, требование остаётся L90 навсегда. При этом:

- `handleGlobalHackPrestige()` сбрасывает `Data`, карты, команду, active missions, Energy и Heat;
- XP, уровень, Base, питомцы, Crypto, Chips, Rep и достижения сохраняются;
- `computeDerivedStats()` ограничивает multiplier на ×2²⁰ = 1 048 576;
- `record.prestigeCount` не имеет верхнего серверного лимита;
- daily bonus и текст prestige используют сырой `Math.pow(2, record.prestigeCount)`, а не тот же clamp.

Это не просто вопрос вкуса. После L90 появляется бесконечный повторяемый reset с сохранением карьерного XP и скин-наградой. На prestige 20 экономика уже достигает миллиона-кратного multiplier, а после 20 счётчик продолжает расти, хотя derived multiplier остановлен. Daily bonus рано или поздно может стать некорректным или `Infinity`.

**Рекомендация:** до теста retention зафиксировать одну из моделей:

- конечный `MAX_PRESTIGE` и отказ выше него;
- бесконечный prestige, но с отдельной линейной/мягкой post-cap валютой, без удвоения дохода;
- prestige после L90 превращается в cosmetic/seasonal reset без полного экономического multiplier.

Технически все места должны пользоваться одной функцией `getSafePrestigeMultiplier()`, а сервер должен атомарно отклонять prestige выше разрешённого значения.

---

## 5. Контракты: шанс, исходы, Data, XP, Heat и Rep

### 5.1. Формула шанса

```text
gearRatio = hackPower / requiredPower
gearFactor = clamp(0.5 + 0.5 × gearRatio, 0.55, 1.25)
levelFactor = clamp(0.72 + 0.28 × level / requiredLevel, 0.72, 1.12)
experienceFactor = clamp(1 + 0.02 × successes − 0.04 × fails, 0.70, 1.15)
heatFactor = clamp(1 − Heat / 250, 0.72, 1)
chance = clamp(baseChance × все множители, 0.05, 0.96)
```

На открытии тиров при `hackPower=10` и нулевой истории:

| Контрактный тир | Уровень открытия | Лучший chance по классу | Grey на открытии |
|---:|---:|---:|---:|
| T1 | 1 | около 75.0% | — |
| T2 | 3 | около 55.0% | — |
| T3 | 7 | около 49.5% | около 35.2% |
| T4 | 12 | около 49.5% | около 35.2% |
| T5 | 18 | около 48.4% | около 35.2% |
| T6 | 26 | около 48.4% | около 35.2% |

При `hackPower=2200` Grey T6 становится около 64.0%, при 3000 — около 75.6%. Нижний clamp gear factor не запрещает запуск сильно недокачанного тира: он только удерживает шанс от полного нуля. Это позволяет экспериментировать, но при 35% chance игроку нужен очень ясный preview ожидаемого результата.

### 5.2. Исходы

При `p = chance`:

- success: вероятность `p`, Data/XP/Rep/Heat × `1`, Chips за успех;
- partial: `(1-p) × 0.45`, Data ×0.45, XP ×0.55, Rep/Heat ×0.5;
- fail: `(1-p) ×0.55`, Data ×0, XP ×0.15, Rep ×0, Heat ×1.5.

Ожидаемые множители без учёта entry:

```text
E[Data] = 0.45 + 0.55p
E[XP]   = 0.33 + 0.67p
E[Rep]  = 0.225 + 0.775p
E[Heat] = 1.05 − 0.05p
```

Плюсы текущей схемы:

- failure не уничтожает прогресс полностью;
- шанс фиксируется в миссии на старте и не меняется при прокачке во время таймера;
- partial и fail различаются по цене риска.

Риски:

- при низком chance контракт может быть положительным по ожидаемому Data, потому что entry равен только 12% reward; значит `risk` в основном ограничивает время, Energy и Heat, а не капитал;
- `experienceFactor` считается по общему классу цели (`bad/good/neutral/grey`), хотя переменные и комментарии местами называют его опытом по тиру. 50 успешных T1 могут повысить шанс T6 того же класса;
- Gray-описания обещают разные шансы Crypto по тиром, но сервер ниже заменяет их одной константой.

### 5.3. Entry и Gray Crypto

При старте:

```text
energy = max(10, ceil(durationSec))
data   = max(25, ceil(reward × 0.12))
```

Reward строится как `baseDataReward × 1.14^(level-1) × prestige × mission bonuses`, а затем entry считается уже от scaled reward. Это прозрачно и даёт положительный expected Data, но при каждом параллельном слоте увеличивает нагрузку на Energy.

Критическая несогласованность в `handleMissionAction()`:

```ts
const baseDropChance = cfg.targetType === 'grey' ? 0.35 : cfg.cryptoDropChance ?? 0;
```

Для Grey игнорируются значения в `missions.config.ts`: 45%, 60%, 65%, 75% для T3–T6. Фактически все серые контракты получают 35% до бонуса Lucky Charm. Максимальный бонус Lucky Charm при 15 уровнях — около 10.05 процентных пунктов, а не полная компенсация разницы до 75%.

Нужно либо использовать конфигурационное значение `cfg.cryptoDropChance`, либо изменить описания/конфиг под единый 35%. Автоматически повышать шанс без определения цели нельзя: Crypto — долгосрочный ресурс, и его rate влияет на pets, skins, frames и skip.

### 5.4. Skip

Skip за 1 Crypto гарантирует partial, обходит таймер, не даёт Chips и не бросает success. Это хорошая понятная покупка времени, но она должна показываться как именно `partial`, а не как «быстрый успех». Сейчас сервер это делает правильно; в экономическом симуляторе нужно проверить, не становится ли skip обязательным для low-chance T5/T6.

---

## 6. Экономика ресурсов

### 6.1. Сводная таблица

| Ресурс | Источники | Стоки / ограничения | Persistence |
|---|---|---|---|
| **Data** | тап, auto-click, карточки/passive, offline, контракты, daily login, referral, achievements | карточки, Base, team, pets, skins/frames через связанные действия, contract entry, card tiers, Heat penalty; prestige обнуляет | не сохраняется при prestige |
| **Energy** | regen 1/2 сек базово, Coffee, Energy Max-карточки, prestige возвращает базовый запас | каждый валидный тап −1, старт контракта −duration; cap 1500 + upgrades до 5000 | не сохраняется при prestige |
| **Rep** | контракты, особенно good/white path; partial половина положительного delta | команда, pets; отрицательные mission delta clamp до 0 | сохраняется при prestige |
| **Heat** | bad/dark карточки/контракты, fail ×1.5, black alignment ×1.3 к приросту | при `Heat>100`: −10% текущего Data и 60 секунд lockdown, Heat сбрасывается до50; обычного decay нет | prestige обнуляет |
| **Crypto** | стартовые 5, achievements, daily, успешные Grey drops, referral не даёт Crypto | skip 1, clear lockdown 2, pets, skins, profile frames | сохраняется при prestige |
| **Chips** | success mission: 1, Grey success: 2, daily: 3, achievements | tier unlock 60+150+320=530, Base около705; обычные источники capped на45/игровые сутки, achievement rewards обходят cap | сохраняются при prestige |
| **XP** | success/partial/fail contract, daily tasks, referral | уровень 200; prestige XP/level сохраняет; tap/offline/passive XP не дают | сохраняется |

### 6.2. Тап и passive

Тап — серверно валидируемый ресурсный поток: клиент отправляет pending clicks, сервер ограничивает rate и Energy. Базовая сила клика равна 1 Data и усиливается карточками, командой, alignment, Base, pets, cosmetics и prestige.

Black alignment даёт +50% к клику, но повышает Heat multiplier до 1.3. White alignment даёт +20% passive и двойной reward для bad-контрактов/Rep при соответствующих условиях. Это два разных стиля, но White сейчас имеет более безопасный контрактный Data-профиль, а Heat почти не имеет активного способа восстановления. Нужна playtest-проверка, не является ли White доминирующим выбором после появления достаточного Rep.

Passive складывается из карточек, team, white alignment, Base, pets и auto-click. Auto-click добавляется в `dataPerHour`, но не тратит Energy как ручной тап. Это сильный источник runaway после prestige, особенно при сохранённой Base.

### 6.3. Карточки

- 48 карточек;
- 4 карточных тира: max 15/30/45/60;
- T2: 60 Chips + 120 000 Data, L10;
- T3: 150 Chips + 1 500 000 Data, L22;
- T4: 320 Chips + 12 000 000 Data, L36;
- `CARD_LEVEL_INCOME_GROWTH = 1.18`;
- `CARD_PRICE_GROWTH = 1.24` плюс глобальный индекс стоимости до ×40 для дешёвых модулей.

Множитель доходного вклада одной карточки:

| Уровень | 1 | 10 | 20 | 30 | 45 | 60 |
|---:|---:|---:|---:|---:|---:|---:|
| Income multiplier | 1× | 23.521× | 146.628× | 790.948× | 9 531.577× | 114 189.666× |

Контрольные суммы для одной ветки, рассчитанные по текущему коду:

- дешёвая `keyboard` до L60: примерно **2.45 млрд Data**;
- дорогая `leviathan_protocol` до L60: примерно **52.31 трлн Data**;
- глобальный индекс делает порядок покупки важным: «равномерно по всем картам» и «одна специализация» — разные экономики.

Риск — не только дороговизна, но и непрозрачность. Геометрический доход кажется маленьким в начале, затем один высокий уровень резко меняет `dataPerHour`, а price index одновременно увеличивает следующие покупки. Нужно показывать `price`, `+Data/hour`, `payback` и влияние на следующий контракт в одном preview.

### 6.4. Base

10 улучшений × 15 уровней. Полная прокачка по текущим `getBaseUpgradePrice()`/`getBaseUpgradeChipCost()` требует примерно:

- **223 154 763 864 Data**;
- **705 Chips**.

Максимальные эффекты: Coffee около +19.95% regen, Standing Desk +10.05% click, VPN −15% Heat, UPS +10 часов offline cap, Auto Script примерно +1 auto-click/sec, Analytics +15% contract reward, Storage +15% passive, Thermal −10.05% card price, Feeder около −19.95% feed cost, Lucky около +10.05 percentage points Crypto drop.

Это хороший long-term sink, который переживает prestige, но два момента требуют проверки:

1. комментарий конфигурации говорит о примерно +15% экономике, тогда как эффекты разных каналов суммарно дают значительно больше в отдельных сценариях;
2. achievement `base_max_one` проверяет `maxBaseLevel >= 10`, хотя максимальный уровень конфигурации равен 15.

### 6.5. Team

Стоимость полного состава:

- Data: **1 715 000**;
- Rep: **3 600**;
- суммарно `hackPower`: **500**;
- passive: **+93%**;
- click: **+60%**;
- auto-click: **+2/sec**;
- reduction Heat: **35%** до общих clamps.

Команда не имеет содержания/зарплаты и полностью сбрасывается prestige. Это делает её сильным midgame-ускорителем, но одновременно превращает каждый новый prestige в обязательный повтор дорогих покупок. Нужно проверить, является ли повторный найм интересным маршрутом или просто налогом перед восстановлением прежней мощности.

Analyst открывает Grey только на L18 и после 50 миссий. Это хорошо связывает секретные контракты с игрой, но при низком фактическом Grey drop reward игрок может почувствовать, что большой requirement не окупается.

### 6.6. Pets

| Питомец | Покупка | Открытие | Баф |
|---|---:|---:|---|
| Hamster Byte | 60 000 Data | L14 | +3% passive, hunger decay 2.1/h, корм каждые 4h |
| Rat Glitch | 120 Crypto | L17 | +4% click, корм каждые 4h |
| Guinea Pixel | 450 Rep | L20 | −9% Heat и +4% contract reward, корм каждые 5h |

Корм стоит `max(feedBaseCost, доля от dataPerHour)` с discount от Auto Feeder. Баф зависит от эффективной сытости и feedCount; capped по категориям. Система интересна как обслуживание, но требует двух UX-улучшений: показывать цену следующего корма после всех бонусов и предупреждать, насколько упадёт effective buff при пропуске кормления. Сейчас hunger — долгосрочный penalty без потери питомца, поэтому его ценность легко превращается в рутинный maintenance.

### 6.7. Heat

Heat почти монотонный:

- растёт от bad/dark миссий, fail и тёмных карточек;
- после penalty падает только до 50, не до 0;
- Fence/VPN/Pet уменьшают только будущий прирост;
- `clear_lockdown` за 2 Crypto снимает блокировку, но не Heat.

Это создаёт потенциальную ловушку: игрок, ошибочно выбравший Black path или купивший несколько dark cards, не имеет обычного активного способа вернуться к нейтральному состоянию. Нужен осознанный design decision: либо Heat — постоянная специализация до prestige, и это должно быть написано, либо добавить ограниченный cooling sink (white contract, Rep, cooldown, Crypto — один понятный способ, не четыре разрозненных).

---

## 7. Ежедневные задачи, сезон, referrals, achievements и рейтинги

### 7.1. Daily login и daily tasks

Daily login даёт:

- Crypto `3 + streak × 2`: от 5 до 17;
- Data `150 × streak × 2^prestige × ceil(level/3)`;
- 3 Chips с обычным daily cap.

При L50, streak 7, prestige 0 это 17 850 Data — полезно в ранней игре, но ничтожно рядом с mission scale после midgame. При prestige multiplier и L90 bonus уже становится очень большим, а после сырого `prestigeCount` — неконтролируемым.

Daily tasks — ровно три задания: tap, mission_start, mission_complete; каждое даёт 10/20/30 XP. Максимум — 90 XP в сутки. Сравнение с `XP_to_next`:

- L10: до 0.64% следующего уровня;
- L50: около 0.026%;
- L90: около 0.008%;
- L200: XP-бар уже capped.

Это не обязательно означает «дать больше XP». Рекомендуется после L20 перевести часть daily value в отдельный daily/season score, Data или Chips, чтобы ежедневное действие оставалось заметным, не ломая XP-кривую.

### 7.2. Neon Relay

Новая 7-дневная модель удачно сохраняет обычную экономику: каждую дату игрок получает три личные задачи, сложность фиксируется при генерации, первый завершённый день выдаёт participation frame, все семь — master frame. Нет старых глобальных целей, которые могли бы быть недостижимы для одного игрока.

Что проверить перед повторным сезоном:

- пропуск любого дня лишает mastery, но UI должен явно говорить это до старта;
- день 1 и день 7 не равны по длине из-за окна 09:00 MSK;
- задания capped на L100;
- в событии нет Data/XP/Chip reward, поэтому мотивация после получения participation frame полностью cosmetic.

### 7.3. Referral

Конфигурация обещает:

- друг квалифицируется после 8 минут активности;
- referrer получает 0.5 текущего `XP_to_next` и до часа passive Data;
- лимит 3/день, 10/неделю, XP cap 1 уровень/день и 3 уровня/неделю;
- attribution window 7 дней;
- больше 3 аккаунтов с одной сети в день — `flagged`.

Найденные проблемы:

1. `REFERRAL_ATTRIBUTION_WINDOW_DAYS` определён, но фактически не участвует в проверке времени.
2. `flagged` записи не выбираются в payout и не имеют механизма повторного review/разморозки.
3. Статус referral обновляется отдельно от начисления referrer; при сбое между ними награда может быть потеряна.
4. На L200 referral XP становится `Infinity` из-за max-level XP.
5. Много аккаунтов с одной сетью — эвристика, но хранение/лимит должны быть атомарны и распределённо защищены; in-memory throttling недостаточно.

### 7.4. Achievements

Есть 64 достижения, включая Crypto, Chips и Data rewards. Сервер защищает уникальность записи achievements через unique key/upsert, что хорошо. Но условия ряда достижений не совпадают с текстом:

- `first_chip` фактически открывается уже при любой mission, Base или Tier, а описание говорит «получить первый Чип»;
- `first_mission` проверяет `totalMissions >= 1`, куда попадают исходы, а описание говорит «успешно завершить»;
- `base_max_one` проверяет 10 вместо максимальных 15;
- `card_level_*` и тексты про уровни/тиры остались от старой модели;
- telemetry-achievements с клиентскими фактами могут дать ресурсные награды без события игры.

Все достижительные условия нужно описывать в виде серверных predicate-тестов и прогонять на positive/negative кейсах. Награды достижений должны либо входить в общий ledger, либо иметь явный bypass дневного Chip cap с объяснением.

### 7.5. Leaderboard

Рейтинг поддерживает Data, XP и level, а также косметику и rival NPC. В Supabase список и self-rank считаются разными запросами. `buildLeaderboardSelf()` считает только строки строго выше `myValue`, а список дополнительно сортирует по вторичной метрике. При равенстве значения self-rank может не совпасть с позицией строки в top-100. Это P2, но особенно заметно в level leaderboard.

Нужно использовать единый tie-breaker (`metric`, затем XP, затем username) и одинаковую rank query. Для Data рядом с prestige дополнительно показать lifetime XP/prestige, иначе после reset игрок выглядит слабее по текущему кошельку, хотя карьерно дальше.

### 7.6. Донаты и pay-to-win

Текущий donation path не выдаёт Data, XP, Crypto, Chips или ускорение; Stars фиксированы конфигом и проверяются сервером. Это сохраняет модель без pay-to-win. При этом косметические desk/UI/avatar items дают click bonus, суммарно capped на 22%; Crypto не продаётся за донат. Значит это не текущий pay-to-win, но термин «косметика» не совсем точен: часть cosmetic collection — soft power.

Нужно сохранить правило: никакой новый платный товар не должен покупать ресурс, Energy, шанс, prestige или ускорение. Если когда-нибудь появятся платные boosts, это будет отдельная балансная и юридическая модель, а не «ещё один skin».

---

## 8. Сервер, UI, persistence и античит

### 8.1. Server source of truth — правильное направление

Хорошо реализовано:

- сервер принимает только mission key из текущей витрины;
- minLevel, Grey unlock, entry и chance проверяются на сервере;
- chance хранится в active mission;
- start mission использует `start_mission_atomic` с CAS по Data/Energy и созданием active row в одной RPC-транзакции;
- daily task claim использует XP-CAS;
- daily login имеет CAS по `last_daily_claim`;
- клиентские clicks ограничиваются сервером;
- Donation payment сверяется с Telegram charge id.

### 8.2. Локальный lock не заменяет распределённый lock

`withPlayerLock()` — `Map` внутри одного Node/Vercel процесса. Он защищает `Promise.all` в одном инстансе, но не две параллельные serverless функции на разных инстансах. Для операций, которые читают snapshot, меняют баланс и пишут дочернюю строку, нужны DB CAS/RPC/idempotency keys.

Особенно уязвимы:

- покупка карточки: сначала upsert строки `cards`, затем отдельный update `players`; сбой между ними оставляет карту без списания или списание без согласованного snapshot;
- hire team: отдельный upsert `team` и затем `players`;
- Base: `players` обновляется, а upsert `base_upgrades` выполняется после и ошибки проглатываются;
- pet: есть частичный rollback, но это ручная компенсация, не транзакция;
- mission claim: сначала `missions.status=completed`, затем reward/Data/XP записываются в `players` отдельным сохранением;
- prestige: `players` lock обновляет prestige_count, а deletes cards/team/missions идут отдельными запросами `Promise.all`.

Комментарий в коде называет claim «100% защитой от двойного забора», но он защищает только двойной переход mission status. Он не гарантирует атомарность между этим переходом и выдачей награды.

**Целевой паттерн:** `action_id`/idempotency key + одна PostgreSQL RPC или reward ledger, где в одной транзакции меняются:

1. исходная сущность и её status;
2. баланс/XP игрока;
3. ledger операции;
4. counters и дочерние строки.

### 8.3. Supabase defaults расходятся с application defaults

В `supabase/migrations/001_initial_schema.sql`:

```sql
data numeric NOT NULL DEFAULT 0,
energy int NOT NULL DEFAULT 1000
```

В `shared/mechanics.ts` и memory fresh record:

```ts
BASE_MAX_ENERGY = 1500
// fresh player Data = 250
```

`init_player()` вставляет только `tg_id` и username, поэтому новый реальный Supabase игрок получает 0 Data и 1000 Energy. Это не полный deadlock — Data можно натапать, — но это другой onboarding, другой первый контракт и другая длительность старта, чем в QA/memory режиме.

Нужно либо создать migration с корректными defaults, либо явно передавать стартовые значения в `init_player()` и написать staging-тест с пустой БД. Нельзя полагаться на fallback `safeNonNeg(..., BASE_MAX_ENERGY)`: он не заменяет существующее значение 1000.

### 8.4. Клиентские telemetry-события

`handleTrackEvent()` принимает:

- `session:value` и просто записывает max до 240 минут;
- `local_hour:value` и доверяет присланному часу;
- `shop_freeze_30`, `idle_15` без серверного факта;
- tutorial/tab события, которые сами по себе нормально могут быть telemetry.

Дальше `unlockAchievements()` выдаёт Crypto/прочие награды за `maxSessionMinutes`, night/early session, idle и shop freeze. Поэтому комментарий «telemetry не влияет на экономику» фактически неверен.

Безопасная схема:

- оставлять клиентские события только для UI-аналитики без награды;
- `session` выводить из server heartbeat/активных действий;
- `night/early` выводить из server time или подписанной timezone policy, а не из `local_hour`;
- `shop_freeze` выдавать только после серверного freeze action;
- если telemetry-achievements нужны, награждать только cosmetic badge, не Crypto/Chips/Data.

### 8.5. Memory fallback и production guard

Локальный JSON/memory режим полезен для QA, но в serverless filesystem не является надёжным постоянным storage. При ошибочной конфигурации Supabase игрок может видеть прогресс, который исчезает после нового инстанса. Для production нужен fail-closed guard: если обязательные Supabase env отсутствуют, приложение должно явно сообщить «storage unavailable», а не молча переключаться на временное хранилище.

---

## 9. Приоритетный реестр проблем

| ID | Приоритет | Наблюдение | Доказательство в коде | Рекомендация |
|---|---|---|---|---|
| BAL-01 | P0 | Prestige после L90 повторяем бесконечно; multiplier capped только частично | `getPrestigeRequiredLevel()`, `computeDerivedStats()`, `handleGlobalHackPrestige()` | Ввести конечный cap/новую post-cap модель; унифицировать multiplier и daily |
| BAL-02 | P0 | L200 даёт `Infinity` XP; referrals и mission RPC ломаются | `getXpToNext()`, `getMissionXpAward()`, `p_xp_reward integer` | Max-level special case, finite reward, запрет XP после cap, decimal-safe Data |
| DATA-01 | P0/P1 | Mission claim не атомарен с выдачей награды | update mission status отдельно от `savePlayerCore()` | Complete/reward ledger RPC с idempotency |
| DATA-02 | P1 | Card/team/Base/pet операции состоят из нескольких записей | `handleBuyCard`, `handleHireNpc`, `savePlayerCore` | RPC/transaction или compensating ledger; distributed CAS |
| DATA-03 | P1 | Initial DB defaults: 0 Data / 1000 Energy вместо 250 / 1500 | migration 001 vs `createFreshRecord`/mechanics | Migration/explicit init + empty-DB integration test |
| TIME-01 | P1 | Старый `pg_cron` passive не учитывает qualification, half-rate и cap | `distribute_passive_income()` migration 001 | Отключить или заменить единой settlement-функцией |
| SEC-01 | P1 | Подделываемая telemetry выдаёт Crypto-achievements | `handleTrackEvent()` + `unlockAchievements()` | Убрать resource rewards с client events или подтверждать сервером |
| TIME-02 | P1 | UTC и MSK смешаны в pet/telemetry/donation/event keys | `toISOString().slice(0,10)` vs `getGameDayKey()` | Общий day-key helper и таблица rolling windows |
| ECON-01 | P1 | Free mission reroll без cooldown/цены | `handleMissionAction('refresh')` | 1 бесплатный auto refresh/15m, ручной reroll — token/cooldown/лимит |
| ECON-02 | P1 | Grey config drop chance игнорируется, везде 0.35 | `baseDropChance` | Выбрать config-driven или переписать descriptions |
| ECON-03 | P1 | Heat не имеет обычного cooling | только penalty→50 и prestige→0 | Явный design decision; добавить контролируемый cooling path либо UI предупреждение |
| PROG-01 | P1 | `minData` рангов не используется | `computeDerivedStats()` проверяет лишь `minLevel` | Удалить ложное условие или реализовать двухфакторный rank |
| REF-01 | P1 | Referral attribution window unused; flagged не возвращаются | referral config/`payoutReferrals()` | Проверять 7 дней, review queue и retry/expiry |
| UI-01 | P2 | UI/tutorial/README говорят старые Energy, rate и 25 levels | TopHud, TutorialModal, README, cards comments | Генерировать copy из shared constants или обновить вручную |
| UI-02 | P2 | Achievement texts/conditions расходятся | `first_chip`, `first_mission`, `base_max_one`, card tier texts | Единственная predicate-таблица + QA negative tests |
| SIM-01 | P2 | balance simulator не является economic simulator | `scripts/balance-sim.ts` | Переписать event-driven simulation с Energy, entry, offers, offline, cap |
| RET-01 | P2 | Daily XP теряет видимую ценность после midgame | max 90 XP/day vs 350k+ next XP | Добавить level-scaled non-XP daily value, не менять XP вслепую |
| RET-02 | P2 | L101–L200 не имеют новых season targets/level milestones | season level cap100, achievements largely stop at60 | Endgame goals, milestones and repeatable post-prestige content |
| RANK-01 | P2 | Self-rank ties может не совпасть с top list | separate `gt()` query and secondary sorting | Единый comparator/rank query |

---

## 10. План исправлений по этапам

### Этап A — correctness/security, до новых балансных коэффициентов

1. Утвердить max-level policy и `MAX_PRESTIGE`/post-cap policy.
2. Убрать все `Infinity`, `NaN` и unsafe `Number` из reward path; добавить `assertFiniteReward()` перед RPC.
3. Сделать reward ledger для mission claim, daily, referral, achievement и prestige.
4. Перенести card/team/Base/pet purchase в атомарные DB actions или гарантированный idempotent command pattern.
5. Привести initial Supabase defaults к application contract.
6. Проверить и выключить старый pg_cron passive или сделать его единственным вызовом общей формулы.
7. Убрать экономические награды из неподтверждаемой telemetry.
8. Добавить distributed rate limit/idempotency для action requests, а не только process-local `Map`.

### Этап B — единый временной контракт и наблюдаемость

1. Ввести `getGameDayKey()` для pet streak, telemetry cap, donation throttle и всех будущих daily counters.
2. В UI явно разделить:
   - календарные MSK-сутки;
   - rolling 20-hour daily login;
   - 48-hour streak reset;
   - 15-minute mission offer;
   - 7-day fixed event window.
3. Добавить server event log/reward ledger с `source`, `amount`, `action_id`, `created_at`, `game_day_key`.
4. Метрики: Data/hour, Energy spent/hour, contract attempts by tier/chance, success/partial/fail, Heat penalty rate, chips/day, rerolls/player/day, reward loss/error rate.

### Этап C — баланс после реальных данных

1. Запустить модель с тремя типами игрока: casual 5–10 минут, regular 20–30 минут, hardcore 60+ минут.
2. Для каждой группы моделировать L1–L50 и prestige 0–5 с entry, Energy, chance history, free/paid offers, offline и daily.
3. Отдельно проверить Data EV и Energy throughput для всех tiers при `hackPower` P10/P50/P130/P360/P900/P2200/P3000.
4. Проверить, не доминируют ли:
   - безопасные neutral-контракты по XP/min;
   - White alignment по Data + Heat;
   - Black alignment по click+prestige;
   - одна карточка по payback;
   - ранний prestige против продолжения Base/card progression.
5. Только после этого менять коэффициенты. Базовая последовательность предпочтительна: сначала доступность и ясность, затем sink/source, затем reward scale, и последним — шанс/исход.

### Этап D — retention/content

1. Добавить L70/L90/L100/L125/L155/L200 milestones, если эти уровни остаются в продукте.
2. Определить post-prestige loop, не сводящийся к повтору тех же покупок с огромным множителем.
3. Для daily после midgame дать заметную, но capped value: seasonal points, cosmetic progress или небольшой ресурсный пакет.
4. Для Neon Relay оставить текущую 7-day personal model, но заранее показать miss-day rule и точные MSK timestamps.
5. Синхронизировать все тексты с конфигом и добавить автоматическую проверку stale numbers.

---

## 11. План тестирования

### 11.1. Unit/invariant tests

Обязательные проверки чистых функций:

- `getXpToNext(1..200)` конечен для всех playable levels; max-level API возвращает согласованный конечный sentinel;
- `getMissionXpAward()` конечен для всех mission × level 1..200;
- reward/entry/chance всегда finite, non-negative, в DB range;
- `getSafePrestigeMultiplier()` одинаков в derived stats, mission, daily, UI и alert;
- prestige выше cap отклоняется;
- все `getGameDayKey()` boundary cases: 23:59:59, 00:00:00 MSK, UTC 00:00, leap/day transition;
- pet streak, Chip cap, daily task, telemetry cap используют один ожидаемый day key;
- expected outcome values совпадают с HACK_OUTCOME_REWARD;
- rank predicate и achievement description/condition находятся в одном источнике.

### 11.2. Property-based economy tests

Для случайных корректных snapshots проверять:

- ни одно действие не делает Data/Energy/Crypto/Chips/Rep отрицательными;
- retry одного `action_id` не меняет reward второй раз;
- параллельные start/claim/buy/hire дают один результат;
- Data и XP ledger равны сумме источников минус sinks;
- prestige сохраняет ровно заявленные поля и сбрасывает ровно заявленные;
- active mission после reload имеет тот же reward, chance, start/finish и outcome;
- offline не выдаёт XP/Crypto/Chips и не платит более cap.

### 11.3. Supabase staging integration

Начинать с пустой схемы и прогнать:

1. `init_player()` — фактические Data/Energy/Crypto;
2. миграции 001–009 и наличие `pets`, `base_upgrades`, `referrals`, `stats`, `xp bigint`;
3. `pg_cron`/scheduled jobs — нет ли старого passive одновременно с API;
4. две параллельные покупки одной карточки;
5. две параллельные mission claims;
6. claim, затем искусственный DB/network failure до player update;
7. prestige и падение одного из delete-запросов;
8. duplicate webhook/retry daily/referral/achievement;
9. Data около `Number.MAX_SAFE_INTEGER` и reward после L180/L199;
10. восстановление active mission после cold start/нового Vercel instance.

### 11.4. Anti-cheat tests

- отправить `session:240`, `local_hour:3`, `shop_freeze_30`, `idle_15` без игровых действий — не должно быть Crypto/Data/Chip reward;
- повторить запросы с разных инстансов/процессов;
- подменить mission key, reward, chance, entry, finishAt и outcome — сервер должен игнорировать client values;
- отправить clicks быстрее rate, отрицательные значения, дробные и огромные batches;
- проверить, что участник не может claim чужую миссию или referral.

### 11.5. Balance acceptance gates

До изменения формул нужен отчёт по симуляции, содержащий минимум:

- время и активные минуты до L5/L10/L20/L26/L36/L50/L90;
- Data/hour и Energy/hour для casual/regular/hardcore;
- число mission attempts и failures до каждого milestone;
- стоимость первого card, first tier, Coder, Analyst, first pet;
- дни до 60/150/320 Chips и до полной Base;
- prestige cycle time #1–#5 и post-cap;
- доля игроков, которые получают Heat penalty;
- доля контрактов с chance <40%, <55%, >80%;
- p50/p90 для daily claims, rerolls, offline payout и return after prestige.

Целевые product-gates следует утвердить с владельцем игры, но минимум должен быть таким: нет тупика для нового игрока, нет обязательной покупки/skip для прохождения, ни одна currency не имеет скрытого источника, каждая награда идемпотентна, а каждый displayed timer совпадает с серверным временем.

---

## 12. Что сознательно не менялось этим аудитом

- формула тапов;
- XP-коэффициенты;
- chance/partial/fail probabilities;
- mission rewards и entry percentage;
- card/base/team/pet prices;
- новая семидневная модель Neon Relay;
- donation/payment path;
- production UI и shared configs.

Это сделано намеренно: сначала требуется закрыть P0/P1 корректность, получить staging telemetry и прогнать полную event-driven симуляцию. Иначе изменение формулы может только замаскировать проблему persistence, времени или runaway prestige.

## Итоговое решение о готовности

**Для внутреннего QA:** текущий код проходит существующие сценарии и уже позволяет тестировать основную петлю.
**Для открытого балансного плейтеста:** после закрытия P0/P1 correctness и staging Supabase smoke-test.
**Для заявления «экономика сбалансирована до эндгейма и после prestige»:** пока рано — max-level overflow, повторяемый L90 prestige, Energy throughput и неполная симуляция не дают такого основания.
