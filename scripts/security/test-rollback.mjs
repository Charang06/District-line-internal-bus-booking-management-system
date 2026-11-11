// Focused forward + exact ACL rollback test. Only the approved restore project.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import pg from 'pg'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig}=require('../lib/supabase-verified-tls.cjs')
loadEnv(process.cwd())
if(!process.argv.includes('--isolated-rollback-only')||projectFingerprint(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL)!=='3ae16e4ead10'
 ||projectFingerprint(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL)===projectFingerprint(process.env.DATABASE_URL))throw Error('Distinct approved isolated target required')
const c=new pg.Client({...verifiedPostgresConfig(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL),connectionTimeoutMillis:15000,query_timeout:20000,keepAlive:true,application_name:'district-exact-rollback-rehearsal'})
const report={at:new Date().toISOString(),sourceConnected:false,committed:false}
const snapshot=async()=>({relations:(await c.query(`SELECT c.relname,c.relkind,
 (SELECT jsonb_agg(jsonb_build_object('grantee',a.grantee,'grantor',a.grantor,'privilege',a.privilege_type,'grantable',a.is_grantable)
 ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable) FROM aclexplode(c.relacl) a) acl,
 c.relrowsecurity,c.relforcerowsecurity,c.relowner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY c.relname`)).rows,
 schema:(await c.query(`SELECT n.nspname,n.nspowner,(SELECT jsonb_agg(jsonb_build_object('grantee',a.grantee,'grantor',a.grantor,
 'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable)
 FROM aclexplode(n.nspacl) a) acl FROM pg_namespace n WHERE n.nspname='public'`)).rows})
const body=text=>text.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
let baseline
try{
 await c.connect();assert.equal(c.connection.stream.authorized,true)
 await c.query('BEGIN READ ONLY');baseline=await snapshot();await c.query('ROLLBACK')
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL transaction_timeout='3min'")
 for(const [v,file,sha]of [[5,'server/migrations/005_admin_username_recovery.sql','c5022498d0945d8d002c680827d5badb0766084eb09cd74adaa7a05f0e8f6a76'],
 [6,'server/migrations/006_admin_recovery_email_verification.sql','5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe']]){
  if(!(await c.query('SELECT 1 FROM public.schema_meta WHERE version=$1',[v])).rowCount){const bytes=fs.readFileSync(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);await c.query(body(bytes.toString()))}
 }
 const before=await snapshot()
 const release=fs.readFileSync('scripts/security/007_internal_application_security.sql','utf8')
 const manifest=JSON.parse(fs.readFileSync('artifacts/internal-table-security/production-migration.json','utf8'))
 assert.equal(createHash('sha256').update(release).digest('hex'),manifest.sha256)
 await c.query(body(release))
 assert.equal((await c.query('SELECT count(*)::int n FROM public.schema_meta WHERE version=7')).rows[0].n,1)
 report.productionMigrationSha256=manifest.sha256
 await c.query("SELECT set_config('district_security.approve_insecure_rollback','owner-approved-exact-baseline',true)")
 await c.query(body(fs.readFileSync('artifacts/internal-table-security/rollback-baseline.sql.review','utf8')))
 assert.equal((await c.query('SELECT count(*)::int n FROM public.schema_meta WHERE version=7')).rows[0].n,0)
 assert.deepEqual(await snapshot(),before)
 report.exactAclRlsRollbackPassed=true
}catch(e){report.errorCode=e.code||e.name;process.exitCode=1}
finally{
 await c.query('ROLLBACK').catch(()=>{})
 if(baseline){try{await c.query('BEGIN READ ONLY');assert.deepEqual(await snapshot(),baseline);await c.query('ROLLBACK');report.originalRestoreCatalogPreserved=true}catch{report.originalRestoreCatalogPreserved=false;process.exitCode=1}}
 await c.end().catch(()=>{});report.passed=report.exactAclRlsRollbackPassed===true&&report.originalRestoreCatalogPreserved===true
 fs.writeFileSync('artifacts/internal-table-security/rollback-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}
