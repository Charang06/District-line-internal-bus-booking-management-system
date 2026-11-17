import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
const root='artifacts/cancellation-performance/'
const read=name=>JSON.parse(fs.readFileSync(root+name,'utf8').replace(/^\uFEFF/,''))
const mean=values=>Number((values.reduce((sum,n)=>sum+n,0)/values.length).toFixed(2))
const output={database:[],browser:[]}
for(const stage of ['before','after']){
 const data=read('postgres-'+stage+'.json')
 for(const latency of [0,10])for(const size of [1,5]){
  const rows=data.timings.filter(row=>row.size===size&&row.queryLatencyMs===latency)
  const perf=rows.flatMap(row=>row.apiPerf)
  const labels=[...new Set(perf.flatMap(row=>row.db_query_breakdown.map(x=>x.statement)))]
  output.database.push({stage,seats:size,injectedQueryLatencyMs:latency,repetitions:rows.length,apiTotalMs:mean(rows.map(row=>row.apiMs)),queriesPerSeat:rows[0].queryCount/size,
   transactionPerSeatMs:mean(rows.flatMap(row=>row.transactionMs)),authPerSeatMs:mean(perf.map(row=>row.auth_ms)),
   stages:labels.map(statement=>({statement,totalPerSeatMs:mean(perf.map(row=>row.db_query_breakdown.find(x=>x.statement===statement)?.total_ms||0))}))})
 }
 output.browser.push(...read('browser-'+stage+'.json').map(row=>({stage,seats:row.size,dialogMs:Number(row.dialogMs.toFixed(2)),busyMs:row.busyMs==null?null:Number(row.busyMs.toFixed(2)),rowUpdateMs:Number(row.updateMs.toFixed(2)),requestCount:row.requestCount,requestDelayMs:75})))
}
fs.writeFileSync(root+'timing-comparison.json',JSON.stringify(output,null,2))
const beforeServer=fs.readFileSync(root+'baseline-server.js','utf8'),afterServer=fs.readFileSync('server/server.js','utf8')
const outsideCancellation=text=>{
 const start=text.indexOf("app.post('/api/bookings/:id/cancel'")
 const end=text.indexOf("app.patch('/api/bookings/:id/confirmation'",start)
 assert.ok(start>0&&end>start)
 return text.slice(0,start)+text.slice(end)
}
const confirmationHandler=text=>text.slice(text.indexOf('  const handleBookingConfirmation ='),text.indexOf('  const handleSaveCustomerDetails ='))
const baseline=JSON.parse(fs.readFileSync('docs/handover/districtline-booking-candidate-manifest.json','utf8'))
const preservation={serverOutsideCancellationIdentical:outsideCancellation(beforeServer)===outsideCancellation(afterServer),
 confirmationHandlerIdentical:confirmationHandler(fs.readFileSync(root+'baseline-App.jsx','utf8'))===confirmationHandler(fs.readFileSync('src/App.jsx','utf8')),
 homeFilesUnchanged:['src/components/TripWorkspace.jsx','src/data/bookingSubmission.js','src/data/seatLayout.js'].every(file=>fs.readFileSync(path.join(baseline.candidate,file)).equals(fs.readFileSync(file)))}
assert.ok(Object.values(preservation).every(Boolean),'Protected implementation changed')
fs.writeFileSync(root+'preservation.json',JSON.stringify(preservation,null,2))
console.log(JSON.stringify({database:output.database.map(({stages,...row})=>row),browser:output.browser},null,2))
