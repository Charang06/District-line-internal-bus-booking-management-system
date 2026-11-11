// PREPARED ONLY. Never invoke without explicit owner approval for the exact hash.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import pg from 'pg'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
const expected='5f725e7d9765326691c0bc5c21d9af522a7d0897379c0ef61298371099670bde'
if(!process.argv.includes('--owner-approved-apply-v7')||process.env.DISTRICT_V7_APPROVAL_SHA256!==expected)throw Error('Exact owner approval marker required; no connection attempted')
loadEnv(process.cwd())
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig}=require('../lib/supabase-verified-tls.cjs')
if(projectFingerprint(process.env.DATABASE_URL)!=='868295d24a51')throw Error('Production fingerprint mismatch')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const file='scripts/security/007_internal_application_security.sql',bytes=fs.readFileSync(file)
if(sha(bytes)!==expected)throw Error('Exact migration checksum mismatch')
const drill=read('artifacts/internal-table-security/encrypted-restore-drill.json')
const backup=read('artifacts/internal-table-security/fresh-encrypted-backup.json')
if(!drill.passed||!drill.decryptionAuthenticated||!drill.originalTargetPreserved||drill.productionMigrationSha256!==expected||drill.encryptedBackupSha256!==backup.archiveSha256)throw Error('Complete encrypted restore evidence required')
if(sha(fs.readFileSync('artifacts/internal-table-security/rollback-baseline.sql.review'))!==drill.rollbackSha256)throw Error('Tested rollback checksum changed')
if(Date.now()-new Date(backup.at).getTime()>24*3600000)throw Error('Backup older than 24 hours; refresh and verify before approval')
const h=createHash('sha256');for await(const b of fs.createReadStream(backup.archiveRelativePath))h.update(b)
if(h.digest('hex')!==backup.archiveSha256)throw Error('Encrypted archive checksum mismatch')
const preflight=spawnSync(process.execPath,['scripts/security/final-readiness.mjs'],{env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:120000})
if(preflight.status!==0||!read('artifacts/internal-table-security/final-readiness.json').passed)throw Error('Current read-only preflight must pass')
const c=new pg.Client({...verifiedPostgresConfig(process.env.DATABASE_URL),connectionTimeoutMillis:15000,query_timeout:180000,application_name:'district-owner-approved-v7'})
const report={at:new Date().toISOString(),projectFingerprint:'868295d24a51',migrationSha256:expected,applied:false,automaticRetry:false,automaticInsecureRollback:false}
let connected=false
try{
 await c.connect();connected=true
 // Execute exact reviewed bytes including its own BEGIN, all assertions and COMMIT.
 report.stage='apply';await c.query(bytes.toString('utf8'));report.applied=true;report.stage='committed'
}catch(e){report.errorCode=e.code||e.name;report.commitOutcome=report.stage==='apply'?'REQUIRES_READ_ONLY_RECONCILIATION':'NOT_ATTEMPTED';process.exitCode=1}
finally{if(connected)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{})
 fs.writeFileSync('artifacts/internal-table-security/production-deployment.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))}
