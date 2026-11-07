// Explicitly authorized, isolated restore verification only. Never executes migration 006.
// Credentials come from the existing environment; private artifacts stay outside the repo.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { Client } = require('pg');

const quote = s => '"' + s.replaceAll('"', '""') + '"';
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const hash = s => createHash('sha256').update(s).digest('hex');
const catalogSQL = `SELECT jsonb_build_object(
 'relations', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM (
   SELECT c.relname name,c.relkind kind,pg_get_userbyid(c.relowner) owner,
     c.relrowsecurity rls,c.relforcerowsecurity force_rls,
     ARRAY(SELECT a::text FROM unnest(c.relacl) a ORDER BY a::text) grants,
     (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
       'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
       'default',pg_get_expr(d.adbin,d.adrelid),
       'grants',ARRAY(SELECT z::text FROM unnest(a.attacl) z ORDER BY z::text)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m')
 ) x),
 'constraints', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.name) FROM (
   SELECT c.relname table_name,k.conname name,pg_get_constraintdef(k.oid) definition
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x),
 'indexes', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.indexname) FROM (
   SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') x),
 'triggers', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.name) FROM (
   SELECT c.relname table_name,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal) x),
 'functions', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.definition) FROM (
   SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) name,
     pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,
     ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text) grants
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS (
     SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) x),
 'policies', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.tablename,x.policyname) FROM (
   SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') x)
) value`;
const defaultsSQL = `SELECT pg_get_userbyid(d.defaclrole) role,n.nspname schema,d.defaclobjtype type,
 ARRAY(SELECT a::text FROM unnest(d.defaclacl) a ORDER BY a::text) grants
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 ORDER BY 1,2,3`;
const rolesSQL = `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
 rolreplication,rolbypassrls,rolconnlimit FROM pg_roles
 WHERE rolname IN ('postgres','anon','authenticated','service_role') ORDER BY rolname`;
const membershipsSQL = `SELECT r.rolname role,m.rolname member,a.admin_option,a.inherit_option,a.set_option
 FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
 WHERE m.rolname IN ('postgres','anon','authenticated','service_role') ORDER BY 1,2`;
const tableSQL = name => `SELECT count(*)::text rows,MD5(COALESCE(string_agg(h,'' ORDER BY h),'')) data_checksum
 FROM (SELECT MD5(to_jsonb(t)::text) h FROM public.${quote(name)} t) z`;

function normalizeFunctionText(text) {
  // Preserve line endings inside SQL literals/quoted identifiers: those can be data.
  const scan = input => {
    let out='',i=0,quoteMode=null,dollar=null,blockDepth=0,lineComment=false;
    while(i<input.length) {
      const rest=input.slice(i),ch=input[i];
      if(lineComment){if(rest.startsWith('\r\n')){out+='\n';i+=2;lineComment=false;}
        else{out+=ch;i++;if(ch==='\n')lineComment=false;}continue;}
      if(blockDepth){if(rest.startsWith('/*')){blockDepth++;out+='/*';i+=2;}
        else if(rest.startsWith('*/')){blockDepth--;out+='*/';i+=2;}
        else if(rest.startsWith('\r\n')){out+='\n';i+=2;}else{out+=ch;i++;}continue;}
      if(dollar) {if(rest.startsWith(dollar)){out+=dollar;i+=dollar.length;dollar=null;}else{out+=ch;i++;}continue;}
      if(quoteMode) {
        out+=ch;i++;
        if(ch==='\\'&&i<input.length){out+=input[i++];continue;}
        if(ch===quoteMode){if(input[i]===quoteMode)out+=input[i++];else quoteMode=null;}
        continue;
      }
      if(ch==="'"||ch==='"'){quoteMode=ch;out+=ch;i++;continue;}
      if(rest.startsWith('--')){lineComment=true;out+='--';i+=2;continue;}
      if(rest.startsWith('/*')){blockDepth=1;out+='/*';i+=2;continue;}
      const tag=rest.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if(tag){dollar=tag;out+=tag;i+=tag.length;continue;}
      if(rest.startsWith('\r\n')){out+='\n';i+=2;}else{out+=ch;i++;}
    }
    return out;
  };
  const body=text.match(/\bAS (\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$)([\s\S]*?)\1/);
  if(!body) return scan(text);
  const start=body.index,header=body[0].slice(0,body[0].length-body[2].length-body[1].length);
  return scan(text.slice(0,start))+header+scan(body[2])+body[1]+scan(text.slice(start+body[0].length));
}

// Only line-ending differences in function definitions are normalized. All other
// text and every privilege, owner, RLS flag and policy property remain strict.
function compareCatalogs(expected, actual) {
  const differences = [], normalizedFunctionLineEndings = [];
  const keys = { relations: x=>x.name, constraints: x=>`${x.table_name}.${x.name}`,
    indexes: x=>`${x.tablename}.${x.indexname}`, triggers: x=>`${x.table_name}.${x.name}`,
    functions: x=>x.name, policies: x=>`${x.tablename}.${x.policyname}` };
  function walk(a,b,object,property,functionText=false) {
    if (functionText && typeof a==='string' && typeof b==='string' && a!==b &&
      normalizeFunctionText(a)===normalizeFunctionText(b)) {
      normalizedFunctionLineEndings.push({object,property}); return;
    }
    if (a===b) return;
    if (a && b && typeof a==='object' && typeof b==='object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())
        walk(a[k],b[k],object,property?`${property}.${k}`:k,object.startsWith('functions:')&&k==='definition');
      return;
    }
    if (Array.isArray(a)&&Array.isArray(b)) {
      if (property==='columns') {
        const am=new Map(a.map(x=>[x.name,x])),bm=new Map(b.map(x=>[x.name,x]));
        for(const k of [...new Set([...am.keys(),...bm.keys()])].sort()) walk(am.get(k),bm.get(k),object,`columns.${k}`);
        // Column order is material even when definitions are equal.
        walk(a.map(x=>x.name),b.map(x=>x.name),object,'columnOrder'); return;
      }
      if (JSON.stringify(a)===JSON.stringify(b)) return;
    }
    // Do not place SQL bodies/default expressions/policy expressions into public
    // reports. Exact values remain in the access-restricted catalog snapshots.
    const safe = (x,p=property) => x===undefined ? {missing:true} : typeof x==='string' &&
      /definition|default|indexdef|qual|with_check/.test(p)
      ? {sha256:hash(x),characters:x.length} : Array.isArray(x)?x.map(v=>safe(v,p)):
      x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,safe(v,k)])):x;
    differences.push({object,property:property||'$object',expected:safe(a),actual:safe(b)});
  }
  for (const [group,key] of Object.entries(keys)) {
    const a=expected?.[group]||[],b=actual?.[group]||[];
    const am=new Map(a.map(x=>[key(x),x])),bm=new Map(b.map(x=>[key(x),x]));
    if (am.size!==a.length || bm.size!==b.length || [...am.keys(),...bm.keys()].includes(undefined))
      throw Error('Ambiguous catalog object identity');
    for(const name of [...new Set([...am.keys(),...bm.keys()])].sort())
      walk(am.get(name),bm.get(name),`${group}:${name}`,'');
  }
  return {match:differences.length===0,differences,normalizedFunctionLineEndings};
}

function boundRestoreTimeouts(sql) {
  const header=/^SET row_security = off;\r?$/gm;
  if ([...sql.matchAll(header)].length!==1) throw Error('Unrecognized restore header');
  return sql.replace(header,"SET row_security = off;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\nSET LOCAL transaction_timeout='10min';\nSET LOCAL idle_in_transaction_session_timeout='60s';");
}

const diagnosticPrefix='DISTRICT_RESTORE_DIAGNOSTIC:';
function buildDiagnosticSQL(manifest,sequences) {
  let sql="\nSET LOCAL timezone='UTC'; SET LOCAL search_path=public,pg_catalog;\n"+
    'CREATE TEMP TABLE district_restore_diagnostics(kind text,name text,payload jsonb) ON COMMIT DROP;\n';
  const capture=(kind,name,query)=>`DO $capture$ BEGIN
    INSERT INTO pg_temp.district_restore_diagnostics SELECT ${literal(kind)},${literal(name)},(${query});
    EXCEPTION WHEN OTHERS THEN INSERT INTO pg_temp.district_restore_diagnostics
      VALUES (${literal(kind)},${literal(name)},jsonb_build_object('errorCode',SQLSTATE));
    END $capture$;\n`;
  sql+=capture('catalog','public',catalogSQL);
  for(const x of manifest) sql+=capture('data',x.name,`SELECT to_jsonb(a) FROM (${tableSQL(x.name)}) a`);
  for(const x of sequences) sql+=capture('sequence',x.name,
    `SELECT jsonb_build_object('last_value',last_value::text,'is_called',is_called) FROM public.${quote(x.name)}`);
  sql+=`SELECT ${literal(diagnosticPrefix)} || COALESCE(jsonb_agg(to_jsonb(d) ORDER BY kind,name),'[]'::jsonb)::text FROM pg_temp.district_restore_diagnostics d;\n`;
  // No pass/fail exception here: every diagnostic is captured before rollback.
  return sql+'ROLLBACK;\n';
}

function evaluateDiagnostics(stdout,manifest,sequences,expected) {
  const lines=stdout.split(/\r?\n/).filter(x=>x.startsWith(diagnosticPrefix));
  if(lines.length!==1) throw Error('Missing or ambiguous restored diagnostics');
  const rows=JSON.parse(lines[0].slice(diagnosticPrefix.length));
  const get=(kind,name)=>rows.filter(x=>x.kind===kind&&x.name===name);
  const errors=[];
  const value=(kind,name)=>{const found=get(kind,name);if(found.length!==1||found[0].payload?.errorCode){
    errors.push({kind,name,errorCode:found[0]?.payload?.errorCode||'MISSING_OR_DUPLICATE'});return null;}return found[0].payload;};
  const restoredCatalog=value('catalog','public');
  const catalogComparison=restoredCatalog?compareCatalogs(expected,restoredCatalog):null;
  const dataChecks=manifest.map(x=>{const a=value('data',x.name);return {name:x.name,match:!!a&&a.rows===x.rows&&a.data_checksum===x.data_checksum};});
  const sequenceChecks=sequences.map(x=>{const a=value('sequence',x.name);return {name:x.name,
    expected:{last_value:x.last_value,is_called:x.is_called},actual:a,
    match:!!a&&a.last_value===x.last_value&&a.is_called===x.is_called};});
  return {restoredCatalog,catalogComparison,dataChecks,sequenceChecks,errors,
    pass:errors.length===0&&catalogComparison?.match===true&&dataChecks.every(x=>x.match)&&sequenceChecks.every(x=>x.match)};
}

async function auditRollback(before,readAfter) {
  const after=await readAfter();
  // No SQL-text normalization for rollback: the prior state must be exact.
  return {after,verified:isDeepStrictEqual(before,after)};
}

async function native(exe, args, env, directory, label) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', x => stdout += x);
    p.stderr.on('data', x => stderr += x);
    p.on('error', reject);
    p.on('close', code => {
      fs.writeFileSync(path.join(directory, label + '.stdout'), stdout);
      fs.writeFileSync(path.join(directory, label + '.stderr'), stderr);
      resolve({ code, stdout, stderr });
    });
  });
}

async function snapshot(c) {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await c.query("SET LOCAL timezone='UTC'; SET LOCAL search_path=public,pg_catalog; SET LOCAL statement_timeout='60s'");
    const catalog = (await c.query(catalogSQL)).rows[0].value;
    const defaults = (await c.query(defaultsSQL)).rows;
    const roles = (await c.query(rolesSQL)).rows;
    const memberships = (await c.query(membershipsSQL)).rows;
    const tables = {};
    const sequences = {};
    for (const x of catalog.relations || []) {
      if (['r','p'].includes(x.kind)) tables[x.name] = (await c.query(tableSQL(x.name))).rows[0];
      if (x.kind === 'S') sequences[x.name] = (await c.query(`SELECT last_value::text,is_called FROM public.${quote(x.name)}`)).rows[0];
    }
    return { catalog, defaults, roles, memberships, tables, sequences };
  } finally { await c.query('ROLLBACK'); }
}

async function main() {
  // Importing this module or running without an explicit remote-operation mode
  // must never load credentials, touch prior artifacts, or open a connection.
  if (!process.argv.includes('--execute-approved-test') && !process.argv.includes('--prepare-approved-test'))
    throw Error('Explicit remote-operation mode required');
  const root = process.cwd();
  const { loadEnv } = await import(pathToFileURL(path.join(root, 'server/env.js')));
  loadEnv(root);
  if (process.env.RESTORE_VERIFICATION_APPROVAL !== 'separate-project-temporary-permissions-rollback') throw Error('Explicit restore approval flag required');
  const backupDirectory = path.join(process.env.LOCALAPPDATA, 'DistrictLine', 'Backups', 'migration006-2026-11-07-2f69638c');
  const archive = path.join(backupDirectory, 'database.dump');
  const backup = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'backup-report.json')));
  if (hash(fs.readFileSync(archive)) !== backup.archiveSha256) throw Error('Archive hash mismatch');
  const source = new URL(process.env.DATABASE_URL), target = new URL(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL);
  const ref = u => u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] || decodeURIComponent(u.username).match(/\.([a-z0-9]+)$/)?.[1];
  if (!ref(source) || !ref(target) || ref(source) === ref(target)) throw Error('Distinct Supabase project IDs required');
  for (const u of [source,target]) if (u.hostname.endsWith('.pooler.supabase.com') && u.port === '6543') u.port = '5432';
  // Inherit the restricted backup-directory ACL and retain every prior run's evidence.
  const directory=fs.mkdtempSync(path.join(backupDirectory,'diagnostic-'));
  const save = (name, x) => fs.writeFileSync(path.join(directory, name), JSON.stringify(x, null, 2));
  const report = { startedAt: new Date().toISOString(), distinctProjectIdsConfirmed: true,
    sourceProjectFingerprint: hash(ref(source)).slice(0,12), restoreProjectFingerprint: hash(ref(target)).slice(0,12),
    sourceModified: false, migration006Executed: false, temporaryChangesCommitted: false,
    archiveSha256: backup.archiveSha256 };
  save('approved-restore-verification-report.json', report);
  const make = (u, readonly) => new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000, application_name: 'district-approved-backup-verification',
    options: readonly ? '-c default_transaction_read_only=on' : undefined });
  const s = make(source,true), t = make(target,false);
  let attempted = false, targetBefore;
  try {
    await s.connect(); await t.connect();
    const expected = await snapshot(s);
    if (!expected.tables.schema_meta || (await s.query('SELECT 1 FROM public.schema_meta WHERE version=6')).rowCount) throw Error('Unexpected source migration state');
    const manifest = JSON.parse(fs.readFileSync(path.join(backupDirectory,'source-snapshot-manifest.json'))).tables.filter(x => x.schema === 'public');
    // Schema/ACL expectations must still describe this backup. Data may legitimately change after backup.
    const savedAccess = JSON.parse(fs.readFileSync(path.join(backupDirectory,'source-access-snapshot.json')));
    for (const x of savedAccess) {
      const now = expected.catalog.relations.find(r => r.name === x.relname);
      if (!now || now.rls !== x.relrowsecurity || now.force_rls !== x.relforcerowsecurity ||
        JSON.stringify(now.grants) !== JSON.stringify(x.acl_entries)) throw Error('Source access drift; stop');
    }
    targetBefore = await snapshot(t);
    save('approved-source-expected-state.json', expected);
    save('approved-target-before-state.json', targetBefore);
    report.requiredRoleAttributesMatch = JSON.stringify(expected.roles) === JSON.stringify(targetBefore.roles);
    report.requiredRoleMembershipsMatch = JSON.stringify(expected.memberships) === JSON.stringify(targetBefore.memberships);
    if (!report.requiredRoleAttributesMatch || !report.requiredRoleMembershipsMatch) throw Error('Required roles differ; no role changes authorized');
    const identity = (await t.query('SELECT current_user,session_user')).rows[0];
    if (identity.current_user !== 'postgres' || identity.session_user !== 'postgres') throw Error('Unexpected restore role');
    // Only remove inherited default grants responsible for extra access to newly restored objects.
    // Changes affect postgres-created public tables/sequences inside this transaction only.
    const adjustments = [];
    for (const x of targetBefore.defaults.filter(x => x.role==='postgres' && x.schema==='public' && ['r','S'].includes(x.type))) {
      for (const grant of x.grants) {
        const grantee = grant.split('=')[0];
        if (['anon','authenticated','service_role',''].includes(grantee)) adjustments.push(
          `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ${x.type==='r'?'TABLES':'SEQUENCES'} FROM ${grantee ? quote(grantee) : 'PUBLIC'};`);
      }
    }
    report.temporaryPermissionSQL = adjustments;
    const bin = path.join(process.env.TEMP,'district-pg17-portable');
    const list = fs.readFileSync(path.join(backupDirectory,'archive-contents.list'),'utf8').split('\n').map(l =>
      (/^\d+; \d+ \d+ SCHEMA - public\s/.test(l) || /DEFAULT ACL public .* supabase_admin$/.test(l.trim())) ? ';'+l : l).join('\n');
    const listPath = path.join(directory,'approved-restore.list'); fs.writeFileSync(listPath,list);
    const extract = await native(path.join(bin,'pg_restore.exe'), ['--file=-','--clean','--if-exists','--no-owner','--schema=public','--use-list='+listPath,archive], process.env,directory,'approved-extract');
    if (extract.code !== 0) throw Error('Archive extraction failed');
    const sql = boundRestoreTimeouts(extract.stdout);
    // Function bodies contain END; it is not top-level transaction control.
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql) || /^\\connect\b/m.test(sql)) throw Error('Unsafe archive transaction control');
    const sequences = [...sql.matchAll(/SELECT pg_catalog\.setval\('public\.([^']+)', (\d+), (true|false)\);/g)]
      .map(m=>({name:m[1],last_value:m[2],is_called:m[3]==='true'}));
    if(sequences.length!==17||new Set(sequences.map(x=>x.name)).size!==17) throw Error('Expected 17 unique sequence checks');
    for (const x of sequences) if (!sql.includes(`DROP SEQUENCE IF EXISTS public.${x.name};`) &&
      !sql.includes(`DROP TABLE IF EXISTS public.${x.name.replace(/_id_seq$/, '')};`)) throw Error('Sequence rollback cannot be guaranteed');
    const script = path.join(directory,'approved-transaction-restore.sql');
    fs.writeFileSync(script,"SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';\n"+adjustments.join('\n')+'\n'+sql+buildDiagnosticSQL(manifest,sequences));
    report.restoreScriptSha256 = hash(fs.readFileSync(script));
    save('approved-restore-verification-report.json',report);
    if (!process.argv.includes('--execute-approved-test')) {
      console.log(JSON.stringify({...report,preparedOnly:true,temporaryAdjustmentCount:adjustments.length})); return;
    }
    const env = {...process.env,PGHOST:target.hostname,PGPORT:target.port||'5432',PGDATABASE:decodeURIComponent(target.pathname.slice(1)),
      PGUSER:decodeURIComponent(target.username),PGPASSWORD:decodeURIComponent(target.password),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
    attempted = true;
    const result = await native(path.join(bin,'psql.exe'),['--no-psqlrc','--no-password','--tuples-only','--no-align','--single-transaction','--variable=ON_ERROR_STOP=1','--file='+script],env,directory,'approved-restore-test');
    report.restoreExitCode = result.code;
    let diagnostics=null;
    try {
      diagnostics=evaluateDiagnostics(result.stdout,manifest,sequences,expected.catalog);
      save('approved-restored-catalog.json',diagnostics.restoredCatalog);
      save('approved-restored-diagnostics.json',diagnostics);
      report.schemaDifferences=diagnostics.catalogComparison?.differences||[];
      report.normalizedFunctionLineEndings=diagnostics.catalogComparison?.normalizedFunctionLineEndings||[];
    } catch {report.diagnosticCaptureFailed=true;}
    // Always audit rollback, including a failed restore. No follow-up writes or retries.
    const rollback = await auditRollback(targetBefore,()=>snapshot(t)); save('approved-target-after-state.json',rollback.after);
    report.targetPriorStateRestored = rollback.verified;
    report.rollbackVerified = report.targetPriorStateRestored;
    report.applicationRestoreVerified = result.code===0 && report.rollbackVerified && diagnostics?.pass===true;
    report.dataTablesCompared = diagnostics?.dataChecks.length||0;
    report.applicationDataChecksPassed = !!diagnostics && diagnostics.dataChecks.every(x=>x.match);
    report.sequenceChecksPlanned = sequences.length;
    report.sequenceChecksCompleted = diagnostics?.sequenceChecks.length||0;
    report.sequenceChecksPassed = diagnostics?.sequenceChecks.filter(x=>x.match).length||0;
    report.restoredSchemaAndSecurityMatch = diagnostics?.catalogComparison?.match===true;
    report.diagnosticErrors=diagnostics?.errors||[];
    report.schemaAndSecurityComparisonCovers = ['columns','defaults','constraints','indexes','triggers','functions','owners','table/sequence/column/function ACLs','RLS flags','policies'];
    report.rolesRestored = false;
    report.rolesVerifiedCompatible = report.requiredRoleAttributesMatch && report.requiredRoleMembershipsMatch;
    report.fullSupabasePlatformCloneVerified = false;
    report.limitations = ['Managed Supabase schemas/default grants were preserved, not restored.',
      'Required roles and memberships were compared, not recreated; passwords are excluded from the roles export.',
      'External Storage files and platform secrets are not included in a database-only restore.'];
    report.finishedAt = new Date().toISOString();
    save('approved-restore-verification-report.json',report);
    console.log(JSON.stringify({applicationRestoreVerified:report.applicationRestoreVerified,rollbackVerified:report.rollbackVerified,
      differenceCount:report.schemaDifferences?.length||0,sequenceChecksCompleted:report.sequenceChecksCompleted,
      sequenceChecksPassed:report.sequenceChecksPassed,migration006Executed:false}));
    if (!report.applicationRestoreVerified) process.exitCode=1;
  } catch(e) {
    report.failed=true;report.errorCode=e.code||e.name;
    if (attempted && targetBefore && report.rollbackVerified===undefined) {
      try {const rollback=await auditRollback(targetBefore,()=>snapshot(t));save('approved-target-after-state.json',rollback.after);
        report.rollbackVerified=rollback.verified;
      } catch {report.rollbackVerified=false;}
    }
    save('approved-restore-verification-report.json',report);
    console.log(JSON.stringify({failed:true,errorCode:report.errorCode,rollbackVerified:report.rollbackVerified??null}));process.exitCode=1;
  } finally {await Promise.allSettled([s.end(),t.end()]);}
}

module.exports={compareCatalogs,normalizeFunctionText,boundRestoreTimeouts,buildDiagnosticSQL,evaluateDiagnostics,auditRollback,diagnosticPrefix};
if(require.main===module) main().catch(e=>{console.log(JSON.stringify({failed:true,errorCode:e.code||e.name}));process.exitCode=1;});
