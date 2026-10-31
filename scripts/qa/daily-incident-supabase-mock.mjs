/** Regression against the real bundled engine and a local PostgREST-shaped mock.
 * No real Supabase or player data is used. PostgreSQL behavior is separately
 * checked against a rolled-back synthetic row; this mock is not hosted E2E.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';

for (const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BOT_TOKEN','TELEGRAM_BOT_TOKEN']) delete process.env[key];
let row, sabotage = false;
const now = Date.now();
const dayKey = new Date(now + 3 * 3600_000).toISOString().slice(0,10);
const ago = new Date(now - 20_000).toISOString();
function reset() {
 row = { id:'9a4f0c70-8355-4f65-8dd4-7e536c80f639', tg_id:-1234567, username:'MockUser',
  rank:1,data:10000,crypto:100,energy:1500,energy_updated:ago,heat:25,rep:50,level:1,
  data_per_hour:600,prestige_count:0,click_blocked_until:null,daily_streak:0,last_daily_claim:null,
  equipped_skin:'default',unlocked_skins:['default'],total_clicks:0,total_missions:0,
  last_passive_claim:ago,chips:0,xp:0,card_tier:1,
  stats:{ lastActiveAt:ago, activeDayKey:dayKey, lastTapClaimAt:ago,
   inventoryOwned:['reward:gift_cola'],unlockedProfileFrames:['frame_rooster_red'],
   dailyIncident:{version:1,dayKey,incidentKey:'ghost_login',choiceKey:null,resolvedAt:null,outcome:null} }
 };
 sabotage = false;
}
reset();
const requests=[];
const server=http.createServer(async(req,res)=>{
 try {
  let raw='';for await (const c of req) raw+=c;const body=raw?JSON.parse(raw):null;
  const u=new URL(req.url,'http://127.0.0.1');const table=u.pathname.split('/').at(-1);
  requests.push({method:req.method,table,url:u.href,body});
  const send=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','content-range':'0-0/0'});res.end(JSON.stringify(data))};
  if(table==='init_player') return send({...row,tg_id:body.p_tg_id});
  if(table==='players' && req.method==='PATCH') {
   if (sabotage && body.stats?.dailyIncident?.choiceKey) {
    row.stats={...row.stats,inventoryOwned:[...row.stats.inventoryOwned,'reward:gift_whiskey']}; sabotage=false;
   }
   const matches=[...u.searchParams].filter(([k])=>k!=='select').every(([key, filter])=>{
    if(key.startsWith('stats->')) {
     const property=key.slice(7);
     if(filter==='is.null') return !Object.hasOwn(row.stats,property);
     if(filter.startsWith('eq.')) return Object.hasOwn(row.stats,property)&&isDeepStrictEqual(row.stats[property],JSON.parse(filter.slice(3)));
     throw Error('unsupported JSON filter '+key+' '+filter);
    }
    if (!filter.startsWith('eq.')) throw Error('unsupported filter '+key+' '+filter);
    return String(row[key])===filter.slice(3);
   });
   if(matches) Object.assign(row,structuredClone(body));
   return send(matches?[{id:row.id}]:[]);
  }
  if(table==='new_year_candy') return send({uses_remaining:3,boost_until:null});
  if(table==='cards') return send([{card_key:'monitor',level:5}]);
  if(table==='achievements' && req.method==='POST') return send([]);
  if(['team','missions','achievements','pets','base_upgrades','referrals'].includes(table))return send([]);
  throw Error('Unexpected mock request '+req.method+' '+u.pathname);
 } catch(e){console.error(e);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({message:String(e)}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-only';
const {dispatchApiRequest}=createRequire(import.meta.url)(path.resolve('api/_core.cjs'));
async function incident(seed, choiceKey='close_session',clicks=0){
 const req={url:'/api/daily-incident',method:'POST',headers:{host:'localhost', 'x-demo-user-id':seed,'x-demo-username':'MockUser'},body:{choiceKey,clicks},socket:{remoteAddress:'127.0.0.1'},on(){}};
 const res={statusCode:200,setHeader(){},end(v){this.payload=v??''}};
 await dispatchApiRequest(req,res);return {...JSON.parse(res.payload),status:res.statusCode};
}
let count=0;function check(label,ok){assert.ok(ok,label);console.log('PASS',label);count++}
try {
 let r=await incident('mock-regression-1');
 check('incident succeeds when passive sync changes Data',r.ok && row.data>10050);
 check('reward and selected choice persist',row.rep===53 && row.heat===15 && row.stats.dailyIncident.choiceKey==='close_session');
 check('gift and frame remain owned',row.stats.inventoryOwned.includes('reward:gift_cola')&&row.stats.unlockedProfileFrames.includes('frame_rooster_red'));
 let patch=requests.find(x=>x.table==='players'&&x.body?.stats?.dailyIncident?.choiceKey);
 check('CAS uses original Data and original stats',new URL(patch.url).searchParams.get('data')==='eq.10000' && JSON.parse(new URL(patch.url).searchParams.get('stats->dailyIncident').slice(3)).choiceKey===null);
 r=await incident('mock-regression-1');check('same incident cannot pay twice',!r.ok && row.rep===53);
 reset();requests.length=0;
 r=await incident('mock-regression-click', 'close_session', 3);
 check('pending taps and choice succeed together',r.ok && row.total_clicks===3 && row.stats.dailyIncident.choiceKey==='close_session');
 check('click-stage and incident-stage both persisted',requests.filter(x=>x.table==='players'&&x.body?.stats).length===2);
 reset();requests.length=0;sabotage=true;
 r=await incident('mock-regression-race');
 check('concurrent stats update rejects stale incident safely',!r.ok&&/Попробуй ещё раз/.test(r.error)&&!row.stats.dailyIncident.choiceKey);
 check('concurrent gift is not overwritten',row.stats.inventoryOwned.includes('reward:gift_whiskey')&&row.rep===50);
 r=await incident('mock-regression-race');check('retry after conflict succeeds once and preserves gift',r.ok&&row.rep===53&&row.stats.inventoryOwned.includes('reward:gift_whiskey'));
 console.log(`${count} checks passed; mock PostgREST, not a live Supabase E2E test.`);
}finally{server.close()}
