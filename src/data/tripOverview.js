export function filterTripOverviewTrips(trips, { start, end, route = '', bus = '', tripId = '' } = {}) {
  return trips.filter((trip) => {
    if (!trip.travel_date || (start && trip.travel_date < start) || (end && trip.travel_date > end)) return false
    if (route && trip.route_code !== route) return false
    if (tripId && String(trip.id) !== String(tripId)) return false
    if (bus) {
      const registration = String(trip.registration_no || trip.bus_no || '').trim()
      if (bus === '__unassigned__') {
        if (registration && registration.toLowerCase() !== 'unassigned') return false
      } else if (registration.toLowerCase() !== bus.toLowerCase()) return false
    }
    return true
  })
}

export function findUnscheduledBuses(buses, scheduledTrips, { route = '', bus = '', tripId = '' } = {}) {
  if (route || tripId) return []
  const scheduled = new Set(scheduledTrips.map((trip) => String(trip.registration_no || trip.bus_no || '').trim().toLowerCase()).filter(Boolean))
  return buses.filter((item) => {
    if (item.status === 'inactive') return false
    const registration = String(item.registration_no || '').trim()
    if (!registration || scheduled.has(registration.toLowerCase())) return false
    if (!bus) return true
    if (bus === '__unassigned__') return false
    return registration.toLowerCase() === bus.toLowerCase()
  })
}

export function buildTripOverview(trips, dailyRevenue, seatCapacity, unscheduledBuses = [], accountRevenueEntries = []) {
  // Keep the prior argument for callers, but revenue in Trip Overview must come
  // from the Accounts operational submissions table only.
  void dailyRevenue
  const rows = trips.map((trip) => {
    const directAccountEntries = accountRevenueEntries.filter((entry) => entry.status === 'locked' && entry.trip_id != null && String(entry.trip_id) === String(trip.id))
    const busNo = String(trip.registration_no || trip.bus_no || '').trim().toLowerCase()
    const accountEntries = directAccountEntries.length ? directAccountEntries : accountRevenueEntries.filter((entry) => (
      entry.status === 'locked'
      && entry.trip_id == null
      && entry.travel_date === trip.travel_date
      && entry.route_code === trip.route_code
      && String(entry.bus_no || '').trim().toLowerCase() === busNo
    ))
    const booked = Number(trip.booked_count || 0)
    const available = Math.max(0, seatCapacity - booked)
    const seatRevenue = accountEntries.reduce((sum, entry) => sum + Number(entry.seat_subtotal || 0), 0)
    const cargoRevenue = accountEntries.reduce((sum, entry) => sum + Number(entry.cargo_subtotal || 0), 0)
    const totalRevenue = accountEntries.reduce((sum, entry) => sum + Number(entry.total_revenue || 0), 0)
    return { trip, booked, available, seatRevenue, cargoRevenue, totalRevenue }
  })
  rows.push(...unscheduledBuses.map((bus) => ({
    trip: { id: null, trip_code: 'No scheduled trip', travel_date: '', route_label: 'No route assigned', registration_no: bus.registration_no },
    busId: bus.id,
    unscheduled: true,
    booked: 0,
    available: seatCapacity,
    seatRevenue: 0,
    cargoRevenue: 0,
    totalRevenue: 0,
  })))
  const booked = rows.reduce((sum, row) => sum + row.booked, 0)
  const available = rows.reduce((sum, row) => sum + row.available, 0)
  const totalSeats = booked + available
  return { rows, booked, available, totalSeats, bookedPercent: totalSeats ? booked / totalSeats * 100 : 0, availablePercent: totalSeats ? available / totalSeats * 100 : 0 }
}
