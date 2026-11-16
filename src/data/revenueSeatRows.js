import { SEAT_LAYOUT } from './seatLayout.js'

export const REVENUE_SEAT_CATEGORIES = Object.freeze(['Standard', 'Intermediate', 'Special', 'Agent / Extra'])
export const MAX_REVENUE_SEAT_ROW_COUNT = SEAT_LAYOUT.totalSeats
export const MAX_EXTRA_REVENUE_SEAT_ROWS = 30

export function createDefaultRevenueSeatRows(savedRows) {
  // Keep unsupported candidate-era drafts visible; never silently drop their amounts.
  // Submission is blocked until the user explicitly resets/corrects the draft.
  if (Array.isArray(savedRows)) return savedRows.map((row, index) => {
    const isExtra = index >= REVENUE_SEAT_CATEGORIES.length
    const legacyExtra = isExtra && /^Extra row \d+$/i.test(String(row?.category || ''))
    return {
      ...row,
      category: REVENUE_SEAT_CATEGORIES[index] || (legacyExtra ? REVENUE_SEAT_CATEGORIES[3] : row?.category),
      ...(legacyExtra ? { rowLabel: row.category } : {}),
    }
  })
  return REVENUE_SEAT_CATEGORIES.map(category => ({ category, count: '0', amount: '0' }))
}

export function calculateRevenueSeatRows(rows) {
  const seatTotals = rows.map(row => (Number(row?.count) || 0) * (Number(row?.amount) || 0))
  const seatCount = rows.reduce((sum, row) => sum + (Number(row?.count) || 0), 0)
  const seatSubtotal = seatTotals.reduce((sum, value) => sum + value, 0)
  let validationError = ''
  if (rows.length < REVENUE_SEAT_CATEGORIES.length) validationError = 'Enter all four seat fare categories.'
  else if (rows.length > REVENUE_SEAT_CATEGORIES.length + MAX_EXTRA_REVENUE_SEAT_ROWS) validationError = `You can add up to ${MAX_EXTRA_REVENUE_SEAT_ROWS} extra fare rows.`
  else {
    for (let index = 0; index < rows.length; index += 1) {
      const count = Number(rows[index]?.count)
      const amount = Number(rows[index]?.amount)
      const category = index < REVENUE_SEAT_CATEGORIES.length ? REVENUE_SEAT_CATEGORIES[index] : rows[index]?.category
      if (index >= REVENUE_SEAT_CATEGORIES.length && category !== REVENUE_SEAT_CATEGORIES[3]) {
        validationError = 'Additional fare rows must use the approved Agent / Extra category.'
        break
      }
      if (!Number.isSafeInteger(count) || count < 0 || count > MAX_REVENUE_SEAT_ROW_COUNT || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
        validationError = 'Enter a valid seat count and whole-rupee amount for ' + category + '.'
        break
      }
    }
    if (!validationError && seatCount > MAX_REVENUE_SEAT_ROW_COUNT) validationError = 'Seat counts cannot exceed the 49-seat bus capacity.'
  }
  return { seatTotals, seatCount, seatSubtotal, validationError }
}
