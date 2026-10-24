import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// РУЧНОЙ инструмент (npm run bundle:api). На Vercel НЕ запускается: платформа
// сама собирает api/*.ts в отдельные Serverless-функции, а этот скрипт удаляет
// исходники (.ts), из-за чего `vercel build` падает с ENOENT на api/<route>.ts.
// Нужен только для локальной проверки «всё ядро в одном файле».
if (process.env.FORCE_BUNDLE_API) {
  const apiDir = path.resolve('api');
  const routeNames = fs
    .readdirSync(apiDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''));

  const barrelSource = routeNames
    .map(
      (name, idx) =>
        `import h_${idx} from './api/${name}';\nexport { h_${idx} as route_${name.replace(/[^a-zA-Z0-9_]/g, '_')} };`
    )
    .join('\n');

  await build({
    stdin: {
      contents: barrelSource,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(apiDir, '_core.cjs'),
  });

  // Удаляем исходные .ts и _lib и создаём лёгкие обёртки api/<route>.js -> _core.cjs
  for (const name of routeNames) {
    fs.unlinkSync(path.join(apiDir, `${name}.ts`));
    const safeExport = `route_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    fs.writeFileSync(
      path.join(apiDir, `${name}.js`),
      `'use strict';\nmodule.exports = require('./_core.cjs').${safeExport};\n`
    );
  }
  fs.rmSync(path.join(apiDir, '_lib'), { recursive: true, force: true });
  console.log(
    `[bundle-api] Bundled ${routeNames.length} routes sharing unified security & mutex core (api/_core.cjs)!`
  );
}
