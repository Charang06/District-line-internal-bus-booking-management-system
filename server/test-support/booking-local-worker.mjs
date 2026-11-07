// Executed only by a local unit test. No pg.Pool and no database connection.
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { serveBookingTestApp } from './booking-app.js'

const password = 'Synthetic-local-password', calls = []
const user = { id: -7, username: 'synthetic_local', password_hash: await bcrypt.hash(password, 4), role: 'admin', status: 'active', full_name: 'Synthetic local', recovery_email: 'local@example.test', permissions: '{}' }
const pool = { waitingCount: 0, totalCount: 0, idleCount: 0, on() {}, async connect() {
  return { release() {}, async query(sql) {
    calls.push(sql)
    if (sql.startsWith('SELECT * FROM users WHERE username')) return { rows: [user] }
    if (sql.includes('JOIN users ON users.id = sessions.user_id')) return { rows: [{ ...user, session_id: 1 }] }
    return { rows: [{ id: 1 }], rowCount: 1 }
  } }
} }
let api
try {
  api = await serveBookingTestApp(pool)
  assert.equal(calls.length, 0)
  await api.request('POST', '/api/login', { username: user.username, password })
  assert.equal((await api.request('GET', '/api/me')).user.id, user.id)
  assert.ok(!calls.some(sql => /CREATE TABLE|ALTER TABLE|INSERT INTO users|schema_meta/.test(sql)))
  console.log('LOCAL_MOCK_PASS')
} finally { await api?.close() }
