import assert from 'node:assert/strict'
import * as vm from 'node:vm'
import test from 'node:test'
import { isolatedTestOptions, openIsolatedPool, requireEmptyApplication, syntheticAccounts } from './test-support/isolated-postgres.js'
import { serveBookingTestApp, cleanupBookingFixtures } from './test-support/booking-app.js'

test('isolated PostgreSQL duties: separate bus finances and frozen reports with cookie authentication', isolatedTestOptions, async t => {
  assert.ok(vm.SourceTextModule, 'Run the approved harness with --experimental-vm-modules')
  const pool = await openIsolatedPool()
  let fixture, api
  const busIds = []
  t.after(async () => { try { await api?.close(); await cleanupBookingFixtures(pool, fixture, busIds) } finally { await pool.end() } })
  // Dashboard code can update duties; refuse a populated target before fixtures.
  await requireEmptyApplication(pool)
  fixture = await syntheticAccounts(pool)
  await pool.query("INSERT INTO daily_expenses (expense_date,category,description,amount,created_by) VALUES ('2026-01-31','Fuel','Synthetic pre-duty expense',1200,$1)", [fixture.admin.id])
  api = await serveBookingTestApp(pool)
  const request = api.request
  await request('POST', '/api/login', { username: fixture.staff.username, password: fixture.password })
  assert.equal((await request('GET', '/api/me')).user.role, 'staff')
  await request('POST', '/api/admin/duties', {}, 403)
  await request('POST', '/api/logout', {})
  await request('POST', '/api/login', { username: fixture.admin.username, password: fixture.password })
  assert.equal((await request('GET', '/api/me')).user.role, 'admin')

  async function makeBus(registration_no) {
    const bus = (await request('POST', '/api/buses', { registration_no: `${registration_no}-${fixture.suffix}`, display_name: 'Synthetic bus' }, 201)).bus
    busIds.push(bus.id)
    return bus
  }
  async function makeTrip(bus, travel_date, route_code, status = 'completed') {
    return (await request('POST', '/api/trips', { bus_id: bus.id, bus_no: bus.registration_no, travel_date, route_code, departure_time: '20:30', status }, 201)).trip
  }
  async function makeConfirmedBooking(trip, seat_number, fare, payment_status = 'unpaid') {
    const result = await request('POST', '/api/bookings', {
      trip_id: trip.id,
      seat_number,
      passenger_name: `Passenger ${seat_number}`,
      contact: '0771234567',
      gender: 'Male',
      boarding_point: 'Kattankudy',
      destination: 'Colombo',
      fare,
      payment_status,
    }, 201)
    await request('PATCH', `/api/bookings/${result.booking.id}/confirmation`, { confirmation_status: 'confirmed' })
    return result.booking
  }

  const busOne = await makeBus('NE-1111')
  const busTwo = await makeBus('NE-2222')
  const busThree = await makeBus('NE-3333')
  const busFour = await makeBus('NE-4444')
  const busFive = await makeBus('NE-5555')
  const firstOne = await makeTrip(busOne, '2026-02-01', 'KTY_CMB')
  const returnOne = await makeTrip(busOne, '2026-02-02', 'CMB_KTY')
  const firstTwo = await makeTrip(busTwo, '2026-02-03', 'CMB_KTY')
  const returnTwo = await makeTrip(busTwo, '2026-02-04', 'KTY_CMB')
  const noExpenseFirst = await makeTrip(busThree, '2026-02-05', 'KTY_CMB')
  const noExpenseReturn = await makeTrip(busThree, '2026-02-06', 'CMB_KTY')
  const incompleteFirst = await makeTrip(busFour, '2026-02-07', 'KTY_CMB', 'scheduled')
  const incompleteReturn = await makeTrip(busFour, '2026-02-08', 'CMB_KTY', 'scheduled')
  const returningFirst = await makeTrip(busFive, '2026-02-09', 'CMB_KTY')
  const returningTrip = await makeTrip(busFive, '2026-02-10', 'KTY_CMB', 'scheduled')
  const manualBusNo = `MANUAL-${fixture.suffix}`
  const manualFirst = (await request('POST', '/api/trips', { bus_no: manualBusNo, travel_date: '2026-02-11', route_code: 'KTY_CMB', status: 'completed' }, 201)).trip
  const manualReturn = (await request('POST', '/api/trips', { bus_no: manualBusNo, travel_date: '2026-02-12', route_code: 'CMB_KTY', status: 'completed' }, 201)).trip

  await makeConfirmedBooking(firstOne, '01', 45000, 'paid')
  await makeConfirmedBooking(firstOne, '02', 35000, 'paid')
  const cancelledBooking = await makeConfirmedBooking(firstOne, '03', 9000)
  await request('POST', `/api/bookings/${cancelledBooking.id}/cancel`, {}, 200)
  await makeConfirmedBooking(returnOne, '01', 70000)
  await makeConfirmedBooking(firstTwo, '01', 50000, 'paid')
  await makeConfirmedBooking(returnTwo, '01', 40000)

  const dutyOne = (await request('POST', '/api/admin/duties', { bus_no: busOne.registration_no, first_trip_id: firstOne.id, return_trip_id: returnOne.id }, 201)).duty
  const dutyTwo = (await request('POST', '/api/admin/duties', { bus_no: busTwo.registration_no, first_trip_id: firstTwo.id, return_trip_id: returnTwo.id }, 201)).duty
  const dutyThree = (await request('POST', '/api/admin/duties', { bus_no: busThree.registration_no, first_trip_id: noExpenseFirst.id, return_trip_id: noExpenseReturn.id }, 201)).duty
  const dutyFour = (await request('POST', '/api/admin/duties', { bus_no: busFour.registration_no, first_trip_id: incompleteFirst.id, return_trip_id: incompleteReturn.id }, 201)).duty
  const dutyFive = (await request('POST', '/api/admin/duties', { bus_no: busFive.registration_no, first_trip_id: returningFirst.id, return_trip_id: returningTrip.id }, 201)).duty
  const manualDuty = (await request('POST', '/api/admin/duties', { bus_no: manualBusNo, first_trip_id: manualFirst.id, return_trip_id: manualReturn.id }, 201)).duty

  assert.equal(dutyOne.total_revenue, 150000)
  assert.equal(dutyOne.total_collected, 80000)
  assert.equal(dutyOne.total_outstanding, 70000)
  assert.equal(dutyTwo.total_revenue, 90000)
  assert.equal(dutyOne.status, 'awaiting_financial_review')
  assert.equal(dutyThree.status, 'awaiting_financial_review')
  assert.equal(dutyFour.status, 'in_progress')
  assert.equal(dutyFive.status, 'awaiting_return')
  assert.equal(manualDuty.bus_no, manualBusNo)
  assert.equal(manualDuty.status, 'awaiting_financial_review')
  const linkedManualTrips = await Promise.all([request('GET', `/api/trips/${manualFirst.id}`), request('GET', `/api/trips/${manualReturn.id}`)])
  assert.ok(linkedManualTrips[0].trip.bus_id)
  assert.equal(linkedManualTrips[0].trip.bus_id, linkedManualTrips[1].trip.bus_id)
  busIds.push(linkedManualTrips[0].trip.bus_id)

  const spareReturn = await makeTrip(busOne, '2026-02-07', 'CMB_KTY')
  await request('POST', '/api/admin/duties', { bus_no: busOne.registration_no, first_trip_id: firstOne.id, return_trip_id: spareReturn.id }, 409)
  await request('POST', `/api/admin/duties/${dutyFour.id}/finalize`, {}, 400)

  await request('POST', `/api/admin/duties/${dutyOne.id}/expenses`, { expense_date: '2026-02-01', trip_id: firstOne.id, category: 'Fuel', description: 'Outbound fuel', amount: 12000 }, 201)
  await request('POST', `/api/admin/duties/${dutyOne.id}/expenses`, { expense_date: '2026-02-02', category: 'Toll / parking charge', description: 'Return tolls', amount: 25000 }, 201)
  await request('POST', `/api/admin/duties/${dutyTwo.id}/expenses`, { expense_date: '2026-02-04', category: 'Fuel', description: 'Bus two fuel', amount: 4000 }, 201)

  const dashboard = await request('GET', '/api/admin/dashboard')
  const migratedGeneralExpense = dashboard.expenses.find((expense) => expense.description === 'Synthetic pre-duty expense')
  assert.ok(migratedGeneralExpense, 'synthetic general expenses remain separate from duty expenses')
  assert.equal(migratedGeneralExpense.duty_id, null)
  const listedOne = dashboard.duties.find((duty) => duty.id === dutyOne.id)
  const listedTwo = dashboard.duties.find((duty) => duty.id === dutyTwo.id)
  assert.equal(listedOne.total_expenses, 37000)
  assert.equal(listedOne.net_profit, 113000)
  assert.equal(listedTwo.total_expenses, 4000)
  assert.equal(listedTwo.net_profit, 86000)
  assert.equal(dashboard.duties.reduce((sum, duty) => sum + duty.total_revenue, 0), 240000)

  const missingExpenseAck = await request('POST', `/api/admin/duties/${dutyThree.id}/finalize`, {}, 400)
  assert.equal(missingExpenseAck.needs_expense_acknowledgement, true)
  await request('PATCH', `/api/trips/${returningTrip.id}`, { status: 'completed' })
  const afterReturn = await request('GET', '/api/admin/dashboard')
  assert.equal(afterReturn.duties.find((duty) => duty.id === dutyFive.id).status, 'awaiting_financial_review')
  await request('DELETE', `/api/trips/${firstOne.id}`, undefined, 409)
  const finalized = (await request('POST', `/api/admin/duties/${dutyOne.id}/finalize`, {}, 200)).duty
  assert.equal(finalized.net_profit, 113000)
  assert.equal(finalized.snapshot.total_revenue, 150000)
  await request('POST', `/api/admin/duties/${dutyOne.id}/finalize`, {}, 409)
  await request('POST', `/api/admin/duties/${dutyOne.id}/expenses`, { expense_date: '2026-02-03', category: 'Fuel', description: 'Late expense', amount: 1000 }, 409)
  await request('POST', `/api/bookings/${(await request('GET', `/api/bookings?tripId=${firstOne.id}`)).bookings[0].id}/cancel`, {}, 409)

  const noExpenseFinalized = (await request('POST', `/api/admin/duties/${dutyThree.id}/finalize`, { acknowledge_no_expenses: true }, 200)).duty
  assert.equal(noExpenseFinalized.total_expenses, 0)
  assert.equal(noExpenseFinalized.net_profit, 0)
})
