// Local HTTP regression only: fake PostgreSQL, synthetic data, no external services.
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { serveBookingTestApp } from './booking-app.js'
import { seal, totp } from '../admin-mfa.js'
const key = Buffer.alloc(32,7), secret = Buffer.from('12345678901234567890')
const password = 'synthetic-password'
const admin = { id:1,username:'synthetic_admin',role:'admin',status:'active',permissions:'{}',password_hash:await bcrypt.hash(password,4) }
const staff = { ...admin,id:2,username:'synthetic_staff',role:'staff' }
let state = { secret:seal(secret,1,key),lastCounter:-1,recoveryHashes:[] }, issued = 0
const sessions = new Map()
const limits = new Map()
async function query(sql,args=[]) {
  if (sql.includes('DELETE FROM auth_sessions WHERE token_hash')) {sessions.delete(args[0]);return {rows:[],rowCount:1}}
  if (sql.includes('INSERT INTO login_rate_limits')) return {rows:args[0].map((scope,index)=>{
    const key=scope+args[1][index],attempts=(limits.get(key)||0)+1
    limits.set(key,attempts);return {scope,attempts,retry_after:900}
  })}
  if (sql.startsWith('SELECT * FROM users WHERE username')) return {rows:[admin,staff].filter(u=>u.username===args[0])}
  if (sql.includes('SELECT * FROM users WHERE id')) return {rows:[admin,staff].filter(u=>u.id===args[0])}
  if (sql.startsWith('SELECT role, permissions, status FROM users WHERE id =')) return {rows:[admin,staff].filter(u=>u.id===args[0])}
  if (sql.includes("AND role = 'staff'")) return {rows:[staff].filter(u=>String(u.id)===String(args[0]))}
  if (sql.startsWith('UPDATE users SET permissions =')) { const user=[admin,staff].find(u=>String(u.id)===String(args[1])); if(user)user.permissions=args[0]; return {rows:[],rowCount:1} }
  if (sql.includes('SELECT state FROM admin_mfa')) return {rows:[{state:structuredClone(state)}]}
  if (sql.includes('INSERT INTO admin_mfa')) {state=JSON.parse(args[1]);return {rows:[]}}
  if (sql.includes('INSERT INTO auth_sessions')) {
    issued++; sessions.set(args[1],{userId:args[0],mfa:sql.includes('mfa_verified_at')}); return {rows:[],rowCount:1}
  }
  if (sql.includes('JOIN users ON users.id = sessions.user_id')) {
    const session=sessions.get(args[0]); const user=[admin,staff].find(u=>u.id===session?.userId)
    return {rows:user?[{...user,session_id:1,mfa_verified_at:session.mfa?new Date():null}]:[]}
  }
  return {rows:[],rowCount:1}
}
const pool = {waitingCount:0,totalCount:0,idleCount:0,on(){},query,async connect(){return {query,release(){}}}}
let server
try {
  server=await serveBookingTestApp(pool,{securityEnv:{ADMIN_MFA_MODE:'enforce',ADMIN_MFA_ENCRYPTION_KEY:key.toString('base64'),ENABLE_LOGIN_RATE_LIMIT:'true',LOGIN_RATE_LIMIT_KEY:'synthetic-rate-key-'.repeat(3)}})
  // The cookie harness exercises unchanged production route definitions.
  const challenge=await server.request('POST','/api/login',{username:admin.username,password})
  assert.equal(challenge.mfaRequired,true);assert.equal(issued,0)
  await server.request('GET','/api/me',undefined,401)
  await server.request('POST','/api/admin-mfa/verify',{challenge:challenge.challenge,code:'wrong'},401)
  assert.equal(issued,0)
  await server.request('POST','/api/admin-mfa/verify',{challenge:challenge.challenge,code:totp(secret,Math.floor(Date.now()/30000))})
  assert.equal(issued,1)
  const adminUser=(await server.request('GET','/api/me')).user
  assert.equal(adminUser.role,'admin')
  assert.equal(adminUser.permissions.dashboard,true)
  assert.equal(adminUser.permissions.accounts,true)
  // Turning enforcement on invalidates existing password-only administrator sessions.
  for (const session of sessions.values()) session.mfa=false
  await server.request('GET','/api/me',undefined,401)
  await server.request('POST','/api/admin-mfa/verify',{challenge:challenge.challenge,code:'wrong'},401)
  await server.request('POST','/api/login',{username:staff.username,password})
  assert.equal((await server.request('GET','/api/me')).user.role,'staff')
  const legacyPermissions = (await server.request('GET','/api/me')).user.permissions
  assert.equal(legacyPermissions.dashboard,false)
  assert.equal(legacyPermissions.accounts,false)
  assert.equal(legacyPermissions.customers,false)
  assert.equal(legacyPermissions.staff,false)
  await server.request('GET','/api/admin/staff',undefined,403)
  await server.request('POST','/api/admin/staff',{username:'synthetic_other',password:'synthetic-password',full_name:'Synthetic Other'},403)
  await server.request('GET','/api/admin/dashboard?scope=dashboard',undefined,403)
  await server.request('GET','/api/admin/dashboard?scope=accounts',undefined,403)
  await server.request('GET','/api/admin/dashboard?scope=customers',undefined,403)
  await server.request('GET','/api/admin/revenue-entries?summary=1',undefined,403)
  await server.request('GET','/api/admin/expense-submissions',undefined,403)
  await server.request('POST','/api/admin/revenue-entries',{},403)
  await server.request('POST','/api/admin/expenses',{},403)
  await server.request('POST','/api/admin/expense-submissions',{},403)
  staff.permissions=JSON.stringify({home:true,log:true,info:true,dashboard:true,accounts:false,passengers:true,cargo:true,trips:true})
  const dashboardUser=(await server.request('GET','/api/me')).user
  assert.equal(dashboardUser.permissions.dashboard,true)
  await server.request('GET','/api/admin/dashboard?scope=dashboard')
  await server.request('GET','/api/trips?date=2026-11-11&route=KTY_CMB&dashboard=1')
  await server.request('GET','/api/admin/revenue-entries?summary=1',undefined,403)
  await server.request('GET','/api/admin/expense-submissions',undefined,403)
  const operationalDashboard=await server.request('GET','/api/admin/dashboard?scope=dashboard')
  assert.equal('dailyRevenue' in operationalDashboard,false)
  assert.equal('expenses' in operationalDashboard,false)
  assert.equal('smsGateway' in operationalDashboard,false)
  assert.equal(dashboardUser.permissions.pageAccess.home.manage,true)
  assert.equal(dashboardUser.permissions.pageAccess.log.manage,true)
  await server.request('GET','/api/admin/dashboard?scope=full',undefined,403)
  await server.request('GET','/api/admin/dashboard?scope=accounts',undefined,403)
  await server.request('GET','/api/admin/revenue-entries',undefined,403)
  await server.request('POST','/api/admin/revenue-entries',{},403)
  staff.permissions=JSON.stringify({home:true,log:true,info:true,dashboard:false,accounts:true,passengers:true,cargo:true,trips:true})
  const accountsUser=(await server.request('GET','/api/me')).user
  assert.equal(accountsUser.permissions.accounts,true)
  await server.request('GET','/api/admin/dashboard?scope=accounts')
  await server.request('GET','/api/admin/revenue-entries?summary=1')
  await server.request('GET','/api/admin/expense-submissions')
  await server.request('GET','/api/admin/dashboard?scope=dashboard',undefined,403)
  await server.request('GET','/api/trips?date=2026-11-11&route=KTY_CMB&dashboard=1',undefined,403)
  await server.request('POST','/api/admin/expenses',{},403)
  await server.request('POST','/api/admin/expense-submissions',{},403)
  staff.permissions=JSON.stringify({home:true,log:false,info:false,passengers:true,cargo:true,trips:true,pageAccess:{home:{view:true,manage:false},log:{view:false,manage:true}}})
  await server.request('POST','/api/trips',{},403)
  await server.request('POST','/api/bookings',{},403)
  staff.permissions=JSON.stringify({home:true,log:true,info:true,dashboard:false,accounts:false,customers:true,staff:true,passengers:true,cargo:true,trips:true})
  const directoryUser=(await server.request('GET','/api/me')).user
  assert.equal(directoryUser.permissions.customers,true)
  assert.equal(directoryUser.permissions.staff,true)
  const customerScope=await server.request('GET','/api/admin/dashboard?scope=customers')
  assert.equal(customerScope.scope,'customers')
  assert.ok(Array.isArray(customerScope.passengerRecords))
  assert.ok(Array.isArray(customerScope.regularCustomers))
  for (const excluded of ['trips','buses','expenses','dailyRevenue','cargoRecords']) assert.equal(excluded in customerScope,false)
  const staffDirectory=await server.request('GET','/api/admin/staff')
  assert.ok(Array.isArray(staffDirectory.staff))
  await server.request('POST','/api/admin/staff',{username:'synthetic_other',password:'synthetic-password',full_name:'Synthetic Other'},403)
  await server.request('PATCH','/api/admin/staff/2/permissions',{permissions:{home:true}},403)
  await server.request('POST','/api/admin/staff/2/reset-password',{password:'new-password'},403)
  staff.permissions=JSON.stringify({passengers:true,pageAccess:{customers:{view:true,manage:true}}})
  await server.request('PATCH','/api/bookings/999/contact',{contact:'0771234567'},404)
  staff.permissions=JSON.stringify({passengers:true,pageAccess:{customers:{view:true,manage:false}}})
  await server.request('PATCH','/api/bookings/999/contact',{contact:'0771234567'},403)
  const permissionServer=await serveBookingTestApp(pool)
  try {
    assert.equal((await permissionServer.request('POST','/api/login',{username:admin.username,password})).user.role,'admin')
    const saved=(await permissionServer.request('PATCH','/api/admin/staff/2/permissions',{permissions:{home:false,log:false,info:false,dashboard:true,accounts:true,customers:true,staff:true,passengers:false,cargo:false,trips:false,pageAccess:{home:{view:false,manage:true},log:{view:false,manage:true},info:{view:false,manage:true},dashboard:{view:true,manage:true},accounts:{view:true,manage:true},customers:{view:true,manage:true},staff:{view:true,manage:true}}}})).staff
    assert.equal(saved.permissions.dashboard,true)
    assert.equal(saved.permissions.accounts,true)
    assert.equal(saved.permissions.customers,true)
    assert.equal(saved.permissions.staff,true)
    assert.equal(saved.permissions.pageAccess.dashboard.manage,true)
    assert.equal(saved.permissions.pageAccess.staff.manage,false)
    assert.equal((await permissionServer.request('POST','/api/logout',{})).ok,true)
    assert.equal((await permissionServer.request('POST','/api/login',{username:staff.username,password})).user.permissions.dashboard,true)
    await permissionServer.request('GET','/api/admin/dashboard?scope=dashboard')
    await permissionServer.request('GET','/api/admin/dashboard?scope=customers')
    await permissionServer.request('GET','/api/admin/staff')
    await permissionServer.request('POST','/api/admin/expenses',{},400)
    await permissionServer.request('POST','/api/logout',{})
    await permissionServer.request('POST','/api/login',{username:admin.username,password})
    const noAccountView=(await permissionServer.request('PATCH','/api/admin/staff/2/permissions',{permissions:{home:false,log:false,info:false,dashboard:true,accounts:false,customers:false,staff:false,passengers:true,cargo:true,trips:true,pageAccess:{home:{view:false,manage:false},log:{view:false,manage:false},info:{view:false,manage:false},dashboard:{view:true,manage:false},accounts:{view:false,manage:true},customers:{view:false,manage:false},staff:{view:false,manage:true}}}})).staff
    assert.equal(noAccountView.permissions.pageAccess.accounts.manage,false)
    await permissionServer.request('POST','/api/logout',{})
    await permissionServer.request('POST','/api/login',{username:staff.username,password})
    await permissionServer.request('POST','/api/admin/expenses',{},403)
    await permissionServer.request('POST','/api/logout',{})
    await permissionServer.request('POST','/api/login',{username:admin.username,password})
    await permissionServer.request('PATCH','/api/admin/staff/2/permissions',{permissions:{home:false,log:false,info:false,dashboard:true,accounts:true,customers:false,staff:false,passengers:false,cargo:false,trips:false,pageAccess:{home:{view:false,manage:false},log:{view:false,manage:false},info:{view:false,manage:false},dashboard:{view:true,manage:false},accounts:{view:true,manage:false},customers:{view:false,manage:false},staff:{view:false,manage:false}}}})
    await permissionServer.request('POST','/api/logout',{})
    await permissionServer.request('POST','/api/login',{username:staff.username,password})
    await permissionServer.request('POST','/api/admin/expenses',{},403)
  } finally { await permissionServer.close() }
  await server.request('POST','/api/login',{username:'unknown',password},401)
  await server.request('POST','/api/login',{username:admin.username,password:'wrong'},401)
  admin.status='inactive'
  await server.request('POST','/api/login',{username:admin.username,password},401)
  // Account limits must spare another staff member sharing the same office IP.
  for(let i=0;i<7;i++)await server.request('POST','/api/login',{username:staff.username,password})
  const beforeBlocked=issued
  await server.request('POST','/api/login',{username:staff.username,password},429)
  assert.equal(issued,beforeBlocked)
  // Recovery has its own configuration/limits, independently of a blocked login.
  await server.request('POST','/api/password-recovery/request',{email:'synthetic@example.test'},503)
  admin.status='active'
  assert.equal((await server.request('POST','/api/login',{username:admin.username,password})).mfaRequired,true)
  await server.close();server=null;limits.clear()
  // Enrollment stage still permits ordinary admin/staff password authentication.
  server=await serveBookingTestApp(pool,{securityEnv:{ADMIN_MFA_MODE:'enroll',ADMIN_MFA_ENCRYPTION_KEY:key.toString('base64'),ENABLE_LOGIN_RATE_LIMIT:'true',LOGIN_RATE_LIMIT_KEY:'synthetic-rate-key-'.repeat(3)}})
  assert.equal((await server.request('POST','/api/login',{username:admin.username,password})).user.role,'admin')
  assert.equal((await server.request('POST','/api/login',{username:staff.username,password})).user.role,'staff')
  await server.request('POST','/api/logout',{})
  await server.request('GET','/api/me',undefined,401)
  await server.request('POST','/api/login',{username:admin.username,password})
  await server.request('POST','/api/logout',{})
  await server.request('GET','/api/me',undefined,401)
  console.log('SECURITY_HTTP_MOCK_PASS')
} finally {await server?.close()}
