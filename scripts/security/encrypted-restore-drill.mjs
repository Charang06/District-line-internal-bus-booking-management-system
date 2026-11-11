// Owner-authorized decryption and rollback-only application restore.
// The private identity is read only by age. No plaintext archive/SQL/records on disk.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {isDeepStrictEqual} from 'node:util'
import pg from 'pg'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig,certificatePath}=require('../lib/supabase-verified-tls.cjs')
const {guardReadOnlyConnection}=require('../lib/read-only-preflight-guard.cjs')
const {compareCatalogs}=require('../verify-migration006-backup.cjs')
const q=s=>'"'+s.replaceAll('"','""')+'"'
const literal=s=>"'"+s.replaceAll("'","''")+"'"
const md5=s=>createHash('md5').update(s).digest('hex')
const sha=s=>createHash('sha256').update(s).digest('hex')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const report={at:new Date().toISOString(),productionWrites:false,isolatedFingerprint:'3ae16e4ead10',committed:false,
 privateIdentityCopied:false,plaintextArchiveWritten:false,plaintextSqlWritten:false,customerRecordsDisplayed:false,
 restoreScope:'public application schema; managed Supabase schemas and external Storage files are not replayed'}
if(!process.argv.includes('--owner-authorized-rollback-drill'))throw Error('Explicit isolated drill argument required')
loadEnv(process.cwd())
if(projectFingerprint(process.env.DATABASE_URL)!=='868295d24a51'||projectFingerprint(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL)!=='3ae16e4ead10')throw Error('Approved source/restore identities required')
const backup=read('artifacts/internal-table-security/fresh-encrypted-backup.json')
const archive=path.resolve(backup.archiveRelativePath)
if(!archive.startsWith(path.resolve('.private-security/backups')+path.sep))throw Error('Unexpected archive path')
const identity=path.join(process.env.USERPROFILE,'districtline-backup-key.txt') // Exact owner-provided file; never read by this code.
if(!fs.existsSync(identity))throw Error('Owner-provided identity file unavailable')
const base={}
for(const k of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[k])base[k]=process.env[k]
const ageDir=path.join(process.env.LOCALAPPDATA,'Microsoft/WinGet/Packages/FiloSottile.age_Microsoft.Winget.Source_8wekyb3d8bbwe/age')
base.PATH=[ageDir,path.join(os.tmpdir(),'district-pg17-portable'),process.env.PATH].join(path.delimiter)
async function native(exe,args,input,env=base){
 return new Promise((resolve,reject)=>{
  const p=spawn(exe,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']})
  const output=[];let bytes=0,finished=false
  const timer=setTimeout(()=>{p.kill();reject(Object.assign(Error('Native timeout'),{code:'NATIVE_TIMEOUT'}))},240000)
  p.stdin.on('error',()=>{});p.stderr.resume() // Never print/store provider or SQL diagnostics.
  p.stdout.on('data',b=>{bytes+=b.length;if(bytes>128*1024*1024){p.kill();return}output.push(b)})
  p.on('error',e=>{clearTimeout(timer);if(!finished){finished=true;reject(Object.assign(Error('Native tool unavailable'),{code:e.code||'NATIVE_SPAWN_FAILED'}))}})
  p.on('close',code=>{clearTimeout(timer);if(finished)return;finished=true
   if(code!==0||bytes>128*1024*1024)reject(Object.assign(Error('Native process failed'),{code:bytes>128*1024*1024?'MEMORY_BOUND_EXCEEDED':'NATIVE_PROCESS_FAILED'}))
   else resolve(Buffer.concat(output))})
  p.stdin.end(input)
 })
}
const template=fs.readFileSync('scripts/verify-migration006-backup.cjs','utf8')
const query=name=>{const sql=template.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'))?.[1];if(!sql)throw Error('Catalog template missing');return sql}
const catalogSQL=query('catalogSQL'),defaultsSQL=query('defaultsSQL'),rolesSQL=query('rolesSQL'),membershipsSQL=query('membershipsSQL')
const source=new pg.Client({...verifiedPostgresConfig(process.env.DATABASE_URL),connectionTimeoutMillis:15000,query_timeout:20000,application_name:'district-restore-source-catalog-readonly'})
const target=new pg.Client({...verifiedPostgresConfig(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL),connectionTimeoutMillis:15000,query_timeout:20000,application_name:'district-restore-baseline-readonly'})
let sourceConnected=false,targetConnected=false,plaintext,before,stage='ciphertext-checksum'
async function snapshot(c,withData){
 await guardReadOnlyConnection(c)
 try{
  const catalog=(await c.query(catalogSQL)).rows[0].value
  const defaults=(await c.query(defaultsSQL)).rows,roles=(await c.query(rolesSQL)).rows,memberships=(await c.query(membershipsSQL)).rows
  const schema=(await c.query("SELECT nspname,pg_get_userbyid(nspowner) owner,nspacl::text FROM pg_namespace WHERE nspname='public'")).rows
  const sequences={},data={}
  if(withData){
   const seqSQL=(catalog.relations||[]).filter(r=>r.kind==='S').map(r=>`SELECT ${literal(r.name)} name,last_value::text,is_called FROM public.${q(r.name)}`).join(' UNION ALL ')
   for(const r of (await c.query(seqSQL)).rows)sequences[r.name]={last_value:r.last_value,is_called:r.is_called}
   const dataSQL=(catalog.relations||[]).filter(r=>['r','p'].includes(r.kind)).map(r=>`SELECT ${literal(r.name)} name,count(*)::text rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) checksum FROM (SELECT md5(to_jsonb(t)::text) h FROM public.${q(r.name)} t) x`).join(' UNION ALL ')
   for(const r of (await c.query(dataSQL)).rows)data[r.name]={rows:r.rows,checksum:r.checksum}
  }
  return{catalog,defaults,roles,memberships,schema,sequences,data}
 }finally{await c.query('ROLLBACK')}
}
function copyField(s){return s==='\\N'?null:s.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|[\s\S])/g,(_m,e)=>/^[0-7]/.test(e)?String.fromCharCode(parseInt(e,8)):e[0]==='x'?String.fromCharCode(parseInt(e.slice(1),16)):({b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\'})[e]??e)}
function copyManifest(sql){
 const tables=[],sequences=[];let block
 const unquote=s=>s.startsWith('"')?s.slice(1,-1).replaceAll('""','"'):s
 for(const line of sql.split(/\r?\n/)){
  if(block){if(line==='\\.'){tables.push({name:block.name,columns:block.columns,rows:block.hashes.length,checksum:md5(block.hashes.sort().join(''))});block=null}
   else block.hashes.push(md5(JSON.stringify(line.split('\t').map(copyField))));continue}
  const m=line.match(/^COPY public\.("(?:[^"]|"")*"|[\w$]+) \((.*)\) FROM stdin;$/)
  if(m)block={name:unquote(m[1]),columns:(m[2].match(/"(?:[^"]|"")*"|[^,\s]+/g)||[]).map(unquote),hashes:[]}
  const s=line.match(/^SELECT pg_catalog\.setval\('public\.([^']+)', (\d+), (true|false)\);$/)
  if(s)sequences.push({name:s[1],last_value:s[2],is_called:s[3]==='true'})
 }
 if(block||tables.length!==22||sequences.length!==18)throw Object.assign(Error('Unexpected archive inventory'),{code:'ARCHIVE_INVENTORY_MISMATCH'})
 return{tables,sequences}
}
try{
 const h=createHash('sha256');for await(const chunk of fs.createReadStream(archive))h.update(chunk)
 if(h.digest('hex')!==backup.archiveSha256)throw Object.assign(Error('Ciphertext mismatch'),{code:'CIPHERTEXT_CHECKSUM_MISMATCH'})
 report.encryptedBackupSha256=backup.archiveSha256
 stage='authenticated-decryption'
 plaintext=await native('age',['--decrypt','--identity',identity,archive])
 if(plaintext.subarray(0,5).toString()!=='PGDMP')throw Error('Decrypted archive header mismatch')
 report.decryptionAuthenticated=true;report.decryptedArchiveHeaderValid=true
 console.log(JSON.stringify({stage:'authenticated-decryption-passed',plaintextArchiveWritten:false,privateIdentityCopied:false}))
 stage='archive-metadata'
 const toc=(await native('pg_restore',['--list'],plaintext)).toString('utf8')
 const selection=toc.split('\n').map(line=>(/^\d+; \d+ \d+ SCHEMA - public\s/.test(line)||/DEFAULT ACL public .* supabase_admin$/.test(line.trim()))?';'+line:line).join('\n')
 const directory=fs.mkdtempSync(path.resolve('.private-security/restore-drill-'))
 const list=path.join(directory,'application-restore.list');fs.writeFileSync(list,selection,{mode:0o600}) // TOC metadata only.
 let sql=(await native('pg_restore',['--file=-','--clean','--if-exists','--no-owner','--schema=public','--use-list='+list],plaintext)).toString('utf8')
 plaintext.fill(0);plaintext=null
 if(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)||/^\\connect\b/m.test(sql))throw Error('Unexpected archive transaction control')
 const expected=copyManifest(sql)
 stage='source-catalog-only';await source.connect();sourceConnected=true
 const sourceState=await snapshot(source,false)
 await source.end();sourceConnected=false
 stage='isolated-baseline';await target.connect();targetConnected=true;before=await snapshot(target,true)
 if(!isDeepStrictEqual(sourceState.roles,before.roles)||!isDeepStrictEqual(sourceState.memberships,before.memberships))throw Error('Required isolated role configuration differs')
 // Only target-local postgres defaults are neutralized; no platform role or source changes.
 const prep=`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated,service_role;`
 const bounds="SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; SET LOCAL transaction_timeout='10min'; SET LOCAL idle_in_transaction_session_timeout='60s'; SET LOCAL timezone='UTC'; SET LOCAL DateStyle='ISO, MDY'; SET LOCAL IntervalStyle='postgres'; SET LOCAL extra_float_digits=3;"
 if((sql.match(/^SET row_security = off;\r?$/gm)||[]).length!==1)throw Error('Unexpected archive header')
 sql=sql.replace(/^SET row_security = off;\r?$/m,'SET row_security = off;\n'+bounds)
 let checks="\nSET LOCAL search_path=public,pg_catalog; SET LOCAL timezone='UTC';\nCREATE TEMP TABLE district_readiness(kind text,name text,payload jsonb) ON COMMIT DROP;\n"
 checks+=`INSERT INTO district_readiness SELECT 'catalog','restored',(${catalogSQL});\n`
 for(const table of expected.tables){
  const r=sourceState.catalog.relations.find(r=>r.name===table.name)
  if(!r)throw Error('Unknown application table')
  const fields=table.columns.map(name=>{const col=r.columns.find(c=>c.name===name);return col?.type==='boolean'?`CASE WHEN t.${q(name)} IS NULL THEN NULL WHEN t.${q(name)} THEN 't' ELSE 'f' END`:`t.${q(name)}::text`}).join(',')
  checks+=`INSERT INTO district_readiness SELECT 'data',${literal(table.name)},to_jsonb(x) FROM (SELECT count(*)::int rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) checksum FROM (SELECT md5(array_to_json(ARRAY[${fields}])::text) h FROM public.${q(table.name)} t) v) x;\n`
 }
 for(const seq of expected.sequences)checks+=`INSERT INTO district_readiness SELECT 'sequence',${literal(seq.name)},jsonb_build_object('last_value',last_value::text,'is_called',is_called) FROM public.${q(seq.name)};\n`
 const release=read('artifacts/internal-table-security/production-migration.json')
 const releaseSql=fs.readFileSync(release.file,'utf8')
 if(sha(releaseSql)!==release.sha256)throw Error('Release checksum changed')
 report.productionMigrationSha256=release.sha256
 const body=text=>text.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
 checks+=body(releaseSql)+'\n'
 checks+=`INSERT INTO district_readiness SELECT 'security','v7',jsonb_build_object(
 'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity),
 'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
 'browserTableAccess',EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated')) r(role) WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))),
 'browserSequenceAccess',EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated')) r(role) WHERE n.nspname='public' AND c.relkind='S' AND has_sequence_privilege(r.role,c.oid,'USAGE,SELECT,UPDATE')),
 'browserSchemaCreate',has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE'),
 'version7',EXISTS(SELECT 1 FROM public.schema_meta WHERE version=7));\n`
 const rollback=fs.readFileSync('artifacts/internal-table-security/rollback-baseline.sql.review','utf8')
 report.rollbackSha256=sha(rollback)
 checks+="SELECT set_config('district_security.approve_insecure_rollback','owner-approved-exact-baseline',true);\n"+body(rollback)+'\n'
 checks+=`INSERT INTO district_readiness SELECT 'catalog','after-v7-rollback',(${catalogSQL});\n`
 checks+="SELECT 'DISTRICT_FINAL_READINESS:'||jsonb_agg(to_jsonb(d) ORDER BY kind,name)::text FROM district_readiness d;\nROLLBACK;\n"
 const config=verifiedPostgresConfig(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL)
 const env={...base,PGHOST:config.host,PGPORT:String(config.port),PGDATABASE:config.database,PGUSER:config.user,PGPASSWORD:config.password,
 PGSSLMODE:'verify-full',PGSSLROOTCERT:certificatePath,PGCONNECT_TIMEOUT:'15',PGAPPNAME:'district-owner-authorized-encrypted-restore',PGOPTIONS:'-c timezone=UTC -c default_transaction_read_only=off'}
 stage='isolated-restore';console.log(JSON.stringify({stage,scope:'application public schema only',automaticRollback:true,productionWrites:false}))
 const output=(await native('psql',['--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--set=VERBOSITY=sqlstate'],Buffer.from('BEGIN;\n'+bounds+'\n'+prep+'\n'+sql+'\n'+checks),env)).toString('utf8')
 sql=''
 const markers=output.split(/\r?\n/).filter(x=>x.startsWith('DISTRICT_FINAL_READINESS:'))
 if(markers.length!==1)throw Error('Restore diagnostic marker missing')
 const diagnostics=JSON.parse(markers[0].slice('DISTRICT_FINAL_READINESS:'.length))
 const get=(kind,name)=>diagnostics.find(x=>x.kind===kind&&x.name===name)?.payload
 report.schemaComparison=compareCatalogs(sourceState.catalog,get('catalog','restored'))
 report.schemaPermissionsMatch=report.schemaComparison.match
 report.applicationDataChecks=expected.tables.map(t=>({table:t.name,match:isDeepStrictEqual(get('data',t.name),{rows:t.rows,checksum:t.checksum})}))
 report.sequenceChecks=expected.sequences.map(s=>({sequence:s.name,match:isDeepStrictEqual(get('sequence',s.name),{last_value:s.last_value,is_called:s.is_called})}))
 report.migrationOnFreshRestorePassed=isDeepStrictEqual(get('security','v7'),{tables:22,policies:0,browserTableAccess:false,browserSequenceAccess:false,browserSchemaCreate:false,version7:true})
 report.rollbackComparison=compareCatalogs(sourceState.catalog,get('catalog','after-v7-rollback'))
 report.rollbackOnFreshRestorePassed=report.rollbackComparison.match
 stage='target-preservation';report.originalTargetPreserved=isDeepStrictEqual(before,await snapshot(target,true))
 report.passed=report.schemaPermissionsMatch&&report.applicationDataChecks.every(x=>x.match)&&report.sequenceChecks.every(x=>x.match)&&report.migrationOnFreshRestorePassed&&report.rollbackOnFreshRestorePassed&&report.originalTargetPreserved
}catch(e){report.failedStage=stage;report.errorCode=e.code||e.name;report.passed=false
 if(before&&targetConnected){try{report.originalTargetPreserved=isDeepStrictEqual(before,await snapshot(target,true))}catch{report.originalTargetPreserved=false}}}
finally{
 plaintext?.fill(0)
 if(sourceConnected)await source.end().catch(()=>{})
 if(targetConnected)await target.end().catch(()=>{})
 report.finishedAt=new Date().toISOString()
 fs.writeFileSync('artifacts/internal-table-security/encrypted-restore-drill.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1
}
