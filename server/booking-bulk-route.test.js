import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'

const source = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8')
const start = source.indexOf("app.post('/api/bookings'")
const end = source.indexOf("app.post('/api/bookings/:id/cancel'", start)
assert.ok(start >= 0 && end > start, 'booking route source boundaries are present')
const route = source.slice(start, end)

async function invoke(body) {
  let handler
  const inserted = []
  const calls = []
  const response = {
    code: 200,
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this },
  }
  vm.runInNewContext(route, {
    randomUUID,
    transactionContext: { getStore: () => ({ requestId: 'synthetic' }) },
    app: { post(...args) { handler = args.at(-1) } },
    authMiddleware() {},
    requireAnyPageManage() {},
    VALID_SEATS: new Set(Array.from({ length: 49 }, (_, index) => String(index + 1).padStart(2, '0'))),
    padSeat(value) { return String(value || '').trim().padStart(2, '0') },
    normalizePhone(value) { return String(value || '').replace(/\s+/g, '') },
    isValidPhone(value) { return /^(0?7\d{8}|94?7\d{8})$/.test(String(value || '').replace(/\s+/g, '')) },
    tripJoinSelect() { return 'SELECT synthetic trip' },
    async exec(sql) { calls.push(sql) },
    async get(sql) {
      if (sql.includes('SELECT synthetic trip')) return { id: 10, status: 'completed' }
      if (sql.includes('FROM bus_duties')) return undefined
      return undefined
    },
    async all(sql, params = []) {
      if (sql.includes('SELECT * FROM bookings')) return []
      if (sql.includes('INSERT INTO bookings')) {
        for (let offset = 0; offset < params.length; offset += 13) {
          inserted.push({ id: inserted.length + 1, booking_ref: params[offset], seat_number: params[offset + 3] })
        }
        return inserted
      }
      if (sql.includes('FROM bookings bk JOIN trips')) return inserted.map((booking) => ({
        ...booking, trip_id: 10, passenger_name: 'Synthetic Passenger', contact: '0770000000', gender: 'Male',
        boarding_point: 'Kattankudy', destination: 'Colombo', fare: 2700, notes: '', travel_date: '2026-11-18',
      }))
      return []
    },
    async run() { return { id: 1 } },
    console: { error() {} },
  })
  await handler({ body, user: { id: 1 } }, response)
  return { response, calls }
}

test('bulk booking accepts seat_numbers without requiring the legacy seat_number field', async () => {
  const { response, calls } = await invoke({
    trip_id: 10,
    seat_numbers: ['01', '02'],
    booking_group_id: 'synthetic-bulk-group',
    passenger_name: 'Synthetic Passenger',
    contact: '0770000000',
    gender: 'Male',
    boarding_point: 'Kattankudy',
    destination: 'Colombo',
    fare: 2700,
  })

  assert.equal(response.code, 201, JSON.stringify(response.data))
  assert.deepEqual(response.data.bookings.map((booking) => booking.seat_number), ['01', '02'])
  assert.deepEqual(response.data.failed, [])
  assert.ok(calls.includes('BEGIN IMMEDIATE'))
  assert.ok(calls.includes('COMMIT'))
})
