import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// Собираем ВСЁ серверное ядро в один self-contained CJS-файл api/_core.cjs:
// 1) Vercel Hobby разрешает максимум 12 Serverless-функций на деплой — у нас одна;
// 2) ноль зависимостей в рантайме (включая @supabase/supabase-js) => мгновенный cold start;
// 3) все маршруты в одном процессе => общий пул IP-лимитов и per-player мьютексов.
//
// В репозитории нет ни api/_core.cjs, ни api/[...path].js — оба создаются здесь.
// Исходники (.ts) НЕ удаляем: они типизируются `tsc -b` и грузятся dev-сервером Vite.
const apiDir = path.resolve('api');

await build({
  entryPoints: [path.join(apiDir, '_router.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(apiDir, '_core.cjs'),
  logLevel: 'warning',
});

// Обёртка ЗАКОММИЧЕНА в репозиторий (Vercel определяет функции по исходникам до сборки),
// здесь лишь страхуемся, что её содержимое не разъехалось с ядром.
const wrapperPath = path.join(apiDir, '[...path].js');
const wrapperSource =
  "'use strict';\n" +
  '// Единственная Serverless-функция приложения (Vercel Hobby: максимум 12 на деплой).\n' +
  '// Файл обязан лежать в репозитории: Vercel определяет список функций по исходникам,\n' +
  '// ДО запуска `npm run build`. Само ядро (api/_core.cjs) собирает scripts/bundle-api.mjs.\n' +
  "module.exports = require('./_core.cjs').dispatchApiRequest;\n";
const current = fs.existsSync(wrapperPath) ? fs.readFileSync(wrapperPath, 'utf8') : '';
if (current !== wrapperSource) {
  fs.writeFileSync(wrapperPath, wrapperSource);
}

console.log('[bundle-api] Единая функция api/[...path].js -> api/_core.cjs (все маршруты в одном ядре).');
