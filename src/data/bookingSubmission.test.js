import test from 'node:test'
import assert from 'node:assert/strict'
import {submitSeatBooking} from './bookingSubmission.js'

const submission={booking_group_id:'synthetic-group',trip_id:1,seat_numbers:['01','02'],passenger_name:'Synthetic'}
const bookings=submission.seat_numbers.map(seat_number=>({...submission,id:Number(seat_number),seat_number,status:'confirmed'}))

test('lost response reconciles persisted seats without a second write',async()=>{
  let pending,reads=0,writes=0
  const result=await submitSeatBooking({submission,remember:v=>{pending=v},send:async()=>{writes++;throw new TypeError('lost response')},read:async()=>{reads++;return{bookings}}})
  assert.equal(result.bookings.length,2);assert.equal(writes,1);assert.equal(reads,1);assert.equal(pending,null)
})

test('unknown result retains immutable attempt and blocks writes while read is unavailable',async()=>{
  let pending,writes=0
  const args={submission,remember:v=>{pending=v},send:async()=>{writes++;throw Error('timeout')},read:async()=>{throw Error('offline')}}
  await assert.rejects(submitSeatBooking(args),e=>e.bookingUncertain)
  assert.deepEqual(pending,submission)
  await assert.rejects(submitSeatBooking({...args,pending}),e=>e.bookingUncertain)
  assert.equal(writes,1)
})

test('retry reconciles first and reuses the exact group after a confirmed-empty read',async()=>{
  const order=[];let saved
  await submitSeatBooking({submission,pending:submission,remember:()=>{},read:async()=>{order.push('read');return{bookings:[]}},send:async body=>{order.push('write');saved=body;return{bookings,failed:[]}}})
  assert.deepEqual(order,['read','write']);assert.equal(saved,submission)
})

test('changed passenger or seats cannot replace an unresolved attempt',async()=>{
  await assert.rejects(submitSeatBooking({submission:{...submission,passenger_name:'Changed'},pending:submission,remember:()=>{},read:async()=>({bookings:[]}),send:async()=>assert.fail('must not send')}),e=>e.bookingUncertain)
})

test('malformed success does not clear an unresolved request or report success',async()=>{
  let pending
  await assert.rejects(submitSeatBooking({submission,remember:v=>{pending=v},send:async()=>({bookings:[]}),read:async()=>({bookings:[]})}),e=>e.bookingUncertain)
  assert.deepEqual(pending,submission)
})

test('known conflict preserves safe seat message and clears the pending attempt',async()=>{
  const conflict=Object.assign(new Error('Seat 01 is already booked.'),{status:409});let pending
  await assert.rejects(submitSeatBooking({submission,remember:v=>{pending=v},send:async()=>{throw conflict},read:async()=>assert.fail('known failure needs no reconciliation')}),conflict)
  assert.equal(pending,null)
})
