/** Local-only mobile browser QA. Optional: playwright-core, @sparticuz/chromium. */
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const base=process.env.API_BASE ?? 'http://localhost:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base))throw Error('Local demo only');
const ping=await (await fetch(`${base}/api/ping`)).json();if(ping.mode!=='memory-fallback')throw Error('Refusing non-memory backend');
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});let pass=0;
function check(name,ok){if(!ok)throw Error(`FAIL ${name}`);console.log(`PASS ${name}`);pass++}
try{for(const width of [320,390]){const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});await context.addInitScript(id=>{localStorage.setItem('hk_tutorial_seen_v1','1');localStorage.setItem('hk_demo_tg_id',id)},`energy-ui-${width}-${Date.now()}`);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/init',async route=>{const response=await route.fetch(),json=await response.json();if(json.player){json.player.energy=0;json.player.energyUpdated=new Date().toISOString()}await route.fulfill({response,json})});
 await page.goto(`${base}/hacks`,{waitUntil:'networkidle'});const dialog=page.getByRole('dialog');if(await dialog.count()){await dialog.getByRole('button',{name:/Классика/}).click();await dialog.waitFor({state:'hidden'})}
 await page.getByText('Без расхода Energy').first().waitFor();check(`${width}px: costs clearly explain no Energy`,await page.getByText('Без расхода Energy').count()>0);const buttons=page.getByRole('button',{name:/^(HACK|Рискнуть)$/});check(`${width}px: at zero displayed energy a contract is available`,await buttons.count()>0&&await buttons.first().isEnabled());
 const wait=page.waitForResponse(r=>r.url().endsWith('/api/missions')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='start');await buttons.first().click();const response=await wait,json=await response.json();check(`${width}px: tap starts a contract with no CPU fee`,json.ok&&json.player.activeMissions.length===1&&json.player.activeMissions[0].entryEnergyCost===0);check(`${width}px: no client errors`,errors.length===0);
 }}finally{await browser.close()}console.log(`${pass} passed; local browser + mocked zero CPU display; true zero CPU checked separately in API QA.`);
