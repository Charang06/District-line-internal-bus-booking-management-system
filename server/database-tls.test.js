import test from 'node:test'
import assert from 'node:assert/strict'
import tls from 'node:tls'
import { X509Certificate } from 'node:crypto'
import { databaseConnection } from './database-tls.js'

test('runtime TLS verifies CA and hostname and preserves transaction-pool port', () => {
  const config = databaseConnection('postgresql://postgres.synthetic:secret@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=require', {})
  assert.equal(config.port, 6543)
  assert.equal(config.ssl.rejectUnauthorized, true)
  assert.equal(config.ssl.servername, config.host)
  assert.ok(new X509Certificate(config.ssl.ca).ca)
  assert.equal(config.connectionString, undefined)
  assert.ok(tls.checkServerIdentity('wrong.example.test', { subjectaltname: 'DNS:expected.example.test' }))
})
test('TLS bypasses fail closed; plaintext is limited to nonproduction localhost', () => {
  const remote = 'postgresql://user:password@db.synthetic.supabase.co/postgres'
  for (const env of [{ DATABASE_SSL: 'disable' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }]) assert.throws(() => databaseConnection(remote, env))
  for (const query of ['sslmode=disable', 'sslmode=no-verify', 'sslrootcert=other']) assert.throws(() => databaseConnection(remote + '?' + query, {}))
  assert.equal(databaseConnection('postgresql://user:pw@localhost/test', { DATABASE_SSL: 'disable' }).ssl, false)
  assert.throws(() => databaseConnection('postgresql://user:pw@localhost/test', { NODE_ENV: 'production', DATABASE_SSL: 'disable' }))
})
