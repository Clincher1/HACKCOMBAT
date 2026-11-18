/** Optional local Chromium QA for current-stage-only design. Never target production. */
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base='http://127.0.0.1:5173';
if((await(await fetch(base+'/api/ping')).json()).mode!=='memory-fallback')throw Error('Refusing non-memory backend');
const b=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args});let n=0;
const check=(v,s)=>{if(!v)throw Error('FAIL '+s);console.log('PASS '+s);n++};
try {
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addInitScript(()=>{const RealDate=Date;const fixed=Number(localStorage.getItem('qa_clock_ms')||RealDate.now());class FixedDate extends RealDate{constructor(...args){args.length?super(...args):super(fixed)}static now(){return fixed}};window.Date=FixedDate;localStorage.setItem('hk_tutorial_seen_v1','1')});
 const page=await ctx.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let stage=1,level=1,theme='classic';
 await page.route('**/api/init',async route=>{const response=await route.fetch(),json=await response.json();json.player.derived.level=level;json.player.derived.deskStage=stage;json.player.stats.baseTheme=theme;await route.fulfill({response,json})});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 for(theme of ['classic','femme'])for(const [lv,st] of [[1,1],[4,1],[5,5],[9,5],[10,10],[14,10],[15,15],[19,15],[20,20],[24,20],[25,25],[29,25],[30,30],[180,30]])for(const [hour,light] of [[12,'day'],[22,'night']]){
  level=lv;stage=st;await page.evaluate(ms=>localStorage.setItem('qa_clock_ms',String(ms)),new Date(2026,9,31,hour).getTime());
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(([t,s,l])=>{const e=document.querySelector('.theme-art img');return e?.complete&&e.naturalWidth>0&&e.getAttribute('src')?.includes(`${t}-${String(s).padStart(2,'0')}-${l}.webp`)},[theme,stage,light]);
  check(true,`${theme} level ${level}: ${light} uses current stage ${stage}`);
  check(await page.getByRole('button',{name:/Этапы|Посмотреть этап|этап уровня/i}).count()===0,`no stage preview controls`);
 }
 check(errors.length===0,'no JavaScript exceptions');
}finally{await b.close()}
console.log(`${n} passed; stage/level and clock mocked, local memory server only.`);
