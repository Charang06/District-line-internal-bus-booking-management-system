// Offline Chrome/CDP tests: clean candidate, fresh profile, all API calls mocked.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {spawn} from 'node:child_process'
import {accountWorkflows,adminWorkflows,loginWorkflows} from './browser-acceptance.mjs'
const meta=JSON.parse(fs.readFileSync(process.argv[2]||'docs/handover/districtline-final-candidate-manifest.json'))
for(const k of Object.keys(process.env))if(k.startsWith('VITE_'))delete process.env[k]
const {build}=await import('vite')
const built=await build({root:meta.candidate,configFile:path.join(meta.candidate,'vite.config.js'),envDir:false,publicDir:false,build:{write:false,emptyOutDir:false}})
const assets=new Map(built.output.map(x=>['/'+x.fileName,Buffer.from(x.code||x.source)]))
const resourceErrors=[]
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){res.writeHead(503);res.end('Mock missing');return}
 let data=assets.get(url.pathname==='/'?'/index.html':url.pathname)
 if(!data){const relative='public'+url.pathname;const full=path.resolve(meta.candidate,relative);if(full.startsWith(path.join(meta.candidate,'public')+path.sep)&&fs.existsSync(full)&&fs.statSync(full).isFile())data=fs.readFileSync(full)}
 if(!data){if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}resourceErrors.push({path:url.pathname,status:404});res.writeHead(404);res.end();return}
 const ext=path.extname(url.pathname);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'})[ext]||'text/html');res.end(data)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin='http://127.0.0.1:'+server.address().port
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'district-clean-browser-'))
const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p))
if(!executable)throw Error('No installed Chrome or Edge executable found; no installation attempted')
const chrome=spawn(executable,['--headless=new','--no-first-run','--disable-background-networking','--disable-sync','--disable-component-update','--disable-default-apps','--disable-extensions','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
let browserStderr='';chrome.stderr.on('data',chunk=>{browserStderr=(browserStderr+chunk).slice(-6000)})
let launchError;chrome.on('error',e=>launchError=e)
const pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[],consoleErrors=[],networkErrors=[]
async function check(name,fn){try{await fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:String(e.message).slice(0,1800)})}console.log(JSON.stringify(results.at(-1)))}
function fixture(mode){
 const pages=['home','log','info','dashboard','accounts','customers','staff'];const access=Object.fromEntries(pages.map(p=>[p,{view:mode==='admin'||(['manager','view'].includes(mode)&&p==='accounts')||(mode==='none'&&p==='home'),manage:mode==='admin'||(mode==='manager'&&p==='accounts')}]))
 const user={id:1,username:'synthetic',fullName:'Synthetic Tester',role:mode==='admin'?'admin':'staff',permissions:{...Object.fromEntries(pages.map(p=>[p,access[p].view])),passengers:mode==='admin',trips:mode==='admin',cargo:mode==='admin',pageAccess:access}}
 const date=new Date().toLocaleDateString('en-CA');const trips=[{id:11,trip_code:'SYN-11',travel_date:date,route_code:'KTY_CMB',route_label:'Synthetic corridor',registration_no:'SYN-BUS',bus_no:'SYN-BUS',status:'completed',departure_time:'20:30',booked_count:0},{id:12,trip_code:'SYN-12',travel_date:'2026-12-01',route_code:'CMB_KTY',route_label:'Synthetic return',registration_no:'SYN-BUS',status:'completed'}]
 const revenue={total:100,collected:100,outstanding:0};const duty={id:501,duty_code:'DUTY-SYNTHETIC',bus_no:'SYN-BUS',status:'in_progress',first_trip:{...trips[0],revenue},return_trip:{...trips[1],revenue},total_revenue:200,total_expenses:25,net_profit:175,expenses:[{id:1,category:'Fuel',description:'Synthetic fuel',amount:25,expense_date:date}],adjustments:[],adjustment_totals:{refunds:0,cancellation_fees:0,other_income:0}}
 window.__requests=[];window.__entries=[];window.__submissions=[];window.__bookings=[];window.__user=user;window.__duty=duty;window.__mode=mode;window.__authed=mode!=='login';window.__delay=0;window.__error=false;window.__unhandled=[]
 localStorage.clear();sessionStorage.clear()
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin);if(url.origin!==location.origin)throw Error('External request forbidden')
  const p=url.pathname,m=options.method||'GET';window.__requests.push({path:p,method:m,body:options.body?JSON.parse(options.body):undefined});if(window.__delay)await new Promise(r=>setTimeout(r,window.__delay))
  let status=200,data={ok:true};if(p==='/api/me')data=window.__authed?{user:window.__user}:(status=401,{message:'Synthetic signed-out session'})
  else if(p==='/api/login'){window.__authed=true;window.__user={...window.__user,role:'admin'};data={user:window.__user}}
  else if(p==='/api/logout'){window.__authed=false;data={ok:true}}
  else if(p==='/api/admin/dashboard')data=window.__error?(status=503,{message:'Synthetic unavailable'}):{scope:url.searchParams.get('scope'),trips,buses:[{id:7,registration_no:'SYN-BUS',status:'active'}],expenses:[],dailyRevenue:[],passengerRecords:[],regularCustomers:[],duties:[],dutyTrips:[],smsGateway:{configured:false}}
  else if(p==='/api/accounts/crew-options'||p==='/api/admin/crew')data={crew:[{id:9,full_name:'Synthetic Driver',role:'driver'},{id:10,full_name:'Synthetic Conductor',role:'conductor'}]}
  else if(p==='/api/accounts/duties')data={duties:[window.__duty],dutyTrips:trips}
  else if(p==='/api/trips')data={trips}
  else if(/^\/api\/trips\/\d+$/.test(p))data={trip:trips[0],bookings:window.__bookings,cargo:[]}
  else if(p==='/api/buses')data={buses:[{id:7,registration_no:'SYN-BUS',status:'active'}]}
  else if(p==='/api/admin/bus-contacts')data={contacts:[]}
  else if(p==='/api/admin/staff')data={staff:[]}
  else if(p==='/api/bookings'){
   if(m==='GET')data={bookings:window.__bookings}
   else {const body=JSON.parse(options.body);const booking={...body,id:701,booking_ref:'BOOK-SYN',status:'confirmed',confirmation_status:'unconfirmed',sms_status:'pending',created_at:'2026-11-12T00:00:00Z',travel_date:date,route_code:'KTY_CMB',route_label:'Synthetic corridor',registration_no:'SYN-BUS'};window.__bookings.push(booking);data={booking}}
  }
  else if(p==='/api/cargo')data={cargo:[]}
  else if(p==='/api/admin/revenue-entries'){
   if(m==='GET')data={entries:window.__entries}
   else {const body=JSON.parse(options.body);const entry={...body,id:1,entry_code:'REV-SYN',status:'locked',total_revenue:4900,seat_rows_json:JSON.stringify(body.seat_rows),cargo_rows_json:JSON.stringify(body.cargo_rows)};window.__entries.unshift(entry);data={entry}}
  }
  else if(p==='/api/admin/expense-submissions'){
   if(m==='GET')data={submissions:window.__submissions}
   else {const body=JSON.parse(options.body);const submission={...body,id:1,submission_code:'EXP-SYN',status:'locked',total_expense:20,items_json:JSON.stringify(body.items)};window.__submissions.unshift(submission);data={submission}}
  }
  else if(p.startsWith('/api/admin/duties')){
   if(p.endsWith('/finalize'))window.__duty={...window.__duty,status:'finalized'}
   if(p.endsWith('/expenses')&&m==='POST')window.__duty={...window.__duty,expenses:[...window.__duty.expenses,{...JSON.parse(options.body),id:2}]}
   if(p.endsWith('/adjustments')&&m==='POST')window.__duty={...window.__duty,adjustments:[...window.__duty.adjustments,{...JSON.parse(options.body),id:3}]}
   if(m==='DELETE')window.__duty={...window.__duty,...(p.includes('/adjustments/')?{adjustments:window.__duty.adjustments.filter(a=>!p.endsWith('/'+a.id))}:{expenses:window.__duty.expenses.filter(a=>!p.endsWith('/'+a.id))})}
   data={duty:window.__duty}
  }
  else if(p==='/api/admin/smslenz/balance')data={sms_credit_balance:0,allocated_credit_total:0,sender_id_balances:[],status:'synthetic',updated_at:'2026-11-12T00:00:00Z'}
  else {window.__unhandled.push({path:p,method:m});status=501;data={message:'Unmocked local endpoint '+p}}
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
 }
}
let ws,seq=0;const pending=new Map()
async function call(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+r.result?.description);return r.result.value}
async function wait(expression){for(let i=0;i<80;i++){if(await evaluate('Boolean('+expression+')'))return;await pause(75)}throw Error('UI condition timed out: '+expression)}
async function click(text){const ok=await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==='+JSON.stringify(text)+');if(!b)return false;b.click();return true})()');if(!ok)throw Error('Missing button '+text);await pause(180)}
const context={evaluate,call,check,click,wait,pause}
const screenshotDir=process.argv[3]
const desktopPixelDiffs=[]
const screenshotMetrics=[]
async function captureReviewScreenshot(name,width,height=900){
 if(!screenshotDir)return
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768})
 await pause(250)
 const dimensions=await evaluate('({innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})')
 screenshotMetrics.push({name,requestedWidth:width,...dimensions})
 const image=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:0,y:0,width,height:dimensions.height,scale:1}})
 const target=path.resolve(screenshotDir,`${name}-${width}.png`)
 fs.mkdirSync(path.dirname(target),{recursive:true})
 fs.writeFileSync(target,Buffer.from(image.data,'base64'))
 if(name==='admin-dashboard'&&width>=1280){
  const baseline=path.resolve('artifacts/mobile-responsive-ux/before',`${name}-${width}.png`)
  if(fs.existsSync(baseline)){
   const before=fs.readFileSync(baseline).toString('base64')
   await call('Fetch.disable')
   try{
    const comparison=await evaluate(`(async()=>{const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src});const [a,b]=await Promise.all([load('data:image/png;base64,${before}'),load('data:image/png;base64,${image.data}')]);if(a.width!==b.width||a.height!==b.height)return{baseline:{width:a.width,height:a.height},after:{width:b.width,height:b.height},dimensionMatch:false,differentPixels:null};const canvas=document.createElement('canvas');canvas.width=a.width;canvas.height=a.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(a,0,0);const first=ctx.getImageData(0,0,a.width,a.height).data;ctx.clearRect(0,0,a.width,a.height);ctx.drawImage(b,0,0);const second=ctx.getImageData(0,0,b.width,b.height).data;let differentPixels=0;for(let i=0;i<first.length;i+=4)if(first[i]!==second[i]||first[i+1]!==second[i+1]||first[i+2]!==second[i+2]||first[i+3]!==second[i+3])differentPixels++;return{width:a.width,height:a.height,dimensionMatch:true,differentPixels,totalPixels:a.width*a.height}})()`)
    desktopPixelDiffs.push({width,...comparison})
   }finally{await call('Fetch.enable',{patterns:[{urlPattern:'*'}]})}
  }
 }
}
try{
 const ready=await fetch(origin+'/',{signal:AbortSignal.timeout(3000)});if(!ready.ok)throw Error('Local candidate server is not ready')
 for(let i=0;i<80&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++){if(launchError)throw launchError;if(chrome.exitCode!==null)throw Error('Browser exited '+chrome.exitCode);await pause(100)}
 if(!fs.existsSync(path.join(profile,'DevToolsActivePort')))throw Error('Chrome debug endpoint unavailable')
 const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]
 const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT',signal:AbortSignal.timeout(3000)})).json()
 if(target.type!=='page'||!target.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:'))throw Error('Unexpected CDP page target')
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('CDP socket open timeout')),3000);ws.onopen=()=>{clearTimeout(timer);r()};ws.onerror=e=>{clearTimeout(timer);j(e)}})
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}else if(m.method==='Fetch.requestPaused'){const u=m.params.request.url;if(u.startsWith(origin+'/'))call('Fetch.continueRequest',{requestId:m.params.requestId}).catch(()=>{});else call('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{})}else if(m.method==='Runtime.exceptionThrown')consoleErrors.push(m.params.exceptionDetails.text)}
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.loadingFailed'&&!(m.params.canceled&&m.params.type==='Document'))networkErrors.push({type:m.params.type,error:m.params.errorText});if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.value||a.description||'').join(' ').slice(0,500))})
 console.log('CDP connected');const version=await call('Browser.getVersion');console.log('CDP version read',version.product);await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]})
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.addEventListener("error",e=>{window.__lastError=String(e.error?.stack||e.message)})'})
 let injection
 for(const mode of ['admin','manager','view','none','login']){
  if(injection)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection})
  injection=(await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')('+JSON.stringify(mode)+')'})).identifier
  await call('Page.navigate',{url:origin+'/'});await wait('document.querySelector(".login-panel")||document.querySelector(".app-shell")||document.querySelector("nav")');await pause(350)
  if(mode==='login'){await check('signed-out login screen',async()=>{if(!await evaluate('!!document.querySelector("input[type=password]")'))throw Error('No login form')});await loginWorkflows(context);continue}
  await check(mode+' mobile navigation permission visibility',async()=>{
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
   const allowed=await evaluate('[...document.querySelectorAll(".nav-button")].map(e=>e.textContent.trim())')
   if(allowed.includes('Dashboard')!== (mode==='admin')||allowed.includes('Accounts')!==(['admin','manager','view'].includes(mode))||allowed.includes('Staff')!== (mode==='admin'))throw Error('Unexpected permitted navigation: '+JSON.stringify(allowed))
   await evaluate('document.querySelector(".mobile-nav-toggle").click()')
   if(!await evaluate('document.querySelector(".nav-tabs").classList.contains("is-open")'))throw Error('Drawer did not open')
   const opened=await evaluate('[...document.querySelectorAll(".nav-button")].map(e=>e.textContent.trim())')
   if(JSON.stringify(opened)!==JSON.stringify(allowed))throw Error('Drawer permission list changed: '+JSON.stringify(opened))
   await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
   if(!await evaluate('!document.querySelector(".nav-tabs").classList.contains("is-open")&&document.body.style.overflow===""&&document.activeElement.classList.contains("mobile-nav-toggle")'))throw Error('Escape did not close drawer and restore focus/scroll')
  })
  if(mode==='admin')for(const tab of ['Home','Log','Info','Dashboard','Customers','Staff'])await check('admin '+tab+' navigation',async()=>{await click(tab);if(!await evaluate('document.body.textContent.length>100'))throw Error('Empty screen: '+await evaluate('window.__lastError'))})
  if(mode==='admin'&&screenshotDir){
   await click('Dashboard');await wait('document.querySelector(".admin-dashboard-page")')
   for(const width of [320,375,390,430,768,1024,1280,1440,1920])await captureReviewScreenshot('admin-dashboard',width,width>=1280?1100:900)
   await click('Staff');await wait('document.querySelector(".staff-ui-page")');await captureReviewScreenshot('admin-staff',390)
  }
  if(mode==='admin')await adminWorkflows(context)
  if(mode==='none'){await check('ungranted staff Accounts navigation absent',async()=>{if(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Accounts")'))throw Error('Unauthorized Accounts navigation')});continue}
  await click('Accounts');await wait('document.body.textContent.includes("Revenue and Expenses")');await pause(200)
  if(mode==='manager'&&screenshotDir){await captureReviewScreenshot('staff-accounts',390);await captureReviewScreenshot('staff-accounts',768)}
  for(const width of [320,360,375,390,430,768,1024,1280,1440,1920])await check(mode+' Accounts responsive '+width,async()=>{
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await pause(80)
   const metrics=await evaluate('({innerWidth,scroll:document.documentElement.scrollWidth,zero:[...document.querySelectorAll("button,select,input")].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height<12).length,smallTargets:[...document.querySelectorAll("button,select,input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range])")].filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=="hidden"&&e.getBoundingClientRect().height<44).map(e=>({tag:e.tagName,className:e.className,text:e.textContent.trim().slice(0,40),height:Math.round(e.getBoundingClientRect().height)}))})')
   if(metrics.innerWidth!==width||metrics.scroll>width+2)throw Error('Page overflow or viewport expansion '+JSON.stringify(metrics))
   if(width<=1024&&metrics.smallTargets.length)throw Error('Touch target below 44px '+JSON.stringify(metrics))
  })
  if(mode==='view')await check('View-only forms hidden and scoped manager reads absent',async()=>{const v=await evaluate('({panel:!!document.querySelector(".accounts-duty-panel"),visible:[...document.querySelectorAll("button[type=submit]")].some(b=>b.getBoundingClientRect().width>0),reads:window.__requests.filter(r=>r.path.startsWith("/api/accounts/")).length})');if(v.panel||v.visible||v.reads)throw Error(JSON.stringify(v))})
  if(mode==='view')await check('View-only Expense form remains read-only',async()=>{await click('Expense');if(await evaluate('[...document.querySelectorAll("button[type=submit]")].some(e=>e.getBoundingClientRect().width>0)||window.__requests.some(r=>r.method==="POST")'))throw Error('View-only expense mutation control exposed')})
  else {
   await accountWorkflows(context,mode)
   await check(mode+' minimized crew selectors populated',async()=>{if(!await evaluate('[...document.querySelectorAll("select option")].some(e=>e.textContent==="Synthetic Driver")'))throw Error('Missing crew')})
   await check(mode+' manual revenue fixed count inputs',async()=>{const values=await evaluate('[...document.querySelectorAll(".accounts-seat-table input[type=number]")].map(e=>({max:e.max,step:e.step}))');if(values.length!==16||values.some((v,i)=>i%2===0&&v.max!=='49'))throw Error(JSON.stringify(values))})
   await check(mode+' duty review and finalization refresh',async()=>{
    await evaluate('(()=>{const e=[...document.querySelectorAll("select")].find(e=>[...e.options].some(o=>o.textContent.includes("DUTY-SYNTHETIC")));e.value="501";e.dispatchEvent(new Event("change",{bubbles:true}))})()');await pause(120);await click('Review and finalize duty');await wait('document.body.textContent.includes("Confirm and finalize")');await click('Confirm and finalize');await pause(180);if(!await evaluate('window.__requests.some(r=>r.path.endsWith("/finalize")&&r.method==="POST")&&window.__requests.filter(r=>r.path==="/api/accounts/duties").length>=2'))throw Error('Finalize/refresh missing')
   })
   await check(mode+' finalized duty controls hidden',async()=>{await wait('!document.body.textContent.includes("Add duty expense")');if(await evaluate('!!document.querySelector(".accounts-duty-panel fieldset")'))throw Error('Finalized duty remains editable')})
  }
  await check(mode+' no unmatched synthetic API calls',async()=>{const unmatched=await evaluate('window.__unhandled');if(unmatched.length)throw Error(JSON.stringify(unmatched))})
 }
 await check('no uncaught browser exceptions',async()=>{if(consoleErrors.length)throw Error(consoleErrors.join('; '))})
 await check('no failed local resources or unexpected network errors',async()=>{if(resourceErrors.length||networkErrors.length)throw Error(JSON.stringify({resourceErrors,networkErrors}))})
}catch(e){results.push({name:'browser harness',pass:false,error:e.message})}
finally{
 if(ws?.readyState===WebSocket.OPEN)await Promise.race([call('Browser.close').catch(()=>{}),pause(2000)])
 ws?.close()
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'))}pending.clear()
 for(let i=0;i<20&&chrome.exitCode===null;i++)await pause(100)
 if(chrome.exitCode===null)await new Promise(resolve=>{const killer=spawn('taskkill',['/PID',String(chrome.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('exit',resolve);killer.on('error',resolve)})
 server.closeAllConnections();await new Promise(r=>server.close(r))
}
const evidencePath='docs/handover/districtline-final-verification.json'
if(screenshotDir){fs.writeFileSync(path.resolve(screenshotDir,'desktop-pixel-diff.json'),JSON.stringify(desktopPixelDiffs,null,2)+'\n');fs.writeFileSync(path.resolve(screenshotDir,'screenshot-metrics.json'),JSON.stringify(screenshotMetrics,null,2)+'\n')}
const previousEvidence=fs.existsSync(evidencePath)?JSON.parse(fs.readFileSync(evidencePath,'utf8')):{}
const output={...previousEvidence,browser:{results,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,consoleErrors,profile:'fresh temporary profile; retained outside release',mocked:true,testedCandidate:meta.candidate},candidateBuild:{pass:true,modules:'see Vite output',outputs:built.output.length}}
output.browser.diagnostics={executable,exitCode:chrome.exitCode,stderr:browserStderr,commandTimeoutMs:30000,resourceErrors,networkErrors}
fs.writeFileSync('docs/handover/districtline-final-verification.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));if(output.browser.failed)process.exitCode=1
