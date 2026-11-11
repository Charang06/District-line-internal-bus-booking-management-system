import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

// Exercise the actual, unchanged App memo bodies without moving or duplicating
// the production formulas. Mobile grouping and trip deduplication remain server-owned.
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const start = app.indexOf('  const sortedRegularCustomers = useMemo(')
const end = app.indexOf('  const revenueSummary = useMemo(', start)
assert.ok(start >= 0 && end > start, 'Customer analytics memo boundaries must exist')
const memos = app.slice(start, end)
const calculate = (adminStats, customerPeriod = '6', customerChartPeriod = '6') => JSON.parse(JSON.stringify(runInNewContext(
  memos + '\n;({ customers: sortedRegularCustomers, departures: popularDeparturesByRoute })',
  { adminStats, customerPeriod, customerChartPeriod, customerToday: '2026-11-10', useMemo: fn => fn() },
)))

const regularCustomers = [
  { passenger_name: 'Amina', contact: '+94770000001', trip_dates: ['2026-11-10', '2026-11-07', '2026-10-10', '2026-08-05', '2026-05-10'] },
  { passenger_name: 'Nimal', contact: '+94770000002', trip_dates: ['2026-11-09', '2026-10-09', '2026-09-09'] },
  { passenger_name: 'Fathima', contact: '+94770000003', trip_dates: ['2026-11-08', '2026-11-06', '2026-11-05'] },
]

test('regular customer ranking preserves trip, distinct-month and recent-trip order', () => {
  const rows = calculate({ regularCustomers }).customers
  assert.deepEqual(rows.map(row => [row.passenger_name, row.trip_count, row.month_count, row.last_trip_date]), [
    ['Amina', 5, 4, '2026-11-10'], ['Nimal', 3, 3, '2026-11-09'], ['Fathima', 3, 1, '2026-11-08'],
  ])
  const tied = calculate({ regularCustomers: [
    { contact: 'one', trip_dates: ['2026-11-01', '2026-11-07'] },
    { contact: 'two', trip_dates: ['2026-11-02', '2026-11-08'] },
  ] }).customers
  assert.deepEqual(tied.map(row => row.contact), ['two', 'one'])
})

test('independent customer periods preserve existing boundaries and repeat-customer threshold', () => {
  assert.deepEqual(calculate({ regularCustomers }, 'week').customers.map(row => [row.passenger_name, row.trip_count]), [['Fathima', 3], ['Amina', 2]])
  assert.equal(calculate({ regularCustomers }, '1').customers[0].trip_count, 3)
  const rows = calculate({ regularCustomers: [
    { contact: 'boundary', trip_dates: ['2026-11-03', '2026-11-04', '2026-11-10', '2026-11-11'] },
    { contact: 'only-once', trip_dates: ['2026-11-10'] },
  ] }, 'week').customers
  assert.deepEqual(rows.map(row => [row.contact, row.trip_count, row.last_trip_date]), [['boundary', 2, '2026-11-10']])
})

test('already grouped mobile profiles remain one row and distinct same-day trips count separately', () => {
  const rows = calculate({ regularCustomers: [{ passenger_name: 'Grouped profile', contact: '+94770000001', trip_dates: ['2026-11-10', '2026-11-10'] }] }).customers
  assert.equal(rows.length, 1)
  assert.deepEqual([rows[0].trip_count, rows[0].month_count, rows[0].last_trip_date], [2, 1, '2026-11-10'])
})

test('popular departures preserve confirmation checks, route grouping, case normalization and date filtering', () => {
  const booking = (boarding_point, extra = {}) => ({ route_code: 'KTY_CMB', status: 'confirmed', confirmation_status: 'confirmed', travel_date: '2026-11-10', boarding_point, ...extra })
  const passengerRecords = [
    booking(' Kattankudy '), booking('kattankudy'), booking('Market'),
    booking('Colombo', { route_code: 'CMB_KTY' }),
    booking('Old', { travel_date: '2026-10-01' }), booking('Future', { travel_date: '2026-11-11' }),
    booking('Pending', { confirmation_status: 'pending' }), booking('Cancelled', { status: 'cancelled' }),
    booking('Unknown route', { route_code: 'OTHER' }), booking(' '),
  ]
  const result = calculate({ passengerRecords }, '6', 'week').departures
  assert.deepEqual(result, { KTY_CMB: [{ departure: 'Kattankudy', count: 2 }, { departure: 'Market', count: 1 }], CMB_KTY: [{ departure: 'Colombo', count: 1 }] })
  assert.equal(calculate({ passengerRecords }, 'week', '6').departures.KTY_CMB.some(row => row.departure === 'Old'), true)
})

test('empty or unavailable analytics produce no synthetic customers or departure counts', () => {
  assert.deepEqual(calculate(null), { customers: [], departures: { KTY_CMB: [], CMB_KTY: [] } })
  assert.deepEqual(calculate({ regularCustomers: [], passengerRecords: [] }), calculate(null))
})
