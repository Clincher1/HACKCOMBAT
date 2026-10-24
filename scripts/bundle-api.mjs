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

fs.writeFileSync(
  path.join(apiDir, '[...path].js'),
  "'use strict';\n" +
    '// Генерируется scripts/bundle-api.mjs на этапе сборки: единственная Serverless-функция приложения.\n' +
    "module.exports = require('./_core.cjs').dispatchApiRequest;\n"
);

console.log('[bundle-api] Единая функция api/[...path].js -> api/_core.cjs (все маршруты в одном ядре).');
