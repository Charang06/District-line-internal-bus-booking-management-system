const test = require('node:test');
const assert = require('node:assert/strict');
const { identitySQL, guardReadOnlyConnection } = require('./lib/read-only-preflight-guard.cjs');

function fixture({ initial = {}, final = {}, stream = {}, ignoreSettings = false } = {}) {
  const calls = [];
  const base = { current_user: 'postgres', session_user: 'postgres', database: 'postgres', read_only: 'on', default_read_only: 'on', version: '17.11' };
  let reads = 0, applied = false;
  const client = { connection: { stream: { encrypted: true, authorized: true, ...stream } },
    async query(sql) {
      calls.push(sql);
      if (sql === identitySQL) return { rows: [{ ...base, ...initial, ...(reads++ ? { default_read_only: applied ? 'on' : (initial.default_read_only || 'on'), ...final } : {}) }] };
      if (sql.startsWith('SET LOCAL')) applied = !ignoreSettings;
      return { rows: [] };
    } };
  return { client, calls };
}

test('all identity/read-only requirements pass before application inspection', async () => {
  const f = fixture();
  const report = await guardReadOnlyConnection(f.client);
  assert.equal(report.stage, 'passed');
  assert.ok(Object.values(report.finalChecks).every(Boolean));
  assert.equal(f.calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
});

test('missing startup default is explicitly set and rechecked without relaxing final requirements', async () => {
  const f = fixture({ initial: { default_read_only: 'off' } });
  const report = await guardReadOnlyConnection(f.client);
  assert.equal(report.initialChecks.sessionDefaultReadOnly, false);
  assert.equal(report.initialChecks.transactionReadOnly, true);
  assert.equal(report.finalChecks.sessionDefaultReadOnly, true);
  assert.equal(report.startupDefaultReadOnlyObserved, 'off');
  assert.ok(f.calls[2].includes('SET LOCAL default_transaction_read_only = on'));
});

test('role/database mismatches and writable transactions stop before configuration or inspection', async () => {
  for (const initial of [{ current_user: 'wrong' }, { session_user: 'wrong' }, { database: 'wrong' }, { read_only: 'off' }, { default_read_only: null }]) {
    const f = fixture({ initial });
    await assert.rejects(guardReadOnlyConnection(f.client), error => error.code === 'GUARD_REMOTE_IDENTITY_OR_TRANSACTION' && !!error.guardDiagnostics.initialChecks);
    assert.equal(f.calls.length, 2);
    assert.ok(!f.calls.some(sql => sql.startsWith('SET LOCAL')));
  }
});

test('unverified or unencrypted TLS stops without any SQL', async () => {
  for (const stream of [{ encrypted: false }, { authorized: false }, { authorized: undefined }]) {
    const f = fixture({ stream });
    await assert.rejects(guardReadOnlyConnection(f.client), error => error.code === 'GUARD_TLS_IDENTITY');
    assert.equal(f.calls.length, 0);
  }
});

test('ignored settings or final guard regressions fail closed and preserve exact failing checks', async () => {
  const cases = [{ initial: { default_read_only: 'off' }, ignoreSettings: true },
    { final: { read_only: 'off' } }, { final: { current_user: 'wrong' } }];
  for (const options of cases) {
    const f = fixture(options);
    await assert.rejects(guardReadOnlyConnection(f.client), error => error.code === 'GUARD_FINAL_READONLY_REQUIREMENTS'
      && Object.values(error.guardDiagnostics.finalChecks).some(x => !x));
    assert.equal(f.calls.length, 4);
  }
});

test('guard SQL contains only read-only transaction, identity SELECTs and LOCAL bounded settings', async () => {
  const f = fixture(); await guardReadOnlyConnection(f.client);
  assert.ok(f.calls.every(sql => /^(BEGIN|SELECT|SET LOCAL)/.test(sql)));
  const settings = f.calls[2];
  assert.ok(settings.includes("lock_timeout = '5s'"));
  assert.ok(settings.includes("statement_timeout = '60s'"));
  assert.ok(settings.includes("transaction_timeout = '10min'"));
  assert.ok(!/\b(ALTER|INSERT|UPDATE|DELETE|GRANT|CREATE|COMMIT)\b/.test(f.calls.join('\n')));
});
