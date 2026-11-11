// Actual recovery routes with synthetic in-memory SQL responses. No .env or network.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { serveBookingTestApp } from './booking-app.js'
import { seal } from '../admin-mfa.js'
const password='Synthetic-start-password', replacement='Synthetic-replacement-password'
const admin={id:1,username:'synthetic_admin',role:'admin',status:'active',permissions:'{}',recovery_email:'admin@example.test',password_hash:await bcrypt.hash(password,4)}
const staff={...admin,id:2,username:'synthetic_staff',role:'staff',recovery_email:'staff@example.test'}
const key=Buffer.alloc(32,7), sessions=new Map(), tokens=new Map(), deliveries=[], calls=[]
let mfaState={secret:seal(Buffer.alloc(20,8),1,key),lastCounter:-1,recoveryHashes:[]}
const digest=value=>createHash('sha256').update(value).digest('hex')
async function query(sql,args=[]) {
  calls.push(sql)
  if(sql.includes('INSERT INTO login_rate_limits'))return {rows:args[0].map(scope=>({scope,attempts:1,retry_after:900}))}
  if(sql.includes('SELECT attempts FROM password_recovery_rate_limits'))return {rows:[{attempts:1}]}
  if(sql.includes('SELECT * FROM users WHERE username'))return {rows:[admin,staff].filter(x=>x.username===args[0])}
  if(sql.includes('SELECT id FROM users WHERE LOWER(recovery_email)'))return {rows:admin.recovery_email===args[0]?[{id:admin.id}]:[]}
  if(sql.includes('SELECT id FROM password_recovery_tokens'))return {rows:[...tokens.values()].filter(x=>x.user_id===args[0]&&!x.used&&x.expires>Date.now()).slice(0,1)}
  if(sql.includes('INSERT INTO password_recovery_tokens')){tokens.set(args[1],{id:tokens.size+1,user_id:args[0],used:false,expires:Date.now()+1200000});return {rows:[{id:tokens.size}],rowCount:1}}
  if(sql.includes('SELECT recovery.id, recovery.user_id')){const token=tokens.get(args[0]);return {rows:token&&!token.used&&token.expires>Date.now()?[token]:[]}}
  if(sql.includes('UPDATE password_recovery_tokens SET used_at')){for(const [hash,token]of tokens)if(sql.includes('WHERE token_hash')?hash===args[0]:token.user_id===args[0])token.used=true;return {rows:[],rowCount:1}}
  if(sql.includes('UPDATE users SET password_hash')){admin.password_hash=args[0];return {rows:[],rowCount:1}}
  if(sql.includes('INSERT INTO auth_sessions')){sessions.set(args[1],args[0]);return {rows:[{id:sessions.size}],rowCount:1}}
  if(sql.includes('DELETE FROM auth_sessions WHERE user_id')){for(const [hash,id]of sessions)if(id===args[0])sessions.delete(hash);return {rows:[],rowCount:1}}
  if(sql.includes('JOIN users ON users.id = sessions.user_id')){const id=sessions.get(args[0]);return {rows:[admin,staff].filter(x=>x.id===id).map(x=>({...x,session_id:1}))}}
  if(sql.includes('SELECT * FROM users WHERE id'))return {rows:[admin]}
  if(sql.includes('SELECT state FROM admin_mfa'))return {rows:[{state:structuredClone(mfaState)}]}
  if(sql.includes('INSERT INTO admin_mfa')){mfaState=JSON.parse(args[1]);return {rows:[],rowCount:1}}
  return {rows:[],rowCount:1}
}
const pool={waitingCount:0,totalCount:0,idleCount:0,on(){},query,async connect(){return {query,release(){}}}}
const latestToken=()=>new URL(deliveries.at(-1).text.match(/https:\/\/synthetic\.example\.test\/[^\s]+/)[0]).hash.split('token=')[1]
let server
try {
  server=await serveBookingTestApp(pool,{recordRecoveryEmail:mail=>deliveries.push(mail)})
  await server.request('POST','/api/login',{username:admin.username,password})
  const known=await server.request('POST','/api/password-recovery/request',{email:admin.recovery_email})
  const unknown=await server.request('POST','/api/password-recovery/request',{email:'unknown@example.test'})
  const staffResult=await server.request('POST','/api/password-recovery/request',{email:staff.recovery_email})
  assert.deepEqual(known,unknown);assert.deepEqual(known,staffResult);assert.equal(deliveries.length,1)
  let token=latestToken();assert.ok(tokens.has(digest(token)));assert.ok(!tokens.has(token))
  await server.request('POST','/api/password-recovery/request',{email:admin.recovery_email});assert.equal(deliveries.length,1)
  await server.request('POST','/api/password-recovery/reset',{token,password:replacement,confirmPassword:'mismatch'},400)
  tokens.get(digest(token)).expires=Date.now()-1
  await server.request('POST','/api/password-recovery/reset',{token,password:replacement,confirmPassword:replacement},400)
  await server.request('POST','/api/password-recovery/request',{email:admin.recovery_email});token=latestToken()
  const recoveryCallIndex=calls.length
  await server.request('POST','/api/password-recovery/reset',{token,password:replacement,confirmPassword:replacement})
  assert.ok(!calls.slice(recoveryCallIndex).some(sql=>/UPDATE admin_mfa|DELETE FROM admin_mfa/.test(sql)))
  assert.equal(sessions.size,0);await server.request('GET','/api/me',undefined,401)
  await server.request('POST','/api/password-recovery/reset',{token,password:replacement,confirmPassword:replacement},400)
  await server.request('POST','/api/login',{username:admin.username,password},401)
  await server.request('POST','/api/login',{username:admin.username,password:replacement})
  await server.request('POST','/api/login',{username:staff.username,password})
  await server.close();server=null
  server=await serveBookingTestApp(pool,{securityEnv:{ADMIN_MFA_MODE:'enforce',ADMIN_MFA_ENCRYPTION_KEY:key.toString('base64'),ENABLE_LOGIN_RATE_LIMIT:'true',LOGIN_RATE_LIMIT_KEY:'synthetic-rate-key-'.repeat(3)}})
  const count=sessions.size,result=await server.request('POST','/api/login',{username:admin.username,password:replacement})
  assert.equal(result.mfaRequired,true);assert.equal(sessions.size,count)
  console.log('PASSWORD_RECOVERY_HTTP_MOCK_PASS')
}finally{await server?.close()}
