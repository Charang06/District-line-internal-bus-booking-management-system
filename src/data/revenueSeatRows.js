export const REVENUE_SEAT_CATEGORIES = Object.freeze(['Standard', 'Intermediate', 'Special', 'Agent / Extra'])
export const MAX_EXTRA_REVENUE_SEAT_ROWS = 30
export const MAX_REVENUE_SEAT_ROW_COUNT = 1_000_000

let extraRowSequence = 0

export function createDefaultRevenueSeatRows(savedRows = []) {
  const rows = Array.isArray(savedRows) ? savedRows : []
  const defaults = REVENUE_SEAT_CATEGORIES.map((category, index) => ({
    category,
    count: rows[index]?.count ?? '0',
    amount: rows[index]?.amount ?? '0',
  }))
  const extras = rows.slice(REVENUE_SEAT_CATEGORIES.length, REVENUE_SEAT_CATEGORIES.length + MAX_EXTRA_REVENUE_SEAT_ROWS).map((row, index) => ({
    rowId: row.rowId || createRowId(),
    category: String(row.category || `Extra row ${index + 1}`),
    count: row.count ?? '0',
    amount: row.amount ?? '0',
  }))
  return [...defaults, ...extras]
}

function createRowId() {
  extraRowSequence += 1
  return `extra-${Date.now()}-${extraRowSequence}`
}

export function appendExtraRevenueSeatRow(rows) {
  if (rows.length >= REVENUE_SEAT_CATEGORIES.length + MAX_EXTRA_REVENUE_SEAT_ROWS) return rows
  let extraCount = rows.length - REVENUE_SEAT_CATEGORIES.length + 1
  let category = `Extra row ${extraCount}`
  const usedCategories = new Set(rows.map((row) => String(row.category || '').toLowerCase()))
  while (usedCategories.has(category.toLowerCase())) {
    extraCount += 1
    category = `Extra row ${extraCount}`
  }
  return [...rows, { rowId: createRowId(), category, count: '0', amount: '0' }]
}

export function removeExtraRevenueSeatRow(rows, rowId) {
  return rows.filter((row, index) => index < REVENUE_SEAT_CATEGORIES.length || row.rowId !== rowId)
}

export function calculateRevenueSeatRows(rows) {
  const seatTotals = rows.map((row) => {
    const count = Number(row.count)
    const amount = Number(row.amount)
    return Number.isSafeInteger(count) && count >= 0 && Number.isSafeInteger(amount) && amount >= 0 && Number.isSafeInteger(count * amount) ? count * amount : 0
  })
  const seatCount = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  const seatSubtotal = seatTotals.reduce((sum, value) => sum + value, 0)
  let validationError = ''
  if (rows.length < REVENUE_SEAT_CATEGORIES.length) validationError = 'All four default seat categories are required.'
  else if (rows.length > REVENUE_SEAT_CATEGORIES.length + MAX_EXTRA_REVENUE_SEAT_ROWS) validationError = `You can add up to ${MAX_EXTRA_REVENUE_SEAT_ROWS} extra seat rows.`
  else {
    let subtotal = 0
    const categories = new Set()
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const category = String(row.category || '').trim()
      if (!category || category.length > 80 || categories.has(category.toLowerCase())) {
        validationError = 'Each extra seat row needs a unique label of up to 80 characters.'
        break
      }
      categories.add(category.toLowerCase())
      const countText = String(row.count ?? '').trim()
      const amountText = String(row.amount ?? '').trim()
      const count = Number(countText)
      const amount = Number(amountText)
      if (!countText || !Number.isSafeInteger(count) || count < 0 || count > MAX_REVENUE_SEAT_ROW_COUNT) {
        validationError = `Enter a valid whole seat count for ${row.category}.`
        break
      }
      if (!amountText || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
        validationError = `Enter a valid whole-rupee amount for ${row.category}.`
        break
      }
      if (!Number.isSafeInteger(count * amount)) {
        validationError = `The total for ${row.category} is outside the supported amount range.`
        break
      }
      subtotal += count * amount
      if (!Number.isSafeInteger(subtotal)) {
        validationError = 'The seat subtotal is outside the supported amount range.'
        break
      }
    }
  }
  if (!validationError && !Number.isSafeInteger(seatSubtotal)) validationError = 'The seat subtotal is outside the supported amount range.'
  return { seatTotals, seatCount, seatSubtotal, validationError }
}
