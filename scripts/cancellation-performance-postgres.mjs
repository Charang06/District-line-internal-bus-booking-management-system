// Owns a new verified-empty local cluster; never reads application environment files.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {serveBookingTestApp} from '../server/test-support/booking-app.js'
import {syntheticAccounts} from '../server/test-support/isolated-postgres.js'
const stage=process.argv.includes('--before')?'before':'after'
const root=path.resolve('artifacts/cancellation-performance'),bin=path.resolve('artifacts/booking-reliability/pgsql/bin')
const cluster=path.join(root,'cluster-'+Date.now());fs.mkdirSync(cluster,{recursive:true})
const run=(name,args)=>execFileSync(path.join(bin,name+'.exe'),args,{stdio:'ignore',windowsHide:true,timeout:60000})
const port=await new Promise(resolve=>{const p=net.createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n))})})
const pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[],timings=[],queries=[],transactions=[],perf=[],apps=[]
let pool,started=false,queryDelay=0,failCancelAudit=false,delayCancel=0
const check=async(name,fn)=>{try{await fn();results.push({name,pass:true})}catch(error){results.push({name,pass:false,error:error.message})}console.log(JSON.stringify(results.at(-1)))}
try{
 run('initdb',['-D',path.join(cluster,'data'),'-U','synthetic_owner','-A','trust','--no-locale','-E','UTF8'])
 run('pg_ctl',['-D',path.join(cluster,'data'),'-l',path.join(cluster,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true
 pool=new pg.Pool({host:'127.0.0.1',port,user:'synthetic_owner',database:'postgres',ssl:false,max:10})
 const identity=(await pool.query("SELECT current_database() AS database,version(),current_setting('data_directory') AS data_directory,pg_postmaster_start_time() AS started")).rows[0]
 assert.equal(fs.realpathSync(identity.data_directory),fs.realpathSync(path.join(cluster,'data')))
 assert.equal((await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count,'0')
 fs.writeFileSync(path.join(root,'isolation-'+stage+'.json'),JSON.stringify({...identity,host:'127.0.0.1',port,independentlyVerifiedEmpty:true,createdByHarness:true,syntheticOnly:true},null,2))
 for(const file of ['001_initial_postgres.sql','002_auth_sessions.sql','003_password_recovery.sql','004_admin_email_recovery.sql'])await pool.query(fs.readFileSync('server/migrations/'+file,'utf8'))
 const fixture=await syntheticAccounts(pool)
 const instrumented=new Proxy(pool,{get(target,key){
  if(key==='connect')return async()=>{const client=await target.connect();let txStart;return new Proxy(client,{get(c,k){
   if(k==='query')return async(sql,params)=>{
    const start=performance.now(),statement=String(sql),operation=statement.trim().split(/\s+/)[0]
    if(operation==='BEGIN')txStart=start
    try{
     if(queryDelay)await pause(queryDelay)
     if(delayCancel&&/UPDATE bookings SET status = 'cancelled'/.test(statement))await pause(delayCancel)
     if(failCancelAudit&&/INSERT INTO audit_logs/.test(statement)&&params?.includes('booking.cancel')){failCancelAudit=false;return await c.query('SELECT 1/0')}
     return await c.query(sql,params)
    }finally{queries.push({operation,ms:performance.now()-start});if(['COMMIT','ROLLBACK'].includes(operation)&&txStart){transactions.push({operation,ms:performance.now()-txStart});txStart=null}}
   }
   const value=Reflect.get(c,k,c);return typeof value==='function'?value.bind(c):value
  }})}
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
 }})
 const source=stage==='before'?fs.readFileSync(path.join(root,'baseline-server.js'),'utf8'):undefined
 const open=async(user=fixture.admin)=>{const app=await serveBookingTestApp(instrumented,{sourceOverride:source,recordInfo:text=>{try{perf.push(JSON.parse(text))}catch{}}});apps.push(app);await app.request('POST','/api/login',{username:user.username,password:fixture.password});return app}
 const app=await open(),staff=await open(fixture.staff)
 const bus=(await app.request('POST','/api/buses',{registration_no:'SYN-'+fixture.suffix},201)).bus
 let day=0
 const trip=async()=> (await app.request('POST','/api/trips',{bus_id:bus.id,bus_no:bus.registration_no,travel_date:`2027-02-${String(++day).padStart(2,'0')}`,route_code:'KTY_CMB',departure_time:'20:30'},201)).trip
 const book=async(t,seats=['01'])=>(await app.request('POST','/api/bookings',{trip_id:t.id,booking_group_id:randomUUID(),seat_numbers:seats,passenger_name:'Synthetic Cancellation',contact:'0770000001',gender:'Male',boarding_point:'Kattankudy',destination:'Colombo',fare:2700},201)).bookings
 const status=async id=>(await pool.query('SELECT status FROM bookings WHERE id=$1',[id])).rows[0].status
 const cancel=(server,id,expected=200)=>server.request('POST',`/api/bookings/${id}/cancel`,{},expected)
 const auditCount=async id=>Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action='booking.cancel' AND entity_id=$1",[String(id)])).rows[0].count)
 for(const latency of [0,10])for(const size of [1,5])for(let repeat=0;repeat<3;repeat++){
  const t=await trip(),rows=await book(t,Array.from({length:size},(_,i)=>String(i+1).padStart(2,'0')))
  queryDelay=latency
  const q=queries.length,tx=transactions.length,start=performance.now()
  if(stage==='before')for(const row of rows)await cancel(app,row.id)
  else {for(let offset=0;offset<rows.length;offset+=4)await Promise.all(rows.slice(offset,offset+4).map(row=>cancel(app,row.id)))}
  const ms=performance.now()-start;queryDelay=0
  timings.push({size,repeat,queryLatencyMs:latency,apiMs:ms,queryCount:queries.length-q,transactionMs:transactions.slice(tx).map(t=>t.ms),apiPerf:perf.filter(p=>p.path?.endsWith('/cancel')).slice(-size),queryStages:queries.slice(q)})
  for(const row of rows){assert.equal(await status(row.id),'cancelled');assert.equal(await auditCount(row.id),1)}
 }
 await check('one confirmed booking, seat freed only after persistence and rebooking',async()=>{
  const t=await trip(),[row]=await book(t);await app.request('PATCH',`/api/bookings/${row.id}/confirmation`,{confirmation_status:'confirmed'})
  await cancel(app,row.id);assert.equal(await status(row.id),'cancelled');assert.equal(await auditCount(row.id),1)
  const [next]=await book(t);assert.notEqual(next.id,row.id);assert.equal(await status(next.id),'confirmed')
 })
 await check('different trips remain isolated; already-cancelled request preserves audit',async()=>{
  const a=await trip(),b=await trip(),[first]=await book(a),[other]=await book(b)
  await cancel(app,first.id);await cancel(app,first.id,400)
  assert.equal(await status(other.id),'confirmed');assert.equal(await auditCount(first.id),1)
 })
 if(stage==='before')await check('baseline audit failure occurs after commit and returns failure for a persisted cancellation',async()=>{
  const t=await trip(),[row]=await book(t);failCancelAudit=true
  await cancel(app,row.id,500);assert.equal(await status(row.id),'cancelled');assert.equal(await auditCount(row.id),0)
 })
 if(stage==='after'){
  await check('concurrent cancellation has one committed transition and one audit',async()=>{
   const t=await trip(),[row]=await book(t),responses=await Promise.allSettled([cancel(app,row.id),cancel(staff,row.id)])
   assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);assert.equal(await auditCount(row.id),1);assert.equal(await status(row.id),'cancelled')
  })
  await check('cancellation audit database failure rolls back status and preserves occupied seat',async()=>{
   const t=await trip(),[row]=await book(t);failCancelAudit=true;await cancel(app,row.id,500)
   assert.equal(await status(row.id),'confirmed');assert.equal(await auditCount(row.id),0)
   await app.request('POST','/api/bookings',{trip_id:t.id,seat_number:'01',passenger_name:'Synthetic',fare:2700},409)
   await cancel(app,row.id);assert.equal(await auditCount(row.id),1)
  })
  await check('timeout reconciliation observes persisted result without duplicate audit',async()=>{
   const t=await trip(),[row]=await book(t);delayCancel=150
   const pending=cancel(app,row.id)
   await assert.rejects(Promise.race([pending,pause(30).then(()=>{throw Error('Synthetic network timeout')})]),/timeout/)
   assert.equal(await status(row.id),'confirmed');await pending;delayCancel=0
   const fresh=await app.request('GET','/api/trips/'+t.id)
   assert.equal(fresh.bookings.find(b=>b.id===row.id).status,'cancelled');assert.equal(await auditCount(row.id),1)
  })
  await check('concurrent rebooking and cancellation preserve active-seat uniqueness',async()=>{
   const t=await trip(),[row]=await book(t)
   const raced=await Promise.allSettled([cancel(app,row.id),book(t)])
   assert.equal(raced[0].status,'fulfilled');assert.equal(await status(row.id),'cancelled')
   const count=Number((await pool.query("SELECT count(*) FROM bookings WHERE trip_id=$1 AND seat_number='01' AND status='confirmed'",[t.id])).rows[0].count)
   assert.ok(count<=1);if(count===0)await book(t)
   assert.equal(await auditCount(row.id),1)
  })
  await check('unauthorized staff cannot cancel; Log refresh reflects persisted status',async()=>{
   await pool.query('UPDATE users SET permissions=$1 WHERE id=$2',[JSON.stringify({home:true,log:false,passengers:false}),fixture.staff.id])
   const denied=await open(fixture.staff),t=await trip(),[row]=await book(t)
   await cancel(denied,row.id,403);assert.equal(await status(row.id),'confirmed')
   await cancel(app,row.id);const logs=await app.request('GET',`/api/bookings?tripId=${t.id}`)
   assert.equal(logs.bookings.find(b=>b.id===row.id).status,'cancelled')
  })
  await check('finalized duty remains immutable and no cancellation audit is added',async()=>{
   const first=await trip(),second=await trip(),[row]=await book(first)
   await pool.query("INSERT INTO bus_duties(duty_code,bus_id,first_trip_id,return_trip_id,start_date,status,created_by) VALUES($1,$2,$3,$4,$5,'finalized',$6)",['SYN-FINAL-'+randomUUID(),bus.id,first.id,second.id,first.travel_date,fixture.admin.id])
   await cancel(app,row.id,409);assert.equal(await status(row.id),'confirmed');assert.equal(await auditCount(row.id),0)
  })
 }
}catch(error){results.push({name:'harness',pass:false,error:error.message});console.error(error.message)}finally{
 for(const app of apps)await app.close();await pool?.end()
 if(started)run('pg_ctl',['-D',path.join(cluster,'data'),'-m','fast','-w','stop'])
 fs.writeFileSync(path.join(root,'postgres-'+stage+'.json'),JSON.stringify({results,timings,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,clusterStopped:started},null,2))
 if(results.some(r=>!r.pass))process.exitCode=1
}
