import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTripOverview, filterTripOverviewTrips, findUnscheduledBuses } from './tripOverview.js'

const trips = [
  { id: 32, trip_code: 'TRP-0032', travel_date: '2026-10-26', route_code: 'KTY_CMB', registration_no: '', booked_count: 2 },
  { id: 31, trip_code: 'TRP-0031', travel_date: '2026-10-26', route_code: 'CMB_KTY', registration_no: 'NE-1111', booked_count: 9 },
]

test('Trip Overview applies combined date, bus, route and trip filters', () => {
  const common = { start: '2026-10-26', end: '2026-10-26' }
  assert.deepEqual(filterTripOverviewTrips(trips, common).map((trip) => trip.id), [32, 31])
  assert.deepEqual(filterTripOverviewTrips(trips, { ...common, bus: 'NE-1111' }).map((trip) => trip.id), [31])
  assert.deepEqual(filterTripOverviewTrips(trips, { ...common, route: 'KTY_CMB' }).map((trip) => trip.id), [32])
  assert.deepEqual(filterTripOverviewTrips(trips, { ...common, bus: '__unassigned__' }).map((trip) => trip.id), [32])
  assert.deepEqual(filterTripOverviewTrips(trips, { ...common, route: 'CMB_KTY', bus: 'NE-1111', tripId: 31 }).map((trip) => trip.id), [31])
  assert.deepEqual(filterTripOverviewTrips(trips, { start: '2026-10-27', end: '2026-10-27' }), [])
})

test('Trip Overview combines only revenue linked to each trip and handles missing revenue safely', () => {
  const dailyRevenue = [
    { trip_id: 32, passenger_revenue: 8500, cargo_revenue: 0 },
    { trip_id: 31, passenger_revenue: 21000, cargo_revenue: 4500 },
    { trip_id: null, passenger_revenue: 999999, cargo_revenue: 999999 },
  ]
  const summary = buildTripOverview(trips, dailyRevenue, 49)
  assert.deepEqual(summary.rows.map(({ seatRevenue, cargoRevenue, totalRevenue }) => [seatRevenue, cargoRevenue, totalRevenue]), [[8500, 0, 8500], [21000, 4500, 25500]])
  assert.equal(summary.rows[0].available, 47)
  assert.equal(summary.rows[1].available, 40)
  assert.equal(summary.booked, 11)
  assert.equal(summary.available, 87)
  assert.equal(summary.totalSeats, 98)
  assert.equal(summary.bookedPercent + summary.availablePercent, 100)
  const empty = buildTripOverview([], dailyRevenue, 49)
  assert.equal(empty.totalSeats, 0)
  assert.equal(empty.bookedPercent, 0)
  assert.equal(empty.availablePercent, 0)
  const noRevenue = buildTripOverview([trips[0]], [], 49)
  assert.equal(noRevenue.rows[0].totalRevenue, 0)
})

test('zero-booking trip on the selected date appears as fully available capacity', () => {
  const zeroBookingTrip = { id: 27, trip_code: 'TRP-0027', travel_date: '2026-10-27', route_code: 'KTY_CMB', registration_no: 'NE-2222', booked_count: 0 }
  const matchingTrips = filterTripOverviewTrips([zeroBookingTrip], { start: '2026-10-27', end: '2026-10-27' })
  const overview = buildTripOverview(matchingTrips, [], 49)
  assert.equal(overview.rows.length, 1)
  assert.equal(overview.rows[0].trip.registration_no, 'NE-2222')
  assert.equal(overview.rows[0].booked, 0)
  assert.equal(overview.rows[0].available, 49)
  assert.equal(overview.bookedPercent, 0)
  assert.equal(overview.availablePercent, 100)
})

test('new registered bus without a scheduled trip is added as available capacity', () => {
  const buses = [{ id: 8, registration_no: 'NE-7788', status: 'active' }]
  const unscheduled = findUnscheduledBuses(buses, [], {})
  const overview = buildTripOverview([], [], 49, unscheduled)
  assert.equal(overview.rows.length, 1)
  assert.equal(overview.rows[0].trip.trip_code, 'No scheduled trip')
  assert.equal(overview.rows[0].trip.registration_no, 'NE-7788')
  assert.equal(overview.rows[0].unscheduled, true)
  assert.equal(overview.rows[0].booked, 0)
  assert.equal(overview.rows[0].available, 49)
  assert.equal(overview.totalSeats, 49)
  assert.equal(overview.bookedPercent, 0)
  assert.equal(overview.availablePercent, 100)
  assert.deepEqual(findUnscheduledBuses(buses, [], { bus: 'NE-7788' }).map((bus) => bus.id), [8])
  assert.deepEqual(findUnscheduledBuses(buses, [{ registration_no: 'NE-7788' }], {}), [])
  assert.deepEqual(findUnscheduledBuses(buses, [], { route: 'KTY_CMB' }), [])
})
