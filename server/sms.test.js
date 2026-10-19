import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConfirmationMessage, sendSms, smsConfig } from './sms.js'

test('confirmation text includes dynamic grouped seats and total without passenger details', () => {
  const booking = {
    boarding_point: 'Kattankudy', destination: 'Colombo', travel_date: '2026-10-18',
    departure_time: '8:00 PM', registration_no: 'NE-1111', conductor_phone: '0771234567',
  }
  const message = buildConfirmationMessage(booking, [{ seat_number: 'A5', fare: 2500 }, { seat_number: 'A6', fare: 3000 }], '0779040300')
  assert.match(message, /DISTRICT LINE/)
  assert.match(message, /Route: Kattankudy to Colombo/)
  assert.match(message, /Date: 18 Oct 2026/)
  assert.match(message, /Seat No: A5, A6/)
  assert.match(message, /Amount: Rs\. 5,500/)
  assert.match(message, /Conductor: 0771234567/)
  assert.match(message, /Hotline: 0779040300/)
  assert.doesNotMatch(message, /passenger|contact|\+947/)
})

test('SmsLenz request uses its documented endpoint and payload and accepts provider response', async (t) => {
  const previous = Object.fromEntries(['SMS_PROVIDER', 'SMS_USER_ID', 'SMS_API_KEY', 'SMS_SENDER_ID'].map((key) => [key, process.env[key]]))
  Object.assign(process.env, { SMS_PROVIDER: 'smslenz', SMS_USER_ID: '123', SMS_API_KEY: 'secret-key', SMS_SENDER_ID: 'DLTEST' })
  t.after(() => Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value))
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://smslenz.lk/api/send-sms')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), {
      user_id: '123', api_key: 'secret-key', sender_id: 'DLTEST', contact: '+94771234567', message: 'hello',
    })
    return new Response(JSON.stringify({ success: true, data: { status: 'success', campaign_id: 42 } }), { status: 200 })
  }
  assert.equal(smsConfig().configured, true)
  const result = await sendSms({ to: '+94771234567', message: 'hello', idempotencyKey: 'test' })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'sent')
  assert.equal(result.raw.data.campaign_id, 42)
})

test('SmsLenz provider rejection is recorded as failure', async (t) => {
  const previous = Object.fromEntries(['SMS_PROVIDER', 'SMS_USER_ID', 'SMS_API_KEY', 'SMS_SENDER_ID'].map((key) => [key, process.env[key]]))
  Object.assign(process.env, { SMS_PROVIDER: 'smslenz', SMS_USER_ID: '123', SMS_API_KEY: 'secret-key', SMS_SENDER_ID: 'DLTEST' })
  t.after(() => Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value))
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Insufficient credit' }), { status: 422 })
  const result = await sendSms({ to: '+94771234567', message: 'hello', idempotencyKey: 'test' })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /Insufficient credit/)
})
