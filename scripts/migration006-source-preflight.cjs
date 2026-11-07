// Explicit source READ-ONLY preflight. No migration, application startup or email.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { Client } = require('pg');
const { verifiedPostgresConfig } = require('./lib/supabase-verified-tls.cjs');
const { guardReadOnlyConnection } = require('./lib/read-only-preflight-guard.cjs');
const { compareCatalogs } = require('./verify-migration006-backup.cjs');
const hash = x => createHash('sha256').update(x).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const expectedSQL = '5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe';

async function main() {
  if (!process.argv.includes('--approved-source-read-only')) throw Error('Explicit read-only source preflight required');
  const root = process.cwd();
  const { loadEnv } = await import(pathToFileURL(path.join(root,'server/env.js')));
  loadEnv(root);
  const { projectFingerprint } = await import(pathToFileURL(path.join(root,'server/test-support/isolated-postgres.js')));
  if (projectFingerprint(process.env.DATABASE_URL) !== '868295d24a51'
    || projectFingerprint(process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL) !== '3ae16e4ead10') throw Error('Approved project identities changed');
  if (hash(fs.readFileSync('server/migrations/006_admin_recovery_email_verification.sql')) !== expectedSQL) throw Error('Reviewed SQL hash changed');
  const backupDir = path.join(process.env.LOCALAPPDATA,'DistrictLine/Backups/migration006-2026-11-07-2f69638c');
  const evidenceDir = path.join(backupDir,'diagnostic-NGHI2k');
  const backup = read(path.join(backupDir,'backup-report.json'));
  if (hash(fs.readFileSync(path.join(backupDir,'database.dump'))) !== backup.archiveSha256) throw Error('Backup archive checksum changed');
  const restored = read(path.join(evidenceDir,'approved-restore-verification-report.json'));
  const rehearsed = read(path.join(evidenceDir,'approved-isolated-rehearsal-kVtqOT/rehearsal-report.json'));
  if (!restored.applicationRestoreVerified || !restored.rollbackVerified || !rehearsed.pass || !rehearsed.baselineRecoveryVerified) throw Error('Validated recovery evidence missing');
  const expected = read(path.join(evidenceDir,'approved-source-expected-state.json'));
  const manifest = read(path.join(backupDir,'source-snapshot-manifest.json')).tables.filter(x => x.schema === 'public');
  const template = fs.readFileSync('scripts/verify-migration006-backup.cjs','utf8');
  const sql = name => { const value = template.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'))?.[1]; if (!value) throw Error('Catalog template unavailable'); return value; };
  const directory = fs.mkdtempSync(path.join(backupDir,'source-final-preflight-'));
  const save = (name,value) => fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2));
  const report = { startedAt:new Date().toISOString(),sourceFingerprint:'868295d24a51',databaseWrites:false,
    migrationExecuted:false,integrationTestsRun:false,emailsSent:false,reviewedSQLHash:expectedSQL,backupArchiveChecksumValid:true,
    priorRestoreVerified:true,isolatedRehearsalPassed:true,backupCreatedAt:backup.createdAt,
    actualVerificationFlagsEnabled:['ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION','VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION'].some(key => process.env[key]==='true'),
    reportDirectory:directory,sourceReadiness:'BLOCKED',backupReadiness:'BLOCKED',migration006Readiness:'BLOCKED' };
  save('source-preflight-report.json',report);
  const client = new Client({ ...verifiedPostgresConfig(process.env.DATABASE_URL), connectionTimeoutMillis:15000,
    options:'-c default_transaction_read_only=on',application_name:'district-authorized-final-source-readonly' });
  let stage = 'connect';
  try {
    await client.connect(); stage='identity';
    report.guard = await guardReadOnlyConnection(client);
    stage='schema-and-security';
    const catalog = (await client.query(sql('catalogSQL'))).rows[0].value;
    report.schemaComparison = compareCatalogs(expected.catalog,catalog);
    const defaults=(await client.query(sql('defaultsSQL'))).rows,roles=(await client.query(sql('rolesSQL'))).rows,memberships=(await client.query(sql('membershipsSQL'))).rows;
    report.defaultPrivilegesUnchanged=isDeepStrictEqual(defaults,expected.defaults);
    report.requiredRolesUnchanged=isDeepStrictEqual(roles,expected.roles);
    report.requiredMembershipsUnchanged=isDeepStrictEqual(memberships,expected.memberships);
    if (!report.schemaComparison.match || !report.defaultPrivilegesUnchanged || !report.requiredRolesUnchanged || !report.requiredMembershipsUnchanged)
      throw Object.assign(Error('Unexpected source schema/security drift'),{code:'SOURCE_SCHEMA_OR_SECURITY_DRIFT'});
    report.migrationVersions=(await client.query('SELECT version FROM public.schema_meta ORDER BY version')).rows.map(x=>x.version);
    report.migration005Installed=report.migrationVersions.includes(5)
      && catalog.relations.some(x=>x.name==='admin_username_recovery_tokens') && catalog.relations.some(x=>x.name==='admin_username_recovery_limits');
    report.migration006Installed=report.migrationVersions.includes(6);
    if (!isDeepStrictEqual(report.migrationVersions,[1,2,3,4,5])) throw Object.assign(Error('Unexpected migration baseline'),{code:'SOURCE_MIGRATION_DRIFT'});
    const permissions=(await client.query(`SELECT current_user=pg_get_userbyid(c.relowner) owns_users,
      has_schema_privilege(current_user,'public','CREATE') can_create,
      has_table_privilege(current_user,'public.schema_meta','INSERT') can_record_version,
      current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.users_id_seq'::regclass) owns_users_sequence,
      c.relrowsecurity users_rls,c.relforcerowsecurity users_force_rls FROM pg_class c WHERE c.oid='public.users'::regclass`)).rows[0];
    report.serverPermissions=permissions;
    if (!permissions.owns_users || !permissions.can_create || !permissions.can_record_version || !permissions.owns_users_sequence)
      throw Object.assign(Error('Migration permissions uncertain'),{code:'SOURCE_OWNER_PERMISSIONS'});
    report.existingUserCounts=(await client.query('SELECT role,status,count(*)::int count FROM public.users GROUP BY role,status ORDER BY role,status')).rows;
    report.adminEmailAudit=(await client.query(`SELECT count(*)::int administrators,
      count(*) FILTER(WHERE nullif(btrim(recovery_email),'') IS NULL)::int missing,
      count(*) FILTER(WHERE recovery_email IS NOT NULL AND recovery_email<>'' AND recovery_email<>lower(btrim(recovery_email)))::int noncanonical,
      count(*) FILTER(WHERE recovery_email IS NOT NULL AND recovery_email<>'' AND recovery_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')::int invalid,
      (SELECT count(*)::int FROM (SELECT lower(btrim(recovery_email)) FROM users WHERE role='admin' AND nullif(btrim(recovery_email),'') IS NOT NULL GROUP BY 1 HAVING count(*)>1) d) duplicate_groups
      FROM users WHERE role='admin'`)).rows[0];
    if (report.adminEmailAudit.noncanonical || report.adminEmailAudit.invalid || report.adminEmailAudit.duplicate_groups)
      throw Object.assign(Error('Administrator email conflict'),{code:'SOURCE_ADMIN_EMAIL_CONFLICT'});
    stage='backup-current-scope';
    const tables={},sequences={}; report.tableDifferences=[];report.sequenceDifferences=[];
    for (const table of manifest) {
      const name='"'+table.name.replaceAll('"','""')+'"';
      const actual=(await client.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) data_checksum FROM (SELECT md5(to_jsonb(t)::text) h FROM public.${name} t) z`)).rows[0];
      tables[table.name]=actual;
      if (actual.rows!==table.rows || actual.data_checksum!==table.data_checksum) report.tableDifferences.push(table.name);
    }
    for (const [name,previous] of Object.entries(expected.sequences)) {
      const identifier='"'+name.replaceAll('"','""')+'"';
      const actual=(await client.query(`SELECT last_value::text,is_called FROM public.${identifier}`)).rows[0];
      sequences[name]=actual;
      if (!isDeepStrictEqual(previous,actual)) report.sequenceDifferences.push(name);
    }
    save('source-current-state.json',{catalog,defaults,roles,memberships,tables,sequences});
    report.applicationTablesCompared=Object.keys(tables).length;report.sequencesCompared=Object.keys(sequences).length;
    report.backupAgeMinutes=Math.round((Date.now()-Date.parse(backup.createdAt))/60000);
    if (report.tableDifferences.length || report.sequenceDifferences.length) throw Object.assign(Error('Recovery backup is not current'),{code:'SOURCE_BACKUP_SCOPE_DRIFT'});
    const settings={originValid:false,originLocal:false};
    try {const u=new URL(process.env.APP_URL);settings.originValid=['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;
      settings.originLocal=['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{}
    report.applicationSettings={...settings,senderConfigured:Boolean(process.env.RECOVERY_EMAIL_FROM),providerKeyConfigured:Boolean(process.env.RESEND_API_KEY),realDeliveryTested:false};
    if(report.actualVerificationFlagsEnabled) throw Object.assign(Error('Feature must remain disabled'),{code:'SOURCE_FLAGS_UNEXPECTEDLY_ENABLED'});
    await client.query('ROLLBACK');
    report.sourceReadiness='PASS';report.backupReadiness='PASS';report.migration006Readiness='PASS';
    report.nextAction='AWAIT_FINAL_SOURCE_MIGRATION_APPROVAL';
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    report.failedStage=stage;report.errorCode=error.code||error.name;
    if(error.guardDiagnostics)report.guardDiagnostics=error.guardDiagnostics;
    report.nextAction='STOP_NO_WRITES';process.exitCode=1;
  } finally {
    report.finishedAt=new Date().toISOString();save('source-preflight-report.json',report);
    await client.end().catch(()=>{});console.log(JSON.stringify(report));
  }
}
if(require.main===module)main().catch(error=>{console.log(JSON.stringify({sourceReadiness:'BLOCKED',databaseWrites:false,errorCode:error.code||error.name}));process.exitCode=1;});
