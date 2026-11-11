// Isolated, rollback-only rehearsal. Never starts production initialization.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import pg from 'pg'
import { loadEnv } from '../../server/env.js'
import { projectFingerprint, syntheticAccounts, savepointPool } from '../../server/test-support/isolated-postgres.js'
import { serveBookingTestApp } from '../../server/test-support/booking-app.js'
const require = createRequire(import.meta.url)
const { verifiedPostgresConfig } = require('../lib/supabase-verified-tls.cjs')
const q = name => '"' + name.replaceAll('"', '""') + '"'
const report = { at: new Date().toISOString(), sourceConnected: false, committed: false, realEmailsSent: false, checks: [] }
const pass = name => { report.checks.push(name); console.log(JSON.stringify({ passed: name })) }
if (!process.argv.includes('--isolated-rollback-only')) throw Error('Explicit isolated rehearsal argument required')
loadEnv(process.cwd())
const target = process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL
if (projectFingerprint(target) !== '3ae16e4ead10' || projectFingerprint(target) === projectFingerprint(process.env.DATABASE_URL))
  throw Error('Distinct approved restore identity required')
const c = new pg.Client({ ...verifiedPostgresConfig(target), connectionTimeoutMillis: 15000, query_timeout:20000,keepAlive:true,application_name: 'district-rollback-only-hardening' })
let api, baseline, failure
async function snapshot() {
  const objects = (await c.query(`SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY c.relname`)).rows
  const columns = (await c.query(`SELECT a.attrelid,a.attnum,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum`)).rows
  const functions = (await c.query(`SELECT p.oid,p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,p.proacl::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid`)).rows
  const sequences = {}
  for (const r of objects.filter(x => x.relkind === 'S')) sequences[r.relname] = (await c.query(`SELECT last_value::text,is_called FROM public.${q(r.relname)}`)).rows[0]
  const schemas = (await c.query("SELECT nspname,nspacl::text,nspowner FROM pg_namespace WHERE nspname='public'")).rows
  const policies = (await c.query("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows
  return { objects, columns, functions, sequences, schemas, policies, versions: (await c.query('SELECT version FROM public.schema_meta ORDER BY version')).rows }
}
function transactionBody(file, expectedHash) {
  const bytes = fs.readFileSync(file)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash)
  const text = bytes.toString('utf8')
  assert.equal((text.match(/^BEGIN;/gm) || []).length, 1)
  assert.equal((text.match(/^COMMIT;/gm) || []).length, 1)
  return text.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}
try {
  await c.connect()
  assert.equal(c.connection.stream.authorized, true)
  await c.query('BEGIN READ ONLY'); baseline = await snapshot(); await c.query('ROLLBACK')
  fs.writeFileSync('artifacts/internal-table-security/rehearsal-baseline.json',JSON.stringify(baseline,null,2)+'\n')
  await c.query('BEGIN')
  await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL transaction_timeout='10min'; SET LOCAL idle_in_transaction_session_timeout='60s'")
  // Protect this rollback rehearsal from concurrent application/sequence users.
  const tables = baseline.objects.filter(x => ['r','p'].includes(x.relkind))
  await c.query('LOCK TABLE ' + tables.map(x => `public.${q(x.relname)}`).join(',') + ' IN ACCESS EXCLUSIVE MODE')
  for (const [name, value] of Object.entries(baseline.sequences)) {
    // Transactional RESTART isolates nextval changes; ROLLBACK restores the old sequence storage.
    const next = BigInt(value.last_value) + (value.is_called ? 1n : 0n)
    await c.query(`ALTER SEQUENCE public.${q(name)} RESTART WITH ${next}`)
  }
  for (const [v, file, sha] of [[5,'server/migrations/005_admin_username_recovery.sql','c5022498d0945d8d002c680827d5badb0766084eb09cd74adaa7a05f0e8f6a76'],
    [6,'server/migrations/006_admin_recovery_email_verification.sql','5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe']]) {
    if (!baseline.versions.some(x => x.version === v)) await c.query(transactionBody(file, sha))
  }
  pass('Restore prerequisites 1–6 available inside rollback transaction')
  await c.query("SELECT set_config('district_security.runtime_role',current_user,true)")
  await c.query(fs.readFileSync('scripts/security/internal-tables.sql','utf8'))
  const affected = (await c.query(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND relkind='r' AND relrowsecurity ORDER BY relname`)).rows
  assert.equal(affected.length,22)
  assert.equal((await c.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'")).rows[0].n,0)
  for (const role of ['anon','authenticated']) {
    assert.equal((await c.query("SELECT has_schema_privilege($1,'public','CREATE') allowed",[role])).rows[0].allowed,false)
    const sequences=(await c.query("SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'")).rows
    for(const seq of sequences)assert.equal((await c.query("SELECT has_sequence_privilege($1,$2::oid,'USAGE,SELECT,UPDATE') allowed",[role,seq.oid])).rows[0].allowed,false)
  }
  pass('Schema CREATE, all sequence privileges and absence of browser policies verified')
  for (const role of ['anon','authenticated']) for (const {relname} of affected) {
    await assert.rejects(c.query(`SAVEPOINT denial; SET LOCAL ROLE ${q(role)}; SELECT * FROM public.${q(relname)} WHERE false`),e=>e.code==='42501')
    await c.query('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial')
  }
  pass('22 tables deny browser roles; zero-row SELECT probes read no private records')
  const pool = savepointPool(c)
  pool.on = () => pool
  const fixture = await syntheticAccounts(pool)
  const mail = []
  api = await serveBookingTestApp(pool,{recordRecoveryEmail:message=>mail.push(message)})
  const request = api.request
  await request('POST','/api/login',{username:fixture.staff.username,password:fixture.password})
  assert.equal((await request('GET','/api/me')).user.role,'staff')
  await request('POST','/api/admin/expenses',{},403)
  await request('POST','/api/logout',{})
  await request('GET','/api/me',undefined,401)
  pass('Synthetic staff cookie login, admin finance denial and logout invalidation')
  await request('POST','/api/login',{username:fixture.admin.username,password:fixture.password})
  assert.equal((await request('GET','/api/me')).user.role,'admin')
  const bus = (await request('POST','/api/buses',{registration_no:`SEC-${fixture.suffix}`,display_name:'Synthetic hardening test'},201)).bus
  const trip = (await request('POST','/api/trips',{bus_id:bus.id,bus_no:bus.registration_no,travel_date:'2098-11-08',route_code:'KTY_CMB',status:'scheduled'},201)).trip
  await request('POST','/api/logout',{})
  await request('POST','/api/login',{username:fixture.staff.username,password:fixture.password})
  const booking = (await request('POST','/api/bookings',{trip_id:trip.id,seat_number:'01',passenger_name:'Synthetic passenger',contact:'0771234567',gender:'Male',boarding_point:'Kattankudy',destination:'Colombo',fare:4500,payment_status:'paid'},201)).booking
  await request('PATCH',`/api/bookings/${booking.id}/confirmation`,{confirmation_status:'confirmed'})
  assert.equal((await request('GET',`/api/bookings?tripId=${trip.id}`)).bookings.length,1)
  await request('POST',`/api/bookings/${booking.id}/cancel`,{})
  pass('Synthetic staff booking creation, confirmation, filtered read and cancellation')
  const cargo=(await request('POST','/api/cargo',{trip_id:trip.id,sender_name:'Synthetic sender',sender_phone:'0771234567',description:'Synthetic parcel',weight:1,charge:100,payment_status:'paid'},201)).cargo
  assert.equal(Number(cargo.charge),100)
  assert.equal((await request('GET',`/api/cargo?tripId=${trip.id}`)).cargo.length,1)
  await request('DELETE',`/api/cargo/${cargo.id}`)
  pass('Synthetic staff cargo create, trip-filtered read and delete')
  await request('POST','/api/logout',{})
  await request('POST','/api/login',{username:fixture.admin.username,password:fixture.password})
  const expense = (await request('POST','/api/admin/expenses',{expense_date:'2098-11-08',category:'Fuel',description:'Synthetic hardening',amount:100,bus_no:bus.registration_no},201)).expense
  assert.equal(Number(expense.amount),100)
  const revenue = await request('POST','/api/admin/revenue-entries',{travel_date:'2098-11-08',route_code:'KTY_CMB',bus_no:bus.registration_no,trip_id:trip.id,
    seat_rows:[{count:1,amount:4500},{count:0,amount:0},{count:0,amount:0},{count:0,amount:0}],cargo_rows:[]},201)
  assert.ok(revenue)
  pass('Synthetic admin login, expense and locked revenue creation')
  const status = await request('GET','/api/recovery-email-verification/status'); assert.equal(status.verified,false)
  await request('POST','/api/recovery-email-verification/request',{})
  const tokenFrom = message => message.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1]
  const verifyToken = tokenFrom(mail.at(-1)); assert.ok(verifyToken)
  await request('POST','/api/recovery-email-verification/confirm',{token:verifyToken})
  assert.equal((await request('GET','/api/recovery-email-verification/status')).verified,true)
  await request('POST','/api/recovery-email-verification/confirm',{token:verifyToken},400)
  await request('POST','/api/username-recovery/request',{email:fixture.admin.email})
  const usernameToken=tokenFrom(mail.at(-1)); assert.ok(usernameToken)
  assert.equal((await request('POST','/api/username-recovery/confirm',{token:usernameToken})).username,fixture.admin.username)
  await request('POST','/api/password-recovery/request',{email:fixture.admin.email})
  const resetToken=tokenFrom(mail.at(-1)); assert.ok(resetToken)
  const password=fixture.password+'-reset'
  await request('POST','/api/password-recovery/reset',{token:resetToken,password,confirmPassword:password})
  await request('GET','/api/me',undefined,401)
  await request('POST','/api/password-recovery/reset',{token:resetToken,password,confirmPassword:password},400)
  await request('POST','/api/login',{username:fixture.admin.username,password})
  pass('Email verification, username recovery and password reset use real DB adapters with mocked delivery; reset revokes sessions and rejects replay')
  // The rollback harness has one outer transaction, so production CURRENT_TIMESTAMP
  // comparisons share that transaction's clock. Expire fixtures against that clock.
  await c.query("UPDATE auth_sessions SET idle_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE user_id=$1",[fixture.admin.id])
  await request('GET','/api/me',undefined,401)
  await request('POST','/api/login',{username:fixture.admin.username,password})
  await c.query("UPDATE auth_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE user_id=$1",[fixture.admin.id])
  await request('GET','/api/me',undefined,401)
  pass('Idle and absolute session expiry reject expired synthetic sessions')
} catch(error) { failure=error; report.error={code:error.code||error.name,message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted]').slice(0,200)} }
finally {
  await api?.close()
  await c.query('ROLLBACK').catch(()=>{})
  if(baseline){try{await c.query('BEGIN READ ONLY');assert.ok(isDeepStrictEqual(baseline,await snapshot()));await c.query('ROLLBACK');pass('Independent post-rollback catalog and sequence state match baseline')}catch(e){failure ||= e;report.rollbackVerified=false}}
  await c.end().catch(()=>{})
  report.passed=!failure; report.rollbackVerified=report.checks.includes('Independent post-rollback catalog and sequence state match baseline')
  fs.mkdirSync('artifacts/internal-table-security',{recursive:true});fs.writeFileSync('artifacts/internal-table-security/rehearsal.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report));if(failure)process.exitCode=1
}
