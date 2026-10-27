import test from 'node:test'
import assert from 'node:assert/strict'
import { clearSmsLenzBalanceCache, getSmsLenzBalance } from './smslenz-balance.js'

const credentials = { provider: 'smslenz', userId: 'test-user', apiKey: 'test-secret' }
const response = (body, options = {}) => ({ ok: options.ok ?? true, json: async () => body })
const success = {
  success: true,
  data: {
    status: 'active',
    sms_credit_balance: '1234.5',
    allocated_credit_total: '400',
    sender_id_balances: [{ sender_id: 'DISTRICT', allocated_balance: '400', active: true }],
  },
}

test.beforeEach(clearSmsLenzBalanceCache)
test.afterEach(clearSmsLenzBalanceCache)

test('fetches and maps account status without exposing provider payload fields', async () => {
  let request
  const result = await getSmsLenzBalance({ ...credentials, fetchImpl: async (...args) => { request = args; return response(success) } })
  assert.equal(request[0], 'https://smslenz.lk/api/account-status')
  assert.equal(request[1].method, 'POST')
  assert.deepEqual(JSON.parse(request[1].body), { user_id: 'test-user', api_key: 'test-secret' })
  assert.deepEqual(result, {
    status: 'active', sms_credit_balance: 1234.5, allocated_credit_total: 400,
    sender_id_balances: [{ sender_id: 'DISTRICT', allocated_balance: 400, active: true }],
    updated_at: result.updated_at,
  })
  assert.equal(Object.hasOwn(result, 'api_key'), false)
})

test('caches successful results for 60 seconds', async () => {
  let calls = 0
  let now = 1000
  const fetchImpl = async () => { calls += 1; return response(success) }
  await getSmsLenzBalance({ ...credentials, fetchImpl, now: () => now })
  await getSmsLenzBalance({ ...credentials, fetchImpl, now: () => now + 59_999 })
  assert.equal(calls, 1)
  now += 60_001
  await getSmsLenzBalance({ ...credentials, fetchImpl, now: () => now })
  assert.equal(calls, 2)
})

test('coalesces concurrent requests', async () => {
  let calls = 0
  let release
  const fetchImpl = () => { calls += 1; return new Promise((resolve) => { release = () => resolve(response(success)) }) }
  const one = getSmsLenzBalance({ ...credentials, fetchImpl })
  const two = getSmsLenzBalance({ ...credentials, fetchImpl })
  await new Promise((resolve) => setImmediate(resolve))
  release()
  assert.deepEqual(await one, await two)
  assert.equal(calls, 1)
})

test('fails safely for missing config, rejected requests, invalid JSON and timeout', async () => {
  await assert.rejects(getSmsLenzBalance({ ...credentials, provider: 'other-sms' }), { status: 503, kind: 'provider_not_smslenz' })
  await assert.rejects(getSmsLenzBalance({ userId: '', apiKey: '' }), { status: 503 })
  await assert.rejects(getSmsLenzBalance({ ...credentials, fetchImpl: async () => response({ success: false, message: 'secret detail' }) }), (error) => {
    assert.equal(error.status, 502)
    assert.equal(error.message.includes('secret detail'), false)
    return true
  })
  await assert.rejects(getSmsLenzBalance({ ...credentials, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('raw response') } }) }), { kind: 'invalid_json' })
  await assert.rejects(getSmsLenzBalance({ ...credentials, timeoutMs: 1, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }), { status: 504 })
})
