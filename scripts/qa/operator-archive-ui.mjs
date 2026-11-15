/** Mobile browser checks against local mocked archive API, never real accounts. */
import { createRequire } from 'node:module';
const require=createRequire(process.env.QA_MODULE_ROOT ? `${process.env.QA_MODULE_ROOT}/package.json` : import.meta.url);
const {chromium}=require('playwright-core');
const base=process.env.API_BASE??'http://127.0.0.1:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) throw Error('local only');
if((await (await fetch(`${base}/api/ping`)).json()).mode!=='memory-fallback')throw Error('memory backend only');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/tmp/chromium',headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
let checks=0;const check=(v,name)=>{if(!v)throw Error('FAIL '+name);console.log('PASS '+name);checks++};
try { for (const width of [320,390]) {
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>localStorage.setItem('hk_tutorial_seen_v1','1'));
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let failure=false;const entries=[
 {entry_key:'story:1',category:'story',position:1,content:{title:'Первый сигнал',text:'Тестовая история',season:1},unlocked_at:new Date().toISOString(),read_at:null,reply:null},
 ...Array.from({length:14},(_,i)=>({entry_key:`city:${i+1}`,category:'city',position:i+1,content:{title:`Сообщение ${i+1}`,text:'Текст сообщения',sender:'Ника',carefulReply:'Осторожно',focusedReply:'По плану'},unlocked_at:new Date().toISOString(),read_at:null,reply:null}))];
 await page.route('**/api/init',async route=>{const response=await route.fetch();const json=await response.json();json.player.stats.baseTheme='classic';await route.fulfill({response,json});});
 await page.route('**/api/operator-archive',async route=>{
  const b=route.request().postDataJSON();if(failure)return route.fulfill({status:503,json:{ok:false,error:'fail'}});
  if(b.action==='sync')return route.fulfill({json:{ok:true,entries}});
  const entry=entries.find(e=>e.entry_key===b.key);if(!entry)return route.fulfill({status:404,json:{ok:false}});
  if(b.action==='read')entry.read_at??=new Date().toISOString();
  if(b.action==='reply')entry.reply=b.reply;
  return route.fulfill({json:{ok:true,entry}});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const link=page.getByRole('link',{name:/архив оператора|непрочитанные главы|новое сообщение в архиве/i});await link.waitFor();
 await link.click(); const archive=page.getByRole('region',{name:'Архив оператора'});await archive.waitFor();
 const story=archive.getByRole('button',{name:/Первый сигнал/});await story.waitFor();
 check((await story.innerText()).includes('Не прочитано'),`${width}: unlocked story starts unread`);
 await story.click();await page.getByRole('article',{name:'Открытая запись'}).waitFor();
 await page.waitForFunction(()=>document.body.innerText.includes('Прочитано'));
 check(entries[0].read_at!==null,`${width}: read sent and acknowledged`);
 await page.reload(); await page.getByRole('button',{name:/Первый сигнал/}).waitFor();
 check((await page.getByRole('button',{name:/Первый сигнал/}).innerText()).includes('Прочитано'),`${width}: read survives reload`);
 await page.getByRole('button',{name:'Городская смена',exact:true}).click();
 check(await page.getByRole('button',{name:/Сообщение \d+/}).count()===14,`${width}: all 14 city reports accessible`);
 const first=page.getByRole('button',{name:/^1\. Сообщение 1 /});await first.click();
 check((await page.getByRole('article',{name:'Открытая запись'}).innerText()).includes('Сохранённого ответа пока нет'),`${width}: shows absent reply honestly`);
 await page.goto(base+'/hacks'); const panel=page.getByRole('region',{name:'Городская смена'});await panel.waitFor();
 const careful=panel.getByRole('button',{name:'Проверим осторожно'});await careful.waitFor({state:'visible'});
 await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Проверим осторожно');return b && !b.disabled});
 await careful.click();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Проверим осторожно');return b?.getAttribute('aria-pressed')==='true'});
 check(entries.some(e=>e.category==='city'&&e.reply==='careful'),`${width}: city reply saved`);
 await page.reload();const again=page.getByRole('region',{name:'Городская смена'}).getByRole('button',{name:'Проверим осторожно'});await again.waitFor();
 await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Проверим осторожно');return b?.getAttribute('aria-pressed')==='true'});
 check(true,`${width}: city reply restored after reload`);
 failure=true; await page.goto(base+'/archive');await page.getByRole('alert').waitFor();
 check((await page.getByRole('alert').innerText()).includes('Не удалось загрузить архив'),`${width}: storage outage reported`);
 check(errors.length===0,`${width}: no browser errors`);
 await context.close();
 }} finally {await browser.close()}
console.log(`${checks} mobile UI checks passed on mocked backend, not real Telegram.`);
