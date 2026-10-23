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
| **Supabase PostgreSQL 17 (`eu-west-1`)** | 🟢 `ACTIVE_HEALTHY` | `https://hekzplfftannlzwvgwwm.supabase.co` (`players`, `cards`, `team`, `missions`, `achievements`, `leaderboard`, RLS) |
| **Supabase Edge Function** | 🟢 `ACTIVE` | `passive-income` (`distribute_passive_income()`) |
| **Supabase Storage (`game-assets`)** | 🟢 17 ассетов | `scenes/stage-01..30.webp`, `avatars/*.webp`, `cards/*.svg` |
| **GitHub Репозиторий и PR** | 🟢 Public | [`Clincher1/HACKCOMBAT`](https://github.com/Clincher1/HACKCOMBAT) ([PR #1](https://github.com/Clincher1/HACKCOMBAT/pull/1)) |

---

## 🎮 Реализованные игровые механики

- **4 игровые валюты**:
  - **Data** — основная валюта с кликов, пассивного дохода (`Data/час`) и миссий.
  - **Crypto (💎)** — редкая валюта за ежедневную серию входов (Дни 1–7), достижения и секретные «серые» миссии. Тратится на эксклюзивные скины стола, мгновенный пропуск таймеров миссий и сброс блокировки прокси.
  - **Rep (Репутация)** — начисляется за ликвидацию `🔴 Bad`-сайтов. Открывает ветку **White Hat** и позволяет нанимать элитных специалистов команды.
  - **Heat (Розыск)** — растёт при взломе `🟢 Good`-сайтов и покупке `Darknet`-карточек. При **Heat > 100** срабатывает киберпатруль: **-10% Data**, блокировка кликов на **60 секунд** и сброс Heat до **50**.
- **Эволюция рабочего стола каждые 5 уровней** (`/public/assets/scenes/*.webp` ≤ 110 KB):
  - `Ур. 1`: Подпольный старт (один монитор, механика, ночной кофе)
  - `Ур. 5`: Второй монитор + неоновая подсветка
  - `Ур. 10`: Локальная серверная стойка
  - `Ур. 15`: Дрон-разведчик с активным оптическим сканером
  - `Ур. 20`: Три монитора + кресло геймера + открытие **3 слотов миссий**
  - `Ур. 25`: Подземный серверный бункер
  - `Ур. 30+`: Ядро Матрицы — цифровой дождь и парящие голограммы
- **32 карточки улучшений** (`shared/cards.config.ts`) в сетке `2×N` по 4 категориям (*Hardware, Software, Comfort, Darknet*), цена `base_price * 1.5^level`, прокачка `Energy Max` от `1000` до `5000`.
- **20 вымышленных миссий** (`shared/missions.config.ts`) длительностью `5–30 сек` с автообновлением каждые 15 минут, ручным обновлением и мгновенным пропуском таймера за `1 💎 Crypto`.
- **6 специалистов команды** (`shared/team.config.ts`) с WebP-аватарками: *Coder (+5% Data/ч)*, *Social Engineer (+10% к клику)*, *Botmaster (автоклик 1/сек)*, *Fence (-20% Heat)*, *Analyst (открывает серые миссии)*, *AI Architect (+20% Data/ч и +15% к клику)*.
- **Ветвление White Hat / Black Hat** и **Global Hack Престиж на 50 уровне** (множитель `×2` навсегда + скин *Omega Singularity* + легендарная ачивка).
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
3. *(Опционально)* В разделе **Database → Extensions** включите `pg_cron` и повторно выполните блок планировщика из конца миграции (либо задеплойте Edge Function `supabase functions deploy passive-income`).
4. В разделе **Project Settings → API** скопируйте:
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
