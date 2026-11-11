// Read-only production catalog verification and local evidence integrity.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {isDeepStrictEqual} from 'node:util'
import pg from 'pg'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig}=require('../lib/supabase-verified-tls.cjs')
const {guardReadOnlyConnection}=require('../lib/read-only-preflight-guard.cjs')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const normalize=x=>JSON.stringify(x)
loadEnv(process.cwd())
if(projectFingerprint(process.env.DATABASE_URL)!=='868295d24a51')throw Error('Confirmed production identity mismatch')
const manifest=read('artifacts/internal-table-security/production-migration.json')
const reviewed=read('artifacts/internal-table-security/review-manifest.json')
const rollback='artifacts/internal-table-security/rollback-baseline.sql.review'
const post=process.argv.includes('--post-deployment')
const report={at:new Date().toISOString(),mode:post?'post-deployment':'pre-deployment',productionWrites:false,projectFingerprint:'868295d24a51',checks:{}}
report.migrationSha256=sha(manifest.file);report.rollbackSha256=sha(rollback)
report.checks.migrationIntegrity=report.migrationSha256===manifest.sha256&&manifest.sha256==='5f725e7d9765326691c0bc5c21d9af522a7d0897379c0ef61298371099670bde'
report.checks.bodyIntegrity=sha('scripts/security/internal-tables.sql')===manifest.bodySha256
report.checks.rollbackIntegrity=reviewed.files.some(x=>x.file===rollback&&x.sha256===report.rollbackSha256)
const compatibility=read('artifacts/internal-table-security/rehearsal.json'),rollbackTest=read('artifacts/internal-table-security/rollback-test.json')
report.checks.scopedCompatibilityPassed=compatibility.passed===true&&compatibility.rollbackVerified===true
report.checks.exactRollbackPassed=rollbackTest.passed===true&&rollbackTest.productionMigrationSha256===manifest.sha256
report.compatibilityChecks=compatibility.checks
const drill=read('artifacts/internal-table-security/encrypted-restore-drill.json')
const backup=read('artifacts/internal-table-security/fresh-encrypted-backup.json')
report.checks.authenticatedEncryptedRestorePassed=drill.passed===true&&drill.decryptionAuthenticated===true&&drill.originalTargetPreserved===true
 &&drill.productionMigrationSha256===manifest.sha256&&drill.rollbackSha256===report.rollbackSha256&&drill.encryptedBackupSha256===backup.archiveSha256
 &&drill.applicationDataChecks?.length===22&&drill.applicationDataChecks.every(x=>x.match)
 &&drill.sequenceChecks?.length===18&&drill.sequenceChecks.every(x=>x.match)
const c=new pg.Client({...verifiedPostgresConfig(process.env.DATABASE_URL),connectionTimeoutMillis:15000,query_timeout:20000,application_name:'district-final-readonly-readiness'})
let connected=false
try{
 await c.connect();connected=true;await guardReadOnlyConnection(c)
 const baseline=read('artifacts/internal-table-security/rollback-catalog.json')
 const relations=(await c.query(`SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) owner
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY c.relname`)).rows
 const expected=baseline.objects.map(x=>post&&x.relkind==='r'?{...x,relrowsecurity:true}:x).sort((a,b)=>a.relname.localeCompare(b.relname))
 report.checks.productionObjectSecurityUnchanged=isDeepStrictEqual(relations.slice().sort((a,b)=>a.relname.localeCompare(b.relname)),expected)
 const grants=(await c.query(`SELECT c.oid,pg_get_userbyid(a.grantor) grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,
  a.privilege_type,a.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=ANY($1::oid[])
  ORDER BY c.oid,grantee,a.privilege_type`,[baseline.objects.map(x=>x.oid)])).rows
 const expectedGrants=post?baseline.grants.filter(g=>!['PUBLIC','anon','authenticated'].includes(g.grantee)):baseline.grants
 report.checks.productionGrantsUnchanged=normalize(grants)===normalize(expectedGrants)
 const schemaGrants=(await c.query(`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,
  pg_get_userbyid(a.grantor) grantor,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
  WHERE n.nspname='public' ORDER BY grantee,a.privilege_type`)).rows
 const expectedSchema=post?baseline.schemaGrants.filter(g=>!(g.privilege_type==='CREATE'&&['PUBLIC','anon','authenticated'].includes(g.grantee))):baseline.schemaGrants
 if(post){
  // The exact reviewed SQL makes the runtime's existing implicit owner CREATE
  // privilege explicit. Account for that ACL representation without allowing drift.
  const databaseOwner=(await c.query('SELECT pg_get_userbyid(datdba) owner FROM pg_database WHERE datname=current_database()')).rows[0].owner
  if(databaseOwner==='postgres'&&baseline.schema.owner==='pg_database_owner'
   &&baseline.schemaGrants.some(g=>g.grantee==='pg_database_owner'&&g.privilege_type==='CREATE')
   &&!expectedSchema.some(g=>g.grantee==='postgres'&&g.privilege_type==='CREATE'))
   expectedSchema.push({grantee:'postgres',grantor:'pg_database_owner',privilege_type:'CREATE',is_grantable:false})
 }
 const ordered=rows=>rows.map(x=>JSON.stringify(x)).sort()
 report.checks.productionSchemaGrantsUnchanged=isDeepStrictEqual(ordered(schemaGrants),ordered(expectedSchema))
 report.checks.noUnexpectedColumnGrants=(await c.query(`SELECT count(*)::int n FROM pg_attribute WHERE attrelid=ANY($1::oid[]) AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL`,[baseline.objects.map(x=>x.oid)])).rows[0].n===0
 report.checks.noUnexpectedPolicies=(await c.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'")).rows[0].n===0
 report.versions=(await c.query('SELECT version FROM public.schema_meta ORDER BY version')).rows.map(x=>x.version)
 report.checks.expectedMigrationVersions=isDeepStrictEqual(report.versions,post?[1,2,3,4,5,6,7]:[1,2,3,4,5,6])
 report.checks.noForcedRls=(await c.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity")).rows[0].n===0
 await c.query('ROLLBACK')
}catch(e){report.errorCode=e.code||(/timeout/i.test(e.message)?'CONNECTION_OR_QUERY_TIMEOUT':e.name)}
finally{if(connected)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{})}
report.passed=!report.errorCode&&Object.values(report.checks).every(Boolean)
fs.writeFileSync(`artifacts/internal-table-security/${post?'post-deployment-catalog':'final-readiness'}.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1
