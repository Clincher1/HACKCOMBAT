/** QA new mission content against isolated memory-fallback; never production. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hk-missions-'));
const require=createRequire(import.meta.url);
const outfile=path.join(tmp,'missions.cjs');
buildSync({entryPoints:[path.join(root,'shared/missions.config.ts')],bundle:true,platform:'node',format:'cjs',outfile,logLevel:'silent'});
const {MISSIONS_CONFIG}=require(outfile);
for(const k of Object.keys(process.env))if(/SUPABASE|TELEGRAM|BOT_TOKEN|ADMIN_TG|^VITE_/i.test(k))delete process.env[k];
process.chdir(tmp);
let runtime=require(path.join(root,'api/_core.cjs'));
let now=Date.parse('2026-11-05T10:00:00Z');Date.now=()=>now;Math.random=()=>0;
let passed=0;
function check(label,ok,detail=''){if(!ok)throw Error(`FAIL ${label} ${detail}`);console.log(`PASS ${label}${detail?' '+detail:''}`);passed++}
async function api(seed,route,body={}){const req={url:`/api/${route}`,method:'POST',headers:{host:'localhost:5173','x-demo-user-id':seed,'x-demo-username':'TestOnly','x-forwarded-for':'local-'+seed},body,socket:{remoteAddress:'127.0.0.1'},on(){}};const res={statusCode:200,setHeader(){},end(v){this.body=v}};await runtime.dispatchApiRequest(req,res);return JSON.parse(res.body)}
const keys=['signal_rescue','lost_photo_archive','midnight_billboard','parcel_trap','old_observatory'];
check('all mission keys are unique',new Set(MISSIONS_CONFIG.map(m=>m.key)).size===MISSIONS_CONFIG.length);
for(const key of keys){const m=MISSIONS_CONFIG.find(x=>x.key===key);check(`${key}: conservative same-tier reward and gates`,Boolean(m)&&m.baseDataReward===Math.round(m.durationSec*(m.tier===1?({bad:4,neutral:3.6,good:5.8}[m.targetType]):({bad:6,neutral:5.4}[m.targetType])))&&m.requiredPower===(m.tier===1?15:45)&&m.minLevel===(m.tier===1?1:3));}
for(const key of keys){const cfg=MISSIONS_CONFIG.find(m=>m.key===key);let init,seed;
 for(let n=0;n<100;n++){seed=`new-${key}-${n}`;init=await api(seed,'init');if(!init.ok||init.storageMode!=='memory-fallback')throw Error('wrong storage mode');
  if(cfg.minLevel===3){const file=path.join(tmp,'.local-db.json'),db=JSON.parse(fs.readFileSync(file,'utf8'));const player=Object.values(db.playersByTgId).find(p=>p.id===init.player.id);if(!player)throw Error('isolated player not found');player.xp=700;player.missionsRefreshedAt='2000-01-01T00:00:00.000Z';fs.writeFileSync(file,JSON.stringify(db));const core=path.join(root,'api/_core.cjs');delete require.cache[require.resolve(core)];runtime=require(core);init=await api(seed,'init');}
  if(init.player.availableMissionKeys.includes(key))break;init=null;
 }
 check(`${key}: offered to a qualified player`,!!init&&init.player.derived.level>=cfg.minLevel);
 const before=init.player, gifts=JSON.stringify(before.stats.inventoryOwned),frames=JSON.stringify(before.stats.unlockedProfileFrames);
 let start=await api(seed,'missions',{action:'start',missionKey:key}),active=start.player?.activeMissions?.find(m=>m.missionKey===key);
 check(`${key}: starts, preserves gifts and charges the configured costs`,start.ok&&!!active&&active.entryEnergyCost===cfg.durationSec&&start.player.energy===before.energy-cfg.durationSec&&active.entryDataCost>=25&&start.player.data===before.data-active.entryDataCost&&JSON.stringify(start.player.stats.inventoryOwned)===gifts&&JSON.stringify(start.player.stats.unlockedProfileFrames)===frames,start.error);
 let early=await api(seed,'missions',{action:'claim',missionId:active.id});check(`${key}: cannot claim early`,!early.ok);
 now+=cfg.durationSec*1000+1000;let claim=await api(seed,'missions',{action:'claim',missionId:active.id});check(`${key}: completes once and preserves inventory`,claim.ok&&claim.player.totalMissions===before.totalMissions+1&&claim.player.activeMissions.every(m=>m.id!==active.id)&&JSON.stringify(claim.player.stats.inventoryOwned)===gifts&&JSON.stringify(claim.player.stats.unlockedProfileFrames)===frames,claim.error);
 let duplicate=await api(seed,'missions',{action:'claim',missionId:active.id});check(`${key}: duplicate reward rejected`,!duplicate.ok);
}
console.log(`\n${passed} passed; memory-only, synthetic users and clock. No real players or Supabase data touched.`);
