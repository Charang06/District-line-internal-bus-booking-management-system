import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { databaseTargetDigest, requestedDatabaseOperation, authorizeDatabaseOperation, verifyDatabaseBaseline } from './database-startup.js'
const url='postgresql://synthetic:synthetic@localhost:5549/synthetic'
test('normal readiness only uses read-only SQL and fails closed on a missing baseline without writes',async()=>{
  for(const ready of [true,false]){
    const calls=[];let released=false
    const pool={async connect(){return {async query(sql,args){calls.push(sql)
      if(sql.includes('unnest'))return {rows:args[0].map(name=>({name,present:ready}))}
      if(sql.includes('SELECT version'))return {rows:[1,2,3,4].map(version=>({version}))}
      return {rows:[]}
    },release(){released=true}}}}
    if(ready)await verifyDatabaseBaseline(pool)
    else await assert.rejects(verifyDatabaseBaseline(pool),/baseline missing/)
    assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');assert.ok(released)
    assert.ok(calls.every(sql=>/^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(sql)))
  }
})
test('migration and seed require distinct command, marker and target; reject hosted/restore contexts',()=>{
  assert.equal(requestedDatabaseOperation([]),null)
  const env={DATABASE_MAINTENANCE_TARGET_SHA256:databaseTargetDigest(url),DATABASE_MIGRATION_APPROVAL:'apply-001-004-to-approved-disposable-target'}
  const migrate=['--approved-database-operation=migrate'],seed=['--approved-database-operation=seed']
  assert.doesNotThrow(()=>authorizeDatabaseOperation('migrate',url,env,migrate))
  for(const bad of [{...env,NODE_ENV:'production'},{...env,VERCEL:'1'},{...env,USERNAME_RECOVERY_RESTORE_DATABASE_URL:url},{...env,DATABASE_MAINTENANCE_TARGET_SHA256:'wrong'},{}])assert.throws(()=>authorizeDatabaseOperation('migrate',url,bad,migrate))
  assert.throws(()=>authorizeDatabaseOperation('migrate',url,env,[]))
  assert.throws(()=>authorizeDatabaseOperation('seed',url,env,seed))
  assert.doesNotThrow(()=>authorizeDatabaseOperation('seed',url,{...env,DATABASE_SEED_APPROVAL:'seed-approved-disposable-target'},seed))
  assert.throws(()=>requestedDatabaseOperation(['--approved-database-operation=unknown']))
})
test('real startup/reconnect calls baseline verification and never migration/seed; seed cannot chain migrations',()=>{
  const source=fs.readFileSync(new URL('./server.js',import.meta.url),'utf8')
  const initialize=source.slice(source.indexOf('async function initializeDatabaseWithRetry'),source.indexOf('function ensureDatabaseReady'))
  assert.match(initialize,/await verifyDatabaseBaseline\(pool, process.env\)/)
  assert.doesNotMatch(initialize,/seedDatabase|migrateDatabaseIfNeeded/)
  const seed=source.slice(source.indexOf('async function seedDatabase'),source.indexOf('function tripJoinSelect'))
  assert.doesNotMatch(seed,/migrateDatabaseIfNeeded/)
  assert.match(seed,/authorizeDatabaseOperation\('seed'/)
})
