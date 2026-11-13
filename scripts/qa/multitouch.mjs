/** Mobile interaction QA against an isolated demo server. Requires optional
 * playwright-core and @sparticuz/chromium, e.g. npm install --no-save ... .
 * Run with LD_LIBRARY_PATH set for Chromium if needed. Never targets production.
 */
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base=process.env.API_BASE ?? 'http://localhost:5173';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) throw new Error('QA requires an isolated local demo server');
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
let passed=0,failed=0;
function check(label,ok,detail=''){ console.log(`${ok?'PASS':'FAIL'} — ${label}${detail?` :: ${detail}`:''}`);ok?passed++:failed++; }
try {
 for (const width of [320,390]) {
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript((id)=>{localStorage.setItem('hk_tutorial_seen_v1','1');localStorage.setItem('hk_demo_tg_id',id);}, String(710000 + Math.floor(Math.random()*100000) + (width===390 ? 100000 : 0)));
  const page=await context.newPage(), errors=[], batches=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',async r=>{if(r.url().endsWith('/api/click')){try{batches.push(await r.json())}catch{}}});
  await page.goto(base,{waitUntil:'networkidle'});
  const dialog=page.getByRole('dialog');
  if (await dialog.count()) {await dialog.getByRole('button',{name:/Классика/}).click();await dialog.waitFor({state:'hidden'});}
  const btn=page.getByRole('button',{name:/^HACK/});
  const scene=page.locator('div.theme-art[role="button"]').first();
  const cdp=await context.newCDPSession(page);
  async function state(){return page.evaluate(async()=>{const r=await fetch('/api/init',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-User-Id':localStorage.getItem('hk_demo_tg_id'),'X-Demo-Username':'MultitouchQA'},body:'{}'});return (await r.json()).player});}
  async function points(el,count){await el.scrollIntoViewIfNeeded();const r=await el.boundingBox();return Array.from({length:count},(_,i)=>({x:r.x+30+i*32,y:r.y+Math.min(30,r.height/2),id:i+1}));}
  async function touch(points){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  async function settled(){await page.waitForTimeout(850);}
  let before=await state();
  await touch(await points(btn,3));await settled();let after=await state();
  check(`${width}px: три одновременных пальца на HACK = три тапа и минус 3 CPU`,after.totalClicks-before.totalClicks===3 && after.data-before.data===3*before.derived.clickPower && batches.at(-1)?.appliedClicks===3 && batches.at(-1)?.player.energy===before.energy-3);
  before=after;await touch(await points(scene,2));await settled();after=await state();
  check(`${width}px: два пальца на сцене = два тапа`,after.totalClicks-before.totalClicks===2 && after.data-before.data===2*before.derived.clickPower);
  before=after;const pt=(await points(btn,1))[0];await page.touchscreen.tap(pt.x,pt.y);await settled();after=await state();
  check(`${width}px: обычное касание не удваивается`,after.totalClicks-before.totalClicks===1);
  // Compatibility mouse click immediately after touch must not be counted again.
  before=after;await touch(await points(btn,1));await btn.dispatchEvent('click',{detail:1});await settled();after=await state();
  check(`${width}px: синтетический click после touch не удваивает награду`,after.totalClicks-before.totalClicks===1);
  before=after;let move=(await points(scene,1))[0];
  const scrollBefore=await page.evaluate(()=>window.scrollY);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...move,y:move.y-60}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled();after=await state();
  const scrollAfter=await page.evaluate(()=>window.scrollY);
  check(`${width}px: движение для прокрутки не становится тапом`,after.totalClicks===before.totalClicks);
  check(`${width}px: прокрутка страницы со сцены работает`,scrollAfter>scrollBefore,`${scrollBefore} → ${scrollAfter}`);
  before=after;move=(await points(btn,1))[0];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settled();after=await state();
  check(`${width}px: отменённое касание не становится тапом`,after.totalClicks===before.totalClicks);
  // Keyboard accessibility is allowed even immediately after a touch.
  before=after;await btn.focus();await page.keyboard.press('Enter');await settled();after=await state();
  check(`${width}px: Enter на кнопке работает`,after.totalClicks-before.totalClicks===1);
  // The existing candy multiplies the usual tap reward, not energy spending.
  const candy=await page.evaluate(async()=>{const r=await fetch('/api/inventory',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-User-Id':localStorage.getItem('hk_demo_tg_id'),'X-Demo-Username':'MultitouchQA'},body:JSON.stringify({action:'use',itemKey:'reward:new_year_candy',requestId:crypto.randomUUID()})});return r.json()});
  before=candy.player;await touch(await points(btn,2));await settled();after=await state();
  check(`${width}px: мультитач совместим с леденцом ×2`,candy.ok && after.totalClicks-before.totalClicks===2 && Math.abs(after.data-before.data-4*before.derived.clickPower)<0.01);
  // Force only the client-visible init snapshot to 1 CPU; record requests. The
  // real demo backend is isolated, and only one tap may leave the client.
  let requested=[];
  await page.route('**/api/init',async route=>{const response=await route.fetch();const json=await response.json();json.player.energy=1;json.player.energyUpdated=new Date().toISOString();await route.fulfill({response,json});});
  await page.route('**/api/click',async route=>{requested.push(route.request().postDataJSON().clicks);const response=await route.fetch();const json=await response.json();json.player.energy=0;await route.fulfill({response,json});});
  await page.addInitScript(() => { const frozen = Date.now(); Date.now = () => frozen; });
  await page.reload({waitUntil:'networkidle'});
  await touch(await points(btn,3));await settled();
  check(`${width}px: при 1 CPU три пальца отправляют только один тап`,requested.reduce((a,b)=>a+b,0)===1,JSON.stringify(requested));
  await touch(await points(btn,2));await settled();
  check(`${width}px: при 0 CPU новые тапы не ставятся в очередь`,requested.reduce((a,b)=>a+b,0)===1,JSON.stringify(requested));
  check(`${width}px: нет ошибок интерфейса`,errors.length===0,errors.join('; '));
  // Chromium single-process mode may exit when its last context is closed.
 }
} finally {await browser.close();}
console.log(`\nИтого: ${passed} pass / ${failed} fail`);if(failed)process.exitCode=1;
