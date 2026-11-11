/** Isolated memory-only QA: never touches production Supabase or Telegram. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const core = path.join(process.cwd(), 'api/_core.cjs');
if (!fs.existsSync(core)) throw Error('Build before running QA');
for (const key of Object.keys(process.env)) if (/SUPABASE|BOT_TOKEN|TELEGRAM/i.test(key)) delete process.env[key];
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'hk-desk-stage-')));
const hash = seed => -(100_000_000 + crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest().readUInt32BE(0) % 800_000_000);
const now = new Date().toISOString();
function record(seed, xp) { const id = hash(seed); return {id:`${id}-qa`,tgId:id,username:'DeskTester',data:10000,crypto:5000,chips:3,xp,energy:100,energyUpdated:now,heat:0,rep:0,prestigeCount:0,cardTier:1,clickBlockedUntil:null,dailyStreak:0,lastDailyClaim:null,equippedSkin:'default',unlockedSkins:['default'],totalClicks:0,totalMissions:0,lastPassiveClaim:now,lastClickBatchAt:0,cards:{},team:[],pets:[],baseUpgrades:{},stats:{inventoryOwned:['reward:first_donut','reward:gift_cola'],inventoryShowcase:['reward:gift_cola'],unlockedProfileFrames:['frame_rooster_red'],equippedProfileFrame:'frame_rooster_red'},activeMissions:[],availableMissionKeys:[],missionsRefreshedAt:now,achievements:[]}; }
const high='desk-high',low='desk-low',mid='desk-mid'; const a=record(high,5_000_000),b=record(low,0),c=record(mid,150_000);
fs.writeFileSync('.local-db.json',JSON.stringify({playersByTgId:{[a.tgId]:a,[b.tgId]:b,[c.tgId]:c}}));
const {dispatchApiRequest}=createRequire(import.meta.url)(core);let count=0,ip=0;
const check=(name,ok)=>{if(!ok)throw Error(`FAIL ${name}`);console.log('PASS '+name);count++};
async function api(seed,route,body={}){const req={url:`/api/${route}`,method:'POST',headers:{host:'localhost:5173','x-demo-user-id':seed,'x-demo-username':'DeskTester','x-forwarded-for':`10.31.0.${++ip}`},body,socket:{remoteAddress:'127.0.0.1'},on(){}};const res={statusCode:200,setHeader(){},end(x){this.payload=x}};await dispatchApiRequest(req,res);return {...JSON.parse(res.payload),status:res.statusCode};}
const select=(seed,key)=>api(seed,'skin',{action:'set_desk_stage',skinKey:key});
let original=(await api(high,'init')).player;
check('old high-level player starts in auto mode',original.derived.deskStage===30 && original.stats.deskStagePreference===undefined);
for(const stage of [1,5,10,15,20,25,30]){
 const r=await select(high,String(stage));check(`unlocked stage ${stage} can be equipped`,r.ok&&r.player.stats.deskStagePreference===stage);
 const reload=await api(high,'init');check(`stage ${stage} persists on reload`,reload.player.stats.deskStagePreference===stage);
}
let r=await select(high,'1');const baseline=r.player;
for(const field of ['data','crypto','chips','xp','equippedSkin'])check(`selection preserves ${field}`,baseline[field]===original[field]);
check('tap strength unchanged',baseline.derived.clickPower===original.derived.clickPower);
check('gift and equipped frame retained',baseline.stats.inventoryOwned.includes('reward:gift_cola')&&baseline.stats.inventoryShowcase.includes('reward:gift_cola')&&baseline.stats.unlockedProfileFrames.includes('frame_rooster_red')&&baseline.stats.equippedProfileFrame==='frame_rooster_red');
r=await api(high,'skin',{action:'set_theme',skinKey:'femme'});check('theme can be changed without losing stage',r.ok&&r.player.stats.baseTheme==='femme'&&r.player.stats.deskStagePreference===1);
r=await select(high,'auto');check('auto mode clears fixed preference',r.ok&&r.player.stats.deskStagePreference===undefined&&r.player.derived.deskStage===30);
for(const key of ['5','10','30','31','05','-1','autoX','']){r=await select(low,key);check(`level 1 rejects invalid or future stage ${JSON.stringify(key)}`,!r.ok);}
const midPlayer=(await api(mid,'init')).player;
check('mid-level fixture is between levels 10 and 30',midPlayer.derived.deskStage>=10&&midPlayer.derived.deskStage<30);
r=await select(mid,'1');check('mid-level player may use an earlier stage',r.ok&&r.player.stats.deskStagePreference===1);
r=await select(mid,'30');check('mid-level player cannot access future stage',!r.ok);
r=await api(mid,'init');check('rejected future choice preserves earlier selection',r.player.stats.deskStagePreference===1);
r=await select(low,'1');check('level 1 can select own stage',r.ok&&r.player.stats.deskStagePreference===1);
r=await select(low,'auto');check('level 1 can return to automatic mode',r.ok&&r.player.stats.deskStagePreference===undefined);
console.log(`${count} passed on isolated memory backend; no hosted Supabase or real Telegram.`);
