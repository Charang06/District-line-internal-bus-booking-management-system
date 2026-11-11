import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { createMfaService, postgresMfaStore, totp, verifyTotp, seal, unseal, mfaMode } from './admin-mfa.js'
const key = Buffer.alloc(32, 7)
test('TOTP matches RFC 6238 SHA1 vectors; rejects replay, wrong codes and old steps', () => {
  const secret = Buffer.from('12345678901234567890')
  for (const [time, code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])
    assert.equal(totp(secret, Math.floor(time/30), 8), code)
  const now = 1234567890000, counter = Math.floor(now/30000), code = totp(secret,counter)
  assert.equal(verifyTotp(secret,code,now), counter)
  assert.equal(verifyTotp(secret,code,now,counter), null)
  assert.equal(verifyTotp(secret,code,now+120000), null)
})
test('MFA secret encryption binds administrator and rejects tampering/wrong keys; default is off', () => {
  const secret = Buffer.from('synthetic-secret'), sealed = seal(secret,1,key)
  assert.deepEqual(unseal(sealed,1,key),secret)
  assert.throws(() => unseal(sealed,2,key))
  assert.throws(() => unseal(sealed,1,Buffer.alloc(32,8)))
  const corrupt = Buffer.from(sealed,'base64'); corrupt[30] ^= 1
  assert.throws(() => unseal(corrupt.toString('base64'),1,key))
  assert.equal(mfaMode({}), 'off'); assert.throws(() => mfaMode({ ADMIN_MFA_MODE:'enforce' }))
})
async function fixture() {
  let now = 1234567890000, revoked = 0, issued = 0
  const state = {}, user = { id:1, username:'synthetic', password_hash:await bcrypt.hash('synthetic-password',4) }
  const service = createMfaService({ env:{ ADMIN_MFA_ENCRYPTION_KEY:key.toString('base64') }, clock:()=>now,
    store:{ async transaction(id, action) {
      assert.equal(id,1)
      return action(state,user,async()=>{revoked++},async()=>{issued++; return 'synthetic-session'})
    } } })
  return { service,state,user,advance:ms=>{now+=ms},code:()=>totp(unseal(state.pending || state.secret,1,key),Math.floor(now/30000)),counts:()=>({revoked,issued}) }
}
test('enrollment requires password and proof; challenge issues no session; verification issues exactly one', async () => {
  const f = await fixture()
  assert.equal((await f.service.enroll(1,'wrong')).status,401)
  assert.ok((await f.service.enroll(1,'synthetic-password')).uri.startsWith('otpauth:'))
  assert.equal((await f.service.confirm(1,'wrong')).status,401)
  const enrolled = await f.service.confirm(1,f.code())
  assert.equal(enrolled.recoveryCodes.length,10)
  assert.ok(!JSON.stringify(f.state).includes(enrolled.recoveryCodes[0]))
  assert.deepEqual(f.counts(), { revoked:1, issued:0 })
  const challenge = await f.service.challenge(1,f.user.password_hash)
  assert.deepEqual(f.counts(), { revoked:1, issued:0 })
  // Enrollment proof code cannot be replayed to sign in.
  assert.equal((await f.service.verify(challenge.challenge,f.code())).status,401)
  f.advance(30000)
  assert.equal((await f.service.verify(challenge.challenge,f.code())).sessionId,'synthetic-session')
  assert.equal((await f.service.verify(challenge.challenge,f.code())).status,401)
  assert.deepEqual(f.counts(), { revoked:1, issued:1 })
})
test('recovery is one-use and revokes sessions; repeated failures cool down; expired/password-changed challenges fail', async () => {
  const f = await fixture(); await f.service.enroll(1,'synthetic-password')
  const { recoveryCodes } = await f.service.confirm(1,f.code())
  let challenge = await f.service.challenge(1,f.user.password_hash)
  assert.ok((await f.service.verify(challenge.challenge,recoveryCodes[0])).user)
  assert.equal(f.counts().revoked,2)
  challenge = await f.service.challenge(1,f.user.password_hash)
  for(let i=0;i<5;i++) assert.equal((await f.service.verify(challenge.challenge,recoveryCodes[0])).status,401)
  assert.equal((await f.service.verify(challenge.challenge,recoveryCodes[1])).status,429)
  f.advance(900001)
  challenge = await f.service.challenge(1,f.user.password_hash)
  f.advance(300001)
  assert.equal((await f.service.verify(challenge.challenge,recoveryCodes[1])).status,401)
  challenge = await f.service.challenge(1,f.user.password_hash)
  f.user.password_hash = 'changed-password-hash'
  assert.equal((await f.service.verify(challenge.challenge,recoveryCodes[1])).status,401)
  assert.equal(f.counts().issued,1)
})
test('recovery code replacement requires fresh password and unreplayed authenticator; enrollment expires',async()=>{
  const f=await fixture();await f.service.enroll(1,'synthetic-password');f.advance(600001)
  assert.equal((await f.service.confirm(1,f.code())).status,401)
  await f.service.enroll(1,'synthetic-password')
  const original=await f.service.confirm(1,f.code())
  assert.equal((await f.service.replaceRecoveryCodes(1,'wrong',f.code())).status,401)
  f.advance(30000)
  const replacement=await f.service.replaceRecoveryCodes(1,'synthetic-password',f.code())
  assert.equal(replacement.recoveryCodes.length,10)
  assert.equal(f.counts().revoked,2)
  const challenge=await f.service.challenge(1,f.user.password_hash)
  assert.equal((await f.service.verify(challenge.challenge,original.recoveryCodes[0])).status,401)
  assert.ok((await f.service.verify(challenge.challenge,replacement.recoveryCodes[0])).user)
})
test('PostgreSQL MFA adapter commits session/state together and rolls back session insertion errors', async () => {
  for (const failSession of [false,true]) {
    const calls=[]
    const client={release(){calls.push('release')},async query(sql,args){
      calls.push(sql)
      if(sql.includes('SELECT * FROM users'))return {rows:[{id:1,role:'admin',status:'active'}]}
      if(sql.includes('SELECT state'))return {rows:[{state:{}}]}
      if(sql.includes('INSERT INTO auth_sessions')) {
        if(failSession)throw Error('synthetic failure')
        assert.match(args[1],/^[a-f0-9]{64}$/)
      }
      return {rows:[]}
    }}
    const store=postgresMfaStore({connect:async()=>client})
    const result=store.transaction(1,async(state,user,revoke,issue)=>{
      assert.equal(user.id,1);state.changed=true;await revoke();return issue()
    })
    if(failSession){await assert.rejects(result,/synthetic failure/);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.includes('COMMIT'))}
    else {assert.equal((await result).length,43);assert.ok(calls.includes('COMMIT'));assert.ok(calls.some(sql=>sql.includes('INSERT INTO admin_mfa')))}
    assert.ok(calls.some(sql=>sql.includes('FOR UPDATE')));assert.equal(calls.at(-1),'release')
  }
})
