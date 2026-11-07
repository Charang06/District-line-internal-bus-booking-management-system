// One explicitly approved source deployment. No fixtures, email, activation or automatic recovery.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { spawn, execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { verifiedPostgresConfig, certificatePath } = require('./lib/supabase-verified-tls.cjs');
const { guardReadOnlyConnection } = require('./lib/read-only-preflight-guard.cjs');
const { compareCatalogs } = require('./verify-migration006-backup.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const quote = name => '"'+name.replaceAll('"','""')+'"';
const sqlHash = '5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe';

function copyField(value) {
  if (value === '\\N') return null;
  return value.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|[\s\S])/g, (_all, escape) => {
    if (/^[0-7]/.test(escape)) return String.fromCharCode(parseInt(escape,8));
    if (escape[0]==='x') return String.fromCharCode(parseInt(escape.slice(1),16));
    return ({b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\'})[escape] ?? escape;
  });
}
function validateCopyData(text, manifests) {
  const actual = new Map(), sequences = {};
  let block = null;
  const unquote = name => name.startsWith('"') ? name.slice(1,-1).replaceAll('""','"') : name;
  for (const line of text.split(/\r?\n/)) {
    if (block) {
      if (line==='\\.') { actual.set(block.key,{columns:block.columns,rows:String(block.hashes.length),copyChecksum:md5(block.hashes.sort().join(''))}); block=null; }
      else block.hashes.push(md5(JSON.stringify(line.split('\t').map(copyField))));
      continue;
    }
    const copy=line.match(/^COPY ("(?:[^"]|"")*"|[\w$]+)\.("(?:[^"]|"")*"|[\w$]+) \((.*)\) FROM stdin;$/);
    if(copy) block={key:unquote(copy[1])+'.'+unquote(copy[2]),columns:(copy[3].match(/"(?:[^"]|"")*"|[^,\s]+/g)||[]).map(unquote),hashes:[]};
    const seq=line.match(/^SELECT pg_catalog\.setval\('public\.([^']+)', (\d+), (true|false)\);$/);
    if(seq)sequences[seq[1]]={last_value:seq[2],is_called:seq[3]==='true'};
  }
  if(block) throw Error('Incomplete archive COPY block');
  const differences=[],omittedEmptyManaged=[];
  for(const table of manifests){const a=actual.get(table.schema+'.'+table.name);
    if(!a&&table.schema!=='public'&&table.rows==='0'){omittedEmptyManaged.push(table.schema+'.'+table.name);continue;}
    if(!a||a.rows!==table.rows||a.copyChecksum!==table.copyChecksum||!isDeepStrictEqual(a.columns,table.columns))differences.push(table.schema+'.'+table.name);
  }
  return {passed:!differences.length,differences,sequences,omittedEmptyManaged,copyBlocks:actual.size};
}
async function native(exe,args,env,directory,label){return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const timeout=setTimeout(()=>child.kill(),240000);
  child.on('error',error=>{clearTimeout(timeout);reject(error);});
  child.on('close',code=>{clearTimeout(timeout);fs.writeFileSync(path.join(directory,label+'.stderr'),stderr);resolve({code,stdout});});
});}

async function main(){
  if(!process.argv.includes('--execute-approved-source-deploy')||process.env.SOURCE_006_DEPLOY_APPROVAL!=='one-reviewed-006-after-fresh-validated-backup')throw Error('Explicit source deployment approval required');
  const root=process.cwd();const{loadEnv}=await import(pathToFileURL(path.join(root,'server/env.js')));loadEnv(root);
  const{projectFingerprint}=await import(pathToFileURL(path.join(root,'server/test-support/isolated-postgres.js')));
  if(projectFingerprint(process.env.DATABASE_URL)!=='868295d24a51')throw Error('Source project identity mismatch');
  if(['ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION','VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION'].some(key=>process.env[key]==='true'))throw Error('Feature flags must remain disabled');
  const migrationFile=path.join(root,'server/migrations/006_admin_recovery_email_verification.sql');
  if(sha(fs.readFileSync(migrationFile))!==sqlHash)throw Error('Reviewed migration checksum mismatch');
  const base=path.join(process.env.LOCALAPPDATA,'DistrictLine/Backups');
  const priorDir=path.join(base,'migration006-2026-11-07-2f69638c'),evidence=path.join(priorDir,'diagnostic-NGHI2k');
  const prior=read(path.join(evidence,'approved-source-expected-state.json'));
  const rehearsal=read(path.join(evidence,'approved-isolated-rehearsal-kVtqOT/rehearsal-report.json'));
  if(!rehearsal.pass||!rehearsal.baselineRecoveryVerified)throw Error('Rehearsal evidence missing');
  const directory=fs.mkdtempSync(path.join(base,'source006-approved-'));
  const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-\d(?:-\d+)+/)[0];
  execFileSync('icacls',[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'pipe'});
  const save=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2));
  const report={startedAt:new Date().toISOString(),sourceFingerprint:'868295d24a51',backup:'NOT_RUN',migration006:'NOT_RUN',
    existingDataIntegrity:'NOT_RUN',securityChecks:'NOT_RUN',deploymentChecks:'NOT_RUN',featureFlagsEnabled:false,emailsSent:false,
    testAccountsCreated:false,migration005Applied:false,automaticRollbackAttempted:false,fullRestoreAttempted:false,operations:[]};
  const progress=(stage,info={})=>{report.operations.push({stage,at:new Date().toISOString(),...info});save('deployment-report.json',report);console.log(JSON.stringify({stage,...info}));};
  const template=fs.readFileSync('scripts/verify-migration006-backup.cjs','utf8');
  const query=name=>{const text=template.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'))?.[1];if(!text)throw Error('Catalog query missing');return text;};
  const config=verifiedPostgresConfig(process.env.DATABASE_URL);
  const client=new Client({...config,connectionTimeoutMillis:15000,application_name:'district-approved-source006-deployment'});
  let baseline,migrationCommitted=false,stage='connect',heartbeat,heartbeatFailed=false;
  const capture=async(withCopy=false)=>{
    const guard=await guardReadOnlyConnection(client);
    await client.query("SET LOCAL DateStyle='ISO, MDY'; SET LOCAL IntervalStyle='postgres'; SET LOCAL extra_float_digits=3");
    const catalog=(await client.query(query('catalogSQL'))).rows[0].value,defaults=(await client.query(query('defaultsSQL'))).rows,
      roles=(await client.query(query('rolesSQL'))).rows,memberships=(await client.query(query('membershipsSQL'))).rows;
    const versions=(await client.query('SELECT version FROM public.schema_meta ORDER BY version')).rows.map(x=>x.version);
    const globalRoles=(await client.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_roles ORDER BY rolname')).rows;
    const globalMemberships=(await client.query('SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor ORDER BY 1,2,3')).rows;
    const namespaces=(await client.query("SELECT nspname,pg_get_userbyid(nspowner) owner,nspacl::text FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname")).rows;
    const tables={},sequences={},copyManifest=[];
    const tableList=(await client.query("SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2")).rows;
    for(const t of tableList){
      if(!withCopy&&t.schema!=='public')continue;
      const id=quote(t.schema)+'.'+quote(t.name);
      const checksum=(await client.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) data_checksum FROM (SELECT md5(to_jsonb(t)::text) h FROM ${id} t) z`)).rows[0];
      if(t.schema==='public')tables[t.name]=checksum;
      if(withCopy){
        const columns=(await client.query("SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' ORDER BY a.attnum",[t.schema,t.name])).rows.map(x=>x.attname);
        const fields=columns.map(c=>'t.'+quote(c)+'::text').join(',');
        const copy=(await client.query(`SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) checksum FROM (SELECT md5(array_to_json(ARRAY[${fields}])::text) h FROM ${id} t) z`)).rows[0];
        copyManifest.push({...t,...checksum,columns,copyChecksum:copy.checksum});
      }
    }
    for(const item of catalog.relations.filter(x=>x.kind==='S'))sequences[item.name]=(await client.query(`SELECT last_value::text,is_called FROM public.${quote(item.name)}`)).rows[0];
    return {guard,catalog,defaults,roles,memberships,globalRoles,globalMemberships,namespaces,versions,tables,sequences,copyManifest};
  };
  const sameBaseline=(a,b)=>isDeepStrictEqual(a.catalog,b.catalog)&&isDeepStrictEqual(a.defaults,b.defaults)&&isDeepStrictEqual(a.roles,b.roles)
    &&isDeepStrictEqual(a.memberships,b.memberships)&&isDeepStrictEqual(a.globalRoles,b.globalRoles)&&isDeepStrictEqual(a.globalMemberships,b.globalMemberships)
    &&isDeepStrictEqual(a.namespaces,b.namespaces)&&isDeepStrictEqual(a.versions,b.versions)&&isDeepStrictEqual(a.tables,b.tables)&&isDeepStrictEqual(a.sequences,b.sequences);
  try{
    await client.connect();stage='source-baseline';baseline=await capture(true);
    if(!compareCatalogs(prior.catalog,baseline.catalog).match||!isDeepStrictEqual(prior.defaults,baseline.defaults)
      ||!isDeepStrictEqual(prior.roles,baseline.roles)||!isDeepStrictEqual(prior.memberships,baseline.memberships)||!isDeepStrictEqual(baseline.versions,[1,2,3,4,5]))throw Error('Unexpected source schema/security/migration drift');
    const conflicts=(await client.query(`SELECT count(*)::int n FROM (SELECT lower(btrim(recovery_email)) FROM users WHERE role='admin' AND nullif(btrim(recovery_email),'') IS NOT NULL GROUP BY 1 HAVING count(*)>1) d`)).rows[0].n;
    const invalid=(await client.query(`SELECT count(*)::int n FROM users WHERE role='admin' AND recovery_email IS NOT NULL AND recovery_email<>'' AND (recovery_email<>lower(btrim(recovery_email)) OR recovery_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')`)).rows[0].n;
    const timezone=(await client.query("SELECT reset_val FROM pg_settings WHERE name='TimeZone'")).rows[0].reset_val;
    if(conflicts||invalid||timezone!=='UTC')throw Error('Source email or backup-format prerequisite failed');
    save('source-baseline.json',baseline);save('source-snapshot-manifest.json',{tables:baseline.copyManifest});
    const exported=(await client.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
    stage='fresh-readonly-backup';progress('source-identity-and-baseline-confirmed',{tables:Object.keys(baseline.tables).length,sequences:Object.keys(baseline.sequences).length});
    heartbeat=setInterval(()=>{client.query('SELECT 1').catch(()=>{heartbeatFailed=true;});},15000);
    const bin=path.join(process.env.TEMP,'district-pg17-portable');
    const env={...process.env,PGHOST:config.host,PGPORT:String(config.port),PGUSER:config.user,PGPASSWORD:config.password,PGDATABASE:config.database,
      PGSSLMODE:'verify-full',PGSSLROOTCERT:certificatePath,PGCONNECT_TIMEOUT:'15',PGAPPNAME:'district-approved-readonly-source-backup',PGOPTIONS:'-c default_transaction_read_only=on'};
    const archive=path.join(directory,'database.dump');
    const dump=await native(path.join(bin,'pg_dump.exe'),['--format=custom','--lock-wait-timeout=5000','--extra-float-digits=3','--snapshot='+exported,'--file='+archive],env,directory,'pg_dump');
    if(dump.code!==0)throw Error('Read-only backup failed');
    const roles=await native(path.join(bin,'pg_dumpall.exe'),['--roles-only','--no-role-passwords'],env,directory,'roles-export');
    if(roles.code!==0)throw Error('Role backup failed');fs.writeFileSync(path.join(directory,'roles.sql'),roles.stdout);
    const list=await native(path.join(bin,'pg_restore.exe'),['--list',archive],env,directory,'archive-list');
    if(list.code!==0)throw Error('Archive list failed');fs.writeFileSync(path.join(directory,'archive-contents.list'),list.stdout);
    const fullFile=path.join(directory,'full-archive-readback.sql');
    const extracted=await native(path.join(bin,'pg_restore.exe'),['--file='+fullFile,archive],env,directory,'archive-readback');
    if(extracted.code!==0)throw Error('Archive integrity readback failed');
    const validation=validateCopyData(fs.readFileSync(fullFile,'utf8'),baseline.copyManifest);
    save('archive-data-validation.json',validation);
    if(!validation.passed||!isDeepStrictEqual(validation.sequences,baseline.sequences))throw Error('Archive content does not match snapshot');
    const normalize=text=>text.replace(/^--[^\r\n]*/gm,'').replace(/^\\(?:un)?restrict[^\r\n]*/gm,'').replace(/\r\n/g,'\n').split('\n').map(x=>x.trimEnd()).filter(x=>x.trim()).join('\n');
    const schemaFiles=[];
    for(const [label,file]of[['previous',path.join(priorDir,'database.dump')],['fresh',archive]]){
      const out=path.join(directory,label+'-schema.sql');const r=await native(path.join(bin,'pg_restore.exe'),['--schema-only','--schema=public','--no-comments','--file='+out,file],env,directory,label+'-schema');
      if(r.code!==0)throw Error('Schema extraction failed');schemaFiles.push(normalize(fs.readFileSync(out,'utf8')));
    }
    if(schemaFiles[0]!==schemaFiles[1])throw Error('Backup schema differs from restore-validated schema');
    clearInterval(heartbeat);heartbeat=null;
    if(heartbeatFailed)throw Error('Source snapshot connection was interrupted');
    report.backup='PASS';report.backupSha256=sha(fs.readFileSync(archive));report.backupBytes=fs.statSync(archive).size;
    report.backupValidation={allApplicationTablesCompared:Object.keys(baseline.tables).length,allSequencesCompared:Object.keys(baseline.sequences).length,
      copyBlocksValidated:validation.copyBlocks,schemaMatchesRestoreValidatedArchive:true,fullArchiveReadback:true,ownershipGrantsPoliciesIncluded:true};
    await client.query('ROLLBACK');progress('fresh-backup-validated',report.backupValidation);
    stage='pre-migration-reconfirmation';const before=await capture(false);await client.query('ROLLBACK');
    if(!sameBaseline(baseline,before))throw Error('Relevant source state changed during backup; stop');
    if(sha(fs.readFileSync(migrationFile))!==sqlHash)throw Error('Reviewed migration hash changed');
    stage='apply-migration006';
    await client.query("SET lock_timeout='5s';SET statement_timeout='30s';SET transaction_timeout='5min';SET idle_in_transaction_session_timeout='60s';SET search_path=public,pg_catalog");
    // Execute the reviewed bytes exactly once; the file owns its BEGIN/COMMIT.
    await client.query(fs.readFileSync(migrationFile,'utf8'));migrationCommitted=true;report.migration006='PASS';
    progress('migration006-committed',{reviewedHash:sqlHash});
    stage='post-migration-integrity';const after=await capture(false);save('source-after-migration.json',after);
    if(!isDeepStrictEqual(after.versions,[1,2,3,4,5,6]))throw Error('Migration metadata incorrect');
    const differences=[];
    for(const[name,old]of Object.entries(baseline.tables)){
      if(name==='schema_meta')continue;
      const row=name==='users'?"(to_jsonb(t)-'recovery_email_verified_at')":'to_jsonb(t)';
      const actual=(await client.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) data_checksum FROM (SELECT md5(${row}::text) h FROM public.${quote(name)} t) z`)).rows[0];
      if(!isDeepStrictEqual(old,actual))differences.push(name);
    }
    for(const[name,old]of Object.entries(baseline.sequences))if(!isDeepStrictEqual(old,after.sequences[name]))differences.push(name);
    report.dataDifferences=differences;
    if(differences.length)throw Error('Unexpected existing data or sequence changes');
    report.existingDataIntegrity='PASS';
    stage='security-and-schema';
    const requiredTables=['users','admin_recovery_email_verification_tokens','admin_recovery_email_verification_limits'];
    const security={rls:[],clientGrants:[],constraints:false,indexes:false,triggers:false,noBackfill:false,ownerAccess:false};
    for(const table of requiredTables){const relation=after.catalog.relations.find(x=>x.name===table);
      if(!relation||!relation.rls||relation.force_rls||relation.owner!=='postgres')throw Error('RLS or owner mismatch');security.rls.push(table);
      for(const role of ['anon','authenticated']){
        const row=(await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') exposed",[role,'public.'+table])).rows[0];
        if(row.exposed)throw Error('Client permission exposure');security.clientGrants.push({table,role,denied:true});
      }
    }
    for(const seq of ['users_id_seq','admin_recovery_email_verification_tokens_id_seq'])for(const role of ['anon','authenticated'])
      if((await client.query("SELECT has_sequence_privilege($1,$2,'USAGE,SELECT,UPDATE') exposed",[role,'public.'+seq])).rows[0].exposed)throw Error('Client sequence exposure');
    const expectedIndexes=['users_admin_recovery_email_unique','idx_admin_email_verification_user','idx_admin_email_verification_expiry','idx_admin_email_verification_limits_expiry'];
    if(expectedIndexes.some(name=>!after.catalog.indexes.some(x=>x.indexname===name)))throw Error('Required index missing');security.indexes=true;
    if(!after.catalog.constraints.some(x=>x.table_name==='users'&&x.name==='users_admin_recovery_email_canonical'))throw Error('Canonical constraint missing');security.constraints=true;
    if(!after.catalog.triggers.some(x=>x.name==='invalidate_admin_recovery_email_verification_on_change')||!after.catalog.functions.some(x=>x.name==='public.invalidate_admin_recovery_email_verification()'))throw Error('Invalidation trigger missing');security.triggers=true;
    if((await client.query('SELECT count(*)::int n FROM users WHERE recovery_email_verified_at IS NOT NULL')).rows[0].n)throw Error('Unexpected verification backfill');security.noBackfill=true;
    if(!(await client.query("SELECT has_table_privilege(current_user,'public.users','SELECT,UPDATE') AND has_table_privilege('service_role','public.users','SELECT,UPDATE') allowed")).rows[0].allowed)throw Error('Backend/service access lost');security.ownerAccess=true;
    if(!isDeepStrictEqual(after.defaults,baseline.defaults)||!isDeepStrictEqual(after.roles,baseline.roles)||!isDeepStrictEqual(after.memberships,baseline.memberships)
      ||!isDeepStrictEqual(after.globalRoles,baseline.globalRoles)||!isDeepStrictEqual(after.globalMemberships,baseline.globalMemberships)||!isDeepStrictEqual(after.namespaces,baseline.namespaces))throw Error('Unrelated security state changed');
    for(const relation of baseline.catalog.relations){if(['users','users_id_seq'].includes(relation.name))continue;
      if(!isDeepStrictEqual(relation,after.catalog.relations.find(x=>x.name===relation.name)))throw Error('Unrelated relation changed');}
    save('security-checks.json',security);report.securityChecks='PASS';
    await client.query('ROLLBACK');progress('source-data-and-security-verified',{existingTables:Object.keys(baseline.tables).length,originalSequences:Object.keys(baseline.sequences).length});
    stage='non-destructive-route-checks';
    const{serveBookingTestApp}=await import(pathToFileURL(path.join(root,'server/test-support/booking-app.js')));
    // Real route definitions, startup migration/seeding suppressed. These cases
    // must return before storage; any accidental database use fails locally.
    const deniedPool={on(){},waitingCount:0,totalCount:0,idleCount:0,connect(){throw Error('No storage permitted in anonymous route checks')}};
    const api=await serveBookingTestApp(deniedPool);
    try{
      await api.request('POST','/api/login',{},400);await api.request('GET','/api/me',undefined,401);
      await api.request('GET','/api/recovery-email-verification/status',undefined,503);
      await api.request('POST','/api/recovery-email-verification/request',{},503);
      await api.request('POST','/api/recovery-email-verification/confirm',{},503);
    }finally{await api.close();}
    report.nonDestructiveRoutes={loginValidation:true,anonymousSessionDenied:true,verificationDisabled:true,storageAccess:false,successfulRealUserLoginsTested:false};
    let originValid=false,originLocal=false;try{const u=new URL(process.env.APP_URL);originValid=['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;originLocal=['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{}
    report.deploymentConfiguration={originValid,originLocal,senderConfigured:!!process.env.RECOVERY_EMAIL_FROM,providerKeyConfigured:!!process.env.RESEND_API_KEY,
      liveDeploymentTested:false,realDeliveryTested:false,recipientConfirmed:false};
    report.deploymentChecks=originValid&&report.deploymentConfiguration.senderConfigured&&report.deploymentConfiguration.providerKeyConfigured?'PASS':'FAIL';
    report.activationReady=false;report.remaining=['Feature flags deliberately disabled','Confirm intended APP_URL; current origin is local','Restart/deploy current backend and rebuild frontend for future activation','Confirm controlled administrator/recipient and separately authorize real email','Successful real-user login and live delivery were not exercised to avoid session/account writes'];
    progress('non-destructive-checks-completed',{flagsDisabled:true,realEmailSent:false});
  }catch(error){
    // Clear only an uncommitted failed SQL transaction. Never run a rollback migration.
    await client.query('ROLLBACK').catch(()=>{});
    report.errorCode=error.code||error.name;report.failedStage=stage;report.stopped=true;
    if(report.backup==='NOT_RUN')report.backup='FAIL';
    if(stage==='apply-migration006'&&!migrationCommitted)report.migration006='FAIL';
    if(stage==='post-migration-integrity')report.existingDataIntegrity='FAIL';
    if(stage==='security-and-schema')report.securityChecks='FAIL';
    if(stage==='non-destructive-route-checks')report.deploymentChecks='FAIL';
    progress('stopped-no-automatic-recovery',{stage,errorCode:report.errorCode,migrationCommitted});process.exitCode=1;
  }finally{
    clearInterval(heartbeat);
    report.migrationCommitted=migrationCommitted;report.finishedAt=new Date().toISOString();report.reportDirectory=directory;
    save('deployment-report.json',report);await client.end().catch(()=>{});
    console.log(JSON.stringify({backup:report.backup,migration006:report.migration006,existingDataIntegrity:report.existingDataIntegrity,
      securityChecks:report.securityChecks,deploymentChecks:report.deploymentChecks,migrationCommitted,readyToUse:false,reportDirectory:directory}));
  }
}
module.exports={copyField,validateCopyData};
if(require.main===module)main().catch(error=>{console.log(JSON.stringify({stopped:true,errorCode:error.code||error.name,databaseChangesNotAttempted:true}));process.exitCode=1;});
