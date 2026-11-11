// Catalog-only capture. Writes a local review artifact, never executes rollback.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import pg from 'pg'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig}=require('../lib/supabase-verified-tls.cjs')
const {guardReadOnlyConnection}=require('../lib/read-only-preflight-guard.cjs')
const q=value=>'"'+value.replaceAll('"','""')+'"'
loadEnv(process.cwd())
if(projectFingerprint(process.env.DATABASE_URL)!=='868295d24a51')throw Error('Owner-confirmed identity mismatch')
const c=new pg.Client({...verifiedPostgresConfig(process.env.DATABASE_URL),connectionTimeoutMillis:15000,query_timeout:20000,keepAlive:true,application_name:'district-readonly-rollback-preparation'})
try{
 await c.connect();await guardReadOnlyConnection(c)
 const relations=(await c.query(`SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY c.relname`)).rows
 const tables=relations.filter(x=>x.relkind==='r')
 if(tables.length!==22||tables.filter(x=>!x.relrowsecurity).length!==17)throw Error('Inventory drift: review before preparing rollback')
 const schema=(await c.query("SELECT n.oid,n.nspname,n.nspacl::text,pg_get_userbyid(n.nspowner) owner FROM pg_namespace n WHERE n.nspname='public'")).rows[0]
 const schemaGrants=(await c.query(`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,
  pg_get_userbyid(a.grantor) grantor,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
  WHERE n.nspname='public' ORDER BY grantee,a.privilege_type`)).rows
 const sequences=[]
 const allColumns=(await c.query(`SELECT a.attrelid,a.attname,a.attacl::text,
  pg_get_serial_sequence(format('public.%I',c.relname),a.attname) sequence_name
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  WHERE a.attrelid=ANY($1::oid[]) AND a.attnum>0 AND NOT a.attisdropped`,[tables.map(t=>t.oid)])).rows
 for(const t of tables){
  const cols=allColumns.filter(a=>a.attrelid===t.oid)
  if(cols.some(x=>x.attacl))throw Error('Column grants require explicit rollback capture review')
  for(const a of cols){const name=a.sequence_name
   if(name){const seq=relations.find(x=>'public.'+x.relname===name);if(!seq)throw Error('Unexpected sequence');sequences.push(seq)}}
 }
 const objects=[...tables,...sequences]
 const grants=(await c.query(`SELECT c.oid,pg_get_userbyid(a.grantor) grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,
 a.privilege_type,a.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE c.oid=ANY($1::oid[]) ORDER BY c.oid,grantee,a.privilege_type`,[objects.map(x=>x.oid)])).rows
 if(objects.some(x=>x.owner!=='postgres')||grants.some(x=>x.grantor!=='postgres'))throw Error('Unexpected owner/grantor; review manually')
 const sql=['-- REVIEW ONLY. Last-resort exact permission rollback for fingerprint 868295d24a51.',
  '-- Restores the insecure browser grants. Requires SEPARATE explicit owner approval.',
  '-- Prefer fixing runtime access while retaining browser denial; never restore the full DB for an ACL-only issue.',
  'BEGIN;',"SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';",'DO $$ BEGIN',
  "IF current_setting('district_security.approve_insecure_rollback',true) IS DISTINCT FROM 'owner-approved-exact-baseline' THEN RAISE EXCEPTION 'Separate rollback approval required'; END IF;",'END $$;']
 sql.push('REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, postgres, service_role;')
 for(const g of schemaGrants.filter(g=>g.privilege_type==='CREATE'&&['PUBLIC','anon','authenticated','postgres','service_role'].includes(g.grantee)))
  sql.push(`GRANT CREATE ON SCHEMA public TO ${g.grantee==='PUBLIC'?'PUBLIC':q(g.grantee)}${g.is_grantable?' WITH GRANT OPTION':''};`)
 for(const t of tables)sql.push(`ALTER TABLE public.${q(t.relname)} ${t.relrowsecurity?'ENABLE':'DISABLE'} ROW LEVEL SECURITY;`)
 for(const obj of objects){
  const type=obj.relkind==='S'?'SEQUENCE':'TABLE'
  sql.push(`REVOKE ALL PRIVILEGES ON ${type} public.${q(obj.relname)} FROM PUBLIC, anon, authenticated;`)
  for(const g of grants.filter(x=>x.oid===obj.oid&&['PUBLIC','anon','authenticated'].includes(x.grantee)))
   sql.push(`GRANT ${g.privilege_type} ON ${type} public.${q(obj.relname)} TO ${g.grantee==='PUBLIC'?'PUBLIC':q(g.grantee)}${g.is_grantable?' WITH GRANT OPTION':''};`)
 }
 sql.push('DELETE FROM public.schema_meta WHERE version=7;','COMMIT;')
 await c.query('ROLLBACK')
 fs.mkdirSync('artifacts/internal-table-security',{recursive:true})
 fs.writeFileSync('artifacts/internal-table-security/rollback-baseline.sql.review',sql.join('\n')+'\n')
 fs.writeFileSync('artifacts/internal-table-security/rollback-catalog.json',JSON.stringify({at:new Date().toISOString(),projectFingerprint:'868295d24a51',tables:tables.map(x=>x.relname),sequences:sequences.map(x=>x.relname),objects,grants,schema,schemaGrants},null,2)+'\n')
 console.log(JSON.stringify({rollbackPrepared:true,tables:tables.length,sequences:sequences.length,productionWrites:false}))
}catch(e){console.log(JSON.stringify({rollbackPreparationFailed:true,code:e.code||e.name}));process.exitCode=1}
finally{await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{})}
