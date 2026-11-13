/** Isolated mocked snapshots only; never point this test at a real backend. */
import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
if ((await (await fetch(`${base}/api/ping`)).json()).mode !== 'memory-fallback') throw Error('Refusing non-memory backend');
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const keys=['tap_100','mission_start_1','mission_complete_1']; let checks=0;
function check(value, label){assert.ok(value,label);console.log('PASS',label);checks++}
try {
 for(const spec of [
  {name:'active',day:'2026-11-13',claimed:[keys[0]],visible:true},
  {name:'all-claimed',day:'2026-11-13',claimed:keys,visible:false},
  {name:'expired',day:'2026-11-12',claimed:[],visible:false},
  {name:'new-day',day:'2026-11-13',claimed:[],visible:true},
 ]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>{Date.now=()=>Date.parse('2026-11-13T12:00:00Z');localStorage.setItem('hk_tutorial_seen_v1','1')});
  const page=await ctx.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/init',async route=>{const response=await route.fetch(),json=await response.json();
   json.player.stats.baseTheme='classic';json.player.stats.dailyTasks={dayKey:spec.day,taskKeys:keys,progress:{tap_100:100,mission_start_1:1,mission_complete_1:0},claimed:spec.claimed};
   json.player.achievements=['first_upgrade','first_mission'];json.player.derived.totalCardLevels=2;json.player.derived.level=10;json.player.totalMissions=8;
   await route.fulfill({response,json});
  });
  await page.goto(base,{waitUntil:'networkidle'});
  const panel=page.getByRole('region',{name:'Ежедневные поручения'});
  check(await panel.count()===Number(spec.visible),`${spec.name} daily visibility`);
  if(spec.name==='active'){
   check(await panel.getByText('Разогреть терминал').count()===0,'claimed task hidden');
   check(await panel.getByText('Выйти в сеть').count()===1,'unclaimed ready task remains visible');
   check(await panel.getByRole('button',{name:'Забрать'}).count()===1,'ready reward is claimable');
   check((await panel.innerText()).includes('1/3'),'completed count retained');
  }
  const story=page.getByRole('region',{name:'Сюжетный архив'});
  check(await story.getByText('Сюжет доступен').count()===1,`${spec.name} unlocked story highlighted`);
  check(await story.getByRole('button',{name:'Читать историю'}).count()===1,`${spec.name} story readable`);
  check(errors.length===0,`${spec.name} no browser errors`);
 }
} finally {await browser.close()}
console.log(`${checks} checks passed`);
