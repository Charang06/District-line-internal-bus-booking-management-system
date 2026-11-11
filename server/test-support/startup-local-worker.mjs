import assert from 'node:assert/strict'
import { loadBookingTestApp } from './booking-app.js'
for(const ready of [true,false]) {
  const calls=[]
  const pool={on(){},async connect(){return {release(){},async query(sql,args){
    calls.push(sql)
    if(sql.includes('unnest'))return {rows:args[0].map(name=>({name,present:ready}))}
    if(sql.includes('SELECT version'))return {rows:[1,2,3,4].map(version=>({version}))}
    return {rows:[]}
  }}}}
  if(ready)await loadBookingTestApp(pool,{exerciseStartup:true})
  else await assert.rejects(loadBookingTestApp(pool,{exerciseStartup:true}),/baseline missing/)
  assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(calls.at(-1),'ROLLBACK')
  assert.ok(calls.every(sql=>/^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(sql)))
}
console.log('STARTUP_READONLY_MOCK_PASS')
