import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRevenueSeatRows, DEFAULT_REVENUE_SEAT_CATEGORIES } from './revenue-seat-rows.js'
const rows = (count=0, amount=0) => DEFAULT_REVENUE_SEAT_CATEGORIES.map((category,index)=>({category,count:index===0?count:0,amount:index===0?amount:0}))
test('production manual revenue accepts four canonical rows and the 49-seat boundary',()=>{
  const result=normalizeRevenueSeatRows(rows(49,100000000))
  assert.equal(result.seatCount,49);assert.equal(result.subtotal,4900000000)
  assert.deepEqual(result.rows.map(r=>r.category),DEFAULT_REVENUE_SEAT_CATEGORIES)
  const relabeled=rows(2,100);relabeled[0].category='custom label'
  assert.equal(normalizeRevenueSeatRows(relabeled).rows[0].category,'Standard')
})
test('manual revenue accepts extra fare lines only under Agent / Extra and enforces limits',()=>{
  const extra=normalizeRevenueSeatRows([...rows(),{category:'Agent / Extra',count:2,amount:75}])
  assert.equal(extra.seatCount,2);assert.equal(extra.subtotal,150);assert.equal(extra.rows[4].category,'Agent / Extra')
  for(const input of [null,[],rows().slice(0,3),[...rows(),{category:'Extra',count:1,amount:1}], [...rows(),{category:'Agent / Extra',count:1,amount:1},...Array.from({length:30},()=>({category:'Agent / Extra',count:0,amount:0}))],rows(50,1),rows(1000000,1)])assert.ok(normalizeRevenueSeatRows(input).error)
  const combined=rows(25,10);combined[1].count=25;assert.match(normalizeRevenueSeatRows(combined).error,/49-seat/)
})
test('manual revenue still rejects per-row or combined capacity excess',()=>{
  for(const input of [rows(50,1),rows(1000000,1)])assert.ok(normalizeRevenueSeatRows(input).error)
})
test('production whole-rupee/integer validation and Number coercion are retained',()=>{
  for(const value of [-1,1.5,Infinity,NaN,9007199254740992])assert.ok(normalizeRevenueSeatRows(rows(value,10)).error)
  for(const value of [-1,1.5,100000001,Infinity,NaN])assert.ok(normalizeRevenueSeatRows(rows(1,value)).error)
  for(const value of ['',null,'0','1.0'])assert.equal(normalizeRevenueSeatRows(rows(value,value)).error,undefined)
  const missing=rows();delete missing[0].count;assert.ok(normalizeRevenueSeatRows(missing).error)
})
