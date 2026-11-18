/** Price-change regression; isolated memory only, never uses real Telegram or Supabase. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=process.cwd(),require=createRequire(import.meta.url),core=path.join(root,'api/_core.cjs');
const {buildSync}=require('esbuild');const configPath=path.join(os.tmpdir(),`hk-prices-${process.pid}.cjs`);
buildSync({entryPoints:[path.join(root,'shared/skins.config.ts')],outfile:configPath,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {SKINS_CONFIG}=require(configPath),price=key=>SKINS_CONFIG.find(s=>s.key===key).cryptoCost;
for(const k of Object.keys(process.env)) if(/SUPABASE|BOT_TOKEN|TELEGRAM/i.test(k)) delete process.env[k];
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(),'hk-prices-qa-')));
const id=seed=>-(100_000_000+crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest().readUInt32BE(0)%800_000_000);
const now=new Date().toISOString();
function fixture(seed,xp,balance,owned=['default']) { const tgId=id(seed);return {id:`${tgId}-qa`,tgId,username:'PricesQA',data:10_000,crypto:balance,chips:3,xp,energy:100,energyUpdated:now,heat:0,rep:0,prestigeCount:0,cardTier:1,clickBlockedUntil:null,dailyStreak:0,lastDailyClaim:null,equippedSkin:'default',unlockedSkins:owned,totalClicks:0,totalMissions:0,lastPassiveClaim:now,lastClickBatchAt:0,cards:{},team:[],pets:[],baseUpgrades:{},stats:{inventoryOwned:['reward:first_donut','reward:gift_cola'],unlockedProfileFrames:['frame_rooster_red'],equippedProfileFrame:'frame_rooster_red'},activeMissions:[],availableMissionKeys:[],missionsRefreshedAt:now,achievements:[]};}
const rich=fixture('price-rich',5_000_000,5000),poor=fixture('price-poor',5_000_000,0),old=fixture('price-old',0,5,['default','matrix']),locked=fixture('price-locked',0,5000);
fs.writeFileSync('.local-db.json',JSON.stringify({playersByTgId:Object.fromEntries([rich,poor,old,locked].map(p=>[p.tgId,p]))}));
const {dispatchApiRequest}=require(core);let n=0,ip=0;
function check(name,ok){if(!ok)throw Error('FAIL '+name);console.log('PASS '+name);n++}
async function api(seed,route,body={}){const req={url:`/api/${route}`,method:'POST',headers:{host:'localhost:5173','x-demo-user-id':seed,'x-demo-username':'PricesQA','x-forwarded-for':`10.20.1.${++ip}`},body,socket:{remoteAddress:'127.0.0.1'},on(){}};const res={statusCode:200,setHeader(){},end(v){this.body=v}};await dispatchApiRequest(req,res);return {...JSON.parse(res.body),status:res.statusCode}}
const buy=(seed,key,expectedPrice)=>api(seed,'skin',{action:'buy_or_equip',skinKey:key,...(expectedPrice===undefined?{}:{expectedPrice})});
let initial=(await api('price-rich','init')).player;
check('all normal store skins have a positive price and level or prestige requirement',SKINS_CONFIG.filter(s=>!['default','prestige_omega'].includes(s.key)).every(s=>s.cryptoCost>=60&&(s.requiredLevel>1||s.prestigeRequired)));
for(const expected of [undefined,8,59,61,0,-1]){
 const r=await buy('price-rich','ui_amber',expected);
 check(`stale or forged price ${String(expected)} rejected`,!r.ok&&/цены магазина обновились/i.test(r.error));
 const p=(await api('price-rich','init')).player;check(`rejection ${String(expected)} does not charge`,p.crypto===initial.crypto&&!p.unlockedSkins.includes('ui_amber'));
}
let r=await buy('price-locked','ui_amber',price('ui_amber'));check('level gate enforced',!r.ok&&/уровн/i.test(r.error));
let p=(await api('price-poor','init')).player;const poorBefore=p.crypto;r=await buy('price-poor','ui_crimson',price('ui_crimson'));check('insufficient balance rejected',!r.ok&&/недостаточно crypto/i.test(r.error));p=(await api('price-poor','init')).player;check('insufficient balance not charged',p.crypto===poorBefore&&!p.unlockedSkins.includes('ui_crimson'));
r=await buy('price-rich','ui_amber',price('ui_amber'));check('valid purchase succeeds at current server price',r.ok&&r.player.crypto===initial.crypto-price('ui_amber'));
p=(await api('price-rich','init')).player;check('purchase persists',p.stats.equippedUi==='ui_amber'&&p.unlockedSkins.includes('ui_amber'));
const afterPurchase=p.crypto;r=await api('price-rich','skin',{action:'unequip',skinKey:'ui_amber'});check('paid skin can be removed without losing it',r.ok&&!r.player.stats.equippedUi&&r.player.unlockedSkins.includes('ui_amber'));
r=await buy('price-rich','ui_amber');check('old clients can re-equip owned skin for free',r.ok&&r.player.crypto===afterPurchase&&r.player.stats.equippedUi==='ui_amber');
for(const key of ['sakura','avatar_ghost']){const before=(await api('price-rich','init')).player.crypto;r=await buy('price-rich',key,price(key));check(`${key} debits exactly its price`,r.ok&&r.player.crypto===before-price(key));}
p=(await api('price-rich','init')).player;check('other equipment slots and gifted frame survive',p.equippedSkin==='sakura'&&p.stats.equippedUi==='ui_amber'&&p.stats.equippedAvatar==='avatar_ghost'&&p.stats.unlockedProfileFrames.includes('frame_rooster_red')&&p.stats.equippedProfileFrame==='frame_rooster_red'&&p.stats.inventoryOwned.includes('reward:gift_cola'));
const oldBefore=(await api('price-old','init')).player;r=await buy('price-old','matrix');check('previously purchased skin equips for free even below new level',r.ok&&r.player.equippedSkin==='matrix'&&r.player.crypto===oldBefore.crypto);
r=await api('price-old','skin',{action:'unequip',skinKey:'matrix'});check('legacy purchase remains owned after unequip',r.ok&&r.player.unlockedSkins.includes('matrix'));
r=await buy('price-old','matrix',22);check('legacy owner is not charged even with old price',r.ok&&r.player.crypto===oldBefore.crypto);
console.log(`${n} passed; isolated memory backend, no hosted Supabase or real Telegram.`);
