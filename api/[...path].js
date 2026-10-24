'use strict';
// Единственная Serverless-функция приложения (Vercel Hobby: максимум 12 на деплой).
// Файл обязан лежать в репозитории: Vercel определяет список функций по исходникам,
// ДО запуска `npm run build`. Само ядро (api/_core.cjs) собирает scripts/bundle-api.mjs.
module.exports = require('./_core.cjs').dispatchApiRequest;
