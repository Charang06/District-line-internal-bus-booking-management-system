// Executes only the specifically approved 005/006 isolated rehearsal. No source connection.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const { verifiedPostgresConfig } = require('./lib/supabase-verified-tls.cjs');
const { guardReadOnlyConnection } = require('./lib/read-only-preflight-guard.cjs');
const { compareCatalogs } = require('./verify-migration006-backup.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const files = {
  migration005: ['server/migrations/005_admin_username_recovery.sql', 'c5022498d0945d8d002c680827d5badb0766084eb09cd74adaa7a05f0e8f6a76'],
  migration006: ['server/migrations/006_admin_recovery_email_verification.sql', '5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe'],
  rollback006: ['scripts/rollback-admin-recovery-email-verification.sql', '5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b'],
  rollback005: ['scripts/rollback-admin-username-recovery.sql', 'c25cfeb520e4684ee66d57c788a83c2e6387fbb45668297f065bc11268ddcd51'],
};

function approvedSQL(name) {
  const [file, expected] = files[name], bytes = fs.readFileSync(file);
  if (hash(bytes) !== expected) throw Object.assign(Error('Checksum mismatch'), { code: 'SQL_CHECKSUM_MISMATCH', stopImmediately: true });
  return bytes.toString('utf8');
}

function originalDataSQL(name, verificationColumn) {
  const row = name === 'users' && verificationColumn ? "(to_jsonb(t)-'recovery_email_verified_at')" : 'to_jsonb(t)';
  return `SELECT count(*)::text rows,md5(coalesce(string_agg(h,'' ORDER BY h),'')) data_checksum FROM
    (SELECT md5(${row}::text) h FROM public.${quote(name)} t) z`;
}

async function runTests(root, url, directory, progress) {
  const env = {};
  for (const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','ComSpec'])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { NODE_ENV: 'test', ISOLATED_REHEARSAL_DATABASE_URL: url,
    ISOLATED_REHEARSAL_PROJECT_FINGERPRINT: '3ae16e4ead10', ISOLATED_REHEARSAL_ALLOW_WRITES: 'synthetic-fixtures-only',
    ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION: 'false', VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION: 'false',
    ENABLE_ADMIN_USERNAME_RECOVERY: 'false' });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-isolation=none', '--test-concurrency=1', '--test-reporter=tap',
      'server/admin-username-recovery.postgres.test.js', 'server/admin-recovery-email-verification.postgres.test.js'],
    { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '', timedOut = false, shown = 0;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 300000);
    child.stdout.on('data', bytes => {
      stdout += bytes;
      const completed = [...stdout.matchAll(/^(?:not )?ok \d+ - /gm)].length;
      if (completed > shown) { shown = completed; progress('integration-test-progress', { completed }); }
    });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(directory, 'integration-tests.stdout'), stdout);
      fs.writeFileSync(path.join(directory, 'integration-tests.stderr'), stderr);
      const tests = [...stdout.matchAll(/^(not )?ok (\d+) - ([^\r\n]+)/gm)].map(m => ({ name: m[3], passed: !m[1] }));
      const count = label => Number(stdout.match(new RegExp(`^# ${label} (\\d+)`, 'm'))?.[1] || 0);
      resolve({ exitCode: code, timedOut, tests, total: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'),
        success: code === 0 && !timedOut && count('tests') === 4 && count('pass') === 4 && count('skipped') === 0 });
    });
  });
}

async function main() {
  if (!process.argv.includes('--execute-approved-rehearsal') || process.env.ISOLATED_005_006_REHEARSAL_APPROVAL !== 'one-restore-project-rehearsal-and-exact-recovery')
    throw Error('Explicit rehearsal approval required');
  const root = process.cwd();
  const { loadEnv } = await import(pathToFileURL(path.join(root, 'server/env.js')));
  loadEnv(root);
  const { projectFingerprint } = await import(pathToFileURL(path.join(root, 'server/test-support/isolated-postgres.js')));
  const targetURL = process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL;
  if (projectFingerprint(targetURL) !== '3ae16e4ead10' || projectFingerprint(process.env.DATABASE_URL) !== '868295d24a51')
    throw Error('Approved project identity mismatch');
  if (['ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION','VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION'].some(key => process.env[key] === 'true'))
    throw Error('Actual verification flags must remain disabled');
  for (const name of Object.keys(files)) approvedSQL(name);
  const base = path.join(process.env.LOCALAPPDATA, 'DistrictLine/Backups');
  const savedDir = path.join(base, 'migration006-2026-11-07-2f69638c/diagnostic-NGHI2k');
  const expected = read(path.join(savedDir, 'approved-target-after-state.json'));
  const archiveDir = path.join(base, 'test-2026-11-06-1312f8d1');
  if (hash(fs.readFileSync(path.join(archiveDir, 'database.dump'))) !== '36edcc0507c23560931c6897b53245e0a719ec5db59c85273b8f46dd8ed41580')
    throw Error('Recovery archive checksum mismatch');
  const directory = fs.mkdtempSync(path.join(savedDir, 'approved-isolated-rehearsal-'));
  const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2));
  const report = { startedAt: new Date().toISOString(), sourceConnected: false, sourceModified: false,
    targetFingerprint: '3ae16e4ead10', actualVerificationFlagsEnabled: false, realEmailSent: false,
    bookingTestsRun: false, fullDatabaseRestoreAttempted: false, operations: [] };
  const progress = (stage, details = {}) => { report.operations.push({ stage, at: new Date().toISOString(), ...details }); save('rehearsal-report.json', report); console.log(JSON.stringify({ stage, ...details })); };
  const template = fs.readFileSync(path.join(root, 'scripts/verify-migration006-backup.cjs'), 'utf8');
  const sql = name => { const value = template.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'))?.[1]; if (!value) throw Error('Catalog template unavailable'); return value; };
  const client = new Client({ ...verifiedPostgresConfig(targetURL), connectionTimeoutMillis: 15000,
    application_name: 'district-approved-one-005-006-rehearsal' });
  let baseline, applied005 = false, applied006 = false, forwardError = null, stopImmediately = false;

  const snapshot = async () => {
    try {
      const guard = await guardReadOnlyConnection(client);
      const catalog = (await client.query(sql('catalogSQL'))).rows[0].value;
      const defaults = (await client.query(sql('defaultsSQL'))).rows;
      const roles = (await client.query(sql('rolesSQL'))).rows;
      const memberships = (await client.query(sql('membershipsSQL'))).rows;
      const allRoles = (await client.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_roles ORDER BY rolname')).rows;
      const allMemberships = (await client.query('SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor ORDER BY 1,2,3')).rows;
      const namespaces = (await client.query("SELECT nspname,pg_get_userbyid(nspowner) owner,nspacl::text FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname")).rows;
      const tables = {}, sequences = {};
      for (const item of catalog.relations) {
        if (['r','p'].includes(item.kind)) tables[item.name] = (await client.query(originalDataSQL(item.name, false))).rows[0];
        if (item.kind === 'S') sequences[item.name] = (await client.query(`SELECT last_value::text,is_called FROM public.${quote(item.name)}`)).rows[0];
      }
      const versions = (await client.query('SELECT version FROM public.schema_meta ORDER BY version')).rows.map(x => x.version);
      const conflicts = (await client.query(`SELECT count(*)::int n FROM (
        SELECT lower(btrim(recovery_email)) FROM users WHERE role='admin' AND nullif(btrim(recovery_email),'') IS NOT NULL GROUP BY 1 HAVING count(*)>1
      ) q`)).rows[0].n;
      await client.query('ROLLBACK');
      return { guard, catalog, defaults, roles, memberships, tables, sequences, versions, conflicts, allRoles, allMemberships, namespaces };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  };
  const protectedDataCheck = async verificationColumn => {
    try {
      await guardReadOnlyConnection(client);
      const differences = [];
      for (const [name, old] of Object.entries(baseline.tables)) {
        if (name === 'schema_meta') continue;
        const actual = (await client.query(originalDataSQL(name, verificationColumn))).rows[0];
        if (!isDeepStrictEqual(old, actual)) differences.push(name);
      }
      await client.query('ROLLBACK');
      if (differences.length) throw Object.assign(Error('Unexpected original record changes'), { code: 'ORIGINAL_RECORD_DIFFERENCE', stopImmediately: true, tables: differences });
      return true;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  };
  const executeSQL = async name => {
    // Original file bytes execute unchanged, including their own BEGIN/COMMIT.
    try { await client.query(approvedSQL(name)); }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  };
  const securityChecks = async () => {
    const tables = ['users','admin_username_recovery_tokens','admin_username_recovery_limits','admin_recovery_email_verification_tokens','admin_recovery_email_verification_limits'];
    const results = { rls: [], clientPrivileges: [], denialProbes: [], constraints: {} };
    await guardReadOnlyConnection(client);
    try {
      for (const table of tables) {
        const row = (await client.query('SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass', ['public.'+table])).rows[0];
        if (!row?.relrowsecurity || row.relforcerowsecurity || row.owner !== 'postgres') throw Error('RLS/owner check failed');
        results.rls.push({ table, passed: true });
        for (const role of ['anon','authenticated']) {
          const row = (await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') exposed", [role, 'public.'+table])).rows[0];
          if (row.exposed) throw Error('Client grants remain');
          results.clientPrivileges.push({ role, table, denied: true });
        }
      }
      for (const sequence of ['users_id_seq','admin_username_recovery_tokens_id_seq','admin_recovery_email_verification_tokens_id_seq'])
        for (const role of ['anon','authenticated']) {
          const row = (await client.query("SELECT has_sequence_privilege($1,$2,'USAGE,SELECT,UPDATE') exposed", [role,'public.'+sequence])).rows[0];
          if (row.exposed) throw Error('Client sequence grants remain');
        }
      const constraint = (await client.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='public.users'::regclass AND conname='users_admin_recovery_email_canonical' AND convalidated")).rows[0];
      const index = (await client.query("SELECT indisunique,indisvalid FROM pg_index WHERE indexrelid='public.users_admin_recovery_email_unique'::regclass")).rows[0];
      const notBackfilled = (await client.query('SELECT count(*)::int n FROM users WHERE recovery_email_verified_at IS NOT NULL')).rows[0];
      const ownerAccess = (await client.query("SELECT has_table_privilege(current_user,'public.users','SELECT') AND has_table_privilege(current_user,'public.users','UPDATE') AND has_table_privilege('service_role','public.users','SELECT') AND has_table_privilege('service_role','public.users','UPDATE') allowed")).rows[0];
      if (constraint.n !== 1 || !index?.indisunique || !index.indisvalid || notBackfilled.n || !ownerAccess.allowed) throw Error('Constraint/backfill/owner-access check failed');
      results.constraints = { canonicalValidated: true, uniqueIndexValid: true, noBackfill: true, ownerAndServiceAccess: true };
      await client.query('ROLLBACK');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    for (const role of ['anon','authenticated']) {
      for (const probe of [
        'SELECT 1 FROM public.users LIMIT 0',
        'UPDATE public.users SET recovery_email_verified_at=recovery_email_verified_at WHERE false',
        'SELECT 1 FROM public.admin_recovery_email_verification_tokens LIMIT 0',
      ]) {
        await client.query('BEGIN');
        try {
          await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s'");
          await client.query(`SET LOCAL ROLE ${quote(role)}`);
          const active = (await client.query('SELECT current_user role')).rows[0].role;
          if (active !== role) throw Error('Probe role not established');
          let denied = false;
          try { await client.query(probe); } catch (error) { if (error.code !== '42501') throw error; denied = true; }
          if (!denied) throw Error('Expected client denial absent');
          results.denialProbes.push({ role, kind: probe.startsWith('UPDATE') ? 'zero-row-update' : 'zero-row-select', denied: true });
        } finally { await client.query('ROLLBACK'); }
      }
    }
    return results;
  };

  try {
    await client.connect();
    baseline = await snapshot();
    const baselineComparable = { catalog: baseline.catalog, defaults: baseline.defaults, roles: baseline.roles, memberships: baseline.memberships, tables: baseline.tables, sequences: baseline.sequences };
    if (!isDeepStrictEqual(baselineComparable, expected) || !isDeepStrictEqual(baseline.versions, [1,2,3,4]) || baseline.conflicts)
      throw Object.assign(Error('Baseline drift'), { code: 'BASELINE_DRIFT', stopImmediately: true });
    save('baseline-before.json', baseline);
    const lock = (await client.query('SELECT pg_try_advisory_lock(8216042,6006) locked')).rows[0];
    if (!lock.locked) throw Object.assign(Error('Another rehearsal owns lock'), { code: 'REHEARSAL_LOCK_BUSY', stopImmediately: true });
    // Narrow recovery prerequisites: these exact known baseline ACLs are restored,
    // never broadened or applied to another object/project.
    for (const [name, privileges] of [['users','arwdDxtm'], ['users_id_seq','rwU']]) {
      const relation = baseline.catalog.relations.find(x => x.name === name);
      const expectedAcl = ['anon','authenticated','postgres','service_role'].map(role => `${role}=${privileges}/postgres`).sort();
      if (relation.owner !== 'postgres' || relation.rls || relation.force_rls || !isDeepStrictEqual([...relation.grants].sort(), expectedAcl))
        throw Object.assign(Error('Recovery ACL not reviewed'), { code: 'UNEXPECTED_BASELINE_SECURITY', stopImmediately: true });
    }
    await client.query("SET lock_timeout='5s'; SET statement_timeout='30s'; SET transaction_timeout='5min'; SET idle_in_transaction_session_timeout='60s'; SET search_path=public,pg_catalog");
    progress('preflight-passed', { baselineTables: 18, baselineSequences: 16, tlsVerified: true, flagsDisabled: true });
    await executeSQL('migration005'); applied005 = true; report.migration005 = 'PASS'; progress('migration005-applied');
    await protectedDataCheck(false);
    await executeSQL('migration006'); applied006 = true; report.migration006 = 'PASS'; progress('migration006-applied');
    await protectedDataCheck(true);
    report.security = await securityChecks(); save('security-checks.json', report.security); progress('security-checks-passed');
    report.integration = await runTests(root, targetURL, directory, progress);
    save('integration-results.json', report.integration);
    progress('integration-tests-finished', { passed: report.integration.passed, failed: report.integration.failed, skipped: report.integration.skipped });
    if (!report.integration.success) forwardError = { code: 'INTEGRATION_TEST_FAILURE' };
    // Confirm fixture cleanup and every original table's data before recovery DDL.
    await protectedDataCheck(true);
  } catch (error) {
    forwardError = { code: error.code || error.name };
    stopImmediately = error.stopImmediately === true || error.code?.startsWith('GUARD_');
    report.error = forwardError;
    if (error.guardDiagnostics) report.guardDiagnostics = error.guardDiagnostics;
    if (error.tables) report.changedOriginalTables = error.tables;
    progress('forward-stage-stopped', { errorCode: forwardError.code, stopImmediately });
  }

  try {
    if (baseline && !stopImmediately) {
      if (applied006) { await executeSQL('rollback006'); applied006 = false; report.rollback006 = 'PASS'; progress('migration006-rolled-back'); }
      if (applied005) { await executeSQL('rollback005'); applied005 = false; report.rollback005 = 'PASS'; progress('migration005-rolled-back'); }
      if (report.migration005 === 'PASS' || report.migration006 === 'PASS') {
        const securitySQL = `BEGIN;
          SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'; SET LOCAL transaction_timeout='2min';
          ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
          GRANT ALL ON TABLE public.users TO anon,authenticated;
          GRANT ALL ON SEQUENCE public.users_id_seq TO anon,authenticated;
          COMMIT;`;
        save('security-recovery-plan.json', { approvedTargetFingerprint: '3ae16e4ead10', sql: securitySQL, originalGrants: baseline.catalog.relations.filter(x => ['users','users_id_seq'].includes(x.name)).map(x => ({ name:x.name, grants:x.grants, rls:x.rls, force_rls:x.force_rls })) });
        try { await client.query(securitySQL); }
        catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
        report.securityRestored = true; progress('captured-target-security-restored');
        report.sequencesRestored = [];
        for (const [name, old] of Object.entries(baseline.sequences)) {
          const actual = (await client.query(`SELECT last_value::text,is_called FROM public.${quote(name)}`)).rows[0];
          if (!isDeepStrictEqual(old, actual)) {
            await client.query('SELECT pg_catalog.setval($1::regclass,$2::bigint,$3::boolean)', ['public.'+name, old.last_value, old.is_called]);
            const checked = (await client.query(`SELECT last_value::text,is_called FROM public.${quote(name)}`)).rows[0];
            if (!isDeepStrictEqual(old, checked)) throw Error('Sequence recovery failed');
            report.sequencesRestored.push(name);
          }
        }
        progress('sequence-recovery-complete', { restored: report.sequencesRestored.length });
      }
      const after = await snapshot(); save('baseline-after.json', after);
      const { guard: _beforeGuard, ...beforeState } = baseline;
      const { guard: _afterGuard, ...afterState } = after;
      report.baselineRecoveryVerified = isDeepStrictEqual(beforeState, afterState);
      report.recoveryDifferences = report.baselineRecoveryVerified ? [] : compareCatalogs(baseline.catalog, after.catalog).differences;
      if (!report.baselineRecoveryVerified) throw Error('Exact baseline recovery failed');
      progress('exact-baseline-recovery-verified', { tables: Object.keys(after.tables).length, sequences: Object.keys(after.sequences).length, allRolesAndMemberships: true });
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    report.recoveryFailed = true; report.recoveryErrorCode = error.code || error.name;
    progress('recovery-failed-stop', { errorCode: report.recoveryErrorCode });
  } finally {
    report.applied005Remaining = applied005; report.applied006Remaining = applied006;
    report.pass = !forwardError && report.migration005 === 'PASS' && report.migration006 === 'PASS'
      && report.integration?.success === true && report.baselineRecoveryVerified === true && !report.recoveryFailed;
    report.finishedAt = new Date().toISOString();
    save('rehearsal-report.json', report);
    await client.end().catch(() => {});
    console.log(JSON.stringify({ pass: report.pass, recoveryVerified: report.baselineRecoveryVerified || false,
      sourceConnected: false, sourceModified: false, bookingTestsRun: false, migrationsRemaining: applied005 || applied006,
      reportDirectory: directory }));
    if (!report.pass) process.exitCode = 1;
  }
}

if (require.main === module) main().catch(error => { console.log(JSON.stringify({ stopped: true, errorCode: error.code || error.name, noAutomaticRetry: true })); process.exitCode = 1; });
