export const uncertainBookingMessage = 'Unable to confirm whether the booking was saved. Please check the booking log before retrying.'

const seat = value => String(value).padStart(2, '0')

// Reuse the existing booking_group_id contract across lost responses and reloads.
// A successful read alone cannot prove that a timed-out transaction has finished;
// any retry must therefore retain the original group and immutable payload.
export async function submitSeatBooking({ submission, pending, remember, send, read }) {
  const uncertain = () => Object.assign(new Error(uncertainBookingMessage), { bookingUncertain: true })
  const reconcile = async attempt => {
    const data = await read(attempt.trip_id)
    if (!Array.isArray(data.bookings)) throw uncertain()
    const saved = data.bookings.filter(row => row.booking_group_id === attempt.booking_group_id
      && String(row.trip_id) === String(attempt.trip_id) && row.status === 'confirmed'
      && attempt.seat_numbers.map(seat).includes(seat(row.seat_number)))
    if (!saved.length) return null
    for (const row of saved) {
      for (const field of ['passenger_name','contact','gender','boarding_point','destination','notes','fare']) {
        if (!(field in attempt)) continue
        const normalize = value => field === 'fare' ? Number(value) : field === 'contact'
          ? String(value || '').replace(/\s+/g, '') : String(value || '')
        if (normalize(row[field]) !== normalize(attempt[field])) throw uncertain()
      }
    }
    const savedSeats = new Set(saved.map(row => seat(row.seat_number)))
    return { bookings: saved, failed: attempt.seat_numbers.filter(value => !savedSeats.has(seat(value)))
      .map(value => ({ seat_number: value, message: `Seat ${value} is no longer available. Please refresh the seat list.` })) }
  }
  const attempt = pending || submission
  if (pending) {
    // Do not issue another write until a successful reconciliation read.
    let result
    try { result = await reconcile(pending) } catch { throw uncertain() }
    if (result) { remember(null); return result }
    if (JSON.stringify(pending) !== JSON.stringify(submission)) {
      throw Object.assign(new Error(`${uncertainBookingMessage} Keep the original passenger details and seat selection for a safe retry.`), { bookingUncertain: true })
    }
  }
  remember(attempt) // Persist before dispatch so reload cannot lose the retry identity.
  try {
    const data = await send(attempt)
    if (!Array.isArray(data.bookings) || !Array.isArray(data.failed)) throw uncertain()
    const requested = new Set(attempt.seat_numbers.map(seat))
    const returned = [...data.bookings, ...data.failed].map(row => seat(row.seat_number))
    if (returned.length !== requested.size || new Set(returned).size !== requested.size || returned.some(value => !requested.has(value))) throw uncertain()
    remember(null)
    return data
  } catch (error) {
    if (error.status && error.status < 500 && ![408,429].includes(error.status)) {
      remember(null)
      throw error
    }
    try {
      const result = await reconcile(attempt)
      if (result) { remember(null); return result }
    } catch { /* Retain the attempt until reconciliation is possible. */ }
    throw uncertain()
  }
}
