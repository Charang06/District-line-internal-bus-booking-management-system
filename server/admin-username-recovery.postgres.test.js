import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'
import { createPostgresUsernameRecoveryStore } from './admin-username-recovery.js'
import { isolatedTestOptions as options, openIsolatedPool, syntheticAccounts, removeSyntheticAccounts, savepointPool } from './test-support/isolated-postgres.js'

// Explicit opt-in only. Normal npm test never connects to DATABASE_URL.
const digest = value => createHash('sha256').update(value).digest('hex')
const freshHash = () => digest(randomBytes(32))

test('PostgreSQL username recovery: real SQL, expiry, limits, permissions and account-change trigger', options, async (t) => {
  const pool = await openIsolatedPool()
  const client = await pool.connect()
  t.after(async () => { await client.query('ROLLBACK').catch(() => {}); client.release(); await pool.end() })
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout = '2s'")
  await client.query("SET LOCAL statement_timeout = '10s'")
  const fixture = await syntheticAccounts(client)
  const { id, email, username } = fixture.admin
  const { suffix } = fixture
  const store = createPostgresUsernameRecoveryStore(savepointPool(client))
  assert.equal((await store.findAdmin(email)).id, id)
  assert.equal(await store.findAdmin(fixture.staff.email), null)
  assert.equal(await store.issue(fixture.staff.id, fixture.staff.email, freshHash()), false)

  const scopeKey = `test-${suffix}`
  assert.equal(await store.allow('request-email', scopeKey, 1), true)
  assert.equal(await store.allow('request-email', scopeKey, 1), false)
  await client.query("UPDATE admin_username_recovery_limits SET window_started_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes' WHERE scope = 'request-email' AND key_hash = $1", [digest(`request-email:${scopeKey}`)])
  assert.equal(await store.allow('request-email', scopeKey, 1), true)

  const token = freshHash()
  assert.equal(await store.issue(id, email, token), true)
  const ttl = (await client.query('SELECT EXTRACT(EPOCH FROM (expires_at - created_at))::int AS seconds FROM admin_username_recovery_tokens WHERE token_hash = $1', [token])).rows[0]
  assert.equal(ttl.seconds, 1200)
  assert.equal(await store.consume(token), username)
  assert.equal(await store.consume(token), null)

  const expired = freshHash()
  await store.issue(id, email, expired)
  await client.query("UPDATE admin_username_recovery_tokens SET expires_at = clock_timestamp() - INTERVAL '1 second' WHERE token_hash = $1", [expired])
  assert.equal(await store.consume(expired), null)

  for (const [column, changed, original] of [
    ['recovery_email', `changed-${email}`, email],
    ['username', `ur_changed_${suffix}`, username],
    ['role', 'staff', 'admin'],
    ['status', 'inactive', 'active'],
  ]) {
    const hash = freshHash()
    await store.issue(id, email, hash)
    // Only synthetic, uncommitted fixtures are edited. Existing users are untouched.
    await client.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [changed, id])
    await client.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [original, id])
    assert.equal(await store.consume(hash), null, `${column} change and revert must invalidate the link`)
  }

  // Migration 006 must reject ambiguity/noncanonical addresses, not admit bad fixtures.
  for (const [sql, params, code] of [
    ['UPDATE users SET role=$1,recovery_email=$2 WHERE id=$3', ['admin', email, fixture.staff.id], '23505'],
    ['UPDATE users SET recovery_email=$1 WHERE id=$2', [` ${email.toUpperCase()} `, id], '23514'],
  ]) {
    await client.query('SAVEPOINT invalid_email')
    await assert.rejects(client.query(sql, params), error => error.code === code)
    await client.query('ROLLBACK TO SAVEPOINT invalid_email'); await client.query('RELEASE SAVEPOINT invalid_email')
  }
  assert.equal((await store.findAdmin(email)).id, id)

  const tables = (await client.query("SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('admin_username_recovery_tokens'::regclass, 'admin_username_recovery_limits'::regclass)")).rows
  assert.equal(tables.length, 2)
  assert.ok(tables.every(row => row.relrowsecurity))
  for (const role of ['anon', 'authenticated']) {
    const permissions = (await client.query(`SELECT has_table_privilege($1, 'admin_username_recovery_tokens', 'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege($1, 'admin_username_recovery_limits', 'SELECT,INSERT,UPDATE,DELETE') AS exposed`, [role])).rows[0]
    assert.equal(permissions.exposed, false)
  }
})

test('PostgreSQL username recovery: concurrent token redemption succeeds exactly once', options, async (t) => {
  const pool = await openIsolatedPool()
  let fixture
  t.after(async () => { try { await removeSyntheticAccounts(pool, fixture) } finally { await pool.end() } })
  fixture = await syntheticAccounts(pool)
  const admin = fixture.admin
  const tokenHash = freshHash()
  const store = createPostgresUsernameRecoveryStore(pool)
  try {
    assert.equal(await store.issue(admin.id, admin.email, tokenHash), true)
    const results = await Promise.all([store.consume(tokenHash), store.consume(tokenHash)])
    assert.equal(results.filter(value => value !== null).length, 1)
    assert.equal(results.filter(value => value === null).length, 1)
  } finally {
    // Delete this test's generated recovery token only; never an account/session.
    await pool.query('DELETE FROM admin_username_recovery_tokens WHERE token_hash = $1', [tokenHash])
  }
})
