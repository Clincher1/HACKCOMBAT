/**
 * HACKER KOMBAT — бюджет стартового payload (v1.4).
 *
 * Зачем отдельный скрипт, а не «посмотреть в логе vite»: бюджет должен быть
 * машинным гейтом в CI, а не строчкой в PR-описании. Считаем gzip тем же
 * zlib (level 9), что и раньше, поэтому цифры сравнимы с прошлыми пакетами.
 *
 * v1.4: гейт стал ДВУХУРОВНЕВЫМ, и это не косметика.
 *
 *   • ENTRY — сам `index-*.js`: код, который парсится до первого кадра.
 *   • STARTUP — entry + всё, что `index.html` объявляет `modulepreload`.
 *
 * До пакета «Правки прогона» Telegram SDK жил в отдельном чанке `sdk-*.js`,
 * но html его прелоадил, поэтому стартовый payload был 113.38 (entry) +
 * 17.88 (react) + 23.22 (sdk) = 154.48 kB gzip, а гейт видел только entry и
 * показывал «запас 0.02 kB». Игрок при этом ждал на 23 kB больше, чем показывал
 * гейт. После выноса SDK в ленивый чанк стартовый payload стал 114.09 + 17.88 =
 * 131.97 kB gzip, и теперь гейт меряет именно его.
 *
 * Правило проекта: визуальные и контентные итерации не двигают стартовый
 * payload больше чем на +0.5 kB gzip. Если бюджет реально нужен больше — это
 * отдельное решение: поднимаем лимиты и пишем причину в PR.
 *
 * Запуск: node scripts/qa/bundle-budget.mjs   (после npm run build)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');

/**
 * Замеры v1.4 (main 8b44ffb → пакет «Правки прогона») этим скриптом:
 *   entry   114.09 kB gzip  (было 113.38, лимит был 113.4 — запаса не осталось)
 *   startup 131.97 kB gzip  (было 154.48 при том же entry: sdk 23.22 прелоадился)
 *
 * Лимиты = замер + ≥3 kB запаса на один нормальный штрих интерфейса.
 */
const ENTRY_LIMIT_KB = 117.5;
const STARTUP_LIMIT_KB = 135.0;

if (!fs.existsSync(ASSETS)) {
  console.error('НЕТ dist/assets — сначала `npm run build`');
  process.exit(1);
}

const gzipKb = (file) => {
  const buf = fs.readFileSync(path.join(ASSETS, file));
  return { file, raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
};

const entry = fs
  .readdirSync(ASSETS)
  .filter((file) => /^index-.*\.js$/.test(file))
  .map((file) => gzipKb(file))
  .sort((a, b) => b.raw - a.raw)[0];

if (!entry) {
  console.error('в dist/assets нет index-*.js — сборка другого формата?');
  process.exit(1);
}

// Прелоады берём из собранного index.html, а не из конфига: важно, что реально
// попросит браузер, а не что мы думаем о своём конфиге.
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([^"]+)"/g)].map(
  (match) => match[1]
);
const preloaded = preloads.map((file) => gzipKb(file));
const startupKb = (entry.gzip + preloaded.reduce((sum, item) => sum + item.gzip, 0)) / 1024;
const entryKb = entry.gzip / 1024;

const entryOver = entryKb - ENTRY_LIMIT_KB;
const startupOver = startupKb - STARTUP_LIMIT_KB;

console.log(`entry:   ${entry.file}`);
console.log(`  raw  ${(entry.raw / 1024).toFixed(2)} kB`);
console.log(
  `  gzip ${entryKb.toFixed(2)} kB (лимит ${ENTRY_LIMIT_KB.toFixed(1)} kB, запас ${(-entryOver).toFixed(2)} kB)`
);
console.log(
  `startup: entry + ${preloaded.length} modulepreload (${preloaded.map((item) => item.file).join(', ') || '—'})`
);
console.log(
  `  gzip ${startupKb.toFixed(2)} kB (лимит ${STARTUP_LIMIT_KB.toFixed(1)} kB, запас ${(-startupOver).toFixed(2)} kB)`
);

// Telegram SDK обязан оставаться вне стартового пути: если он снова попал в
// modulepreload — пакет «разгрузки» откатился, даже когда цифры ещё влезают.
const sdkPreloaded = preloads.some((file) => /sdk|telegram/i.test(file));

if (sdkPreloaded) {
  console.error('FAIL — Telegram SDK снова прелоадится на старте (должен грузиться по требованию)');
  process.exit(1);
}

const verdict = entryOver > 0 || startupOver > 0 ? 'FAIL' : 'PASS';
console.log(`${verdict} — бюджет стартового payload`);
console.log(`  SDK Telegram: ${sdkPreloaded ? 'в стартовом пути' : 'по требованию (ленивый чанк)'}`);

if (verdict === 'FAIL') {
  console.error(
    `Стартовый payload вырос сверх лимита (entry +${entryOver.toFixed(2)} kB, startup +${startupOver.toFixed(2)} kB gzip). ` +
      'Либо ужать правку, либо осознанно поднять лимиты с обоснованием.'
  );
  process.exit(1);
}
