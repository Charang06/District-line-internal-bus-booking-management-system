import test from 'node:test'
import assert from 'node:assert/strict'
import {validateDisposableAttestation} from './test-support/disposable-attestation.js'
const now=Date.parse('2026-11-12T00:00:00Z')
const valid={ownerApproved:true,syntheticOnly:true,emptyDatabase:true,independentStorage:true,noProtectedProjects:true,noDeliveryIntegrations:true,syntheticDataLifecycleApproved:true,host:'127.0.0.1',port:5549,database:'synthetic',user:'synthetic',processOrContainerId:'dedicated-test-process',isolationEvidence:'Owner inspected dedicated storage, process and network',verifiedAt:new Date(now).toISOString()}
test('disposable gate requires every explicit isolation and data lifecycle approval',()=>{
 for(const key of Object.keys(valid).filter(k=>typeof valid[k]==='boolean'))assert.throws(()=>validateDisposableAttestation({...valid,[key]:false},{},now),/approval missing/)
 for(const value of [null,[],{},'localhost'])assert.throws(()=>validateDisposableAttestation(value,{},now))
})
test('localhost name, stale/future evidence, invalid ports and missing ownership evidence fail before connection',()=>{
 for(const host of ['localhost','db.example.test','::1'])assert.throws(()=>validateDisposableAttestation({...valid,host},{},now))
 for(const port of [0,65536,5432.5,'5432'])assert.throws(()=>validateDisposableAttestation({...valid,port},{},now))
 for(const verifiedAt of ['invalid',new Date(now+1).toISOString(),new Date(now-3600000).toISOString()])assert.throws(()=>validateDisposableAttestation({...valid,verifiedAt},{},now))
 for(const key of ['database','user','processOrContainerId','isolationEvidence'])assert.throws(()=>validateDisposableAttestation({...valid,[key]:''},{},now))
})
test('disposable gate keeps verified TLS and never consumes application or remote database URLs',()=>{
 for(const env of [{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{PGSSLMODE:'disable'},{PGSSLMODE:'no-verify'}])assert.throws(()=>validateDisposableAttestation(valid,env,now),/TLS/)
 const config=validateDisposableAttestation(valid,{DATABASE_URL:'postgresql://protected.invalid/not-used'},now)
 assert.equal(config.host,'127.0.0.1');assert.equal(config.port,5549);assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.servername,'localhost')
 assert.ok(!JSON.stringify(config).includes('protected.invalid'))
})
