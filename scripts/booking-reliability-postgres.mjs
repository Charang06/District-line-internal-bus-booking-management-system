// Creates its own empty, loopback-only PostgreSQL cluster. Never reads .env.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import pg from 'pg'
import {serveBookingTestApp} from '../server/test-support/booking-app.js'
import {syntheticAccounts} from '../server/test-support/isolated-postgres.js'
import {submitSeatBooking} from '../src/data/bookingSubmission.js'

const root=path.resolve('artifacts/booking-reliability')
const bin=path.resolve(process.argv[2]||path.join(root,'pgsql/bin'))
if(!bin.startsWith(root+path.sep))throw Error('Only workspace-local portable PostgreSQL is supported')
const cluster=path.join(root,'cluster-'+Date.now())
fs.mkdirSync(cluster,{recursive:true})
const results=[],dbErrors=[],backendErrors=[]
const run=(name,args)=>execFileSync(path.join(bin,name+'.exe'),args,{stdio:'ignore',windowsHide:true,timeout:60000})
const port=await new Promise(resolve=>{const probe=net.createServer();probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p))})})
let pool,started=false
const apps=[]
const check=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,...detail})}catch(error){results.push({name,pass:false,error:error.message})}console.log(JSON.stringify(results.at(-1)))}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
try {
  run('initdb',['-D',path.join(cluster,'data'),'-U','synthetic_owner','-A','trust','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',path.join(cluster,'data'),'-l',path.join(cluster,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'])
  started=true
  pool=new pg.Pool({host:'127.0.0.1',port,user:'synthetic_owner',database:'postgres',ssl:false,max:10})
  const version=(await pool.query('SELECT version() AS version')).rows[0].version
  for(const name of ['001_initial_postgres.sql','002_auth_sessions.sql','003_password_recovery.sql','004_admin_email_recovery.sql'])
    await pool.query(fs.readFileSync(path.join('server/migrations',name),'utf8'))
  fs.writeFileSync(path.join(root,'isolation.json'),JSON.stringify({version,host:'127.0.0.1',port,cluster,createdByThisRun:true,syntheticOnly:true,externalConnections:false},null,2))
  const fixture=await syntheticAccounts(pool)
  const instrumented=new Proxy(pool,{get(target,key){
    if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(c,k){
      if(k==='query')return async(sql,params)=>{try{return await c.query(sql,params)}catch(error){dbErrors.push({code:error.code,operation:/INSERT INTO bookings/i.test(String(sql))?'insert_bookings':'other',constraint:error.constraint});throw error}}
      const value=Reflect.get(c,k,c);return typeof value==='function'?value.bind(c):value
    }})}
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
  }})
  const open=async (options,identity=fixture.admin)=>{const app=await serveBookingTestApp(instrumented,{recordError:(...args)=>backendErrors.push(args.map(arg=>typeof arg==='string'?arg:{code:arg.code}).filter(Boolean)),...options});apps.push(app);await app.request('POST','/api/login',{username:identity.username,password:fixture.password});return app}
  const app=await open({freezeBookingEntropy:true})
  const bus=(await app.request('POST','/api/buses',{registration_no:'SYN-'+fixture.suffix},201)).bus
  let tripDay=0
  const makeTrip=async()=> (await app.request('POST','/api/trips',{bus_id:bus.id,bus_no:bus.registration_no,travel_date:`2027-01-${String(++tripDay).padStart(2,'0')}`,route_code:'KTY_CMB',departure_time:'20:30'},201)).trip
  const body=trip=>({trip_id:trip.id,booking_group_id:randomUUID(),seat_numbers:['01','02'],passenger_name:'Synthetic Passenger',contact:'0770000001',gender:'Male',boarding_point:'Kattankudy',destination:'Colombo',fare:2700,notes:'Synthetic reliability test'})
  const persisted=async trip=>(await pool.query('SELECT * FROM bookings WHERE trip_id=$1 AND status=$2 ORDER BY seat_number',[trip.id,'confirmed'])).rows
  const source=fs.readFileSync('server/server.js','utf8')
  const oldLine='const bookingRef = `DL-P-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`'
  const baseline=await open({freezeBookingEntropy:true,sourceOverride:source.replace('const bookingRef = `DL-P-${randomUUID().toUpperCase()}`',oldLine)})
  await check('confirmed baseline reference collision: HTTP 500 / SQLSTATE 23505 / insert_bookings',async()=>{
    const trip=await makeTrip();await baseline.request('POST','/api/bookings',body(trip),500)
    assert.ok(dbErrors.some(e=>e.code==='23505'&&e.operation==='insert_bookings'&&e.constraint==='bookings_booking_ref_key'))
    assert.equal((await persisted(trip)).length,0)
    return {httpStatus:500,code:'23505',constraint:'bookings_booking_ref_key',operation:'insert_bookings',persisted:0}
  })
  await check('original random reference generator: 20 repeated 20-seat attempts',async()=>{
    const original=await open({sourceOverride:source.replace('const bookingRef = `DL-P-${randomUUID().toUpperCase()}`',oldLine)})
    const trip=await makeTrip();let failures=0
    for(let iteration=0;iteration<20;iteration++){
      const payload={...body(trip),seat_numbers:Array.from({length:20},(_,i)=>String(i+1).padStart(2,'0'))}
      try { await original.request('POST','/api/bookings',payload,201);assert.equal((await persisted(trip)).length,20) }
      catch(error){assert.match(error.message,/\(500\)$/);failures++;assert.equal((await persisted(trip)).length,0)}
      await pool.query("UPDATE bookings SET status='cancelled' WHERE trip_id=$1",[trip.id])
    }
    return {runs:20,failures,successes:20-failures}
  })
  for(const count of [1,2,5,10,20])await check(`repeated ${count}-seat batches, 20 runs with frozen timestamp/random`,async()=>{
    const trip=await makeTrip();let rows
    for(let iteration=0;iteration<20;iteration++){
      const payload={...body(trip),seat_numbers:Array.from({length:count},(_,i)=>String(i+1).padStart(2,'0'))}
      const response=await app.request('POST','/api/bookings',payload,201)
      assert.equal(response.bookings.length,count);assert.equal(response.failed.length,0)
      for(const row of response.bookings){assert.equal(row.travel_date,trip.travel_date);assert.equal(row.route_code,trip.route_code)}
      rows=await persisted(trip);assert.equal(rows.length,count)
      for(const row of rows){assert.equal(row.passenger_name,payload.passenger_name);assert.equal(row.notes,payload.notes);assert.equal(row.trip_id,trip.id);assert.equal(Number(row.fare),2700)}
      assert.equal(new Set(rows.map(row=>row.booking_ref)).size,count)
      await pool.query("UPDATE bookings SET status='cancelled' WHERE trip_id=$1",[trip.id])
    }
    return {runs:20,verifiedSeats:count*20}
  })
  await check('legacy single-seat endpoint remains unchanged',async()=>{
    const trip=await makeTrip(),payload={...body(trip),seat_number:'01'};delete payload.seat_numbers
    const result=await app.request('POST','/api/bookings',payload,201)
    assert.equal(result.booking.seat_number,'01');assert.equal((await persisted(trip)).length,1)
  })
  await check('duplicate/invalid seats reject without persistence; partial conflicts retain available seats',async()=>{
    const trip=await makeTrip(),payload=body(trip)
    await app.request('POST','/api/bookings',{...payload,seat_numbers:['1','01']},400)
    await app.request('POST','/api/bookings',{...payload,seat_numbers:['50']},400)
    assert.equal((await persisted(trip)).length,0)
    await app.request('POST','/api/bookings',{...payload,seat_numbers:['01']},201)
    const partial=await app.request('POST','/api/bookings',{...payload,booking_group_id:randomUUID()},201)
    assert.deepEqual(partial.failed.map(row=>row.seat_number),['01']);assert.equal((await persisted(trip)).length,2)
    await app.request('POST','/api/bookings',{...payload,booking_group_id:randomUUID()},409)
  })
  await check('concurrent submissions and same-group double submit do not duplicate seats',async()=>{
    const other=await open({freezeBookingEntropy:true},fixture.staff),trip=await makeTrip(),payload=body(trip)
    const responses=await Promise.allSettled([app.request('POST','/api/bookings',payload,201),other.request('POST','/api/bookings',{...payload,booking_group_id:randomUUID(),seat_numbers:['02','01']},201)])
    assert.equal(responses.filter(r=>r.status==='fulfilled').length,1)
    assert.equal((await persisted(trip)).length,2)
    const duplicateApp=await open({freezeBookingEntropy:true}),next=await makeTrip(),same=body(next)
    const duplicates=await Promise.all([app.request('POST','/api/bookings',same,201),duplicateApp.request('POST','/api/bookings',same,201)])
    assert.deepEqual(duplicates[0].bookings.map(r=>r.id),duplicates[1].bookings.map(r=>r.id));assert.equal((await persisted(next)).length,2)
  })
  await check('audit failure rolls back all seats; exact same-group retry succeeds',async()=>{
    const failing=await open({failBookingAuditOnce:true}),trip=await makeTrip(),payload=body(trip)
    await failing.request('POST','/api/bookings',payload,500);assert.equal((await persisted(trip)).length,0)
    await failing.request('POST','/api/bookings',payload,201);assert.equal((await persisted(trip)).length,2)
  })
  await check('lost successful response reconciles real persisted records without retry',async()=>{
    const trip=await makeTrip(),submission=body(trip);let writes=0,pending
    const result=await submitSeatBooking({submission,remember:v=>{pending=v},send:async body=>{writes++;await app.request('POST','/api/bookings',body,201);throw Error('Synthetic response loss after commit')},read:id=>app.request('GET','/api/trips/'+id)})
    assert.equal(writes,1);assert.equal(result.bookings.length,2);assert.equal(pending,null);assert.equal((await persisted(trip)).length,2)
  })
  await check('request timeout before commit retains attempt; retry reconciles original transaction',async()=>{
    const delayed=await open({delayBookingInsertMs:150}),trip=await makeTrip(),submission=body(trip);let pending,write
    const send=()=>{write=delayed.request('POST','/api/bookings',submission,201);return Promise.race([write,pause(40).then(()=>{throw Error('Synthetic client timeout')})])}
    await assert.rejects(submitSeatBooking({submission,remember:v=>{pending=v},send,read:id=>app.request('GET','/api/trips/'+id)}),e=>e.bookingUncertain)
    assert.deepEqual(pending,submission);await write
    const result=await submitSeatBooking({submission,pending,remember:v=>{pending=v},send:()=>assert.fail('must reconcile, not write again'),read:id=>app.request('GET','/api/trips/'+id)})
    assert.equal(result.bookings.length,2);assert.equal((await persisted(trip)).length,2);assert.equal(pending,null)
  })
}catch(error){results.push({name:'harness',pass:false,error:error.message});console.error(error.message)}
finally {
  for(const app of apps)await app.close()
  await pool?.end()
  if(started)run('pg_ctl',['-D',path.join(cluster,'data'),'-m','fast','-w','stop'])
  const output={results,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,dbErrors,backendErrors,clusterStopped:started,syntheticOnly:true}
  fs.writeFileSync(path.join(root,'postgres-results.json'),JSON.stringify(output,null,2))
  if(output.failed)process.exitCode=1
}
