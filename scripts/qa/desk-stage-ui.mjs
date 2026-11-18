/** Mobile UI test; mocked level and preferences on a local memory-only server. */
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base='http://127.0.0.1:5173';
if ((await (await fetch(`${base}/api/ping`)).json()).mode !== 'memory-fallback') throw Error('Refusing non-memory backend');
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args});
let count=0;const check=(v,label)=>{if(!v)throw Error('FAIL '+label);console.log('PASS '+label);count++};
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(()=>localStorage.setItem('hk_tutorial_seen_v1','1'));
 const page=await ctx.newPage();page.setDefaultTimeout(12000);let stage=1,theme='classic',preference,fixture;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/init',async route=>{const resp=await route.fetch();const data=await resp.json();data.player.derived.level=stage;data.player.derived.deskStage=stage;data.player.stats.baseTheme=theme;data.player.stats.deskStagePreference=preference;fixture=data;await route.fulfill({response:resp,json:data})});
 await page.route('**/api/skin',async route=>{const body=route.request().postDataJSON();if(body.action!=='set_desk_stage')return route.continue();preference=body.skinKey==='auto'?undefined:Number(body.skinKey);const data=structuredClone(fixture);data.player.stats.deskStagePreference=preference;fixture=data;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})});
 for(theme of ['classic','femme']) for(stage of [1,5,10,15,20,25,30]){
   preference=undefined;await page.goto(base,{waitUntil:'domcontentloaded'});
   const scene=page.locator('.theme-art img');await scene.waitFor();
   const menu=page.locator('summary').filter({hasText:'Выбрать рабочий стол'});
   if(stage===1){check(await menu.count()===0,`${theme} level 1 has no selector`);continue;}
   await menu.click();const opts=page.locator('[aria-label="Открытые рабочие столы"]');
   const available=[1,5,10,15,20,25,30].filter(n=>n<=stage);
   check(await opts.locator('button').count()===available.length+1,`${theme} stage ${stage}: only unlocked choices and auto`);
   const first=opts.getByRole('button',{name:'Ур. 1',exact:true});await first.click();
   await page.waitForFunction(t=>document.querySelector('.theme-art img')?.getAttribute('src')?.includes(`${t}-01-`),theme);
   check(await first.getAttribute('aria-pressed')==='true',`${theme} stage ${stage}: previous scene selected`);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(t=>document.querySelector('.theme-art img')?.getAttribute('src')?.includes(`${t}-01-`),theme);
   check(true,`${theme} stage ${stage}: previous scene survives reload`);
   await menu.click();await opts.getByRole('button',{name:'Авто',exact:true}).click();
   await page.waitForFunction(([t,s])=>document.querySelector('.theme-art img')?.getAttribute('src')?.includes(`${t}-${String(s).padStart(2,'0')}-`),[theme,stage]);
   check(true,`${theme} stage ${stage}: auto returns to newest`);
 }
 check(errors.length===0,'no browser exceptions');
}finally{await browser.close()}
console.log(`${count} passed; emulated mobile, mock level/preference, no real Telegram.`);
