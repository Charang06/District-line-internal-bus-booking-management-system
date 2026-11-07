import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import express from 'express'
import { createUsernameRecoveryService, createUsernameRecoveryRouter, createUsernameRecoveryEmailSender, usernameRecoveryConfig } from './admin-username-recovery.js'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const testToken = 'a'.repeat(43)
const config = { enabled: true, ready: true }

// Explicit service-level test double. No server.js import or configured database access.
function fixture() {
  let now = 0
  const accounts = [{ id: 1, username: 'admin_test', role: 'admin', status: 'active', email: 'admin@example.test' },
    { id: 2, username: 'staff_test', role: 'staff', status: 'active', email: 'staff@example.test' }]
  const tokens = new Map()
  const deliveries = []
  const limits = new Map()
  const store = {
    async allow(scope, value, maximum, seconds = 900) {
      const key = `${scope}:${value}`
      let entry = limits.get(key)
      if (!entry || now - entry.start >= seconds * 1000) { entry = { count: 0, start: now }; limits.set(key, entry) }
      return ++entry.count <= maximum
    },
    async findAdmin(email) {
      const found = accounts.filter(a => a.role === 'admin' && a.email === email)
      return found.length === 1 && found[0].status === 'active' ? found[0] : null
    },
    async issue(userId, email, tokenHash) {
      if (this.rejectIssue) return false
      for (const t of tokens.values()) if (t.userId === userId) t.used = true
      tokens.set(tokenHash, { userId, email, used: false, expires: now + 1200000 })
      return true
    },
    async invalidate(tokenHash) { tokens.get(tokenHash).used = true },
    async consume(tokenHash) {
      const t = tokens.get(tokenHash)
      if (!t || t.used || t.expires <= now) return null
      const admin = await this.findAdmin(t.email)
      if (!admin || admin.id !== t.userId || t.used) return null
      t.used = true
      return admin.username
    },
  }
  const service = createUsernameRecoveryService({ store, config, tokenFactory: () => testToken, sendEmail: async details => { deliveries.push(details); return true } })
  return { service, store, accounts, tokens, deliveries, advance: ms => { now += ms } }
}

test('feature defaults off and refuses access without touching storage', async () => {
  assert.equal(usernameRecoveryConfig({}).enabled, false)
  const service = createUsernameRecoveryService({ store: new Proxy({}, { get() { throw Error('Storage must not be accessed') } }), config: { enabled: false, ready: true } })
  assert.equal((await service.request('admin@example.test', 'ip')).status, 503)
  assert.equal((await service.confirm(testToken, 'ip')).status, 503)
})

test('canonical email origin rejects credentials, paths, non-HTTPS production and missing settings', () => {
  const env = { ENABLE_ADMIN_USERNAME_RECOVERY: 'true', NODE_ENV: 'production', APP_URL: 'https://example.test', RESEND_API_KEY: 'test', RECOVERY_EMAIL_FROM: 'security@example.test' }
  assert.equal(usernameRecoveryConfig(env).ready, true)
  for (const APP_URL of ['http://example.test', 'https://name:pass@example.test', 'https://example.test/path', 'https://example.test/?x=y', 'https://example.test/#fragment', 'invalid']) {
    assert.equal(usernameRecoveryConfig({ ...env, APP_URL }).ready, false)
  }
  assert.equal(usernameRecoveryConfig({ ...env, RESEND_API_KEY: '' }).ready, false)
})

test('active admin receives a link; username, raw token and account existence are absent from response/storage', async () => {
  const f = fixture()
  const before = structuredClone(f.accounts)
  const result = await f.service.request('  ADMIN@EXAMPLE.TEST  ', 'ip')
  assert.equal(result.status, 200)
  assert.equal(f.deliveries.length, 1)
  assert.equal(f.deliveries[0].email, 'admin@example.test')
  assert.equal(f.deliveries[0].tokenHash, digest(testToken))
  assert.equal(f.tokens.has(testToken), false)
  assert.ok(!JSON.stringify(result).includes(testToken))
  assert.ok(!JSON.stringify(result).includes('admin_test'))
  assert.deepEqual(f.accounts, before)
})

test('unknown, invalid, missing, staff and disabled addresses receive the same generic response as an admin', async () => {
  const valid = await fixture().service.request('admin@example.test', 'ip')
  for (const email of ['unknown@example.test', 'staff@example.test', 'not-email', '', null, {}, 'a'.repeat(255)]) {
    const f = fixture()
    assert.deepEqual(await f.service.request(email, 'ip'), valid)
    assert.equal(f.deliveries.length, 0)
  }
  const f = fixture()
  f.accounts[0].status = 'inactive'
  assert.deepEqual(await f.service.request('admin@example.test', 'ip'), valid)
  assert.equal(f.deliveries.length, 0)
})

test('duplicate admin email fails closed without disclosing or modifying the accounts', async () => {
  const f = fixture()
  f.accounts.push({ ...f.accounts[0], id: 3, username: 'other_admin' })
  const before = structuredClone(f.accounts)
  const expected = await fixture().service.request('unknown@example.test', 'ip')
  assert.deepEqual(await f.service.request('admin@example.test', 'ip'), expected)
  assert.equal(f.deliveries.length, 0)
  assert.deepEqual(f.accounts, before)
})

test('per-address cooldown works across IPs; per-IP limits cover unknown emails too', async () => {
  const f = fixture()
  const first = await f.service.request('admin@example.test', 'ip')
  assert.deepEqual(await f.service.request('admin@example.test', 'different-ip'), first)
  assert.equal(f.deliveries.length, 1)
  f.advance(900000)
  await f.service.request('admin@example.test', 'ip')
  assert.equal(f.deliveries.length, 2)
  const g = fixture()
  for (let i = 0; i < 20; i++) await g.service.request(`unknown${i}@example.test`, 'ip')
  assert.deepEqual(await g.service.request('admin@example.test', 'ip'), first)
  assert.equal(g.deliveries.length, 0)
})

test('link reveals only the administrator username, once, without changing accounts', async () => {
  const f = fixture()
  const before = structuredClone(f.accounts)
  await f.service.request('admin@example.test', 'ip')
  assert.deepEqual(await f.service.confirm(testToken, 'ip'), { status: 200, body: { username: 'admin_test' } })
  assert.equal((await f.service.confirm(testToken, 'ip')).status, 400)
  assert.deepEqual(f.accounts, before)
})

test('tokens expire at 20 minutes; malformed, unknown and reused links have generic errors', async () => {
  const f = fixture()
  await f.service.request('admin@example.test', 'ip')
  f.advance(1200000)
  const expired = await f.service.confirm(testToken, 'ip')
  assert.equal(expired.status, 400)
  for (const token of [undefined, {}, 'short', 'b'.repeat(43), '<script>']) assert.deepEqual(await f.service.confirm(token, 'ip'), expired)
})

test('role, status, changed email and a new duplicate prevent username disclosure', async () => {
  for (const change of [f => { f.accounts[0].role = 'staff' }, f => { f.accounts[0].status = 'inactive' }, f => { f.accounts[0].email = 'changed@example.test' }, f => { f.accounts.push({ ...f.accounts[0], id: 3 }) }]) {
    const f = fixture()
    await f.service.request('admin@example.test', 'ip')
    change(f)
    assert.equal((await f.service.confirm(testToken, 'ip')).status, 400)
  }
})

test('failed or throwing delivery invalidates token and still returns a generic response', async () => {
  for (const sendEmail of [async () => false, async () => { throw Error('private provider detail') }]) {
    const f = fixture()
    const service = createUsernameRecoveryService({ store: f.store, config, tokenFactory: () => testToken, sendEmail })
    const result = await service.request('admin@example.test', 'ip')
    assert.equal(result.status, 200)
    assert.equal((await service.confirm(testToken, 'ip')).status, 400)
    assert.ok(!JSON.stringify(result).includes('private'))
  }
})

test('account change during request cancels token issue without sending', async () => {
  const f = fixture()
  f.store.rejectIssue = true
  assert.equal((await f.service.request('admin@example.test', 'ip')).status, 200)
  assert.equal(f.deliveries.length, 0)
})

test('confirmation brute-force attempts are limited independently of password recovery', async () => {
  const f = fixture()
  for (let i = 0; i < 20; i++) assert.equal((await f.service.confirm('invalid', 'ip')).status, 400)
  assert.equal((await f.service.confirm('invalid', 'ip')).status, 429)
  f.advance(900000)
  assert.equal((await f.service.confirm('invalid', 'ip')).status, 400)
})

test('email uses existing Resend settings, distinct idempotency key and a fragment token; no real email sent', async () => {
  let request
  const sender = createUsernameRecoveryEmailSender({ origin: 'https://example.test', from: 'security@example.test', apiKey: 'test-only' }, async (url, options) => { request = { url, ...options }; return { ok: true } })
  assert.equal(await sender({ email: 'admin@example.test', token: testToken, tokenHash: digest(testToken) }), true)
  assert.equal(request.url, 'https://api.resend.com/emails')
  assert.equal(request.headers['Idempotency-Key'], `admin-username-recovery/${digest(testToken)}`)
  const body = JSON.parse(request.body)
  assert.deepEqual(body.to, ['admin@example.test'])
  assert.ok(body.text.includes(`/#recover-username?token=${testToken}`))
  assert.ok(body.text.includes('20 minutes'))
  assert.ok(!body.text.includes('admin_test'))
})

test('HTTP routes require POST, never set session cookies, prevent caching and redact storage errors', async (t) => {
  const f = fixture()
  const app = express()
  app.use(express.json())
  app.use('/api/username-recovery', createUsernameRecoveryRouter({ service: f.service }))
  const server = createServer(app).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api/username-recovery`
  assert.equal((await fetch(`${base}/confirm?token=${testToken}`)).status, 404)
  const request = await fetch(`${base}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', role: 'staff' }) })
  assert.equal(request.status, 200)
  assert.equal(request.headers.get('set-cookie'), null)
  assert.equal(request.headers.get('cache-control'), 'no-store')
  assert.equal(request.headers.get('referrer-policy'), 'no-referrer')
  const confirmation = await fetch(`${base}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: testToken, role: 'admin' }) })
  assert.deepEqual(await confirmation.json(), { username: 'admin_test' })
  assert.equal(confirmation.headers.get('set-cookie'), null)
  f.store.allow = async () => { throw Error('private account/SQL details') }
  const failure = await fetch(`${base}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(failure.status, 503)
  assert.ok(!(await failure.text()).includes('private'))
})
