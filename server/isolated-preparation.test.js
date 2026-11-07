import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { projectFingerprint, isolatedConnectionConfig, isolatedTestsEnabled, requireEmptyApplication, syntheticAccounts, removeSyntheticAccounts, savepointPool, boundedTestPool } from './test-support/isolated-postgres.js'
import { bookingRouteSource, cookieSessionRequest } from './test-support/booking-app.js'

const target = 'postgresql://postgres.syntheticproject:syntheticpassword@aws-0-test.pooler.supabase.com:6543/postgres'
const env = { ISOLATED_REHEARSAL_ALLOW_WRITES: 'synthetic-fixtures-only', ISOLATED_REHEARSAL_DATABASE_URL: target,
  ISOLATED_REHEARSAL_PROJECT_FINGERPRINT: projectFingerprint(target) }

test('integration gate never falls back to source DATABASE_URL or old write flags', () => {
  assert.equal(isolatedTestsEnabled({ DATABASE_URL: target, USERNAME_RECOVERY_POSTGRES_TEST_ALLOW_WRITES: 'isolated-auth-tests' }), false)
  assert.throws(() => isolatedConnectionConfig({ DATABASE_URL: target }), /not explicitly enabled/)
  assert.throws(() => isolatedConnectionConfig({ ...env, DATABASE_URL: target }), /identity rejected/)
  assert.throws(() => isolatedConnectionConfig({ ...env, ISOLATED_REHEARSAL_PROJECT_FINGERPRINT: 'wrong' }), /identity rejected/)
  const config = isolatedConnectionConfig(env)
  assert.equal(config.port, 5432)
  assert.ok(config.options.includes('statement_timeout=15000')); assert.ok(config.ssl)
})

test('Supabase project identity parser rejects ambiguous hosts and non-database URLs', () => {
  for (const value of ['', 'not-a-url', 'https://db.syntheticproject.supabase.co',
    'postgresql://postgres.one:synthetic@db.two.supabase.co/postgres', 'postgresql://postgres:synthetic@localhost/postgres'])
    assert.equal(projectFingerprint(value), null)
  assert.equal(projectFingerprint('postgresql://postgres:synthetic@db.syntheticproject.supabase.co/postgres'), env.ISOLATED_REHEARSAL_PROJECT_FINGERPRINT)
})

test('isolated sessions apply timeouts before exposing queries, independently of startup options', async () => {
  const calls = [], pool = boundedTestPool({ connect: async () => ({ query: async sql => { calls.push(sql); return { rows: [] } }, release: () => calls.push('release') }) })
  await pool.query('SELECT 1')
  assert.ok(calls[0].includes("statement_timeout='15s'"))
  assert.ok(calls[0].includes("transaction_timeout='10min'"))
  assert.equal(calls[1], 'SELECT 1'); assert.equal(calls[2], 'release')
})

test('booking preflight refuses populated tables before any mutations', async () => {
  const calls = [], pool = { async query(sql) {
    calls.push(sql)
    if (sql.includes('pg_class')) return { rows: [{ relname: 'users' }, { relname: 'bookings' }] }
    return { rows: [{ occupied: sql.includes('"bookings"') }] }
  } }
  await assert.rejects(requireEmptyApplication(pool), /existing records are protected/)
  assert.ok(calls.every(sql => sql.trim().startsWith('SELECT')))
})

test('fixtures use only canonical synthetic emails and explicit IDs; cleanup matches generated IDs and names', async () => {
  const calls = [], client = { async query(...args) { calls.push(args); return { rows: [] } } }
  const fixture = await syntheticAccounts(client)
  assert.ok(fixture.admin.id < 0 && fixture.staff.id < 0)
  assert.match(fixture.admin.email, /^[a-z0-9-]+@example\.test$/)
  assert.equal(fixture.admin.email, fixture.admin.email.trim().toLowerCase())
  assert.equal(calls.length, 1); assert.ok(calls[0][0].startsWith('INSERT INTO users'))
  assert.ok(!calls[0][1].includes(fixture.password))
  await removeSyntheticAccounts(client, fixture)
  assert.deepEqual(calls[1][1], [fixture.admin.id, fixture.admin.username, fixture.staff.id, fixture.staff.username])
  assert.ok(!calls.some(([sql]) => /LIMIT 1|SELECT.*FROM users/.test(sql)))
  const count = calls.length
  await assert.rejects(removeSyntheticAccounts(client, { ...fixture, admin: { id: 1, username: 'existing_admin' } }), /identity rejected/)
  assert.equal(calls.length, count)
})

test('nested adapter transactions use savepoints and never commit the surrounding fixture transaction', async () => {
  const calls = [], pool = savepointPool({ query: async (...args) => { calls.push(args); return { rows: [] } } })
  const client = await pool.connect()
  await client.query('BEGIN'); await client.query('SELECT $1', [7]); await client.query('ROLLBACK')
  await client.query('BEGIN'); await client.query('COMMIT')
  assert.deepEqual(calls.map(x => x[0]), ['SAVEPOINT synthetic_1', 'SELECT $1', 'ROLLBACK TO SAVEPOINT synthetic_1', 'RELEASE SAVEPOINT synthetic_1', 'SAVEPOINT synthetic_2', 'RELEASE SAVEPOINT synthetic_2'])
  assert.deepEqual(calls[1][1], [7])
})

test('cookie request harness sends session cookie, never a Bearer token', async () => {
  const calls = [], request = cookieSessionRequest('http://127.0.0.1:12345', async (url, options) => {
    calls.push({ url, options }); return new Response('{}', { headers: calls.length === 1 ? { 'Set-Cookie': 'district_line_session=synthetic; HttpOnly; SameSite=Lax' } : {} })
  })
  await request('POST', '/api/login', { username: 'synthetic', password: 'synthetic' })
  await request('GET', '/api/me')
  assert.equal(calls[1].options.headers.Cookie, 'district_line_session=synthetic')
  assert.equal(calls[1].options.headers.Authorization, undefined)
  await assert.rejects(request('GET', 'https://unexpected.example.test'), /Unexpected/)
})

test('test-only loader preserves every route while removing startup migration/seeding/listening', () => {
  const source = readFileSync(new URL('./server.js', import.meta.url), 'utf8'), transformed = bookingRouteSource(source)
  assert.equal(transformed.includes('const databaseReady = ensureDatabaseReady()'), false)
  assert.equal(transformed.includes('app.listen(PORT'), false)
  assert.deepEqual(transformed.match(/app\.(?:get|post|patch|delete)\([^\n]+/g), source.match(/app\.(?:get|post|patch|delete)\([^\n]+/g))
  assert.throws(() => bookingRouteSource('unsupported entrypoint'), /requires review/)
})

test('actual route boot with fake PostgreSQL does not seed/migrate or connect; cookie login works locally', () => {
  const fixture = new URL('./test-support/booking-local-worker.mjs', import.meta.url)
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(fixture)], { encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, 'Local VM route harness failed; no remote database was involved')
  assert.ok(result.stdout.includes('LOCAL_MOCK_PASS'))
})
