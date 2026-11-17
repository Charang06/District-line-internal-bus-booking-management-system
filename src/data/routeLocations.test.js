import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES, boardingLocations, droppingLocations, validRouteLocations } from './seatLayout.js'

test('boarding and dropping options preserve each configured route direction', () => {
  const outward = ROUTES[0]
  assert.deepEqual(outward.stops, ['Kattankudy', 'Batticaloa', 'Eravur', 'Valaichenai', 'Oddamavadi', 'Gallela', 'Polonnaruwa', 'Dambulla', 'Kurunegala', 'Mirigama', 'Minuwangoda', 'Airport', 'Colombo', 'Pettah', 'Maradana', 'Kollupitiya', 'Bambalapitiya', 'Wellawatta', 'Dehiwala'])
  assert.deepEqual(boardingLocations(outward), outward.stops.slice(0, -1))
  assert.deepEqual(droppingLocations(outward, 'Eravur'), outward.stops.slice(outward.stops.indexOf('Eravur') + 1))

  const returnRoute = ROUTES[1]
  assert.deepEqual(returnRoute.stops, ['Dehiwala', 'Wellawatta', 'Bambalapitiya', 'Kollupitiya', 'Maradana', 'Pettah', 'Colombo', 'Airport', 'Minuwangoda', 'Mirigama', 'Kurunegala', 'Dambulla', 'Polonnaruwa', 'Gallela', 'Oddamavadi', 'Valaichenai', 'Eravur', 'Batticaloa', 'Kattankudy'])
  assert.deepEqual(boardingLocations(returnRoute), returnRoute.stops.slice(0, -1))
  assert.deepEqual(droppingLocations(returnRoute, 'Kurunegala'), ['Dambulla', 'Polonnaruwa', 'Gallela', 'Oddamavadi', 'Valaichenai', 'Eravur', 'Batticaloa', 'Kattankudy'])
})

test('destination choices exclude same-stop and backward travel', () => {
  const route = ROUTES[0]
  assert.deepEqual(droppingLocations(route, 'Dehiwala'), [])
  assert.equal(validRouteLocations(route, 'Eravur', 'Eravur'), false)
  assert.equal(validRouteLocations(route, 'Eravur', 'Batticaloa'), false)
  assert.equal(validRouteLocations(route, 'Eravur', 'Colombo'), true)
  assert.deepEqual(droppingLocations(route, 'unknown'), [])
})
