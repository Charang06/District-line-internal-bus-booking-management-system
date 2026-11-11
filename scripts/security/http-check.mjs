// GET limit=0 only. No record retrieval, mutation, secret key, or account JWT.
import fs from 'node:fs'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
loadEnv(process.cwd())
const fingerprint=projectFingerprint(process.env.DATABASE_URL)
if(fingerprint!=='868295d24a51')throw Error('Owner-confirmed project identity mismatch')
const u=new URL(process.env.DATABASE_URL)
const ref=u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]||decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
if(!ref||!/^[a-z0-9]+$/.test(ref))throw Error('Project reference unavailable')
const key=process.env.SECURITY_SUPABASE_PUBLIC_API_KEY
if(!key)throw Error('Publishable/anon key not configured')
if(key.startsWith('eyJ')){
 const p=JSON.parse(Buffer.from(key.split('.')[1],'base64url'))
 if(p.role!=='anon'||(p.ref&&p.ref!==ref))throw Error('Only matching project anon key is permitted')
}else if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw Error('Only publishable/anon key is permitted')
const expectDenied=process.argv.includes('--expect-denied')
const catalog=JSON.parse(fs.readFileSync('artifacts/internal-table-security/inspection.json','utf8'))
if(catalog.projectFingerprint!==fingerprint||catalog.tables.length!==22)throw Error('Reviewed catalog evidence missing')
const report={at:new Date().toISOString(),projectFingerprint:fingerprint,method:'GET',limit:0,role:'anon',customerRecordsReturned:0,productionMutations:false,probes:[]}
for(const t of catalog.tables.filter(t=>expectDenied||!t.rls)){
 if(!/^[a-z_]+$/.test(t.name))throw Error('Unexpected table identifier')
 try{
  const response=await fetch(`https://${ref}.supabase.co/rest/v1/${t.name}?select=*&limit=0`,{
   method:'GET',headers:{apikey:key,'Accept-Profile':'public'},signal:AbortSignal.timeout(12000),redirect:'error'})
  const body=await response.text()
  let code
  try{code=JSON.parse(body)?.code}catch{/* Never print provider/error bodies. */}
  if(response.ok&&body.trim()!=='[]')throw Error('ZERO_RECORD_INVARIANT_FAILED')
  const result={table:t.name,status:response.status,code:typeof code==='string'&&/^[A-Za-z0-9_]+$/.test(code)?code:undefined,
   result:response.ok?'EXPOSED_ZERO_ROWS':[401,403].includes(response.status)&&code==='42501'?'PERMISSION_DENIED':response.status===404&&code==='PGRST205'?'ENDPOINT_UNAVAILABLE':'NOT_ESTABLISHED'}
  report.probes.push(result);console.log(JSON.stringify(result))
 }catch(e){report.probes.push({table:t.name,result:'NOT_ESTABLISHED',error:e.message==='ZERO_RECORD_INVARIANT_FAILED'?'ZERO_RECORD_INVARIANT_FAILED':'NETWORK_OR_HTTP_CHECK_FAILED'})}
}
report.successful=report.probes.filter(p=>p.result==='EXPOSED_ZERO_ROWS').map(p=>p.table)
report.denied=report.probes.filter(p=>p.result==='PERMISSION_DENIED').map(p=>p.table)
report.unverified=report.probes.filter(p=>p.result==='NOT_ESTABLISHED').map(p=>p.table)
report.unavailable=report.probes.filter(p=>p.result==='ENDPOINT_UNAVAILABLE').map(p=>p.table)
fs.writeFileSync(`artifacts/internal-table-security/${expectDenied?'post-deployment-http':'http-exposure'}.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({successful:report.successful.length,denied:report.denied.length,unverified:report.unverified.length,customerRecordsReturned:0}))
if(report.unverified.length||(expectDenied&&report.successful.length))process.exitCode=1
