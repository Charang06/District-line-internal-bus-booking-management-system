// Catalog-only production inspection. Never imports the production server.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import pg from 'pg'
import { loadEnv } from '../../server/env.js'
import { projectFingerprint } from '../../server/test-support/isolated-postgres.js'
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig}=require('../lib/supabase-verified-tls.cjs')
const {guardReadOnlyConnection}=require('../lib/read-only-preflight-guard.cjs')
loadEnv(process.cwd())
const fingerprint=projectFingerprint(process.env.DATABASE_URL)
if(fingerprint!=='868295d24a51')throw Error('Owner-confirmed project fingerprint does not match')
const c=new pg.Client({...verifiedPostgresConfig(process.env.DATABASE_URL),connectionTimeoutMillis:15000,application_name:'district-production-catalog-only'})
const report={at:new Date().toISOString(),projectFingerprint:fingerprint,productionMapping:'Owner confirmed; independently reading deployed Vercel configuration still unavailable',privateRecordsRead:false,productionWrites:false}
try{
 await c.connect();await guardReadOnlyConnection(c)
 report.tlsVerified=c.connection.stream.authorized===true
 const rows=(await c.query(`SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
 pg_get_userbyid(c.relowner) owner,c.relacl::text acl,
 has_table_privilege('anon',c.oid,'SELECT') anon_read,
 has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') anon_write,
 has_table_privilege('authenticated',c.oid,'SELECT') authenticated_read,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') authenticated_write
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows
 report.tables=rows
 report.affectedCount=rows.filter(x=>!x.rls&&(x.anon_read||x.anon_write||x.authenticated_read||x.authenticated_write)).length
 report.runtime=(await c.query('SELECT current_user role,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0]
 report.dataApiSchemaSettings=(await c.query(`SELECT r.rolname role,unnest(s.setconfig) setting FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole`)).rows.filter(x=>/^pgrst\.(db_schemas|db_extra_search_path)=/.test(x.setting))
 report.zeroRowSqlProbes=[]
 for(const role of ['anon','authenticated']){
  for(const t of rows.filter(x=>!x.rls)){
   await c.query('SAVEPOINT zero_rows');await c.query(`SET LOCAL ROLE "${role}"`)
   const r=await c.query(`SELECT * FROM public."${t.name.replaceAll('"','""')}" WHERE false`)
   if(r.rowCount!==0)throw Error('Zero-row probe invariant failed')
   await c.query('ROLLBACK TO SAVEPOINT zero_rows');await c.query('RELEASE SAVEPOINT zero_rows')
   report.zeroRowSqlProbes.push({role,table:t.name,readAllowed:true,rowsReturned:0})
  }
 }
 await c.query('ROLLBACK')
 // No API key is extracted from database secrets. Optional publishable/anon key only.
 const u=new URL(process.env.DATABASE_URL)
 const ref=u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]||decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
 const key=process.env.SECURITY_SUPABASE_PUBLIC_API_KEY
 report.dataApi={externallyVerified:false,reason:'No publishable/anon API key or authenticated dashboard access configured; SQL grants alone do not prove HTTP exposure'}
 if(ref&&key){
  if(!key.startsWith('sb_publishable_')&&!key.startsWith('eyJ'))throw Error('Only a publishable/anon key is permitted')
  if(key.startsWith('eyJ')){const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(payload.role!=='anon'||(payload.ref&&payload.ref!==ref))throw Error('Wrong API role/project')}
  const probes=[]
  for(const t of rows.filter(x=>!x.rls)){
   const r=await fetch(`https://${ref}.supabase.co/rest/v1/${t.name}?select=*&limit=0`,{headers:{apikey:key,'Accept-Profile':'public'},signal:AbortSignal.timeout(10000),redirect:'error'})
   const body=await r.text();if(r.ok&&body.trim()!=='[]')throw Error('Expected empty API result')
   probes.push({table:t.name,status:r.status,zeroRows:r.ok})
  }
  report.dataApi={externallyVerified:probes.some(x=>x.zeroRows),probes}
 }
 fs.mkdirSync('artifacts/internal-table-security',{recursive:true})
 fs.writeFileSync('artifacts/internal-table-security/inspection.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({projectFingerprint:fingerprint,tlsVerified:report.tlsVerified,affectedCount:report.affectedCount,zeroRowSqlProbes:report.zeroRowSqlProbes.length,dataApi:report.dataApi}))
}catch(e){console.log(JSON.stringify({inspectionFailed:true,code:e.code||e.name}));process.exitCode=1}
finally{await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{})}
