import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_REVENUE_SEAT_CATEGORIES, MAX_REVENUE_SEAT_ROW_COUNT, normalizeRevenueSeatRows } from './revenue-seat-rows.js'

const defaults = () => DEFAULT_REVENUE_SEAT_CATEGORIES.map(() => ({ count: 0, amount: 0 }))

test('accepts and normalizes legacy four-row records', () => {
  const result = normalizeRevenueSeatRows(defaults())
  assert.equal(result.error, undefined)
  assert.deepEqual(result.rows.map((row) => row.category), DEFAULT_REVENUE_SEAT_CATEGORIES)
  assert.equal(result.rows.length, 4)
  assert.equal(result.subtotal, 0)
})

test('includes multiple labeled extra rows in persisted totals', () => {
  const rows = [...defaults(), { category: 'Extra row 1', count: 2, amount: 50 }, { category: 'Extra row 2', count: 1, amount: 25 }]
  const result = normalizeRevenueSeatRows(rows)
  assert.equal(result.error, undefined)
  assert.equal(result.seatCount, 3)
  assert.equal(result.subtotal, 125)
  const roundTrip = JSON.parse(JSON.stringify(result.rows))
  assert.deepEqual(roundTrip.slice(4).map((row) => [row.category, row.count, row.amount, row.total]), [
    ['Extra row 1', 2, 50, 100],
    ['Extra row 2', 1, 25, 25],
  ])
})

test('accepts manual counts above bus capacity and rejects invalid or excessively large counts', () => {
  for (const count of [49, 50, 60]) {
    const result = normalizeRevenueSeatRows([{ count, amount: 10 }, ...defaults().slice(1)])
    assert.equal(result.error, undefined)
    assert.equal(result.seatCount, count)
    assert.equal(result.subtotal, count * 10)
  }
  const multipleExtras = normalizeRevenueSeatRows([
    ...defaults().map((row, index) => index === 0 ? { count: 49, amount: 10 } : row),
    { category: 'Extra 1', count: 6, amount: 20 },
    { category: 'Extra 2', count: 5, amount: 30 },
  ])
  assert.equal(multipleExtras.error, undefined)
  assert.equal(multipleExtras.seatCount, 60)
  assert.equal(multipleExtras.subtotal, 760)
  assert.ok(normalizeRevenueSeatRows([{ count: MAX_REVENUE_SEAT_ROW_COUNT + 1, amount: 1 }, ...defaults().slice(1)]).error)
})

test('rejects missing rows, excessive rows, invalid values, and duplicate labels', () => {
  assert.ok(normalizeRevenueSeatRows(defaults().slice(0, 3)).error)
  assert.ok(normalizeRevenueSeatRows([...defaults(), ...Array.from({ length: 31 }, (_, i) => ({ category: `Extra ${i}`, count: 0, amount: 0 }))]).error)
  assert.ok(normalizeRevenueSeatRows([...defaults(), { category: 'Standard', count: 0, amount: 0 }]).error)
  assert.ok(normalizeRevenueSeatRows([...defaults().map((row, index) => index === 0 ? { count: -1, amount: 0 } : row)]).error)
  assert.ok(normalizeRevenueSeatRows([...defaults(), { category: 'Extra', count: 1.5, amount: 10 }]).error)
  assert.ok(normalizeRevenueSeatRows([...defaults(), { category: 'Extra', count: 0, amount: Infinity }]).error)
})
