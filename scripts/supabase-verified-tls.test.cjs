const test = require('node:test');
const assert = require('node:assert/strict');
const tls = require('node:tls');
const pg = require('pg');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { loadVerifiedRoot, verifiedPostgresConfig, expectedFingerprint } = require('./lib/supabase-verified-tls.cjs');
const url = 'postgresql://postgres.synthetic:synthetic-password@aws-0-synthetic.pooler.supabase.com:6543/postgres';

test('official root is pinned, unexpired, self-signed CA and loads into a local secure context', () => {
  const root = loadVerifiedRoot();
  assert.equal(root.fingerprint256, expectedFingerprint);
  assert.ok(Date.parse(root.validTo) > Date.now());
  assert.ok(tls.createSecureContext({ ca: root.pem }));
  assert.throws(() => loadVerifiedRoot(undefined, Date.UTC(2040, 0, 1)), /validity/);
});
test('pg receives explicit CA with no URL SSL replacement or verification overrides', () => {
  const config = verifiedPostgresConfig(url, {});
  assert.equal(config.port, 5432);
  assert.deepEqual(Object.keys(config.ssl).sort(), ['ca', 'minVersion']);
  assert.equal(config.connectionString, undefined);
  // Construction only: no socket or connection opened.
  const client = new pg.Client(config);
  assert.equal(client.connectionParameters.ssl.ca, loadVerifiedRoot().pem);
});
test('weak/ambiguous SSL options and unsafe process settings fail before connection', () => {
  for (const query of ['sslmode=disable', 'sslmode=no-verify', 'sslmode=require', 'sslmode=verify-ca', 'uselibpqcompat=true', 'sslrootcert=other.pem', 'host=other.example'])
    assert.throws(() => verifiedPostgresConfig(`${url}?${query}`, {}), /URL option/);
  assert.ok(verifiedPostgresConfig(`${url}?sslmode=verify-full`, {}).ssl.ca);
  assert.throws(() => verifiedPostgresConfig(url, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), /Unsafe/);
  assert.throws(() => verifiedPostgresConfig(url, { NODE_OPTIONS: '--require unexpected.cjs' }), /NODE_OPTIONS/);
});
test('standard Node hostname verification accepts pooler SAN and rejects other hostnames', () => {
  const cert = { subjectaltname: 'DNS:*.pooler.supabase.com', subject: { CN: '*.pooler.supabase.com' } };
  assert.equal(tls.checkServerIdentity('aws-0-synthetic.pooler.supabase.com', cert), undefined);
  assert.equal(tls.checkServerIdentity('other.example.test', cert).code, 'ERR_TLS_CERT_ALTNAME_INVALID');
});
test('preflight default command validates CA locally without opening a database connection', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'migration006-readonly-preflight.cjs')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.mode, 'local-tls-check');
  assert.equal(report.databaseConnections, 0);
  assert.equal(report.caValid, true);
});
