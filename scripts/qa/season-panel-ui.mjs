/** Mobile browser regression against disposable localhost memory backend only. */
import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
if ((await (await fetch(`${base}/api/ping`)).json()).mode !== 'memory-fallback') throw Error('Refusing non-memory backend');
const start=Date.parse('2026-10-27T09:00:00+03:00'), end=start+7*86400_000;
const saved={version:2,eventKey:'neon-relay',weekKey:'2026-10-27',currentDay:7,days:{},completedDays:[1,2,3,5,6,7],participationClaimed:true,masteryClaimed:false};
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});let count=0;
const check=(x,label)=>{assert.ok(x,label);console.log('PASS',label);count++};
try{
 for(const spec of [{name:'before',time:start-1,withState:false,visible:true},{name:'active',time:end-1000,withState:true,visible:true},{name:'finished',time:end,withState:true,visible:false}]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(({time,name})=>{localStorage.setItem('hk_demo_tg_id',`season-ui-${name}`);localStorage.setItem('hk_tutorial_seen_v1','1');Date.now=()=>time},spec);
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/init',async route=>{const response=await route.fetch(),json=await response.json();if(json.player){if(spec.withState)json.player.stats.seasonEvent=structuredClone(saved);else delete json.player.stats.seasonEvent}await route.fulfill({response,json})});
  await page.goto(base,{waitUntil:'networkidle'});
  const dialog=page.getByRole('dialog');if(await dialog.count()){const classic=dialog.getByRole('button',{name:/Классика/});if(await classic.count())await classic.click()}
  const panel=page.getByRole('region',{name:'Игровой ивент Neon Relay'});
  check((await panel.count())===Number(spec.visible),`${spec.name}: event visibility matches calendar`);
  check(await page.getByRole('button',{name:/^HACK/}).isVisible(),`${spec.name}: main game remains playable`);
  check(errors.length===0,`${spec.name}: no browser errors`);
 }
}finally{await browser.close()}
console.log(`${count} checks passed in mobile emulation; temporary memory backend only.`);
