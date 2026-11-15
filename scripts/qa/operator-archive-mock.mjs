/** Bundled API against an in-process PostgREST-shaped fake; no real accounts. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
for (const key of ['SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BOT_TOKEN','TELEGRAM_BOT_TOKEN']) delete process.env[key];
const token='123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHI';
const players = new Map([[1234,{id:'player-1',xp:10000,total_missions:4}], [5678,{id:'player-2',xp:0,total_missions:0}]]);
const rows = new Map(); let fail = false; const calls=[];
const server=http.createServer(async (req,res)=>{
 let raw='';for await(const c of req) raw+=c;
 const body=raw?JSON.parse(raw):null, u=new URL(req.url,'http://localhost'), table=u.pathname.split('/').at(-1);
 calls.push({method:req.method,table,body});
 const send=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 if(fail && table==='operator_archive') return send({message:'synthetic failure'},500);
 if(table==='players') { const tg=Number(u.searchParams.get('tg_id')?.slice(3)); const p=players.get(tg); return send(p ? [p] : []); }
 if(table==='achievements') return send(u.searchParams.get('player_id')==='eq.player-1' ? [{key:'first_upgrade'},{key:'first_mission'}] : []);
 if(table==='cards') return send([]);
 if(table!=='operator_archive') return send({message:'unexpected table'},500);
 if(req.method==='POST') {
   for(const record of body) { const key=`${record.tg_id}/${record.entry_key}`; if(!rows.has(key)) rows.set(key,{...record,unlocked_at:new Date().toISOString(),read_at:null,reply:null}); }
   return send(null,201);
 }
 const tg=Number(u.searchParams.get('tg_id')?.slice(3)); const key=u.searchParams.get('entry_key')?.slice(3);
 let matches=[...rows.values()].filter(r=>r.tg_id===tg && (!key || r.entry_key===key));
 if(req.method==='PATCH') {
   if(u.searchParams.get('read_at')==='is.null') matches=matches.filter(r=>r.read_at===null);
   for(const r of matches) Object.assign(r,body);
   return send(matches);
 }
 return send(matches);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-only'; process.env.BOT_TOKEN=token;
const {dispatchApiRequest}=createRequire(import.meta.url)(path.resolve('api/_core.cjs'));
function signed(id){ const pairs=[`auth_date=${Math.floor(Date.now()/1000)}`,`user=${JSON.stringify({id,username:'test'})}`].sort((a,b)=>a.localeCompare(b));const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();const hash=crypto.createHmac('sha256',secret).update(pairs.join('\n')).digest('hex');const params=new URLSearchParams();for(const p of pairs){const i=p.indexOf('=');params.append(p.slice(0,i),p.slice(i+1));}params.set('hash',hash);return params.toString();}
async function call(id,body,auth=true){ const req={url:'/api/operator-archive',method:'POST',headers:{host:'localhost',...(auth?{'x-telegram-init-data':signed(id)}:{'x-demo-user-id':String(id)})},body,socket:{remoteAddress:'127.0.0.1'},on(){}};const res={statusCode:200,setHeader(){},end(v){this.payload=v??''}};await dispatchApiRequest(req,res);return {...JSON.parse(res.payload),status:res.statusCode}; }
let n=0;function check(label,value){assert.ok(value,label);console.log('PASS',label);n++}
try {
 let a=await call(1234,{action:'sync'}); check('sync imports eligible story and 14 city reports',a.ok&&a.entries.filter(x=>x.category==='story').length===2&&a.entries.filter(x=>x.category==='city').length===14);
 let guest=await call(1234,{action:'sync'},false);check('unauthenticated guest cannot access archive',guest.status===401);
 let other=await call(5678,{action:'sync'});check('other account has independent archive',other.ok&&other.entries.length===14);
 let r=await call(1234,{action:'read',key:'story:1'});check('read persists on server',r.ok&&!!r.entry.read_at);
 let old=r.entry.read_at;r=await call(1234,{action:'read',key:'story:1'});check('repeated read is idempotent',r.ok&&r.entry.read_at===old);
 r=await call(1234,{action:'reply',key:'city:1',reply:'careful'});check('reply stored',r.ok&&r.entry.reply==='careful');
 r=await call(1234,{action:'read',key:'city:1'});check('read and reply coexist',r.ok&&r.entry.read_at&&r.entry.reply==='careful');
 r=await call(5678,{action:'read',key:'story:1'});check('another player cannot mark locked story',!r.ok);
 r=await call(1234,{action:'reply',key:'story:1',reply:'careful'});check('replies restricted to city',!r.ok);
 players.get(1234).total_missions=0;players.get(1234).xp=0;
 a=await call(1234,{action:'sync'});check('existing stories and reads survive lost progression and re-sync',a.entries.filter(x=>x.category==='story').length===2&&a.entries.find(x=>x.entry_key==='story:1').read_at===old);
 check('reply survives repeated sync',a.entries.find(x=>x.entry_key==='city:1').reply==='careful');
 check('archive code never writes player, cards, missions or inventory',calls.filter(c=>['POST','PATCH','DELETE'].includes(c.method)).every(c=>c.table==='operator_archive'));
 fail=true;r=await call(1234,{action:'reply',key:'city:1',reply:'focused'});check('storage failure is surfaced and prior reply remains',!r.ok&&rows.get('1234/city:1').reply==='careful');
 console.log(`${n} mock API checks passed. Not a hosted Supabase E2E.`);
} finally {server.close();}
