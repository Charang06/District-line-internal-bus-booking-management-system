import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createPostgresEmailVerificationStore, createEmailVerificationService } from './admin-recovery-email-verification.js'
import { isolatedTestOptions, openIsolatedPool, syntheticAccounts, removeSyntheticAccounts, savepointPool } from './test-support/isolated-postgres.js'

const digest = x => createHash('sha256').update(x).digest('hex')

test('isolated PostgreSQL email verification: expiry, constraints, trigger invalidation, limits and permissions', isolatedTestOptions, async t => {
  const pool = await openIsolatedPool()
  const client = await pool.connect()
  t.after(async () => { try { await client.query('ROLLBACK') } finally { client.release(); await pool.end() } })
  await client.query('BEGIN')
  const fixture = await syntheticAccounts(client), actor = { id: fixture.admin.id, role: 'admin' }
  const store = createPostgresEmailVerificationStore(savepointPool(client)), deliveries = []
  const service = createEmailVerificationService({ store, config: { enabled: true, ready: true },
    sendEmail: async payload => { deliveries.push(payload); return true } })
  const ip = `synthetic-${fixture.suffix}`
  assert.equal((await service.status(actor)).body.verified, false)
  assert.equal((await service.request({ id: fixture.staff.id, role: 'staff' }, ip)).status, 403)
  assert.equal((await service.request(actor, ip)).status, 200)
  const token = deliveries[0].token
  const saved = (await client.query(`SELECT user_id,email,token_hash,EXTRACT(EPOCH FROM expires_at-created_at) AS ttl
    FROM admin_recovery_email_verification_tokens WHERE user_id=$1 AND token_hash=$2`, [actor.id, digest(token)])).rows[0]
  assert.equal(saved.user_id, actor.id); assert.equal(saved.email, fixture.admin.email)
  assert.ok(saved.token_hash !== token && saved.token_hash === digest(token))
  // clock_timestamp issuance can follow transaction timestamp; test actual expiry instead.
  const lifetime = (await client.query('SELECT EXTRACT(EPOCH FROM expires_at-clock_timestamp()) AS remaining FROM admin_recovery_email_verification_tokens WHERE token_hash=$1', [digest(token)])).rows[0]
  assert.ok(Number(lifetime.remaining) > 1170 && Number(lifetime.remaining) <= 1200)
  assert.equal((await service.request(actor, ip)).status, 429)
  assert.equal((await service.confirm(token, ip)).status, 200)
  assert.equal((await service.confirm(token, ip)).status, 400)
  assert.equal((await service.status(actor)).body.verified, true)

  const secondHash = digest(randomBytes(32))
  await client.query('UPDATE users SET recovery_email=$1 WHERE id=$2', [`changed-${fixture.admin.email}`, actor.id])
  assert.equal((await store.status(actor.id)).verified, false)
  await store.issue(actor.id, secondHash)
  await client.query('UPDATE users SET recovery_email=$1 WHERE id=$2', [fixture.admin.email, actor.id])
  assert.equal(await store.consume(secondHash), false)
  const expired = digest(randomBytes(32)); await store.issue(actor.id, expired)
  await client.query("UPDATE admin_recovery_email_verification_tokens SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE token_hash=$1 AND user_id=$2", [expired, actor.id])
  assert.equal(await store.consume(expired), false)
  for (const [value, code] of [[fixture.admin.email, '23505'], [` ${fixture.admin.email.toUpperCase()} `, '23514']]) {
    await client.query('SAVEPOINT invalid_email')
    await assert.rejects(client.query("UPDATE users SET role='admin',recovery_email=$1 WHERE id=$2", [value, fixture.staff.id]), error => error.code === code)
    await client.query('ROLLBACK TO SAVEPOINT invalid_email'); await client.query('RELEASE SAVEPOINT invalid_email')
  }
  for (const role of ['anon', 'authenticated']) {
    const result = (await client.query(`SELECT has_table_privilege($1,'public.users','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege($1,'public.admin_recovery_email_verification_tokens','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege($1,'public.admin_recovery_email_verification_limits','SELECT,INSERT,UPDATE,DELETE')
      OR has_sequence_privilege($1,'public.users_id_seq','USAGE,SELECT,UPDATE') AS exposed`, [role])).rows[0]
    assert.equal(result.exposed, false)
  }
  const rls = (await client.query("SELECT bool_and(relrowsecurity) AS enabled FROM pg_class WHERE oid IN ('public.users'::regclass,'public.admin_recovery_email_verification_tokens'::regclass,'public.admin_recovery_email_verification_limits'::regclass)")).rows[0]
  assert.equal(rls.enabled, true)
})

test('isolated PostgreSQL email verification: concurrent redemption succeeds once on a synthetic account', isolatedTestOptions, async t => {
  const pool = await openIsolatedPool()
  let fixture
  t.after(async () => { try { await removeSyntheticAccounts(pool, fixture) } finally { await pool.end() } })
  fixture = await syntheticAccounts(pool)
  const store = createPostgresEmailVerificationStore(pool), tokenHash = digest(randomBytes(32))
  const issued = await store.issue(fixture.admin.id, tokenHash)
  assert.equal(issued.email, fixture.admin.email)
  const results = await Promise.all([store.consume(tokenHash), store.consume(tokenHash)])
  assert.equal(results.filter(Boolean).length, 1)
  assert.equal((await store.status(fixture.admin.id)).verified, true)
})
