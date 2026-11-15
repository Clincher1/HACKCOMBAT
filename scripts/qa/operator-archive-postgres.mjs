/** Disposable embedded PostgreSQL; no hosted project is touched. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
let count=0;const check=(name,value)=>{assert.ok(value,name);console.log('PASS',name);count++};
try {
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 await db.exec(await readFile('supabase/migrations/026_operator_archive.sql','utf8'));
 await db.exec(`INSERT INTO operator_archive (tg_id,entry_key,category,position,content) VALUES (101,'city:1','city',1,'{"title":"Original"}'),(202,'city:1','city',1,'{"title":"Other"}')`);
 await db.exec(`UPDATE operator_archive SET read_at=now(),reply='careful' WHERE tg_id=101 AND entry_key='city:1'`);
 await db.exec(`INSERT INTO operator_archive (tg_id,entry_key,category,position,content) VALUES (101,'city:1','city',1,'{"title":"Changed"}') ON CONFLICT (tg_id,entry_key) DO NOTHING`);
 let rows=(await db.query(`SELECT * FROM operator_archive WHERE tg_id=101`)).rows;
 check('resync never overwrites snapshot, read or reply',rows[0].content.title==='Original'&&rows[0].read_at&&rows[0].reply==='careful');
 check('identities remain separate',(await db.query(`SELECT * FROM operator_archive WHERE tg_id=202`)).rows[0].read_at===null);
 let invalid=false;try{await db.exec(`UPDATE operator_archive SET reply='arbitrary' WHERE tg_id=101`)}catch{invalid=true}check('invalid reply is rejected',invalid);
 invalid=false;try{await db.exec(`INSERT INTO operator_archive(tg_id,entry_key,category,position,content) VALUES (101,'x','city',1,'[]')`)}catch{invalid=true}check('invalid content rejected',invalid);
 const privilege=(await db.query(`SELECT has_table_privilege('anon','public.operator_archive','select') AS a, has_table_privilege('authenticated','public.operator_archive','select') AS b, has_table_privilege('service_role','public.operator_archive','select') AS s`)).rows[0];
 check('only backend service has table access',!privilege.a&&!privilege.b&&privilege.s);
 check('row-level security enabled',(await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.operator_archive'::regclass`)).rows[0].relrowsecurity);
 await db.exec(`BEGIN; UPDATE operator_archive SET reply='focused' WHERE tg_id=101; ROLLBACK`);
 check('failed transaction rolls back',(await db.query(`SELECT reply FROM operator_archive WHERE tg_id=101`)).rows[0].reply==='careful');
 console.log(`${count} disposable PostgreSQL checks passed.`);
} finally { await db.close(); }
