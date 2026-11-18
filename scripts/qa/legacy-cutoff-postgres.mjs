import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
const db=new PGlite();let n=0;const check=(name,v)=>{assert.ok(v,name);console.log('PASS',name);n++};
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table players(id int primary key,tg_id bigint unique,xp bigint,total_missions int,data numeric);
 create table achievements(player_id int,key text);create table cards(player_id int,level int);
 insert into players values(1,101,700,4,19),(2,102,699,20,21),(3,103,5000,20,23),(4,104,700,4,25),(5,105,700,1,27);
 insert into achievements values(1,'first_upgrade'),(2,'first_upgrade'),(5,'first_upgrade');insert into cards values(4,1);`);
 await db.exec(await readFile('supabase/migrations/026_operator_archive.sql','utf8'));
 await db.exec(`insert into operator_archive (tg_id,entry_key,category,position,content,read_at) values (103,'story:2','story',2,'{"title":"previous"}',now())`);
 const sql=await readFile('supabase/migrations/027_legacy_story_cutoff.sql','utf8');await db.exec(sql);
 let cut=(await db.query('select * from operator_legacy_cutoff order by tg_id')).rows;
 check('cutoff uses exact old eligibility: xp and upgrade or card',JSON.stringify(cut.map(r=>r.total_missions))===JSON.stringify([4,0,0,4,0]));
 check('existing archive unaffected even when old eligibility can no longer be inferred',(await db.query('select content,read_at from operator_archive')).rows[0].read_at!==null);
 await db.exec(`update players set total_missions=72,xp=99999,data=data+1; delete from cards; insert into players values(6,106,99999,72,29);`);
 await db.exec(sql);cut=(await db.query('select * from operator_legacy_cutoff order by tg_id')).rows;
 check('repeat migration does not overwrite old cutoffs',cut[0].total_missions===4&&cut[1].total_missions===0);
 check('repeat migration never adds a post-cutover account',!cut.some(r=>Number(r.tg_id)===106));
 const priv=(await db.query(`select has_table_privilege('anon','public.operator_legacy_cutoff','select') a,has_table_privilege('authenticated','public.operator_legacy_cutoff','select') b,has_table_privilege('service_role','public.operator_legacy_cutoff','select') s,has_table_privilege('service_role','public.operator_legacy_cutoff','insert') w`)).rows[0];
 check('only service role can read cutoff, none can client-write',!priv.a&&!priv.b&&priv.s&&!priv.w);
 check('row level security enabled',(await db.query(`select relrowsecurity from pg_class where oid='public.operator_legacy_cutoff'::regclass`)).rows[0].relrowsecurity);
 check('migration does not change balances',(await db.query('select data from players where id=1')).rows[0].data==='20');
 console.log(`${n} cutoff migration checks passed`);
} finally {await db.close()}
