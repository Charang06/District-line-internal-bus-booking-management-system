import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { normalizeRevenueSeatRows } from './revenue-seat-rows.js'
const baseline=execFileSync('git',['show','666e833237845cc702b872f58542e2174b718372:server/server.js'],{encoding:'utf8',windowsHide:true})
const current=readFileSync(new URL('./server.js',import.meta.url),'utf8')
function revenueRoute(source){
 const start=source.indexOf("app.post('/api/admin/revenue-entries'")
 const end=source.indexOf("app.post('/api/admin/duties'",start)
 assert.ok(start>=0&&end>start)
 return source.slice(start,end)
}
async function runRoute(source,body){
 let handler;const calls=[];const response={code:200,status(code){this.code=code;return this},json(data){this.data=data;return this}}
 vm.runInNewContext(revenueRoute(source),{
  app:{post(...args){handler=args.at(-1)}},authMiddleware(){},requireAdmin(){},requirePageManage(){},normalizeRevenueSeatRows,
  isIsoCalendarDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value),ROUTES:{KTY_CMB:{label:'Synthetic route'}},console:{error(){}},
  get:async(sql,args)=>{calls.push(['get',sql,args]);return {id:77,status:'locked'}},
  run:async(sql,args)=>{calls.push(['run',sql,args]);return {id:77}},audit:async(...args)=>calls.push(['audit',...args]),
 })
 await handler({body,user:{id:1}},response)
 return JSON.parse(JSON.stringify({code:response.code,data:response.data,calls}))
}
test('manual revenue API matches production validation, totals, persistence and locking with mocked storage',async()=>{
 const rows=(count=1,amount=100)=>[{count,amount},...Array.from({length:3},()=>({count:0,amount:0}))]
 const body={travel_date:'2026-11-12',route_code:'KTY_CMB',bus_no:'SYNTHETIC',seat_rows:rows(),cargo_rows:[]}
 const cases=[body,{...body,seat_rows:rows(49,100000000)},{...body,seat_rows:rows(50)},{...body,seat_rows:[{count:25,amount:1},{count:25,amount:1},{count:0,amount:0},{count:0,amount:0}]},
 {...body,seat_rows:rows(1,1.5)},{...body,seat_rows:rows(1,100000001)},{...body,seat_rows:rows(1.5)},
 {...body,seat_rows:rows('',null)},{...body,seat_rows:[...rows(),{category:'Extra',count:1,amount:1}]},
 {...body,seat_rows:rows().slice(0,3)},{...body,seat_rows:rows(0),cargo_rows:[{description:'Cargo only',amount:50}]},
 {...body,cargo_rows:Array.from({length:30},()=>({description:'Cargo',amount:100000000}))},
 {...body,cargo_rows:Array.from({length:31},()=>({description:'Cargo',amount:1}))},
 {...body,cargo_rows:[{description:'Decimal',amount:1.5}]},{...body,cargo_rows:[{description:'',amount:1}]},
 {...body,seat_rows:rows(0)},{...body,seat_rows:rows(1,0)},{...body,trip_id:999,seat_rows:rows(50)}]
 for(const input of cases)assert.deepEqual(await runRoute(current,input),await runRoute(baseline,input))
 const saved=await runRoute(current,body);assert.equal(saved.code,201)
 const insert=saved.calls.find(call=>call[0]==='run'&&call[1].includes('INSERT INTO revenue_entries'))
 assert.match(insert[1],/'locked'.*CURRENT_TIMESTAMP/s);assert.equal(insert[2][11],100)
})
test('financial middleware matrix on actual HTTP routes with fake pg and no provider delivery',()=>{
 const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./test-support/financial-policy-local-worker.mjs',import.meta.url))],{encoding:'utf8',timeout:30000,windowsHide:true})
 assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/FINANCIAL_POLICY_HTTP_MOCK_PASS/)
})

test('financial handlers and duty calculations retain production bodies except approved route guards',()=>{
 const routeStarts=["app.post('/api/admin/expenses'", "app.get('/api/admin/expense-submissions'", "app.post('/api/admin/expense-submissions'", "app.get('/api/admin/revenue-entries'", "app.post('/api/admin/duties'", "app.post('/api/admin/duties/:id/expenses'", "app.post('/api/admin/duties/:id/adjustments'", "app.delete('/api/admin/duties/:id/expenses/:expenseId'", "app.delete('/api/admin/duties/:id/adjustments/:adjustmentId'", "app.post('/api/admin/duties/:id/finalize'"]
 const body=(source,start)=>{const i=source.indexOf(start);assert.ok(i>=0);const a=source.indexOf('=> {',i);const b=source.indexOf('\n})',a);assert.ok(b>a);return source.slice(a,b).replaceAll('\r','')}
 for(const route of routeStarts)assert.equal(body(current,route),body(baseline,route),route)
 for(const name of ['tripRevenue','serializeDuty','getAdminDutyData']){
  const extract=source=>{const a=source.indexOf('async function '+name+'(');assert.ok(a>=0);const b=source.indexOf('\n}',a);assert.ok(b>a);return source.slice(a,b+2).replaceAll('\r','')}
  assert.equal(extract(current),extract(baseline),name)
 }
})
test('dashboard financial formulas and Accounts route-ledger precedence remain the production formulas',()=>{
 const historical=file=>execFileSync('git',['show','666e833:'+file],{encoding:'utf8',windowsHide:true})
 const report=readFileSync(new URL('../src/components/ExpenseSubmissionsTable.jsx',import.meta.url),'utf8')
 const old=historical('src/components/ExpenseSubmissionsTable.jsx')
 const slice=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b).trim().replaceAll('\r','')}
 assert.equal(slice(report,'  const busOptions =','  const reportingScope ='),slice(old,'  const busOptions =','  return <section'))
 const accounts=readFileSync(new URL('../src/components/AccountsRevenue.jsx',import.meta.url),'utf8')
 const oldAccounts=historical('src/components/AccountsRevenue.jsx')
 assert.equal(slice(accounts,'                  const legs =','                  return legs.map'),slice(oldAccounts,'                  const legs =','                  return legs.map'))
 assert.equal(slice(accounts,'                    const matches =','                    return <tr'),slice(oldAccounts,'                    const matches =','                    return <tr'))
 assert.ok(!accounts.includes('const revenueForLeg ='))
 assert.ok(!accounts.includes('Add Extra Row'))
 assert.match(accounts,/max={MAX_REVENUE_SEAT_ROW_COUNT}/)
 assert.ok(accounts.includes('if (seatError) return showMessage'))
 assert.ok(accounts.includes('if (validationError) return showMessage(validationError, true)'))
})
