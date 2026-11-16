// Manual revenue policy restored from production 666e833; not booking capacity logic.
export const DEFAULT_REVENUE_SEAT_CATEGORIES = Object.freeze(['Standard', 'Intermediate', 'Special', 'Agent / Extra'])
export const MAX_REVENUE_SEAT_ROW_COUNT = 49
export const MAX_REVENUE_EXTRA_SEAT_ROWS = 30

export function normalizeRevenueSeatRows(seatRows) {
  if (!Array.isArray(seatRows) || seatRows.length < 4) return { error: 'Enter all four seat fare categories.' }
  if (seatRows.length > 4 + MAX_REVENUE_EXTRA_SEAT_ROWS) return { error: `You can add up to ${MAX_REVENUE_EXTRA_SEAT_ROWS} extra fare rows.` }
  const seatCategories = DEFAULT_REVENUE_SEAT_CATEGORIES
  const cleanSeatRows = []
  let seatCount = 0
  for (let index = 0; index < seatRows.length; index += 1) {
    const row = seatRows[index] || {}
    const category = index < seatCategories.length ? seatCategories[index] : String(row.category || '').trim()
    if (index >= seatCategories.length && category !== seatCategories[3]) {
      return { error: 'Additional fare rows must use the approved Agent / Extra category.' }
    }
    const count = Number(row.count)
    const amount = Number(row.amount)
    if (!Number.isSafeInteger(count) || count < 0 || count > 49 || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
      return { error: `Enter a valid seat count and whole-rupee amount for ${category}.` }
    }
    seatCount += count
    cleanSeatRows.push({ category, count, amount, total: count * amount })
  }
  if (seatCount > 49) return { error: 'Seat counts cannot exceed the 49-seat bus capacity.' }

  return { rows: cleanSeatRows, seatCount, subtotal: cleanSeatRows.reduce((sum, row) => sum + row.total, 0) }
}
