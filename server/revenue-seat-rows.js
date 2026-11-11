export const DEFAULT_REVENUE_SEAT_CATEGORIES = Object.freeze([
  'Standard',
  'Intermediate',
  'Special',
  'Agent / Extra',
])

export const MAX_REVENUE_EXTRA_SEAT_ROWS = 30
export const MAX_REVENUE_SEAT_ROW_COUNT = 1_000_000

export function normalizeRevenueSeatRows(seatRows) {
  if (!Array.isArray(seatRows) || seatRows.length < DEFAULT_REVENUE_SEAT_CATEGORIES.length) {
    return { error: 'Enter all four seat fare categories.' }
  }
  if (seatRows.length > DEFAULT_REVENUE_SEAT_CATEGORIES.length + MAX_REVENUE_EXTRA_SEAT_ROWS) {
    return { error: `You can add up to ${MAX_REVENUE_EXTRA_SEAT_ROWS} extra seat rows.` }
  }

  const rows = []
  const categories = new Set()
  let seatCount = 0

  for (let index = 0; index < seatRows.length; index += 1) {
    const row = seatRows[index] || {}
    const isDefault = index < DEFAULT_REVENUE_SEAT_CATEGORIES.length
    const category = isDefault
      ? DEFAULT_REVENUE_SEAT_CATEGORIES[index]
      : String(row.category || '').trim()
    if (!category || category.length > 80 || categories.has(category.toLowerCase())) {
      return { error: isDefault ? 'The default seat categories are invalid.' : 'Each extra seat row needs a unique label of up to 80 characters.' }
    }
    categories.add(category.toLowerCase())

    const count = Number(row.count)
    const amount = Number(row.amount)
    const total = count * amount
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_REVENUE_SEAT_ROW_COUNT) {
      return { error: `Enter a valid non-negative whole seat count for ${category}.` }
    }
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
      return { error: `Enter a valid whole-rupee amount for ${category}.` }
    }
    if (!Number.isSafeInteger(total)) {
      return { error: `The total for ${category} is outside the supported amount range.` }
    }

    seatCount += count
    if (!Number.isSafeInteger(seatCount)) {
      return { error: 'The total seat count is outside the supported range.' }
    }
    rows.push({ category, count, amount, total })
  }

  const subtotal = rows.reduce((sum, row) => sum + row.total, 0)
  if (!Number.isSafeInteger(subtotal)) return { error: 'The seat subtotal is outside the supported amount range.' }
  return { rows, seatCount, subtotal }
}
