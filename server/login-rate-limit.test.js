import test from 'node:test'
import assert from 'node:assert/strict'
import { loginKeys, createLoginRateLimit } from './login-rate-limit.js'
const env = { ENABLE_LOGIN_RATE_LIMIT: 'true', LOGIN_RATE_LIMIT_KEY: 'synthetic-test-key-'.repeat(3) }
function response() { return { headers: {}, setHeader(k,v) { this.headers[k] = v }, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } } }
function memoryPool(clock) {
  const rows = new Map()
  return { rows, async query(sql, [scopes, keys]) {
    assert.match(sql, /ON CONFLICT/); assert.match(sql, /RETURNING/)
    return { rows: scopes.map((scope, i) => {
      const key = scope + keys[i], previous = rows.get(key)
      const row = !previous || previous.until <= clock() ? { scope, attempts: 0, until: clock() + 900000 } : previous
      row.attempts++; rows.set(key, row)
      return { ...row, retry_after: Math.ceil((row.until-clock())/1000) }
    }) }
  } }
}
test('durable account/IP/pair limits survive new middleware instances, expire and spare shared offices', async () => {
  let now = 1000000; const pool = memoryPool(() => now)
  async function attempt(username, ip) {
    const res = response(); let next = false
    await createLoginRateLimit({ pool, env })({ body: { username, password: 'synthetic' }, ip }, res, () => { next = true })
    return { res, next }
  }
  for (let i=0;i<8;i++) assert.ok((await attempt('admin', '192.0.2.1')).next)
  const limited = await attempt('admin', '192.0.2.1')
  assert.equal(limited.res.statusCode, 429); assert.equal(limited.res.headers['Retry-After'], '900')
  assert.ok((await attempt('staff', '192.0.2.1')).next)
  for (let i=0;i<6;i++) assert.ok((await attempt('admin', '192.0.2.' + (i+2))).next)
  assert.equal((await attempt('admin', '192.0.2.50')).res.statusCode, 429)
  now += 900001
  assert.ok((await attempt('admin', '192.0.2.1')).next)
})
test('IP limit blocks username rotation, unknown accounts behave identically; unavailable store fails closed', async () => {
  const pool = memoryPool(() => 1000000), middleware = createLoginRateLimit({ pool, env })
  for (let i=0;i<301;i++) {
    const res = response(); let next = false
    await middleware({ body: { username: 'unknown'+i, password: 'pw' }, ip: '192.0.2.1' }, res, () => { next = true })
    assert.equal(next, i<300)
    if (i===300) assert.equal(res.statusCode,429)
  }
  const res = response()
  await createLoginRateLimit({ pool: { query() { throw Error('synthetic unavailable') } }, env })({ body: { username: 'admin', password: 'pw' } }, res, () => assert.fail())
  assert.equal(res.statusCode,503)
})
test('keys are pseudonymous, account normalized, IPv6 /64 normalized, disabled mode avoids database', async () => {
  const a = loginKeys('ADMIN', '2001:db8:1:2::1', env.LOGIN_RATE_LIMIT_KEY)
  const b = loginKeys('admin', '2001:0db8:0001:0002::ff', env.LOGIN_RATE_LIMIT_KEY)
  assert.deepEqual(a,b); assert.match(a[0][1], /^[a-f0-9]{64}$/)
  let next = false
  await createLoginRateLimit({ pool: null, env: {} })({}, response(), () => { next = true })
  assert.ok(next)
})
