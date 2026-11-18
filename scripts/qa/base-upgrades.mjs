/** Base upgrades: all 150 purchases, persistence, shared mechanics and autofeeding. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-base-'));
const entry = path.join(sandbox, 'probe.ts');
fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'shared/mechanics.ts'))};\nexport * from ${JSON.stringify(path.join(root, 'shared/base.config.ts'))};`);
require('esbuild').buildSync({entryPoints:[entry],outfile:path.join(sandbox,'probe.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const { BASE_UPGRADES_CONFIG, getBaseUpgradePrice, getBaseUpgradeChipCost, computeBaseUpgradeTotals, computeDerivedStats, syncEnergy, getGameDayKey } = require(path.join(sandbox,'probe.cjs'));
const core = path.join(root, 'api/_core.cjs');
process.chdir(sandbox);
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { dispatchApiRequest } = require(core);
const realNow = Date.now;
let now = Date.parse('2026-10-24T08:00:00Z');
Date.now = () => now;
const iso = () => new Date(now).toISOString();
const tgId = seed => -(100_000_000 + crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest().readUInt32BE(0) % 800_000_000);
function record(seed, extra = {}) {
  return {id:`id-${seed}`,tgId:tgId(seed),username:'BaseTester',data:1_000_000_000_000,crypto:0,chips:1_000,xp:1_000_000_000,
    energy:100,energyUpdated:iso(),heat:0,rep:0,prestigeCount:0,cardTier:1,clickBlockedUntil:null,dailyStreak:0,lastDailyClaim:null,
    equippedSkin:'default',unlockedSkins:['default'],totalClicks:0,totalMissions:0,lastPassiveClaim:iso(),lastClickBatchAt:0,
    cards:{monitor:10},team:[],pets:[],baseUpgrades:{},stats:{},activeMissions:[],availableMissionKeys:[],missionsRefreshedAt:iso(),achievements:[],...extra};
}
const seeds = BASE_UPGRADES_CONFIG.map(x=>`qa-${x.key}`);
const playersByTgId = Object.fromEntries(seeds.map(seed => [tgId(seed),record(seed)]));
for (const [seed, extra] of [
  ['no-level',{xp:0}], ['no-data',{data:0}], ['no-chips',{chips:0,xp:0,cards:{},data:24000}],
  ['prestige',{baseUpgrades:{coffee_machine:8,standing_desk:3}}],
  ['regen',{energy:0,baseUpgrades:{coffee_machine:8}}],
  ['feeder',{pets:[{key:'hamster_byte',hunger:10,lastFedAt:new Date(now-24*3600_000).toISOString(),feedCount:0}]}],
  ['feeder-low',{data:0,cards:{},baseUpgrades:{auto_feeder:1},pets:[{key:'hamster_byte',hunger:10,lastFedAt:new Date(now-24*3600_000).toISOString(),feedCount:0}]}],
  ...['offline-ups','offline-control'].map(seed=>[seed,{baseUpgrades:seed==='offline-ups'?{ups_battery:3}:{},stats:{activeDayKey:getGameDayKey(now),lastQualifiedDayKey:getGameDayKey(now),activeSecondsToday:480,lastActiveAt:iso(),lastTapClaimAt:iso()}}]),
]) playersByTgId[tgId(seed)] = record(seed,extra);
fs.writeFileSync(path.join(sandbox,'.local-db.json'),JSON.stringify({playersByTgId}));
let requestNo = 0;
async function api(seed, route, body={}) {
  const req={url:`/api/${route}`,method:'POST',body,headers:{host:'localhost:5173','x-demo-user-id':seed,'x-demo-username':'BaseTester','x-forwarded-for':`10.80.${Math.floor(requestNo/200)}.${++requestNo%200+1}`},socket:{remoteAddress:'127.0.0.1'},on(){}};
  const res={statusCode:200,payload:'',setHeader(){},end(value){this.payload=value??''}};
  await dispatchApiRequest(req,res); return JSON.parse(res.payload);
}
let pass=0,fail=0;
function check(label,condition,detail=''){ console.log(`${condition?'PASS':'FAIL'} — ${label}${detail?' :: '+detail:''}`); condition?pass++:fail++; }
const close=(a,b,e=1e-8)=>Math.abs(a-b)<e;
try {
  const coffee=BASE_UPGRADES_CONFIG.find(x=>x.key==='coffee_machine');
  check('скрин: цена 9-го уровня и 3 чипа',getBaseUpgradePrice(coffee,8)===Math.floor(24000*1.85**8) && getBaseUpgradeChipCost(coffee,8)===3, `${getBaseUpgradePrice(coffee,8)}`);
  const regen=0.5*(1+8*0.0133), start=Date.parse('2026-10-24T08:00:00Z');
  const t0=new Date(start).toISOString();
  check('кофемашина L8: +10.64% и 33.192 Energy/мин',close(regen*60,33.192));
  check('реген не начисляется раньше срока',syncEnergy(0,t0,100,start+1807,regen).energy===0);
  check('ускоренный реген начисляется в срок',syncEnergy(0,t0,100,start+1808,regen).energy===1);
  let tick={energy:0,updatedAtIso:t0};
  for (let i=1;i<=60;i++) tick=syncEnergy(tick.energy,tick.updatedAtIso,100,start+i*1000,regen);
  const server=syncEnergy(0,t0,100,start+60_000,regen);
  check('секундные клиентские тики совпадают с серверным регеном за минуту',tick.energy===server.energy && tick.energy===33);
  const full=syncEnergy(100,t0,100,start+1500,regen);
  check('полный запас не копит скрытую энергию',full.updatedAtIso===new Date(start+1500).toISOString() && syncEnergy(99,full.updatedAtIso,100,start+1808,regen).energy===99);
  check('реген ограничен максимумом',syncEnergy(99,t0,100,start+100_000,regen).energy===100);

  const keys={coffee_machine:'energyRegenBonusPct',standing_desk:'clickBonusPct',vpn_router:'heatReductionPct',ups_battery:'offlineCapBonusSec',auto_script:'autoClickPerSec',analytics_desk:'missionRewardBonusPct',storage_rack:'passiveBonusPct',thermal_paste:'cardPriceDiscountPct',auto_feeder:'feedDiscountPct',lucky_charm:'cryptoDropBonusPct'};
  for (const cfg of BASE_UPGRADES_CONFIG) {
    let previous=0, monotonic=true;
    for(let n=1;n<=15;n++) {const value=computeBaseUpgradeTotals({[cfg.key]:n})[keys[cfg.key]];monotonic&&=value>previous;previous=value;}
    check(`${cfg.key}: каждый уровень наращивает заявленный базовый бонус`,monotonic && close(previous,cfg.effectPerLevel*15,1e-7));
  }
  const params={cards:{monitor:10},team:[],rep:0,heat:0,data:1e12,xp:1e9,prestigeCount:0,equippedSkin:'default',pets:[],cardTier:1};
  const base=computeDerivedStats({...params,baseUpgrades:{}});
  const upgraded=Object.fromEntries(BASE_UPGRADES_CONFIG.map(cfg=>[cfg.key,computeDerivedStats({...params,baseUpgrades:{[cfg.key]:15}})]));
  check('кофемашина влияет на derived',upgraded.coffee_machine.energyRegenPerSec>base.energyRegenPerSec);
  check('стол влияет на силу тапа',upgraded.standing_desk.clickPower>base.clickPower);
  check('VPN уменьшает множитель Heat',upgraded.vpn_router.heatMultiplier<base.heatMultiplier);
  check('ИБП увеличивает оффлайн-лимит на 10 часов',upgraded.ups_battery.offlineCapSeconds-base.offlineCapSeconds===36000);
  check('скрипт увеличивает авто-клики и доход',upgraded.auto_script.autoClickPerSec>base.autoClickPerSec && upgraded.auto_script.dataPerHour>base.dataPerHour);
  check('аналитика увеличивает бонус контрактов',upgraded.analytics_desk.missionRewardBonusPct>base.missionRewardBonusPct);
  check('хранилище увеличивает доход карточек',upgraded.storage_rack.dataPerHour>base.dataPerHour);
  check('термопаста добавляет скидку',upgraded.thermal_paste.cardPriceDiscountPct>base.cardPriceDiscountPct);
  check('кормушка включает кормление и скидку',upgraded.auto_feeder.autoFeedEnabled && upgraded.auto_feeder.feedDiscountPct>0);
  check('талисман повышает вероятность Crypto',upgraded.lucky_charm.cryptoDropBonusPct>0);
  check('каждый уровень базы добавляет 3 к силе железа',upgraded.coffee_machine.hackPower===base.hackPower+45);
  check('сырые уровни ограничены диапазоном 0–15',close(computeBaseUpgradeTotals({coffee_machine:100}).energyRegenBonusPct,0.1995) && computeBaseUpgradeTotals({coffee_machine:-2}).energyRegenBonusPct===0);

  for (const cfg of BASE_UPGRADES_CONFIG) {
    const seed=`qa-${cfg.key}`;
    let p=(await api(seed,'init')).player, okay=true, why='';
    for (let level=0;level<15;level++) {
      const price=getBaseUpgradePrice(cfg,level), chips=getBaseUpgradeChipCost(cfg,level);
      const r=await api(seed,'base',{upgradeKey:cfg.key});
      if(!r.ok || r.player.baseUpgrades[cfg.key]!==level+1 || r.player.data!==p.data-price || r.player.chips!==p.chips-chips || r.player.derived.hackPower!==p.derived.hackPower+3) { okay=false;why=`L${level+1}: ${r.error ?? 'сумма/уровень не совпали'}`;break; }
      p=r.player;
    }
    const reloaded=await api(seed,'init');
    const maximum=await api(seed,'base',{upgradeKey:cfg.key});
    check(`${cfg.key}: все 15 покупок, цены, чипы, сохранение и запрет L16`,okay && reloaded.player?.baseUpgrades[cfg.key]===15 && !maximum.ok,why);
  }
  check('покупка заблокирована по уровню',!(await api('no-level','base',{upgradeKey:'standing_desk'})).ok);
  check('покупка заблокирована при нехватке Data',!(await api('no-data','base',{upgradeKey:'coffee_machine'})).ok);
  check('покупка заблокирована при нехватке чипов',!(await api('no-chips','base',{upgradeKey:'coffee_machine'})).ok);
  check('неизвестное улучшение отклоняется',!(await api('no-level','base',{upgradeKey:'unknown'})).ok);
  const before=(await api('feeder','init')).player;
  const bought=await api('feeder','base',{upgradeKey:'auto_feeder'});
  check('при покупке кормушки корм не списывается без сохранения питомца',bought.ok && bought.player.pets[0].feedCount===0 && bought.player.data===before.data-getBaseUpgradePrice(BASE_UPGRADES_CONFIG.find(x=>x.key==='auto_feeder'),0));
  const fed=(await api('feeder','init')).player;
  check('автокормление на следующем sync списывает Data и сохраняет кормление',fed.pets[0].feedCount===1 && fed.data<bought.player.data);
  const again=(await api('feeder','init')).player;
  check('автокормление не повторяется при том же времени',again.pets[0].feedCount===1 && again.data===fed.data);
  const noFunds=(await api('feeder-low','init')).player;
  check('кормушка не кормит при недостатке Data',noFunds.pets[0].feedCount===0 && noFunds.data===0);
  const regenStart=(await api('regen','init')).player;
  now+=1807;
  const regenEarly=(await api('regen','init')).player;
  now+=1;
  const regenDue=(await api('regen','init')).player;
  check('сервер начисляет энергию кофемашины L8 в фактический срок',regenStart.energy===0 && regenEarly.energy===0 && regenDue.energy===1);
  const prestigeBefore=(await api('prestige','init')).player;
  const prestigeResult=await api('prestige','prestige');
  const prestigeReload=await api('prestige','init');
  check('улучшения базы сохраняются после престижа и reload',prestigeResult.ok && prestigeReload.player.baseUpgrades.coffee_machine===8 && prestigeReload.player.baseUpgrades.standing_desk===3 && prestigeResult.player.prestigeCount===prestigeBefore.prestigeCount+1,prestigeResult.error);
  const withUps=(await api('offline-ups','init')).player;
  const withoutUps=(await api('offline-control','init')).player;
  now+=9*3600_000;
  const afterUps=await api('offline-ups','init');
  const afterControl=await api('offline-control','init');
  const extra=(afterUps.player.data-withUps.data)-(afterControl.player.data-withoutUps.data);
  check('ИБП оплачивает дополнительный час оффлайн-пассива',close(extra,withUps.derived.dataPerHour*0.5,0.3),`${extra} / ${withUps.derived.dataPerHour*0.5}`);
  check('ИБП не продлевает 8-часовой лимит фоновых тапов',afterUps.offlineTaps===afterControl.offlineTaps && afterUps.offlineTaps===2880);
  console.log(`\nИТОГО: ${pass} pass / ${fail} fail`); if(fail) process.exitCode=1;
} catch(e){console.error(e);process.exitCode=1;} finally {Date.now=realNow;fs.rmSync(sandbox,{recursive:true,force:true});}
