/** Mobile UI regression on a local memory server; never targets real accounts. */
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base = process.env.API_BASE ?? 'http://127.0.0.1:5173';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) throw Error('Local server only');
if ((await (await fetch(`${base}/api/ping`)).json()).mode !== 'memory-fallback') throw Error('Refusing non-memory backend');
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== '--single-process'), headless: true });
let checks = 0;
const check = (value, name) => { if (!value) throw Error(`FAIL ${name}`); console.log(`PASS ${name}`); checks++; };
try {
  for (const width of [320, 390]) for (const status of ['available', 'running', 'ready']) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('hk_tutorial_seen_v1', '1'));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = [], missionActions = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/api/missions')) {
        try { missionActions.push(request.postDataJSON()?.action); } catch { missionActions.push('unknown'); }
      }
    });
    await page.route('**/api/init', async route => {
      const response = await route.fetch(); const json = await response.json();
      if (!json.player) throw Error('Local init returned no player');
      const now = Date.now();
      json.player.stats.baseTheme = 'classic';
      json.player.stats.lastMissionRefreshAt = new Date(now).toISOString();
      json.player.missionsRefreshedAt = new Date(now).toISOString();
      json.player.activeMissions = status === 'available' ? [] : [{
        id:'f51ce8ef-754d-4d39-8558-666fe478a31c',missionKey:'scam_shop',targetName:'Тестовый контракт',targetType:'bad',
        startedAt:new Date(now-60_000).toISOString(),finishAt:new Date(now+(status==='ready'?-1000:600_000)).toISOString(),
        reward:100,repDelta:1,heatDelta:0,cryptoReward:0,xpReward:10,entryDataCost:0,entryEnergyCost:0,successChance:0.9,outcome:'success',
      }];
      await route.fulfill({ response, json });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const deskLink = page.getByRole('link', {name:'Открыть городскую смену'});
    await deskLink.waitFor();
    check(await deskLink.isVisible(), `${width}/${status}: highlighted desk link is visible`);
    await deskLink.click();
    const panel = page.getByRole('region', {name:'Городская смена'}); await panel.waitFor();
    const text = (await panel.innerText()).toLowerCase();
    check(text.includes('сообщение дня') && text.includes('не отдельное задание') && text.includes('дополнительной награды нет'), `${width}/${status}: story and reward rules are clear`);
    const careful = panel.getByRole('button',{name:'Проверим осторожно'}), focused = panel.getByRole('button',{name:'Работаем по плану'});
    await careful.click();
    check(await careful.getAttribute('aria-pressed') === 'true' && await panel.locator('[aria-live="polite"]').count() === 1, `${width}/${status}: first dialogue reply opens`);
    const firstReply = await panel.locator('[aria-live="polite"]').innerText();
    await focused.click();
    check(await focused.getAttribute('aria-pressed') === 'true' && await panel.locator('[aria-live="polite"]').innerText() !== firstReply, `${width}/${status}: alternative dialogue reply opens`);
    const label = status==='available' ? 'Выбрать обычный контракт' : status==='running' ? 'Контракт выполняется: посмотреть ход' : 'Контракт готов: проверь результат';
    const action = panel.getByRole('button',{name:label});
    check(await action.isVisible(),`${width}/${status}: matching action is visible`);
    const filter = page.getByRole('button',{name:'⚪ Белый хакинг'});
    if (status === 'available') { await filter.click(); check(await filter.getAttribute('aria-pressed') === 'true', `${width}: category filter can be selected`); }
    await action.click();
    const selector = status==='available'?'#available-contracts':'#active-contracts';
    const destination = page.locator(selector);
    await page.waitForFunction(sel => { const el=document.querySelector(sel); if (!el) return false; const r=el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }, selector);
    check(await destination.isVisible(),`${width}/${status}: action scrolls to actual contract section`);
    if (status === 'available') check(await filter.getAttribute('aria-pressed') === 'false', `${width}: action restores all available contracts`);
    check(!missionActions.some(a=>['start','claim','skip'].includes(a)),`${width}/${status}: dialogue and navigation do not start or claim contracts`);
    check(errors.length === 0,`${width}/${status}: no browser exceptions`);
    await context.close();
  }
} finally { await browser.close(); }
console.log(`${checks} mobile browser checks passed on a local synthetic backend; no real Telegram or Supabase mutation.`);
