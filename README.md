# ⚡ HACKER KOMBAT — Telegram Mini App (Idle / Clicker, 12+)

> **⚖️ Юридическая безопасность (12+):** «Hacker Kombat — вымышленная развлекательная игра. Не обучает реальному взлому. Не пропагандирует киберпреступность. Все названия организаций, сетей и события полностью выдуманы.»

Киберпанк-кликер в духе *Hamster Kombat* и *Hacker Clicker* на **100% бесплатном стеке** (React + Vite + TypeScript + TailwindCSS + `@telegram-apps/sdk-react` + Vercel Serverless Functions + Supabase PostgreSQL Free Tier).

## 🌐 Живой продакшн-стенд (Vercel + Supabase Cloud)

| Компонент | Статус | Ссылка / Идентификатор |
| :--- | :--- | :--- |
| **WebApp (Vercel Production)** | 🟢 Online | [`https://hacker-kombat.vercel.app`](https://hacker-kombat.vercel.app) |
| **Healthcheck API (`Supabase`)** | 🟢 `mode: "supabase"` | [`https://hacker-kombat.vercel.app/api/ping`](https://hacker-kombat.vercel.app/api/ping) |
| **Top-100 Leaderboard API** | 🟢 Online | [`https://hacker-kombat.vercel.app/api/leaderboard`](https://hacker-kombat.vercel.app/api/leaderboard) |
| **Telegram Webhook Endpoint** | 🟢 Ready | `https://hacker-kombat.vercel.app/api/telegram` |
| **Supabase PostgreSQL 17 (`eu-west-1`)** | 🟢 `ACTIVE_HEALTHY` | Отдельный проект `hacker-kombat` (`https://llciyqawfbeabkkdsnmc.supabase.co`) |
| **Supabase Edge Function** | 🟢 `ACTIVE` | `passive-income` (`distribute_passive_income()`) |
| **Supabase Storage (`game-assets`)** | 🟢 17 ассетов | `scenes/stage-01..30.webp`, `avatars/*.webp`, `cards/*.svg` |
| **GitHub Репозиторий и PR** | 🟢 Public | [`Clincher1/HACKCOMBAT`](https://github.com/Clincher1/HACKCOMBAT) ([PR #1](https://github.com/Clincher1/HACKCOMBAT/pull/1)) |

---

## 🎮 Реализованные игровые механики

- **5 игровых ресурсов**:
  - **Data** — основная валюта с кликов, пассивного дохода (`Data/час`) и миссий.
  - **Crypto (💎)** — редкая валюта за ежедневную серию входов (Дни 1–7), достижения и секретные «серые» миссии. Тратится на эксклюзивные скины стола, мгновенный пропуск таймеров миссий и сброс блокировки прокси.
  - **Rep (Репутация)** — начисляется за ликвидацию `🔴 Bad`-сайтов. Открывает ветку **White Hat** и позволяет нанимать элитных специалистов команды.
  - **Heat (Розыск)** — растёт при взломе `🟢 Good`-сайтов и покупке `Darknet`-карточек. При **Heat > 100** срабатывает киберпатруль: **-10% Data**, блокировка кликов на **60 секунд** и сброс Heat до **50**.
  - **⚙️ Чипы (Chips)** — падают **только за завершённые контракты** (+1, серые +2, ежедневный бонус +3, суточный кап 45). Нужны для открытия **Тиров карточек** и покупки **Базы**.
- **Эволюция рабочего стола каждые 5 уровней** (`/public/assets/scenes/*.webp` ≤ 110 KB):
  - `Ур. 1`: Подпольный старт (один монитор, механика, ночной кофе)
  - `Ур. 5`: Второй монитор + неоновая подсветка
  - `Ур. 10`: Локальная серверная стойка
  - `Ур. 15`: Дрон-разведчик с активным оптическим сканером
  - `Ур. 20`: Три монитора + кресло геймера + открытие **3 слотов миссий**
  - `Ур. 25`: Подземный серверный бункер
  - `Ур. 30+`: Ядро Матрицы — цифровой дождь и парящие голограммы
- **48 карточек улучшений** (`shared/cards.config.ts`) в сетке `2×N` по 4 категориям (*Hardware, Software, Comfort, Darknet*), прокачка `Energy Max` от `1000` до `5000`.
- **Растянутая прогрессия: 25 уровней на карточку + 4 глобальных Тира**:
  - Тир I — уровни 1–10 (бесплатно), Тир II — до 15 (**35 ⚙️** + 30K Data, нужен 8 ур.), Тир III — до 20 (**90 ⚙️** + 350K Data, 18 ур.), Тир IV — до 25 (**220 ⚙️** + 2.5M Data, 30 ур.).
  - Цена уровня: `base * 1.42^level`, помноженная на **глобальный индекс** `1 + ((1 + сумма_уровней/35)^2.2 − 1) × вес_карточки`. Чем больше уровней уже куплено — тем дороже следующий, но дорогие эндгейм-модули почти не задевает.
  - Замерено симулятором `scripts/balance-sim.ts`: 5 ур. ≈ 7 ч, 10 ур. ≈ 19 ч, 20 ур. ≈ 3 дня, 30 ур. ≈ 8 дней, **50 ур. ≈ 30 дней** (было — меньше недели).
- **🐾 Питомцы-компаньоны** (`shared/pets.config.ts`, вкладка «Команда»): хомяк «Байт» (+3% пассива за Data), крыса «Глитч» (+4% к клику за Crypto), морская свинка «Пиксель» (−9% Heat и +4% к контрактам за Rep). Сытость падает ~2 ед./час: 60–100% — полный баф, 30–60% — половина, ниже 30% — питомец спит. Привязанность (1–10 от кормлений) усиливает баф до +27%. Питомцы **не умирают** и **не сбрасываются Престижем**.
- **🏠 База — 10 пассивных покупок × 10 уровней** (`shared/base.config.ts`): кофемашина, стоячий стол, VPN-роутер, ИБП, авто-скрипт, аналитический терминал, стеллаж, жидкий металл, авто-кормушка, талисман удачи. Переживают Global Hack Престиж.
- **80 достижений** (`shared/achievements.config.ts`), из них **15 секретных**: у закрытых ачивок **картинка скрыта** (замок), у секретных не показывается даже название. Часть «неочевидных»: прочитать все 5 глав Академии, 10 раз открыть Обучение, зайти в 03:00–05:00, кофе-брейк 15 минут без кликов, дойти до Heat 95–99 и не попасться, «Дзен-режим» 30 минут без покупок, домашний зоопарк и т.д.
- **28 вымышленных миссий** (`shared/missions.config.ts`) длительностью `5–30 сек` с автообновлением каждые 15 минут, ручным обновлением и мгновенным пропуском таймера за `1 💎 Crypto`. Контракты открываются по уровню игрока и выдают ⚙️ Чипы.
- **8 специалистов команды** (`shared/team.config.ts`) с WebP-аватарками: *Coder (+5% Data/ч)*, *Social Engineer (+10% к клику)*, *Botmaster (автоклик 1/сек)*, *Fence (-20% Heat)*, *Analyst (открывает серые миссии)*, *AI Architect (+20% Data/ч и +15% к клику)*.
- **12 кибер-рангов** — от *Script Kiddie* до *Zero-Point Entity*.
- **Ветвление White Hat / Black Hat** и **Global Hack Престиж на 50 уровне** (множитель `×2` навсегда + скин *Omega Singularity* + легендарная ачивка).
- **⏸ Оффлайн-экономика (v3.2)** — копилка рассчитана так, чтобы оффлайн не заменял игру:
  - **8 минут реальной игры в сутки** (по Москве, UTC+3) — входной билет. Недоиграл день — оффлайн за эти сутки не капает, и следующий день тоже пустой; «долг впрок» не копится.
  - Фоновые тапы: **6 в минуту** (`0.1`/сек) × сила клика, кап **8 часов**.
  - Пассив карточек в оффлайне — **50 %** от обычной ставки (`OFFLINE_PASSIVE_RATE_MULT`), тот же кап 8 часов.
  - Оффлайн выдаёт **только Data**: XP, 💎 Crypto и ⚙️ Чипы падают исключительно за игру.
  - Проверяется автотестом `npm run qa:offline` (двигает время через `Date.now`, сеть/Supabase не нужны).
- **⚡ Мгновенные покупки (v3.3)** — остаток неотправленных кликов уезжает вместе с покупкой
  (`clicks` в теле запроса): один сетевой круг вместо двух, и сервер уже видит свежий баланс,
  поэтому пропал ложный тост «Недостаточно Data» при видимых деньгах. Сервер возвращает
  `appliedClicks`, чтобы клиент дослал не зачтённое античитом. Проверка: `npm run qa:buy`.
- **Anti-cheat и защита Telegram `initData`**: HMAC-SHA256 валидация на сервере (`api/_lib/telegramAuth.ts`), батчи кликов по 10 тапов / 5 сек, проверка `energy` и лимита `≤ 30 кликов/сек`.

---

## 🚀 Пошаговый запуск и деплой за 15–30 минут (0 ₽)

### Шаг 1. Локальный запуск (работает сразу даже без `.env`!)
```bash
npm install
npm run dev
```
> По умолчанию (`// DEFAULT`), если ключи Supabase ещё не заданы в `.env`, бэкенд `/api/*` автоматически использует локальное JSON-хранилище, чтобы вы могли протестировать всю игру за 10 секунд.

---

### Шаг 2. Создание базы данных в Supabase (Free Tier)
1. Зайдите на [supabase.com](https://supabase.com) → **New Project**.
2. Откройте **SQL Editor** → **New Query**, вставьте содержимое файла [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql) и нажмите **Run**.
   - Скрипт создаст таблицы `players`, `cards`, `team`, `missions`, `achievements`, view `leaderboard`, включит **RLS** на всех таблицах, создаст `init_player(tg_id, username)` и функцию ежеминутного дохода `distribute_passive_income()`.
3. Затем **обязательно** выполните [`supabase/migrations/002_security_hardening.sql`](./supabase/migrations/002_security_hardening.sql) и [`supabase/migrations/003_progression_expansion.sql`](./supabase/migrations/003_progression_expansion.sql).
   - `002` закрывает `SECURITY DEFINER` RPC и прямые записи для `anon`/`authenticated`.
   - `003` снимает старый потолок `cards.level <= 10` (теперь 25), добавляет `players.chips`, `players.card_tier`, `players.stats` и таблицы `pets` + `base_upgrades`. Миграция полностью аддитивная: прогресс существующих игроков не теряется.
4. *(Опционально)* В разделе **Database → Extensions** включите `pg_cron` и повторно выполните блок планировщика из конца миграции (либо задеплойте Edge Function `supabase functions deploy passive-income`).
> **⚠️ Правило обновлений (с v3.1): прогресс игроков не сбрасывается.**
> Все новые миграции строго аддитивные (`ADD COLUMN IF NOT EXISTS`, новые таблицы, `CREATE OR REPLACE FUNCTION`).
> Никаких `TRUNCATE`/`DELETE` по игрокам, никакого пересчёта XP «с нуля» — апдейты выходят маленькими порциями,
> чтобы у действующих игроков ничего не ломалось. Подробности и чек-лист: [`supabase/migrations/README.md`](./supabase/migrations/README.md).

5. В разделе **Project Settings → API** скопируйте:
   - `Project URL` → `SUPABASE_URL` и `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` *(секретный!)* → `SUPABASE_SERVICE_ROLE_KEY`

---

### Шаг 3. Создание Telegram-бота через `@BotFather`
1. Откройте [@BotFather](https://t.me/BotFather) в Telegram и отправьте команду `/newbot`.
2. Укажите имя `HACKER KOMBAT` и свободный username (например `hacker_kombat_game_bot`).
3. Скопируйте выданный токен вида `1234567890:AAF...` в переменную `TELEGRAM_BOT_TOKEN`.

---

### Шаг 4. Деплой Frontend + Serverless API на Vercel (Hobby — Бесплатно)
1. Импортируйте репозиторий в [vercel.com/new](https://vercel.com/new) (Framework Preset: **Vite**).
2. В разделе **Environment Variables** добавьте переменные по образцу из [`.env.example`](./.env.example):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET` *(любая случайная строка)*
   - `PUBLIC_WEBAPP_URL` *(ваш домен `https://<project>.vercel.app`)*
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Нажмите **Deploy** (или выполните `npx vercel --prod`).
4. Привяжите Webhook, кнопку запуска WebApp и описание `12+` одной командой локально:
```bash
TELEGRAM_BOT_TOKEN="ваш_токен" PUBLIC_WEBAPP_URL="https://ваш-домен.vercel.app" npm run bot:setup
```

---

### Шаг 5. Защита Supabase Free от авто-паузы (GitHub Actions Cron)
В репозитории уже настроен workflow [`.github/workflows/supabase-keepalive.yml`](./.github/workflows/supabase-keepalive.yml), который пингует базу каждые **3 дня**. Добавьте в **GitHub → Settings → Secrets and variables → Actions**:
- `PUBLIC_WEBAPP_URL`
- `SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Готово — откройте своего бота в Telegram, отправьте `/start` и жмите **«🚀 Открыть HACKER KOMBAT»**!
