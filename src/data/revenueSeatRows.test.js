import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendExtraRevenueSeatRow,
  calculateRevenueSeatRows,
  createDefaultRevenueSeatRows,
  MAX_EXTRA_REVENUE_SEAT_ROWS,
  MAX_REVENUE_SEAT_ROW_COUNT,
  removeExtraRevenueSeatRow,
  REVENUE_SEAT_CATEGORIES,
} from './revenueSeatRows.js'

test('starts with the four original seat categories and restores legacy values', () => {
  const oldRecord = REVENUE_SEAT_CATEGORIES.map((category, index) => ({ category, count: String(index), amount: String(index * 100) }))
  const rows = createDefaultRevenueSeatRows(oldRecord)
  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map((row) => row.category), REVENUE_SEAT_CATEGORIES)
  assert.equal(rows[3].amount, '300')
  assert.equal(calculateRevenueSeatRows(rows).validationError, '')
})

test('adds multiple extra rows and calculates them in the subtotal', () => {
  const original = createDefaultRevenueSeatRows()
  const rows = appendExtraRevenueSeatRow(appendExtraRevenueSeatRow(original))
  rows[0] = { ...rows[0], count: '1', amount: '100' }
  rows[4] = { ...rows[4], count: '2', amount: '50' }
  rows[5] = { ...rows[5], count: '1', amount: '25' }
  const result = calculateRevenueSeatRows(rows)
  assert.equal(rows.length, 6)
  assert.deepEqual(original.map((row) => row.category), REVENUE_SEAT_CATEGORIES)
  assert.deepEqual(result.seatTotals, [100, 0, 0, 0, 100, 25])
  assert.equal(result.seatSubtotal, 225)
  assert.equal(result.seatCount, 4)
  assert.equal(result.validationError, '')
})

test('removing an extra row recalculates subtotal and keeps default rows', () => {
  let rows = appendExtraRevenueSeatRow(createDefaultRevenueSeatRows())
  rows[0] = { ...rows[0], count: '1', amount: '200' }
  rows[4] = { ...rows[4], count: '1', amount: '50' }
  rows = removeExtraRevenueSeatRow(rows, rows[4].rowId)
  assert.equal(rows.length, 4)
  assert.equal(calculateRevenueSeatRows(rows).seatSubtotal, 200)
  assert.equal(removeExtraRevenueSeatRow(rows, 'Standard').length, 4)
})

test('restores saved extra rows and caps the number of additions', () => {
  const savedRows = [...REVENUE_SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })), { category: 'Extra row A', count: '3', amount: '40', rowId: 'saved-extra' }]
  const restored = createDefaultRevenueSeatRows(savedRows)
  assert.equal(restored[4].rowId, 'saved-extra')
  assert.equal(restored[4].count, '3')
  assert.equal(calculateRevenueSeatRows(restored).seatSubtotal, 120)
  const savedAboveCapacity = [
    ...REVENUE_SEAT_CATEGORIES.map((category, index) => ({ category, count: index === 0 ? '49' : '0', amount: '10' })),
    { category: 'Extra row A', count: '11', amount: '20', rowId: 'saved-extra-a' },
  ]
  const restoredAboveCapacity = createDefaultRevenueSeatRows(savedAboveCapacity)
  assert.equal(calculateRevenueSeatRows(restoredAboveCapacity).seatCount, 60)
  assert.equal(calculateRevenueSeatRows(restoredAboveCapacity).seatSubtotal, 710)
  let rows = createDefaultRevenueSeatRows()
  for (let i = 0; i < MAX_EXTRA_REVENUE_SEAT_ROWS; i += 1) rows = appendExtraRevenueSeatRow(rows)
  assert.equal(rows.length, 4 + MAX_EXTRA_REVENUE_SEAT_ROWS)
  assert.equal(appendExtraRevenueSeatRow(rows), rows)
})

test('accepts counts above physical capacity in manual revenue rows', () => {
  for (const count of [49, 50, 60]) {
    const rows = createDefaultRevenueSeatRows().map((row, index) => index === 0 ? { ...row, count: String(count), amount: '10' } : row)
    const result = calculateRevenueSeatRows(rows)
    assert.equal(result.validationError, '')
    assert.equal(result.seatCount, count)
    assert.equal(result.seatSubtotal, count * 10)
  }
  let rows = createDefaultRevenueSeatRows()
  rows = appendExtraRevenueSeatRow(appendExtraRevenueSeatRow(rows))
  rows[0] = { ...rows[0], count: '49', amount: '10' }
  rows[4] = { ...rows[4], count: '6', amount: '20' }
  rows[5] = { ...rows[5], count: '5', amount: '30' }
  const result = calculateRevenueSeatRows(rows)
  assert.equal(result.validationError, '')
  assert.equal(result.seatCount, 60)
  assert.equal(result.seatSubtotal, 760)
})

test('rejects invalid, negative, and excessively large manual revenue seat values', () => {
  const base = createDefaultRevenueSeatRows()
  for (const invalid of ['', '-1', '1.5', 'Infinity', String(MAX_REVENUE_SEAT_ROW_COUNT + 1), '9007199254740992']) {
    const rows = base.map((row, index) => index === 0 ? { ...row, count: invalid } : row)
    assert.notEqual(calculateRevenueSeatRows(rows).validationError, '', `count ${invalid}`)
  }
  const invalidAmount = base.map((row, index) => index === 0 ? { ...row, amount: '1.5' } : row)
  assert.notEqual(calculateRevenueSeatRows(invalidAmount).validationError, '')
  const excessiveAmount = base.map((row, index) => index === 0 ? { ...row, count: '1', amount: '100000001' } : row)
  assert.notEqual(calculateRevenueSeatRows(excessiveAmount).validationError, '')
  const duplicate = appendExtraRevenueSeatRow(base)
  duplicate[4] = { ...duplicate[4], category: 'Standard' }
  assert.notEqual(calculateRevenueSeatRows(duplicate).validationError, '')
})
