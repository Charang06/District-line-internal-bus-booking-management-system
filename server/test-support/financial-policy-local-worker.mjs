// Offline only: actual routes, injected fake pg, synthetic sessions, loopback HTTP.
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { serveBookingTestApp } from './booking-app.js'
const password='Synthetic-finance-password'
const user={id:1,username:'synthetic_finance',role:'staff',status:'active',permissions:'{}',password_hash:await bcrypt.hash(password,4)}
const sessions=new Map(), calls=[]
let sequence=0, savedEntry
async function query(sql,args=[]){
  calls.push(sql)
  if(sql.startsWith('SELECT * FROM users WHERE username'))return {rows:args[0]===user.username?[user]:[]}
  if(sql.includes('JOIN users ON users.id = sessions.user_id'))return {rows:sessions.has(args[0])?[{...user,session_id:1}]:[]}
  if(sql.startsWith('SELECT role, permissions, status FROM users WHERE id'))return {rows:[user]}
  if(sql.includes('INSERT INTO auth_sessions')){sessions.set(args[1],user.id);return {rows:[{id:++sequence}],rowCount:1}}
  if(sql.includes('DELETE FROM auth_sessions WHERE token_hash')){sessions.delete(args[0]);return {rows:[],rowCount:1}}
  // Extra mock fields test response allowlisting even if a storage adapter returns more.
  if(sql.startsWith('SELECT id, full_name, role FROM crew_members'))return {rows:[{id:9,full_name:'Synthetic Driver',role:'driver',mobile_number:'PRIVATE',password_hash:'PRIVATE',recovery_email:'PRIVATE'}]}
  if(sql.startsWith('SELECT id, duty_code, bus_id, first_trip_id'))return {rows:[{id:501,duty_code:'DUTY-SYNTHETIC',bus_id:7,first_trip_id:11,return_trip_id:12,status:'in_progress',start_date:'2026-11-12',snapshot_json:null},{id:502,duty_code:'DUTY-LOCKED',bus_id:7,first_trip_id:11,return_trip_id:12,status:'finalized',start_date:'2026-11-12',snapshot_json:JSON.stringify({bus_no:'SYNTHETIC-BUS',first_journey:{revenue:{total:111,collected:100,outstanding:11,contact:'PRIVATE'}},return_journey:{revenue:{total:222,collected:200,outstanding:22}},total_revenue:333,total_expenses:25,net_profit:308,expenses:[{id:102,expense_date:'2026-11-12',category:'Fuel',description:'Synthetic locked fuel',amount:25,trip_id:null,contact:'PRIVATE'}],adjustments:[],adjustment_totals:{refunds:0,cancellation_fees:0,other_income:0,contact:'PRIVATE'},finalized_by:{id:999,name:'PRIVATE'},contact:'PRIVATE'})}]}
  if(sql.includes('FROM trips t LEFT JOIN buses')&&sql.includes('WHERE t.id ='))return {rows:[{id:args[0],trip_code:'SYNTHETIC-'+args[0],route_code:args[0]===11?'KTY_CMB':'CMB_KTY',route_label:'Synthetic corridor',status:'completed',travel_date:'2026-11-'+(args[0]+1),registration_no:'SYNTHETIC-BUS',contact:'PRIVATE',password_hash:'PRIVATE'}]}
  if(sql.includes('FROM trips t LEFT JOIN buses')&&sql.includes('NOT EXISTS'))return {rows:[{id:13,trip_code:'SYNTHETIC-13',route_code:'KTY_CMB',route_label:'Synthetic corridor',travel_date:'2026-11-14',status:'scheduled',registration_no:'SYNTHETIC-BUS',contact:'PRIVATE'}]}
  if(sql.includes('FROM bookings bk WHERE bk.trip_id ='))return {rows:[{total:100,collected:80}]}
  if(sql.startsWith('SELECT id, expense_date, category, description, amount, trip_id FROM daily_expenses WHERE duty_id'))return {rows:[{id:101,expense_date:'2026-11-12',category:'Fuel',description:'Synthetic fuel',amount:25,trip_id:null,created_by:999,contact:'PRIVATE'}]}
  if(sql.startsWith('SELECT id, adjustment_date, type, description, amount, trip_id, seat_number FROM duty_adjustments WHERE duty_id'))return {rows:[]}
  if(sql.startsWith('SELECT id, registration_no FROM buses WHERE id'))return {rows:[{id:7,registration_no:'SYNTHETIC-BUS',mobile:'PRIVATE'}]}
  if(sql.includes('INSERT INTO revenue_entries')){
    savedEntry={id:77,seat_rows_json:args[7],cargo_rows_json:args[8],seat_subtotal:args[9],cargo_subtotal:args[10],total_revenue:args[11],status:'locked'}
    assert.match(sql,/'locked'.*CURRENT_TIMESTAMP/s);return {rows:[{id:77}],rowCount:1}
  }
  if(sql.includes('UPDATE revenue_entries SET entry_code')){savedEntry.entry_code=args[0];return {rows:[],rowCount:1}}
  if(sql.includes('FROM revenue_entries WHERE id'))return {rows:[savedEntry]}
  return {rows:[],rowCount:1}
}
const pool={on(){},waitingCount:0,totalCount:0,idleCount:0,query,async connect(){return {query,release(){}}}}
const writes=[
 ['POST','/api/admin/expenses',400],['POST','/api/admin/expense-submissions',400],
 ['POST','/api/admin/revenue-entries',400],['POST','/api/admin/duties',400],
 ['POST','/api/admin/duties/999/expenses',400],['POST','/api/admin/duties/999/adjustments',400],
 ['DELETE','/api/admin/duties/999/expenses/999',404],['DELETE','/api/admin/duties/999/adjustments/999',404],
 ['POST','/api/admin/duties/999/finalize',404],
]
const scopedReads=['/api/accounts/crew-options','/api/accounts/duties']
const reads=['/api/admin/dashboard?scope=accounts','/api/admin/revenue-entries?summary=1','/api/admin/expense-submissions']
const adminWrites=[['POST','/api/admin/staff'],['PATCH','/api/admin/staff/999'],['PATCH','/api/admin/staff/999/permissions'],['POST','/api/admin/staff/999/reset-password'],['DELETE','/api/admin/staff/999'],['POST','/api/admin/crew'],['DELETE','/api/admin/crew/999']]
const matrix=[
 {name:'admin',role:'admin',permissions:{},read:true,write:true},
 {name:'explicit Accounts Manage',permissions:{pageAccess:{accounts:{view:true,manage:true}}},read:true,write:true},
 {name:'Accounts View only',permissions:{pageAccess:{accounts:{view:true,manage:false}}},read:true,write:false},
 {name:'no Accounts',permissions:{pageAccess:{home:{view:true,manage:true}}},read:false,write:false},
 {name:'legacy Accounts view',permissions:{accounts:true},read:true,write:false},
 {name:'missing permissions',permissions:null,read:false,write:false},
 {name:'malformed permissions',permissions:'invalid-json',read:false,write:false},
 {name:'JSON null permissions',permissions:'null',read:false,write:false},
 {name:'JSON scalar permissions',permissions:'42',read:false,write:false},
 {name:'Manage without View',permissions:{pageAccess:{accounts:{view:false,manage:true}}},read:false,write:false},
]
const server=await serveBookingTestApp(pool)
let checks=0
const request=async(method,url,body,status)=>{checks++;return server.request(method,url,body,status)}
const assertNoFinance=before=>assert.ok(!calls.slice(before).some(sql=>/revenue_entries|daily_expenses|expense_submissions|bus_duties|duty_adjustments/.test(sql)))
try{
  // No authenticated session: every read/write path fails before business SQL.
  for(const url of [...reads,...scopedReads]){const before=calls.length;await request('GET',url,undefined,401);assertNoFinance(before)}
  for(const [method,url]of writes){const before=calls.length;await request(method,url,{},401);assertNoFinance(before)}
  for(const row of matrix){
    user.role=row.role||'staff';user.permissions=row.permissions===null?null:typeof row.permissions==='string'?row.permissions:JSON.stringify(row.permissions)
    await request('POST','/api/login',{username:user.username,password},200)
    for(const url of reads){const before=calls.length;await request('GET',url,undefined,row.read?200:403);if(!row.read)assertNoFinance(before)}
    for(const url of scopedReads){
      const before=calls.length
      const result=await request('GET',url,undefined,row.write?200:403)
      if(!row.write){assertNoFinance(before);assert.ok(!calls.slice(before).some(sql=>sql.includes('crew_members')))}
      else {
        assert.ok(!JSON.stringify(result).includes('PRIVATE'))
        // Session activity may write auth_sessions; these endpoints never write business data.
        assert.ok(!calls.slice(before).some(sql=>/^(INSERT|UPDATE|DELETE)/.test(sql.trim())&&!sql.includes('auth_sessions')))
        if(url.endsWith('crew-options'))assert.deepEqual(Object.keys(result.crew[0]).sort(),['full_name','id','role'])
        else {
          assert.deepEqual(Object.keys(result).sort(),['duties','dutyTrips'])
          assert.equal(result.duties[0].net_profit,175)
          assert.equal(result.duties[0].status,'in_progress') // no reconciliation of completed trips
          assert.equal(result.duties[1].status,'finalized')
          assert.equal(result.duties[1].net_profit,308) // preserve stored snapshot totals
          assert.equal(result.duties[0].first_trip.revenue.total,100)
          for(const key of ['snapshot','finalized_by','crewMembers','passengerRecords','regularCustomers'])assert.equal(key in result.duties[0],false)
          assert.deepEqual(Object.keys(result.duties[0].expenses[0]).sort(),['amount','category','description','expense_date','id','trip_id'])
        }
      }
    }
    // Full ledger and unscoped duty/dashboard data remain admin-only by design.
    if(user.role!=='admin'){
      for(const url of ['/api/admin/revenue-entries','/api/admin/dashboard?scope=full','/api/admin/dashboard'])await request('GET',url,undefined,403)
      await request('GET','/api/admin/crew',undefined,403)
      for(const [method,url]of adminWrites)await request(method,url,{},403)
    }
    for(const [method,url,allowed]of writes){const before=calls.length;await request(method,url,{},row.write?allowed:403);if(!row.write)assertNoFinance(before)}
    if(row.write){
      const body={travel_date:'2026-11-12',route_code:'KTY_CMB',bus_no:'SYNTHETIC-BUS',seat_rows:[{count:49,amount:100},...Array.from({length:3},()=>({count:0,amount:0}))],cargo_rows:[{description:'Synthetic cargo',amount:25}]}
      const result=await request('POST','/api/admin/revenue-entries',body,201)
      assert.equal(result.entry.status,'locked');assert.equal(result.entry.total_revenue,4925)
      assert.equal(JSON.parse(result.entry.seat_rows_json).length,4)
      body.seat_rows[0].count=50;await request('POST','/api/admin/revenue-entries',body,400)
      // Accounts Manage alone does not grant unrelated Home/Log or staff actions.
      if(user.role==='staff')for(const [method,url]of [['POST','/api/bookings'],['POST','/api/bookings/999/cancel'],['POST','/api/trips'],['POST','/api/cargo']])await request(method,url,{},403)
    }
    await request('POST','/api/logout',{},200)
  }
  console.log('FINANCIAL_POLICY_HTTP_MOCK_PASS cases='+matrix.length+' requests='+checks)
}finally{await server.close()}
