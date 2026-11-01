#!/usr/bin/env node
/**
 * Скрипт автоматической настройки Telegram-бота HACKER KOMBAT (Шаг 2 ТЗ):
 * 1. Устанавливает описание бота с обязательным юридическим дисклеймером (12+, раздел 9 ТЗ).
 * 2. Настраивает команды /start, /stats, /legal.
 * 3. Устанавливает кнопку меню WebApp (Открыть HACKER KOMBAT).
 * 4. Привязывает Webhook к Vercel Serverless Function (/api/telegram).
 *
 * Запуск:
 *   TELEGRAM_BOT_TOKEN=... PUBLIC_WEBAPP_URL=https://your-app.vercel.app npm run bot:setup
 */

import crypto from 'node:crypto';

const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = (process.env.PUBLIC_WEBAPP_URL || '').replace(/\/$/, '');
const webhookSecret =
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  (token ? crypto.createHmac('sha256', 'hk-webhook-v2').update(token).digest('hex').slice(0, 48) : '');

if (!token || !webAppUrl) {
  console.error(
    '❌ Укажите переменные TELEGRAM_BOT_TOKEN и PUBLIC_WEBAPP_URL!\n' +
      'Пример: TELEGRAM_BOT_TOKEN=123:ABC PUBLIC_WEBAPP_URL=https://hacker-kombat.vercel.app npm run bot:setup'
  );
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${token}`;

async function tgCall(method, payload) {
  const res = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram API ${method} failed: ${JSON.stringify(json)}`);
  }
  return json.result;
}

async function main() {
  console.log('⚡ Настраиваем Telegram-бота HACKER KOMBAT...');

  // 1. Юридически безопасное описание 12+ (раздел 9 ТЗ)
  await tgCall('setMyDescription', {
    description:
      '⚡ HACKER KOMBAT (12+) — киберпанк-кликер в Telegram!\n\n' +
      'Прокачивай хакерский стол, собирай команду и выбирай между Белой и Чёрной шляпой.\n\n' +
      '⚖️ Hacker Kombat — вымышленная игра (12+). Не обучает реальному взлому. Не пропагандирует киберпреступность. Все названия и события выдуманы.',
  });

  await tgCall('setMyShortDescription', {
    short_description:
      'Киберпанк-кликер 12+. Вымышленная игра — не обучает реальному взлому.',
  });

  // 2. Команды бота
  await tgCall('setMyCommands', {
    commands: [
      { command: 'start', description: 'Запустить HACKER KOMBAT' },
      { command: 'invite', description: 'Пригласи друга и получи бонус' },
      { command: 'help', description: 'Как играть и механики' },
      { command: 'legal', description: 'Правовая информация (12+)' },
      { command: 'donate', description: 'Поддержать проект (Telegram Stars)' },
      { command: 'paysupport', description: 'Помощь по платежам и возврат' },
      { command: 'terms', description: 'Условия донатов' },
    ],
  });

  // 3. Кнопка меню чата (открывает Mini App в 1 тап)
  await tgCall('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: '⚡ HACKER KOMBAT',
      web_app: { url: webAppUrl },
    },
  });

  // 4. Привязка Webhook на Vercel (/api/telegram)
  const webhookPayload = {
    url: `${webAppUrl}/api/telegram`,
    // pre_checkout_query обязателен: без него Telegram не пришлёт запрос
    // подтверждения и оплата Stars отвалится по таймауту (10 секунд).
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
  };
  if (webhookSecret) {
    webhookPayload.secret_token = webhookSecret;
  }
  await tgCall('setWebhook', webhookPayload);

  console.log(`✅ Готово! Webhook установлен: ${webAppUrl}/api/telegram`);
}

main().catch((err) => {
  console.error('❌ Ошибка настройки бота:', err.message);
  process.exit(1);
});
