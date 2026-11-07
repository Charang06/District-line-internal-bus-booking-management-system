import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import express from 'express'
import { recoveryEmailVerificationConfig, createEmailVerificationService, createEmailVerificationRouter,
  createPostgresEmailVerificationStore, createRecoveryEmailUpdateHandler, createVerificationEmailSender } from './admin-recovery-email-verification.js'

const hash = x => createHash('sha256').update(x).digest('hex')
const actor = { id: 7, role: 'admin' }
const env = { ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION: 'true', APP_URL: 'https://district.example.test', RESEND_API_KEY: 'synthetic-key', RECOVERY_EMAIL_FROM: 'security@example.test' }
function fixture() {
  let now = 0, serial = 0
  const user = { id: 7, role: 'admin', status: 'active', email: 'owner@example.test', verified: false }
  const tokens = new Map(), counters = new Map(), deliveries = []
  const store = {
    ready: true, duplicates: false,
    async schemaReady() { return this.ready },
    async allow(scope, key, maximum, seconds = 900) {
      const name = `${scope}:${key}`
      let entry = counters.get(name)
      if (!entry || now >= entry.start + seconds * 1000) { entry = { count: 0, start: now }; counters.set(name, entry) }
      return { allowed: ++entry.count <= maximum, retryAfter: Math.max(1, Math.ceil((entry.start + seconds * 1000 - now) / 1000)) }
    },
    async status(id) {
      if (id !== user.id || user.role !== 'admin' || user.status !== 'active') return { error: 'forbidden' }
      if (this.duplicates) return { error: 'conflict' }
      if (!user.email) return { error: 'missing' }
      return { id, email: user.email, verified: user.verified, retryAfter: 0 }
    },
    async issue(id, tokenHash) {
      const state = await this.status(id)
      if (state.error || state.verified) return state
      for (const t of tokens.values()) t.used = true
      tokens.set(tokenHash, { id, email: state.email, used: false, expires: now + 1200000 })
      return state
    },
    async invalidate(tokenHash) { tokens.get(tokenHash).used = true },
    async consume(tokenHash) {
      const t = tokens.get(tokenHash)
      if (!t || t.used || now >= t.expires || user.role !== 'admin' || user.status !== 'active'
        || user.id !== t.id || user.email !== t.email || this.duplicates) return false
      t.used = true; user.verified = true; return true
    },
  }
  const service = createEmailVerificationService({ store, config: { enabled: true, ready: true },
    tokenFactory: () => String(++serial).padStart(43, 'a'), sendEmail: async payload => { deliveries.push(payload); return !store.deliveryFails } })
  return { user, store, service, deliveries, tokens, counters,
    advance: ms => { now += ms }, changeEmail(email) { user.email = email; user.verified = false; for (const t of tokens.values()) t.used = true } }
}

test('verification defaults off; disabled or incomplete config never touches storage', async () => {
  assert.equal(recoveryEmailVerificationConfig({}).enabled, false)
  for (const config of [{ enabled: false, ready: true }, { enabled: true, ready: false }]) {
    const service = createEmailVerificationService({ config, store: new Proxy({}, { get() { throw Error('No database allowed') } }) })
    assert.equal((await service.status(actor)).status, 503)
    assert.equal((await service.request(actor, 'ip')).status, 503)
    assert.equal((await service.confirm('x', 'ip')).status, 503)
  }
})

test('approved migration 006 and its email-change invalidation trigger remain unchanged', () => {
  const sql = readFileSync(new URL('./migrations/006_admin_recovery_email_verification.sql', import.meta.url))
  assert.equal(createHash('sha256').update(sql).digest('hex'), '5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe')
})

test('configured origin is trusted and schema 006 is required before any token work', async () => {
  assert.equal(recoveryEmailVerificationConfig(env).ready, true)
  for (const APP_URL of ['http://example.test', 'https://name:password@example.test', 'https://example.test/path', 'https://example.test/?a=b', 'https://example.test/#x', 'invalid'])
    assert.equal(recoveryEmailVerificationConfig({ ...env, NODE_ENV: 'production', APP_URL }).ready, false)
  const f = fixture(); f.store.ready = false
  assert.equal((await f.service.request(actor, 'ip')).status, 503)
  assert.equal(f.tokens.size, 0); assert.equal(f.counters.size, 0)
})

test('valid issuance stores only hash and binds own stable ID/exact email; sending is not verification', async () => {
  const f = fixture(); assert.equal((await f.service.request(actor, 'ip')).status, 200)
  const sent = f.deliveries[0], persisted = f.tokens.get(hash(sent.token))
  assert.equal(sent.email, f.user.email); assert.equal(persisted.id, actor.id); assert.equal(persisted.email, f.user.email)
  assert.equal(sent.token.length, 43); assert.equal(sent.tokenHash, hash(sent.token)); assert.ok(!f.tokens.has(sent.token))
  assert.equal((await f.service.status(actor)).body.verified, false)
  const response = await f.service.confirm(sent.token, 'ip')
  assert.equal(response.status, 200); assert.equal((await f.service.status(actor)).body.verified, true)
  assert.ok(!JSON.stringify(response).includes(sent.token)); assert.ok(!JSON.stringify(response).includes(f.user.email))
})

test('expired, reused, malformed and unknown tokens fail; no sessions or passwords are issued', async () => {
  const f = fixture(); await f.service.request(actor, 'ip'); const token = f.deliveries[0].token
  f.advance(1200000); assert.equal((await f.service.confirm(token, 'ip')).status, 400); assert.equal(f.user.verified, false)
  const g = fixture(); await g.service.request(actor, 'ip'); const valid = g.deliveries[0].token
  assert.equal((await g.service.confirm(valid, 'ip')).status, 200)
  assert.equal((await g.service.confirm(valid, 'ip')).status, 400)
  for (const bad of ['bad', null, {}, 'z'.repeat(43)]) assert.equal((await fixture().service.confirm(bad, 'ip')).status, 400)
})

test('duplicate emails, staff, inactive and mismatched stable IDs cannot verify', async () => {
  const duplicate = fixture(); duplicate.store.duplicates = true
  assert.equal((await duplicate.service.request(actor, 'ip')).status, 409); assert.equal(duplicate.deliveries.length, 0)
  for (const mutate of [f => { f.store.duplicates = true }, f => { f.user.role = 'staff' }, f => { f.user.status = 'inactive' }, f => { f.user.id = 9 }, f => { f.user.email = 'other@example.test' }]) {
    const f = fixture(); await f.service.request(actor, 'ip'); mutate(f)
    assert.equal((await f.service.confirm(f.deliveries[0].token, 'ip')).status, 400)
    assert.equal(f.user.verified, false)
  }
  for (const denied of [null, { id: 7, role: 'staff' }, { role: 'admin' }]) {
    assert.equal((await fixture().service.request(denied, 'ip')).status, 403)
    assert.equal((await fixture().service.status(denied)).status, 403)
  }
})

test('email changes clear proof and tokens; changing back never resurrects a link', async () => {
  const f = fixture(); await f.service.request(actor, 'ip'); const first = f.deliveries[0].token
  f.changeEmail('new@example.test'); f.changeEmail('owner@example.test')
  assert.equal((await f.service.confirm(first, 'ip')).status, 400)
  f.advance(60000); await f.service.request(actor, 'ip')
  assert.equal((await f.service.confirm(f.deliveries[1].token, 'ip')).status, 200)
  f.changeEmail('new@example.test'); assert.equal((await f.service.status(actor)).body.verified, false)
})

test('resend cooldown/hour/IP limits persist independently; resend retires older links', async () => {
  const f = fixture(); await f.service.request(actor, 'ip')
  const limited = await f.service.request(actor, 'different-ip'); assert.equal(limited.status, 429); assert.equal(limited.body.retryAfter, 60)
  f.advance(60000); assert.equal((await f.service.request(actor, 'ip')).status, 200)
  assert.equal((await f.service.confirm(f.deliveries[0].token, 'ip')).status, 400)
  for (let n = 0; n < 3; n++) { f.advance(60000); assert.equal((await f.service.request(actor, 'ip')).status, 200) }
  f.advance(60000); assert.equal((await f.service.request(actor, 'ip')).status, 429)
  const g = fixture(); for (let n = 0; n < 20; n++) await g.service.confirm('bad', 'same-ip')
  assert.equal((await g.service.confirm('bad', 'same-ip')).status, 429)
  const h = fixture(); for (let n = 0; n < 20; n++) await h.service.request({ id: 99, role: 'admin' }, 'same-ip')
  assert.equal((await h.service.request(actor, 'same-ip')).status, 429)
})

test('single-use confirmation rejects a concurrent replay and failed delivery retires tokens', async () => {
  const f = fixture(); await f.service.request(actor, 'ip')
  assert.deepEqual((await Promise.all([f.service.confirm(f.deliveries[0].token, 'one'), f.service.confirm(f.deliveries[0].token, 'two')])).map(x => x.status).sort(), [200, 400])
  const g = fixture(); g.store.deliveryFails = true
  assert.equal((await g.service.request(actor, 'ip')).status, 503)
  assert.equal((await g.service.confirm(g.deliveries[0].token, 'ip')).status, 400)
})

function database({ duplicate = false, updateError, tokenAvailable = true, failVerification = false } = {}) {
  const calls = []
  const client = { release() { calls.push(['RELEASE']) }, async query(sql, params = []) {
    calls.push([sql, params])
    if (sql.startsWith('SELECT id, role')) return { rows: [{ id: 7, role: 'admin', status: 'active', recovery_email: 'owner@example.test', recovery_email_verified_at: null }] }
    if (sql.startsWith('SELECT id FROM users')) return { rows: duplicate ? [{ id: 8 }] : [] }
    if (sql.startsWith('SELECT u.id')) return { rows: [{ id: 7, email: 'owner@example.test' }] }
    if (sql.startsWith('UPDATE users SET recovery_email =') && updateError) throw updateError
    if (sql.startsWith('UPDATE admin_recovery_email_verification_tokens SET used_at=CURRENT_TIMESTAMP\n')) return { rows: tokenAvailable ? [{ id: 1 }] : [] }
    if (sql.startsWith('UPDATE users SET recovery_email_verified_at') && failVerification) throw Error('synthetic storage failure')
    return { rows: [], rowCount: 1 }
  } }
  return { calls, pool: { connect: async () => client, query: (...args) => client.query(...args) } }
}
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } })

test('email handler normalizes own address and invalidates password links in the same transaction', async () => {
  const db = database(), res = response()
  await createRecoveryEmailUpdateHandler(db)({ user: actor, body: { email: '  NEW@EXAMPLE.TEST ', userId: 99 } }, res)
  assert.equal(res.statusCode, 200)
  const update = db.calls.find(x => x[0].startsWith('UPDATE users SET recovery_email ='))
  assert.deepEqual(update[1], ['new@example.test', 7])
  assert.ok(db.calls.find(x => x[0].startsWith('UPDATE password_recovery_tokens')))
  assert.ok(db.calls.some(x => x[0] === 'COMMIT'))
})

test('invalid emails/unauthorized updates never reach storage; duplicates and constraints return safe 400/409', async () => {
  for (const email of ['invalid', {}, null, 'a'.repeat(255) + '@example.test']) {
    const db = database(), res = response(); await createRecoveryEmailUpdateHandler(db)({ user: actor, body: { email } }, res)
    assert.equal(res.statusCode, 400); assert.equal(db.calls.length, 0)
  }
  const cases = [{ duplicate: true, status: 409 },
    { updateError: { code: '23505', constraint: 'users_admin_recovery_email_unique', detail: 'SECRET' }, status: 409 },
    { updateError: { code: '23514', constraint: 'users_admin_recovery_email_canonical', detail: 'SECRET' }, status: 400 },
    { updateError: { code: '23505', constraint: 'unrelated', detail: 'SECRET' }, status: 503 }]
  for (const options of cases) {
    const db = database(options), res = response()
    await createRecoveryEmailUpdateHandler(db)({ user: actor, body: { email: 'new@example.test' } }, res)
    assert.equal(res.statusCode, options.status); assert.ok(!JSON.stringify(res.body).includes('SECRET'))
    if (options.updateError) assert.ok(db.calls.some(x => x[0] === 'ROLLBACK'))
  }
  const db = database(), res = response()
  await createRecoveryEmailUpdateHandler(db)({ user: { ...actor, role: 'staff' }, body: { email: 'a@example.test' } }, res)
  assert.equal(res.statusCode, 403); assert.equal(db.calls.length, 0)
})

test('Postgres redemption locks user before token, checks one-time consumption and rolls back failed verification', async () => {
  for (const options of [{}, { tokenAvailable: false }, { failVerification: true }]) {
    const db = database(options), store = createPostgresEmailVerificationStore(db.pool)
    if (options.failVerification) await assert.rejects(store.consume('HASH'))
    else assert.equal(await store.consume('HASH'), options.tokenAvailable !== false)
    const sql = db.calls.map(x => x[0])
    assert.ok(sql.find(x => x.startsWith('SELECT u.id')).includes('FOR UPDATE OF u'))
    const tokenIndex = sql.findIndex(x => x.startsWith('UPDATE admin_recovery_email_verification_tokens'))
    assert.ok(sql.findIndex(x => x.startsWith('SELECT u.id')) < tokenIndex)
    assert.ok(sql[tokenIndex].includes('expires_at>clock_timestamp()'))
    if (options.tokenAvailable === false) assert.ok(!sql.some(x => x.startsWith('UPDATE users SET recovery_email_verified_at')))
    if (options.failVerification) { assert.ok(sql.includes('ROLLBACK')); assert.ok(!sql.includes('COMMIT')) }
    assert.equal(sql.at(-1), 'RELEASE')
  }
})

test('Postgres issuance persists hashed token with exact email and 20-minute lifetime without marking verified', async () => {
  const db = database(); await createPostgresEmailVerificationStore(db.pool).issue(7, 'HASH')
  const insert = db.calls.find(x => x[0].startsWith('INSERT INTO admin_recovery_email_verification_tokens'))
  assert.deepEqual(insert[1], [7, 'owner@example.test', 'HASH']); assert.ok(insert[0].includes("INTERVAL '20 minutes'"))
  assert.ok(!db.calls.some(x => x[0].startsWith('UPDATE users')))
})

test('email sender uses trusted origin, independent idempotency and timeout; no real delivery', async () => {
  let sent
  const send = createVerificationEmailSender(recoveryEmailVerificationConfig(env), async (url, options) => { sent = { url, options }; return { ok: true } })
  assert.equal(await send({ email: 'owner@example.test', token: 'a'.repeat(43), tokenHash: 'HASH' }), true)
  const body = JSON.parse(sent.options.body)
  assert.ok(body.text.includes('https://district.example.test/#verify-recovery-email?token='))
  assert.equal(sent.options.headers['Idempotency-Key'], 'admin-recovery-email-verification/HASH')
  assert.ok(sent.options.signal); assert.ok(!body.text.includes('reset-password'))
})

test('HTTP endpoints require administrator session for own status/request, ignore body target, and redact errors', async t => {
  const f = fixture(), app = express(); app.use(express.json())
  const auth = (req, res, next) => { if (!req.headers['x-test-role']) return res.status(401).json({ message: 'Sign in' }); req.user = { id: 7, role: req.headers['x-test-role'] }; next() }
  const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.sendStatus(403)
  app.use('/verify', createEmailVerificationRouter({ env, service: f.service, authMiddleware: auth, requireAdmin: admin }))
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}/verify`
  assert.equal((await fetch(`${url}/status`)).status, 401)
  assert.equal((await fetch(`${url}/request`, { method: 'POST', headers: { 'x-test-role': 'staff' } })).status, 403)
  const result = await fetch(`${url}/request`, { method: 'POST', headers: { 'x-test-role': 'admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 99, email: 'attacker@example.test', role: 'admin' }) })
  assert.equal(result.status, 200); assert.equal(f.deliveries[0].email, 'owner@example.test')
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('set-cookie'), null)
  assert.equal((await fetch(`${url}/confirm`)).status, 404)
  assert.equal(f.user.verified, false)
  const confirmed = await fetch(`${url}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: f.deliveries[0].token }) })
  assert.equal(confirmed.status, 200); assert.equal(confirmed.headers.get('set-cookie'), null)
  f.store.status = () => { throw Error('SECRET token/provider payload') }
  const failure = await fetch(`${url}/status`, { headers: { 'x-test-role': 'admin' } })
  assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes('SECRET'))
})

test('disabled HTTP feature rejects before authentication middleware or database access', async t => {
  const app = express(); let authCalled = false
  app.use(createEmailVerificationRouter({ pool: {}, env: {}, authMiddleware: () => { authCalled = true }, requireAdmin: () => {} }))
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close() })
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/status`)).status, 503); assert.equal(authCalled, false)
})
