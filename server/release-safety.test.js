// Offline configuration/route checks; component rendering never mounts the app.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const server=read('server/server.js')
test('Vercel assets are explicit approved registered SQL plus TLS, with optional migrations denied',()=>{
 const config=JSON.parse(read('vercel.json')),fn=config.functions['api/**/*.js']
 const expand=value=>{assert.ok(value.startsWith('{')&&value.endsWith('}'));return value.slice(1,-1).split(',')}
 const included=expand(fn.includeFiles),excluded=expand(fn.excludeFiles)
 const registered=[...server.slice(server.indexOf('const DATABASE_MIGRATIONS'),server.indexOf('async function migrateDatabaseIfNeeded')).matchAll(/file: '([^']+)'/g)].map(m=>'server/migrations/'+m[1])
 assert.deepEqual(included.filter(p=>p.endsWith('.sql')),registered)
 for(const p of included){assert.ok(fs.existsSync(new URL('../'+p,import.meta.url)),p);assert.ok(!/[?*]/.test(p))}
 assert.ok(included.includes('certs/supabase-prod-ca-2021.crt'));assert.ok(included.includes('scripts/lib/supabase-verified-tls.cjs'))
 assert.deepEqual(excluded,['server/migrations/008_login_rate_limits.sql','server/migrations/009_admin_mfa.sql'])
 for(const p of excluded)assert.ok(!included.includes(p))
 assert.deepEqual(config.rewrites,[{source:'/api/:path*',destination:'/api?path=:path*'},{source:'/(.*)',destination:'/index.html'}])
})
test('scoped financial route registration and client wiring do not expose the admin dashboard',()=>{
 for(const route of ['/api/accounts/crew-options','/api/accounts/duties']){
  assert.equal(server.split("app.get('"+route+"', authMiddleware, requirePageManage('accounts')").length,2)
  assert.ok(!server.includes("app.post('"+route+"'"))
 }
 const start=server.indexOf("app.get('/api/accounts/duties'")
 const end=server.indexOf("app.get('/api/admin/crew'",start)
 const source=server.slice(start,end)
 assert.ok(!source.includes('getAdminDutyData('));assert.ok(!source.includes('await run('));assert.ok(!source.includes('await exec('))
 const app=read('src/App.jsx'),api=read('src/api.js'),accounts=read('src/components/AccountsRevenue.jsx')
 assert.ok(app.includes('else if (staffPermissions.accountsManage) api.accountsCrewOptions(token)'))
 assert.ok(app.includes("scope === 'accounts' && (isAdmin || staffPermissions.accountsManage) ? api.accountsDutyData(token)"))
 assert.ok(app.includes('(isAdmin || staffPermissions.accountsManage) && <AccountsDuties'))
 assert.ok(accounts.includes('{!readOnly && dutyPanel}'))
 assert.ok(accounts.includes('staff with Accounts Manage permission'))
 for(const path of ['/accounts/crew-options','/accounts/duties'])assert.ok(api.includes(path))
 const handler=read('api/_handler.js');assert.ok(handler.includes("import app from '../server/server.js'"))
})
test('duty panel renders existing actions, locks finalized duties and gates finalization on completed journeys',()=>{
 const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./test-support/accounts-duty-render-worker.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:30000})
 assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/ACCOUNTS_DUTY_RENDER_PASS/)
})

test('API adapters preserve endpoint, method, body and query for rewritten and direct requests',()=>{
 const received=[]
 const app=(req,res)=>{received.push({url:req.url,method:req.method,body:req.body,res});return 'handled'}
 function adapter(file) {
  const source=read(file).replace(/^import app from [^\n]+\n/m,'').replace('export default function handler','function handler')
  return vm.runInNewContext(source+'\nhandler',{app,URL})
 }
 const common=adapter('api/_handler.js'), revenue=adapter('api/admin/revenue-entries.js'),res={}
 const body={synthetic:true}
 assert.equal(common({url:'/api?path=accounts%2Fduties&scope=accounts',query:{path:'accounts/duties'},method:'GET'},res),'handled')
 common({url:'/accounts/crew-options?active=1',query:{},method:'GET'},res)
 common({url:'/api/admin/duties/5/finalize',query:{},method:'POST',body},res)
 revenue({url:'/api?path=admin%2Frevenue-entries&summary=1',method:'POST',body},res)
 assert.deepEqual(received.map(r=>r.url),['/api/accounts/duties?scope=accounts','/api/accounts/crew-options?active=1','/api/admin/duties/5/finalize','/api/admin/revenue-entries?summary=1'])
 assert.equal(received[2].body,body);assert.equal(received[3].body,body)
 assert.equal(received[3].method,'POST');assert.ok(received.every(r=>r.res===res))
 for(const file of ['api/index.js','api/[...route].js'])assert.match(read(file),/export \{ default \} from '\.\/_handler\.js'/)
})
