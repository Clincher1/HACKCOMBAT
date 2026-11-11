/** Optional mobile UI QA. Local memory server only, with mocked level/coins. */
import {chromium as pw} from 'playwright-core';import chromium from '@sparticuz/chromium';
const base='http://127.0.0.1:5173';if((await(await fetch(base+'/api/ping')).json()).mode!=='memory-fallback')throw Error('Refusing non-memory backend');
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args});let n=0;const check=(v,s)=>{if(!v)throw Error('FAIL '+s);console.log('PASS '+s);n++};
try { const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>localStorage.setItem('hk_tutorial_seen_v1','1'));const page=await ctx.newPage();page.setDefaultTimeout(12000);let fixture,captured;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/init',async route=>{const resp=await route.fetch(),data=await resp.json();data.player.stats.baseTheme='classic';data.player.derived.level=3;data.player.derived.deskStage=1;data.player.crypto=1000;fixture=data;await route.fulfill({response:resp,json:data})});
 await page.route('**/api/skin',async route=>{captured=route.request().postDataJSON();const data=structuredClone(fixture);if(captured.action==='buy_or_equip'){data.player.unlockedSkins.push(captured.skinKey);data.player.stats.equippedUi=captured.skinKey;data.player.crypto-=captured.expectedPrice}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Открыть магазин скинов/}).first().click();
 const dialog=page.locator('div.fixed').filter({hasText:'Кибер-Косметика'}).last();await dialog.waitFor();
 check((await dialog.innerText()).includes('не дают игровых бонусов'), 'cosmetics are clearly described as visual-only');
 const amber=dialog.locator('div.rounded-xl').filter({hasText:'Amber Panels'}).first();check(await amber.getByText('Цена: 60 💎 Crypto · покупка навсегда').count()===1,'available price visible');
 const grape=dialog.locator('div.rounded-xl').filter({hasText:'Grape Protocol'}).first();check(await grape.getByText('Цена: 170 💎 Crypto · покупка навсегда').count()===1&&await grape.getByText('Ур. 9').count()>0,'locked level and future price visible');
 await amber.getByRole('button',{name:'Купить Amber Panels'}).click();await page.waitForTimeout(200);check(captured.action==='buy_or_equip'&&captured.skinKey==='ui_amber'&&captured.expectedPrice===60,'client confirms displayed price');
 await dialog.getByRole('button',{name:/Рамки Профиля/}).click();const card=dialog.locator('div.rounded-xl').filter({hasText:'Cyan Pulse'}).first();check((await card.innerText()).includes('480 💎')&&(await card.innerText()).includes('Ур. 30'),'locked frame shows level and price');
 check(errors.length===0,'no browser errors');
}finally{await browser.close()};console.log(`${n} passed; emulated mobile, mocked player state.`);
