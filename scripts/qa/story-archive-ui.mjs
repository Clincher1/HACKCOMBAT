/** Browser-only QA with isolated memory backend and synthetic player snapshots. */
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base = 'http://127.0.0.1:5173';
if ((await (await fetch(`${base}/api/ping`)).json()).mode !== 'memory-fallback') throw Error('Refusing non-memory backend');
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
let count = 0;
const check = (value, name) => { if (!value) throw Error(`FAIL ${name}`); console.log(`PASS ${name}`); count++; };
try {
  for (const missions of [0, 2, 4, 48]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('hk_tutorial_seen_v1', '1'));
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.method() === 'POST' && !r.url().endsWith('/api/init')) writes.push(r.url()); });
    await page.route('**/api/init', async route => {
      const response = await route.fetch(); const json = await response.json();
      json.player.stats.baseTheme = 'classic';
      json.player.achievements = missions ? ['first_upgrade', 'first_mission'] : [];
      json.player.derived.totalCardLevels = missions ? 2 : 0;
      json.player.derived.level = missions ? 10 : 1;
      json.player.totalMissions = missions;
      await route.fulfill({ response, json });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const archive = page.getByRole('region', { name: 'Сюжетный архив' }); await archive.waitFor();
    const expected = Math.min(24, missions / 2);
    check((await archive.innerText()).includes(`${expected}/24`), `${missions} missions show correct unlocked count`);
    if (missions === 0) {
      check((await archive.innerText()).includes('Пройди вводные задания'), 'new player sees introduction requirement');
      check(await archive.getByRole('button', { name: 'Читать историю' }).count() === 0, 'locked archive has no read button');
    } else {
      check((await archive.innerText()).includes('Дополнительных наград нет'), 'archive explains rewards honestly');
      await archive.getByRole('button', { name: 'Читать историю' }).click();
      check(await archive.getByText('Посторонний сигнал').count() === 1, 'first episode is readable');
      const previous = archive.getByRole('button', { name: 'Предыдущая запись' });
      const next = archive.getByRole('button', { name: 'Следующая запись' });
      check(await previous.isDisabled(), 'previous is disabled on first episode');
      if (missions === 2) {
        check(await next.isDisabled(), 'next locked episode cannot be opened');
        check(!(await archive.innerText()).includes('Неполный журнал'), 'locked text is not visible');
      } else {
        await next.click();
        check(await archive.getByText('Неполный журнал').count() === 1, 'unlocked episode navigation works');
        await previous.click();
        check(await archive.getByText('Посторонний сигнал').count() === 1, 'back navigation works');
      }
      await archive.getByRole('button', { name: 'Свернуть историю' }).click();
      check(await archive.getByText('Посторонний сигнал').count() === 0, 'history collapses');
    }
    check(writes.length === 0, 'reading does not write player state');
    check(errors.length === 0, 'no browser exceptions');
  }
} finally { await browser.close(); }
console.log(`${count} checks passed; mobile emulation, mocked snapshots, no real Telegram.`);
