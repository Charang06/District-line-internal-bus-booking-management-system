import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultRevenueSeatRows, calculateRevenueSeatRows, MAX_REVENUE_SEAT_ROW_COUNT } from './revenueSeatRows.js'
import { normalizeRevenueSeatRows } from '../../server/revenue-seat-rows.js'
test('four default categories, 49-seat cap and explicit draft preservation',()=>{
  assert.equal(MAX_REVENUE_SEAT_ROW_COUNT,49)
  const defaults=createDefaultRevenueSeatRows();assert.equal(defaults.length,4)
  assert.equal(calculateRevenueSeatRows(defaults).validationError,'')
  const draft=[...defaults,{category:'Candidate extra',count:'2',amount:'50'}]
  const restored=createDefaultRevenueSeatRows(draft)
  assert.equal(restored.length,5);assert.equal(restored[4].amount,'50')
  assert.ok(calculateRevenueSeatRows(restored).validationError)
  assert.equal(draft.length,5)
})
test('frontend/backend agree on production count, fare, blank coercion and totals',()=>{
  const values=[0,1,24,25,49,50,1000000,-1,1.5,'','1.0',null,undefined,NaN,Infinity]
  for(const count of values)for(const amount of [0,10,100000000,100000001,-1,1.5,'',null,undefined]){
    const rows=createDefaultRevenueSeatRows();rows[0]={...rows[0],count,amount}
    const client=calculateRevenueSeatRows(rows),server=normalizeRevenueSeatRows(rows)
    assert.equal(Boolean(client.validationError),Boolean(server.error),String([count,amount]))
    if(!server.error){assert.equal(client.seatCount,server.seatCount);assert.equal(client.seatSubtotal,server.subtotal)}
  }
  const combined=createDefaultRevenueSeatRows();combined[0].count=25;combined[1].count=25
  assert.ok(calculateRevenueSeatRows(combined).validationError);assert.ok(normalizeRevenueSeatRows(combined).error)
})
