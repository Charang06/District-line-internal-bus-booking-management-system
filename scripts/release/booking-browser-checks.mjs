import {acceptanceHelpers} from './browser-acceptance.mjs'

export async function bookingReliabilityChecks(ctx){
  const {check,click,evaluate,wait}=ctx,{field,assert}=acceptanceHelpers(ctx)
  const select=async count=>{
    await click('Home');await wait('document.querySelector(".seat.available")')
    await evaluate(`[...document.querySelectorAll('.seat.available')].slice(0,${count}).forEach(e=>e.click())`)
    await field('.reservation-panel','Passenger Name','Synthetic multi-seat tester')
  }
  await check('double-click Save sends one multi-seat request',async()=>{
    await select(5)
    const before=await evaluate('window.__requests.filter(r=>r.path==="/api/bookings"&&r.method==="POST").length')
    await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Save Passenger booking');b.click();b.click()})()`)
    await wait('document.querySelectorAll(".seat.selected").length===0')
    const writes=await evaluate('window.__requests.filter(r=>r.path==="/api/bookings"&&r.method==="POST")')
    if(writes.length!==before+1||writes.at(-1).body.seat_numbers.length!==5)throw Error('Duplicate or incomplete batch request')
  })
  await check('lost response reconciles persisted synthetic seats and shows success once',async()=>{
    await select(2)
    await evaluate(`(()=>{const original=window.fetch;window.__restoreBookingFetch=()=>{window.fetch=original};window.__lostResponseWrites=0;window.fetch=async(input,options={})=>{const response=await original(input,options);if(String(input).endsWith('/api/bookings')&&options.method==='POST'){window.__lostResponseWrites++;throw new TypeError('Synthetic response lost after commit')}return response}})()`)
    try{
      await click('Save Passenger booking');await wait('document.querySelectorAll(".seat.selected").length===0')
      await assert('window.__lostResponseWrites===1','Lost response caused duplicate write')
      await assert('!document.body.textContent.includes("Unable to confirm whether")','Persisted result was not reconciled')
    }finally{await evaluate('window.__restoreBookingFetch()')}
  })
  await check('offline submission preserves passenger form and prevents blind retry',async()=>{
    await select(2)
    await evaluate(`(()=>{const original=window.fetch;window.__offlineWrites=0;window.__restoreBookingFetch=()=>{window.fetch=original};window.fetch=async(input,options={})=>{if(options.method==='POST'&&String(input).endsWith('/api/bookings'))window.__offlineWrites++;if(String(input).includes('/api/trips/')||options.method==='POST')throw new TypeError('Synthetic offline');return original(input,options)}})()`)
    try{
      await click('Save Passenger booking');await wait('document.body.textContent.includes("Unable to confirm whether")')
      await assert('document.querySelectorAll(".seat.selected").length===2','Failure cleared selected seats')
      await assert('[...document.querySelectorAll(".reservation-panel input")].some(e=>e.value==="Synthetic multi-seat tester")','Failure cleared passenger details')
      await click('Save Passenger booking')
      await assert('window.__offlineWrites===1','Retry wrote before successful reconciliation')
    }finally{await evaluate('window.__restoreBookingFetch()')}
    await click('Save Passenger booking');await wait('document.querySelectorAll(".seat.selected").length===0')
  })
}
