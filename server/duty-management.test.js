import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import sqlite3 from 'sqlite3'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'

async function freePort() {
  const listener = net.createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const { port } = listener.address()
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
  return port
}

test('bus duties keep bus finances separate, calculate revenue and expenses once, and freeze final reports', {
  skip: 'Legacy harness targets an ignored SQLite path and writes to PostgreSQL; replace it before enabling database integration runs.',
}, async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'district-line-duty-test-'))
  const databasePath = path.join(temporaryDirectory, 'duties.sqlite')
  const legacyDatabase = new (sqlite3.verbose().Database)(databasePath)
  await new Promise((resolve, reject) => legacyDatabase.serialize(() => {
    legacyDatabase.run(`CREATE TABLE daily_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (error) => error ? reject(error) : legacyDatabase.run(
      'INSERT INTO daily_expenses (expense_date, category, description, amount) VALUES (?, ?, ?, ?)',
      ['2026-01-31', 'Fuel', 'Pre-duty legacy expense', 1200],
      (insertError) => insertError ? reject(insertError) : resolve(),
    ))
  }))
  await new Promise((resolve, reject) => legacyDatabase.close((error) => error ? reject(error) : resolve()))
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, [path.resolve('server/server.js')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      BUS_BOOKING_DB_PATH: databasePath,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let serverErrors = ''
  server.stderr.setEncoding('utf8').on('data', (chunk) => { serverErrors += chunk })
  t.after(async () => {
    server.kill()
    await Promise.race([once(server, 'exit'), delay(3000)])
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  let ready = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Test API stopped during startup: ${serverErrors}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) { ready = true; break }
    } catch { /* wait for the isolated API to start */ }
    await delay(125)
  }
  assert.equal(ready, true, `Test API did not start: ${serverErrors}`)

  let token = ''
  async function request(method, route, body, expectedStatus = 200) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const result = await response.json()
    assert.equal(response.status, expectedStatus, `${method} ${route}: ${result.message || response.statusText}`)
    return result
  }

  const login = await request('POST', '/api/login', { username: 'admin_kt', password: 'admin123' })
  token = login.token

  async function makeBus(registration_no) {
    return (await request('POST', '/api/buses', { registration_no, display_name: registration_no }, 201)).bus
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
  const manualFirst = (await request('POST', '/api/trips', { bus_no: 'MANUAL-700', travel_date: '2026-02-11', route_code: 'KTY_CMB', status: 'completed' }, 201)).trip
  const manualReturn = (await request('POST', '/api/trips', { bus_no: 'MANUAL-700', travel_date: '2026-02-12', route_code: 'CMB_KTY', status: 'completed' }, 201)).trip

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
  const manualDuty = (await request('POST', '/api/admin/duties', { bus_no: 'MANUAL-700', first_trip_id: manualFirst.id, return_trip_id: manualReturn.id }, 201)).duty

  assert.equal(dutyOne.total_revenue, 150000)
  assert.equal(dutyOne.total_collected, 80000)
  assert.equal(dutyOne.total_outstanding, 70000)
  assert.equal(dutyTwo.total_revenue, 90000)
  assert.equal(dutyOne.status, 'awaiting_financial_review')
  assert.equal(dutyThree.status, 'awaiting_financial_review')
  assert.equal(dutyFour.status, 'in_progress')
  assert.equal(dutyFive.status, 'awaiting_return')
  assert.equal(manualDuty.bus_no, 'MANUAL-700')
  assert.equal(manualDuty.status, 'awaiting_financial_review')
  const linkedManualTrips = await Promise.all([request('GET', `/api/trips/${manualFirst.id}`), request('GET', `/api/trips/${manualReturn.id}`)])
  assert.ok(linkedManualTrips[0].trip.bus_id)
  assert.equal(linkedManualTrips[0].trip.bus_id, linkedManualTrips[1].trip.bus_id)

  const spareReturn = await makeTrip(busOne, '2026-02-07', 'CMB_KTY')
  await request('POST', '/api/admin/duties', { bus_no: busOne.registration_no, first_trip_id: firstOne.id, return_trip_id: spareReturn.id }, 409)
  await request('POST', `/api/admin/duties/${dutyFour.id}/finalize`, {}, 400)

  await request('POST', `/api/admin/duties/${dutyOne.id}/expenses`, { expense_date: '2026-02-01', trip_id: firstOne.id, category: 'Fuel', description: 'Outbound fuel', amount: 12000 }, 201)
  await request('POST', `/api/admin/duties/${dutyOne.id}/expenses`, { expense_date: '2026-02-02', category: 'Toll / parking charge', description: 'Return tolls', amount: 25000 }, 201)
  await request('POST', `/api/admin/duties/${dutyTwo.id}/expenses`, { expense_date: '2026-02-04', category: 'Fuel', description: 'Bus two fuel', amount: 4000 }, 201)

  const dashboard = await request('GET', '/api/admin/dashboard')
  const migratedGeneralExpense = dashboard.expenses.find((expense) => expense.description === 'Pre-duty legacy expense')
  assert.ok(migratedGeneralExpense, 'existing daily expenses survive the duty schema migration')
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
