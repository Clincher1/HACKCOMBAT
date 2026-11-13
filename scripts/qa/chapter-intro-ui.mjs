/** Optional mobile UI QA, isolated memory backend and mocked player snapshots. */
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base='http://127.0.0.1:5173';
if ((await (await fetch(`${base}/api/ping`)).json()).mode !== 'memory-fallback') throw Error('Refusing non-memory backend');
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
let n=0;const check=(condition,label)=>{if(!condition)throw Error(`FAIL ${label}`);console.log(`PASS ${label}`);n++};
try {
 for(const completed of [false,true]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>localStorage.setItem('hk_tutorial_seen_v1','1'));
  const page=await ctx.newPage();page.setDefaultTimeout(12000);const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&!r.url().endsWith('/api/init'))writes.push(r.url())});
  await page.route('**/api/init',async route=>{
   const response=await route.fetch();const json=await response.json();json.player.stats.baseTheme='classic';
   json.player.achievements=completed?['first_upgrade','first_mission']:[];
   json.player.derived.totalCardLevels=completed?2:0;
   json.player.derived.level=completed?10:1;
   json.player.totalMissions=completed?8:0;
   await route.fulfill({response,json});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const chapter=page.getByRole('region',{name:'Задания оператора'});await chapter.waitFor();
  if(!completed){
   check((await chapter.innerText()).includes('0/3 готово'),'new player keeps active chapter progress');
   check((await chapter.innerText()).includes('Собери терминал'),'new player sees first task');
   check(await chapter.getByRole('link',{name:'Открыть апгрейды'}).count()===1,'active task links to upgrades');
   check(await chapter.getByText('Историю можно читать в сюжетном архиве ниже.').count()===0,'unfinished chapter is not collapsed');
  }else{
   check((await chapter.innerText()).includes('Глава 1 завершена · 3/3'),'finished chapter clearly marked');
   check(await chapter.getByText('Это вводные задания. Историю можно читать в сюжетном архиве ниже.').count()===1,'finished chapter points to story archive');
   check(await chapter.getByText('Собери терминал').count()===0,'completed chapter is compact');
   await chapter.getByRole('button',{name:'Посмотреть выполненные задания'}).click();
   check(await chapter.getByText('Глава пройдена').count()===1,'history opens on the last completed step');
   await chapter.getByRole('button',{name:'Предыдущее задание главы'}).click();
   await chapter.getByRole('button',{name:'Предыдущее задание главы'}).click();
   check(await chapter.getByText('Собери терминал').count()===1,'all completed steps remain accessible');
   await chapter.getByRole('button',{name:'Свернуть выполненную главу'}).click();
   check(await chapter.getByText('Глава 1 завершена · 3/3').count()===1,'history can be collapsed again');
   check(writes.length===0,'viewing chapter does not write to the server');
  }
  check(errors.length===0,'no browser exceptions');
  // Keep contexts open: --single-process Chromium exits when its last one closes.
 }
}finally{await browser.close()}
console.log(`${n} checks passed; mobile emulation and mock player, no live player touched.`);
