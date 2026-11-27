/**
 * HACKER KOMBAT — бюджет главного бандла (v6.10).
 *
 * Зачем отдельный скрипт, а не «посмотреть в логе vite»: бюджет должен быть
 * машинным гейтом в CI, а не строчкой в PR-описании. Считаем gzip тем же
 * zlib, что и раннер, поэтому цифра воспроизводима на любой машине.
 *
 * Правило проекта: визуальные и контентные итерации не двигают главный чанк
 * больше чем на +0.5 kB gzip. Если бюджет реально нужен больше — это отдельное
 * решение: поднимаем LIMIT_KB и пишем причину в PR.
 *
 * Запуск: node scripts/qa/bundle-budget.mjs   (после npm run build)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ASSETS = path.join(ROOT, 'dist/assets');

/**
 * Замер v6.9 (main 781b7d3) этим скриптом: 112.81 kB gzip.
 * Разница с логом vite (115.80) — разные параметры gzip; сравнивать нужно
 * только с этой цифрой, поэтому лимит = замер + 0.6 kB.
 */
const LIMIT_KB = 113.4;

if (!fs.existsSync(ASSETS)) {
  console.error('НЕТ dist/assets — сначала `npm run build`');
  process.exit(1);
}

const entries = fs
  .readdirSync(ASSETS)
  .filter((file) => /^index-.*\.js$/.test(file))
  .map((file) => {
    const buf = fs.readFileSync(path.join(ASSETS, file));
    return { file, raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  })
  .sort((a, b) => b.raw - a.raw);

if (entries.length === 0) {
  console.error('в dist/assets нет index-*.js — сборка другого формата?');
  process.exit(1);
}

const main = entries[0];
const gzipKb = main.gzip / 1024;
const over = gzipKb - LIMIT_KB;
const verdict = over > 0 ? 'FAIL' : 'PASS';

console.log(`бандл: ${main.file}`);
console.log(`  raw  ${(main.raw / 1024).toFixed(2)} kB`);
console.log(`  gzip ${gzipKb.toFixed(2)} kB (лимит ${LIMIT_KB.toFixed(1)} kB, запас ${(-over).toFixed(2)} kB)`);
console.log(`${verdict} — бюджет главного чанка`);

if (over > 0) {
  console.error(
    `Главный чанк вырос на ${over.toFixed(2)} kB gzip сверх лимита. ` +
      'Либо ужать правку, либо осознанно поднять LIMIT_KB с обоснованием.'
  );
  process.exit(1);
}
