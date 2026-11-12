// Opt-in only. This suite never loads .env or provisions/migrates a database.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import pg from 'pg'
import { verifyDatabaseBaseline } from './database-startup.js'
import { requireEmptyApplication, syntheticAccounts } from './test-support/isolated-postgres.js'
import { serveBookingTestApp, cleanupBookingFixtures } from './test-support/booking-app.js'
import { validateDisposableAttestation } from './test-support/disposable-attestation.js'
const enabled=process.env.DISTRICT_DISPOSABLE_LOCAL_TESTS==='owner-attested-empty-local-only'
test('real disposable local PostgreSQL: schema, booking conflicts, finance, permissions and finalized immutability', {skip:!enabled?'No independently verified disposable local PostgreSQL instance/attestation; no connection attempted':false},async t=>{
 // Attestation must be supplied after an operator checks process/container identity,
 // dedicated storage/network and absence of real data. A hostname alone is not evidence.
 const proof=JSON.parse(fs.readFileSync(process.env.DISTRICT_DISPOSABLE_ATTESTATION,'utf8'))
 const config=validateDisposableAttestation(proof,process.env)
 const pool=new pg.Pool({...config,password:process.env.DISTRICT_DISPOSABLE_PASSWORD})
 let fixture,server;const busIds=[]
 t.after(async()=>{try{await server?.close()}finally{try{await cleanupBookingFixtures(pool,fixture,busIds)}finally{await pool.end()}}})
 const role=await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')
 assert.equal(role.rows.length,1)
 for(const flag of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'])assert.equal(role.rows[0][flag],false,'Test login must not have '+flag)
 const ownership=await pool.query("SELECT pg_has_role(current_user,datdba,'MEMBER') AS owner_member FROM pg_database WHERE datname=current_database()")
 assert.equal(ownership.rows[0].owner_member,false,'Test login must not own or be a member of the database owner role')
 const schemaGrant=await pool.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create, has_table_privilege(current_user,'public.schema_meta','INSERT') AS can_forge_baseline")
 assert.equal(schemaGrant.rows[0].can_create,false)
 assert.equal(schemaGrant.rows[0].can_forge_baseline,false)
 await requireEmptyApplication(pool)
 await verifyDatabaseBaseline(pool,{})
 for(const [table,columns] of Object.entries({
  users:['id','permissions','password_hash'],auth_sessions:['token_hash','idle_expires_at','expires_at'],
  bookings:['trip_id','seat_number','status','confirmation_status'],trips:['bus_id','travel_date','route_code'],
  revenue_entries:['seat_rows_json','cargo_rows_json','total_revenue','status','locked_at'],
  expense_submissions:['items_json','gross_revenue','total_expense','status'],
  bus_duties:['first_trip_id','return_trip_id','snapshot_json','status'],
  daily_expenses:['duty_id','trip_id','amount'],duty_adjustments:['duty_id','type','amount'],
 })) {
  const actual=await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table])
  for(const column of columns)assert.ok(actual.rows.some(r=>r.column_name===column),table+'.'+column)
 }
 const schema=await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_active_trip_seat'")
 assert.match(schema.rows[0]?.indexdef||'',/UNIQUE/);assert.match(schema.rows[0].indexdef,/confirmed/)
 const grants=await pool.query("SELECT has_table_privilege(current_user,'public.bookings','SELECT') AND has_table_privilege(current_user,'public.bookings','INSERT') AND has_table_privilege(current_user,'public.bookings','UPDATE') AS allowed")
 assert.equal(grants.rows[0].allowed,true)
 for(const table of ['users','auth_sessions','crew_members','bus_contacts','buses','trips','bookings','sms_attempts','cargo','revenue_entries','expense_submissions','bus_duties','daily_expenses','duty_adjustments','audit_logs']) {
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
   const grant=await pool.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed',['public.'+table,privilege])
   assert.equal(grant.rows[0].allowed,true,table+' '+privilege)
  }
 }
 const indexes=await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")
 for(const name of ['uniq_active_trip_seat','idx_trips_date_route','idx_bookings_trip','idx_cargo_date','idx_duty_bus_status','idx_duty_expenses','idx_auth_sessions_user','idx_auth_sessions_expiry'])assert.ok(indexes.rows.some(r=>r.indexname===name),name)
 const foreignKeys=await pool.query("SELECT conrelid::regclass::text AS table_name FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")
 for(const table of ['bookings','auth_sessions','bus_duties','daily_expenses'])assert.ok(foreignKeys.rows.some(r=>[table,'public.'+table].includes(r.table_name)),table+' foreign keys')
 fixture=await syntheticAccounts(pool);server=await serveBookingTestApp(pool)
 const request=server.request
 await request('GET','/api/accounts/duties',undefined,401)
 await request('POST','/api/login',{username:fixture.admin.username,password:fixture.password})
 const bus=(await request('POST','/api/buses',{registration_no:'SYN-'+fixture.suffix,display_name:'Synthetic'},201)).bus;busIds.push(bus.id)
 const createTrip=async(date,route)=>(await request('POST','/api/trips',{bus_id:bus.id,bus_no:bus.registration_no,travel_date:date,route_code:route,departure_time:'20:30',status:'completed'},201)).trip
 const first=await createTrip('2026-02-01','KTY_CMB'),second=await createTrip('2026-02-02','CMB_KTY')
 const payload={trip_id:first.id,seat_number:'01',passenger_name:'Synthetic Passenger',contact:'0770000001',gender:'Male',boarding_point:'Kattankudy',destination:'Colombo',fare:100,payment_status:'paid'}
 const beforeSeats=await request('GET','/api/trips/'+first.id)
 assert.ok(beforeSeats.trip)
 const booked=(await request('POST','/api/bookings',payload,201)).booking
 assert.ok((await request('GET','/api/trips/'+first.id)).bookings.some(b=>b.id===booked.id&&b.status==='confirmed'))
 await request('POST','/api/bookings',payload,409)
 await request('POST','/api/bookings/'+booked.id+'/cancel',{})
 assert.ok(!(await request('GET','/api/trips/'+first.id)).bookings.some(b=>b.seat_number==='01'&&b.status==='confirmed'))
 const rebooked=(await request('POST','/api/bookings',payload,201)).booking
 await request('PATCH','/api/bookings/'+rebooked.id+'/confirmation',{confirmation_status:'confirmed'})
 // Separate cookie jars and real concurrent requests exercise the unique-seat boundary.
 const racers=await Promise.all([serveBookingTestApp(pool),serveBookingTestApp(pool)])
 try {
  for(const racer of racers)await racer.request('POST','/api/login',{username:fixture.admin.username,password:fixture.password})
  const conflicts=await Promise.allSettled(racers.map(r=>r.request('POST','/api/bookings',{...payload,seat_number:'02'},201)))
  assert.equal(conflicts.filter(r=>r.status==='fulfilled').length,1)
  assert.equal(conflicts.filter(r=>r.status==='rejected'&&r.reason.message.endsWith('(409)')).length,1)
 } finally {await Promise.all(racers.map(r=>r.close()))}
 const revenue={travel_date:first.travel_date,route_code:first.route_code,bus_no:bus.registration_no,seat_rows:[{count:49,amount:10},...Array.from({length:3},()=>({count:0,amount:0}))],cargo_rows:[{description:'Synthetic cargo',amount:25}]}
 const saved=(await request('POST','/api/admin/revenue-entries',revenue,201)).entry
 assert.equal(saved.status,'locked');assert.equal(Number(saved.total_revenue),515)
 assert.equal(JSON.parse(saved.seat_rows_json).length,4)
 const submission=(await request('POST','/api/admin/expense-submissions',{expense_date:first.travel_date,first_leg_date:first.travel_date,return_leg_date:second.travel_date,bus_no:bus.registration_no,route_code:first.route_code,gross_revenue:515,items:[{category:'Fuel',description:'Synthetic dispatch',amount:20}]},201)).submission
 assert.equal(submission.status,'locked');assert.equal(Number(submission.total_expense),20)
 await request('POST','/api/admin/revenue-entries',{...revenue,seat_rows:[{count:50,amount:10},...revenue.seat_rows.slice(1)]},400)
 await request('POST','/api/admin/revenue-entries',{...revenue,seat_rows:[...revenue.seat_rows,{count:0,amount:0}]},400)
 await request('POST','/api/admin/revenue-entries',{...revenue,seat_rows:[{count:25,amount:10},{count:25,amount:10},...revenue.seat_rows.slice(2)]},400)
 const duty=(await request('POST','/api/admin/duties',{bus_no:bus.registration_no,first_trip_id:first.id,return_trip_id:second.id},201)).duty
 const expenseBody={expense_date:first.travel_date,category:'Fuel',description:'Synthetic fuel',amount:10}
 const adjustmentBody={adjustment_date:first.travel_date,type:'other_income',description:'Synthetic income',amount:5}
 const dutyExpense=(await request('POST','/api/admin/duties/'+duty.id+'/expenses',expenseBody,201)).expense
 const dutyAdjustment=(await request('POST','/api/admin/duties/'+duty.id+'/adjustments',adjustmentBody,201)).adjustment
 await request('DELETE','/api/admin/duties/'+duty.id+'/expenses/'+dutyExpense.id)
 await request('DELETE','/api/admin/duties/'+duty.id+'/adjustments/'+dutyAdjustment.id)
 await request('POST','/api/admin/duties/'+duty.id+'/expenses',expenseBody,201)
 await request('POST','/api/admin/duties/'+duty.id+'/adjustments',adjustmentBody,201)
 for(const permissions of [{accounts:true},{pageAccess:{home:{view:true,manage:false}}},null]) {
  // Exact synthetic identity only. JSON null is TEXT 'null', not SQL NULL:
  // the approved baseline declares permissions TEXT NOT NULL.
  await pool.query('UPDATE users SET permissions=$1 WHERE id=$2 AND username=$3',[JSON.stringify(permissions),fixture.staff.id,fixture.staff.username])
  await request('POST','/api/logout',{});await request('POST','/api/login',{username:fixture.staff.username,password:fixture.password})
  await request('GET','/api/accounts/duties',undefined,403)
  await request('POST','/api/admin/revenue-entries',revenue,403)
  await request('POST','/api/logout',{});await request('POST','/api/login',{username:fixture.admin.username,password:fixture.password})
 }
 for(const manage of [true,false]){
  await request('PATCH','/api/admin/staff/'+fixture.staff.id+'/permissions',{permissions:{pageAccess:{accounts:{view:true,manage}}}})
  await request('POST','/api/logout',{});await request('POST','/api/login',{username:fixture.staff.username,password:fixture.password})
  await request('GET','/api/accounts/duties',undefined,manage?200:403)
  await request('POST','/api/admin/revenue-entries',revenue,manage?201:403)
  await request('POST','/api/admin/duties/'+duty.id+'/finalize',{},manage?200:403)
  await request('POST','/api/admin/staff',{},403)
  await request('POST','/api/logout',{});await request('POST','/api/login',{username:fixture.admin.username,password:fixture.password})
 }
 await request('POST','/api/admin/duties/'+duty.id+'/expenses',{expense_date:first.travel_date,category:'Fuel',description:'Late synthetic expense',amount:1},409)
 await request('POST','/api/admin/duties/'+duty.id+'/adjustments',adjustmentBody,409)
 await request('POST','/api/admin/duties/'+duty.id+'/finalize',{},409)
 await request('DELETE','/api/admin/duties/'+duty.id+'/expenses/'+dutyExpense.id,undefined,409)
 await request('DELETE','/api/admin/duties/'+duty.id+'/adjustments/'+dutyAdjustment.id,undefined,409)
 await request('POST','/api/bookings',{...payload,seat_number:'03'},409)
 await request('POST','/api/bookings/'+rebooked.id+'/cancel',{},409)
 const before=await pool.query('SELECT total_revenue FROM revenue_entries WHERE id=$1',[saved.id])
 const client=await pool.connect();try{
  await client.query('BEGIN')
  await client.query('UPDATE revenue_entries SET total_revenue=0 WHERE id=$1',[saved.id])
  await assert.rejects(client.query('SELECT 1/0'))
  await client.query('ROLLBACK')
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release()}
 assert.deepEqual((await pool.query('SELECT total_revenue FROM revenue_entries WHERE id=$1',[saved.id])).rows,before.rows)
})
