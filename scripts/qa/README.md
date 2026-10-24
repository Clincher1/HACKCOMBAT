# QA-скрипты (v3.1)

Живые проверки против локального dev-сервера. Ничего не пишут в прод.

```bash
npm install
npm run dev            # терминал №1 — сервер на :5173

node scripts/qa/api.mjs          # ~2 мин: полный API (миссии, гейты, экономика, античит)
node scripts/qa/clicks.mjs       # ~1 мин: быстрый тап не ловит 429; флуд режется античитом
```

## Оффлайн-копилка

`memory-fallback` держит базу в памяти процесса, поэтому проверка идёт в два шага:

```bash
node scripts/qa/offline-taps.mjs setup     # создать игрока Test_offline
# остановить dev-сервер
# откатить в .local-db.json у игрока stats.lastTapClaimAt и lastPassiveClaim на 3 часа назад
npm run dev
node scripts/qa/offline-taps.mjs check     # ожидаем offlineTaps ≈ 3ч × 0.2 тапа/с
```

## Другие проверки

```bash
npm run balance:sim              # симулятор баланса (экономика/XP)
./node_modules/.bin/tsc -b       # типы
npm run build                    # прод-сборка + бандл API
```

## Правила

- Каждый скрипт создаёт **изолированных гостей** (`x-demo-user-id`), прод-игроков не трогает.
- Тесты не должны падать от достижений: любые «лишние» начисления — это бонусы, а не баг.
- Все проверки читают реальные конфиги из `shared/*`, поэтому балансные правки
  автоматически отражаются в тестах.
