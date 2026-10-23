import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// На Vercel собираем все api/*.ts в автономные CommonJS .js функции (0 проблем ESM/CJS и старт за ~35мс!)
if (process.env.VERCEL || process.env.FORCE_BUNDLE_API) {
  const apiDir = path.resolve('api');
  const entries = fs
    .readdirSync(apiDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(apiDir, f));

  await build({
    entryPoints: entries,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outdir: apiDir,
    footer: {
      js: 'if (module.exports && module.exports.default) { module.exports = Object.assign(module.exports.default, module.exports); }',
    },
  });

  // Удаляем исходные .ts и _lib после сборки в .js, чтобы Vercel использовал готовые бандлы api/*.js
  for (const entry of entries) {
    fs.unlinkSync(entry);
  }
  fs.rmSync(path.join(apiDir, '_lib'), { recursive: true, force: true });
  console.log(`[bundle-api] Bundled ${entries.length} self-contained Vercel functions -> api/*.js!`);
}
