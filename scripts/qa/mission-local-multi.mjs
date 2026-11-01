/**
 * Local PostgreSQL + PostgREST QA: this script REFUSES all non-local URLs.
 * Requires an explicitly started isolated test stack, never a real Supabase DB.
 * Separate child processes exercise the same player without shared in-process locks.
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const allowedUrl='http://127.0.0.1:55434';
if (process.env.SUPABASE_URL !== allowedUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN) {
  throw Error('Only the isolated localhost:55434 stack without Telegram tokens is allowed');
}
const CORE=path.resolve('api/_core.cjs');
const seed=process.env.HK_TEST_SEED || `local-multi-${randomBytes(8).toString('hex')}`;
const username=process.env.HK_TEST_USERNAME || `QALocal${randomBytes(4).toString('hex')}`;
const {dispatchApiRequest}=createRequire(import.meta.url)(CORE);
async function api(route,body={},workerId='0'){
  const req={url:`/api/${route}`,method:'POST',headers:{host:'local-test', 'x-demo-user-id':seed, 'x-demo-username':username, 'x-forwarded-for':`10.44.5.${workerId}`},body,socket:{remoteAddress:'127.0.0.1'},on(){}};
  const res={statusCode:200,setHeader(){},end(v){this.payload=v??''}};
  await dispatchApiRequest(req,res); return {...JSON.parse(res.payload),_status:res.statusCode};
}
if(process.argv[2]==='worker') {
  process.on('message',async msg=>{try{process.send({id:msg.id,result:await api(msg.route,msg.body,process.argv[3])})}catch(e){process.send({id:msg.id,error:String(e.stack||e)})}});
  process.send({ready:true});
} else {
 const admin=createClient(allowedUrl,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 let pass=0; const workers=[]; let playerId;
 const check=(name,ok,detail='')=>{if(!ok)throw Error(`FAIL ${name}: ${detail}`);console.log(`PASS ${name}${detail?` — ${detail}`:''}`);pass++};
 async function row(table,columns,filters){let q=admin.from(table).select(columns);for(const [key,value] of Object.entries(filters))q=q.eq(key,value);const {data,error}=await q;if(error)throw error;return data}
 async function initWorkers(){for(let i=1;i<=2;i++){
   const child=fork(fileURLToPath(import.meta.url),['worker',String(i)],{env:{...process.env,HK_TEST_SEED:seed,HK_TEST_USERNAME:username},stdio:['ignore','inherit','inherit','ipc']});
   await new Promise((resolve,reject)=>{child.once('message',m=>m.ready?resolve():reject(Error('Worker failed ready')));child.once('exit',c=>reject(Error(`Worker exited ${c}`)))}); workers.push(child);
 }}
 function send(child,id,route,body){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),15000);child.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m.result)});child.send({id,route,body})})}
 try{
   const initial=await api('init');check('local PostgREST init',initial.ok&&initial.player?.id,initial.error);playerId=initial.player.id;
   const original=(await row('players','stats',{id:playerId}))[0];
   const stats={...original.stats,inventoryOwned:['reward:first_donut','reward:gift_cola','reward:gift_whiskey','reward:gift_snus','reward:gift_python_book'],inventoryShowcase:['reward:gift_cola'],unlockedProfileFrames:['frame_rooster_red'],equippedProfileFrame:'frame_rooster_red'};
   const {error:updateError}=await admin.from('players').update({energy:0,energy_updated:new Date().toISOString(),stats}).eq('id',playerId);if(updateError)throw updateError;
   const state=await api('init');check('synthetic player remains at 0 Energy',state.ok&&state.player.energy===0,`energy=${state.player?.energy}`);
   const missionKey=state.player.availableMissionKeys[0]; await initWorkers();
   const starts=await Promise.all(workers.map((w,i)=>send(w,i,'missions',{action:'start',missionKey})));
   const successfulStarts=starts.filter(r=>r.ok);
   const active=await row('missions','id,energy_cost,data_cost,status',{player_id:playerId,status:'active'});
   const afterStart=(await row('players','data,energy,stats',{id:playerId}))[0];
   check('independent server processes yield one mission start',successfulStarts.length===1,starts.map(x=>x.error||'ok').join(' | '));
   check('database contains exactly one active mission',active.length===1,String(active.length));
   check('zero Energy start is saved by PostgreSQL',active[0].energy_cost===0&&afterStart.energy===0,`cost=${active[0].energy_cost} energy=${afterStart.energy}`);
   check('exactly one Data fee was charged',Number(afterStart.data)===state.player.data-Number(active[0].data_cost),`${state.player.data} - ${active[0].data_cost} = ${afterStart.data}`);
   const claims=await Promise.all(workers.map((w,i)=>send(w,10+i,'missions',{action:'skip',missionId:active[0].id})));
   const successfulClaims=claims.filter(r=>r.ok);
   check('independent server processes claim at most once',successfulClaims.length===1,claims.map(x=>x.error||'ok').join(' | '));
   const completed=await row('missions','id,status',{id:active[0].id});const after=(await row('players','data,energy,stats,total_missions,crypto,xp',{id:playerId}))[0];
   check('one completed mission persisted',completed.length===1&&completed[0].status==='completed'&&after.total_missions===1,JSON.stringify({status:completed[0]?.status,total:after.total_missions}));
   check('database rewards match single successful response',Number(after.data)===successfulClaims[0].player.data&&Number(after.crypto)===successfulClaims[0].player.crypto&&Number(after.xp)===successfulClaims[0].player.xp);
   check('inventory gifts and equipped frame survived',stats.inventoryOwned.every(x=>after.stats.inventoryOwned?.includes(x))&&after.stats.inventoryShowcase?.includes('reward:gift_cola')&&after.stats.unlockedProfileFrames?.includes('frame_rooster_red')&&after.stats.equippedProfileFrame==='frame_rooster_red');
   // Emulate an already-active contract started under the old 60 Energy rule.
   // Energy was paid before the update; finishing must not refund or charge it again.
   let {error:energyError}=await admin.from('players').update({energy:100,energy_updated:new Date().toISOString()}).eq('id',playerId);if(energyError)throw energyError;
   const oldStartState=await api('init');
   const oldStart=await api('missions',{action:'start',missionKey:oldStartState.player.availableMissionKeys[0]});
   check('legacy fixture contract started',oldStart.ok&&oldStart.player.activeMissions.length===1,oldStart.error);
   const oldId=oldStart.player.activeMissions[0].id;
   const {error:legacyError}=await admin.from('missions').update({energy_cost:60}).eq('id',oldId);if(legacyError)throw legacyError;
   ({error:energyError}=await admin.from('players').update({energy:40,energy_updated:new Date().toISOString()}).eq('id',playerId));if(energyError)throw energyError;
   const oldReload=await api('init');
   check('legacy contract keeps recorded 60 Energy cost',oldReload.ok&&oldReload.player.activeMissions[0]?.entryEnergyCost===60&&oldReload.player.energy===40);
   const oldSkip=await api('missions',{action:'skip',missionId:oldId});
   check('legacy completion does not charge or refund Energy',oldSkip.ok&&oldSkip.player.energy===40&&oldSkip.player.activeMissions.length===0,oldSkip.error);
   console.log(`${pass} checks passed on local PostgreSQL/PostgREST, two independent Node processes; not a Supabase cloud test.`);
 }catch(e){console.error(e.stack||e);process.exitCode=1}
 finally{
   for(const w of workers)w.kill();
   if(playerId){const {error}=await admin.from('players').delete().eq('id',playerId);if(error){console.error('isolated player cleanup failed',error);process.exitCode=1}}
 }
}
