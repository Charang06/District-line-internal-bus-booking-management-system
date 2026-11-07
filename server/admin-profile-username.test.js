import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import express from 'express'
import { createAdminUsernameHandler, validateAdminUsername } from './admin-profile-username.js'

const password = 'Profile-password-for-tests'
const passwordHash = await bcrypt.hash(password, 4)
const safeUser = account => ({ id: account.id, username: account.username, role: account.role, permissions: account.permissions, fullName: account.full_name })

function fixture({ role = 'admin', status = 'active', errorCode, auditFailure = false } = {}) {
  const account = { id: 7, username: 'old_admin', role, status, password_hash: passwordHash, permissions: '{"home":true}', full_name: 'Profile test administrator' }
  const calls = []
  let pending = null
  let released = false
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql === 'BEGIN') { pending = { ...account }; return { rows: [] } }
      if (sql.startsWith('SET LOCAL')) return { rows: [] }
      if (sql.startsWith('SELECT * FROM users')) return { rows: [{ ...pending }] }
      if (sql.startsWith('UPDATE users')) {
        if (errorCode || params[0] === 'staff_name') throw Object.assign(new Error('Private SQL account/password information'), { code: errorCode || '23505' })
        assert.equal(params[1], 7)
        pending.username = params[0]
        return { rows: [{ ...pending }] }
      }
      if (sql.startsWith('INSERT INTO audit_logs')) {
        if (auditFailure) throw new Error('private audit failure')
        return { rows: [] }
      }
      if (sql === 'COMMIT') { Object.assign(account, pending); pending = null; return { rows: [] } }
      if (sql === 'ROLLBACK') { pending = null; return { rows: [] } }
      throw new Error(`Unexpected test query: ${sql}`)
    },
    release() { released = true },
  }
  const handler = createAdminUsernameHandler({ pool: { connect: async () => client }, publicUser: safeUser })
  const invoke = async (body, user = { id: 7, role: 'admin' }) => {
    const response = { statusCode: 200, body: null, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this } }
    await handler({ user, body }, response)
    return response
  }
  return { account, calls, invoke, get released() { return released } }
}

test('new admin username validation is a compatible subset; trims whitespace and accepts 4–30 ASCII characters', () => {
  for (const value of [' abcd ', 'A.B_123', 'a'.repeat(30)]) assert.equal(validateAdminUsername(value), null)
  for (const value of ['', '   ', 'abc', 'a'.repeat(31), 'hyphen-name', 'name@example.test', 'space name', 'nämé', null, {}, 1234]) assert.ok(validateAdminUsername(value))
})

test('successful self-service update changes only username and records an ID-based audit', async () => {
  const f = fixture()
  const before = { ...f.account }
  const result = await f.invoke({ newUsername: '  New.Admin_7  ', currentPassword: password, id: 999, userId: 999, role: 'staff', permissions: {} })
  assert.equal(result.statusCode, 200)
  assert.deepEqual(f.account, { ...before, username: 'New.Admin_7' })
  assert.deepEqual(result.body.user, safeUser(f.account))
  assert.ok(!JSON.stringify(result.body).includes(passwordHash))
  assert.ok(!JSON.stringify(result.body).includes(password))
  assert.equal(f.calls.filter(call => call.sql.startsWith('UPDATE users')).length, 1)
  const audit = f.calls.find(call => call.sql.startsWith('INSERT INTO audit_logs'))
  assert.deepEqual(audit.params, [7, '7'])
  assert.ok(f.calls.some(call => call.sql === 'COMMIT'))
  assert.equal(f.calls.some(call => /DELETE|SET password_hash|SET role|SET permissions/.test(call.sql)), false)
  assert.equal(f.calls.some(call => call.params.includes(password) || call.params.includes(passwordHash)), false)
  assert.equal(f.released, true)
})

test('wrong current password rejects reauthentication without changing the account or expiring its session', async () => {
  const f = fixture()
  const before = { ...f.account }
  const result = await f.invoke({ newUsername: 'new_name', currentPassword: 'wrong-password' })
  assert.equal(result.statusCode, 400)
  assert.match(result.body.message, /Current password is incorrect/)
  assert.deepEqual(f.account, before)
  assert.equal(f.calls.some(call => call.sql.startsWith('UPDATE')), false)
  assert.ok(f.calls.some(call => call.sql === 'ROLLBACK'))
})

test('missing password and invalid usernames are rejected before accessing the database', async () => {
  for (const body of [{ newUsername: 'new_name' }, { newUsername: 'new_name', currentPassword: {} }, { newUsername: 'bad-name', currentPassword: password }, { newUsername: '', currentPassword: password }]) {
    const f = fixture()
    assert.equal((await f.invoke(body)).statusCode, 400)
    assert.equal(f.calls.length, 0)
  }
})

test('frontend role/target IDs cannot grant admin access or select another account', async () => {
  const f = fixture()
  const body = { newUsername: 'new_name', currentPassword: password, id: 7, role: 'admin' }
  assert.equal((await f.invoke(body, { id: 3, role: 'staff' })).statusCode, 403)
  assert.equal((await f.invoke(body, null)).statusCode, 403)
  assert.equal(f.calls.length, 0)
})

test('a fresh database role/status check blocks stale administrator sessions', async () => {
  for (const settings of [{ role: 'staff' }, { status: 'inactive' }]) {
    const f = fixture(settings)
    const before = { ...f.account }
    assert.equal((await f.invoke({ newUsername: 'new_name', currentPassword: password })).statusCode, 403)
    assert.deepEqual(f.account, before)
    assert.ok(f.calls.some(call => call.sql === 'ROLLBACK'))
  }
})

test('the existing database unique constraint rejects collisions, including staff usernames', async () => {
  const f = fixture()
  const result = await f.invoke({ newUsername: 'staff_name', currentPassword: password })
  assert.equal(result.statusCode, 409)
  assert.equal(f.account.username, 'old_admin')
  assert.ok(f.calls.some(call => call.sql === 'ROLLBACK'))
  assert.equal(f.calls.some(call => call.sql.includes('WHERE username')), false)
  assert.ok(!JSON.stringify(result.body).includes('staff'))
})

test('username equality and case changes follow exact login matching rules', async () => {
  const f = fixture()
  assert.equal((await f.invoke({ newUsername: ' old_admin ', currentPassword: password })).statusCode, 400)
  assert.equal((await f.invoke({ newUsername: 'OLD_ADMIN', currentPassword: password })).statusCode, 200)
  assert.equal(f.account.username, 'OLD_ADMIN')
})

test('audit failure rolls back the update; database errors never expose details', async () => {
  const f = fixture({ auditFailure: true })
  const result = await f.invoke({ newUsername: 'new_name', currentPassword: password })
  assert.equal(result.statusCode, 503)
  assert.equal(f.account.username, 'old_admin')
  assert.ok(f.calls.some(call => call.sql === 'ROLLBACK'))
  assert.ok(!JSON.stringify(result.body).includes('private'))
  assert.equal(f.released, true)
  for (const errorCode of ['55P03', '57014', 'XX000']) {
    const other = fixture({ errorCode })
    assert.equal((await other.invoke({ newUsername: 'new_name', currentPassword: password })).statusCode, 503)
    assert.equal(other.account.username, 'old_admin')
  }
})

test('HTTP update route returns refreshed safe account information without issuing a new cookie', async (t) => {
  const f = fixture()
  const app = express()
  app.use(express.json())
  app.patch('/api/profile/username', (req, _res, next) => { req.user = { id: 7, role: 'admin' }; next() }, createAdminUsernameHandler({ pool: { connect: async () => ({
    async query(sql, params) {
      if (sql.startsWith('SELECT')) return { rows: [{ ...f.account }] }
      if (sql.startsWith('UPDATE')) return { rows: [{ ...f.account, username: params[0] }] }
      return { rows: [] }
    }, release() {},
  }) }, publicUser: safeUser }))
  const server = createServer(app).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/profile/username`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newUsername: 'new_name', currentPassword: password }) })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('set-cookie'), null)
  const result = await response.json()
  assert.equal(result.user.id, 7)
  assert.equal(result.user.username, 'new_name')
  assert.equal(result.user.role, 'admin')
})
