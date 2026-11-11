// Synthetic browser validation only. Static build server, isolated Chrome profile,
// mocked API responses, and all requests outside the loopback origin blocked.
const localFs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const vm = require('node:vm')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'artifacts/security-local')
const dist = path.join(root, 'dist')
const browser = process.env.SECURITY_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const pauseLocal = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  if (!localFs.existsSync(path.join(dist,'index.html'))) throw Error('Run npm run build first')
  localFs.mkdirSync(output,{recursive:true})
  const server = http.createServer((req,res) => {
    const requested = new URL(req.url,'http://127.0.0.1:5198')
    if (requested.pathname.startsWith('/api/') || requested.pathname.startsWith('/uploads/')) {
      res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"Real API forbidden in synthetic browser test"}');return
    }
    let file = path.resolve(dist,'.'+decodeURIComponent(requested.pathname))
    if (!file.startsWith(dist+path.sep) && file !== dist) {res.writeHead(403);res.end();return}
    if (!localFs.existsSync(file) || !localFs.statSync(file).isFile())file=path.join(dist,'index.html')
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'})
    localFs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5198,'127.0.0.1',resolve)})
  const profile=localFs.mkdtempSync(path.join(os.tmpdir(),'district-synthetic-browser-'))
  const chrome=spawn(browser,['--headless=new','--no-first-run','--disable-background-networking','--disable-sync','--disable-component-update',
    '--disable-default-apps','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9341','--user-data-dir='+profile,'about:blank'],
  {windowsHide:true,stdio:'ignore'})
  let launchError
  chrome.on('error',error=>{launchError=error})
  try {
    let ready=false
    for(let i=0;i<60;i++) {
      if(launchError)throw Error('Isolated Chrome could not start')
      try {await fetch('http://127.0.0.1:9341/json/version',{signal:AbortSignal.timeout(1000)});ready=true;break}catch{await pauseLocal(100)}
    }
    if(!ready)throw Error('Isolated browser did not become ready')
    // Reuse the existing current-UI regression cases; never execute the old baseline.
    let source=localFs.readFileSync(path.join(root,'artifacts/ui-refresh-review/browser-check.cjs'),'utf8')
      .replaceAll('127.0.0.1:9331','127.0.0.1:9341').replaceAll('127.0.0.1:5195','127.0.0.1:5198')
      .replace('for(const baseline of [true,false])','for(const baseline of [false])')
      .replace("artifacts/ui-refresh-review/browser-results.json","artifacts/security-local/browser-results.json")
      .replace("if(results.some(r=>r.name.startsWith('fixed')&&!r.passed)||results.some(r=>r.name.startsWith('baseline')&&r.passed))",'if(results.some(r=>!r.passed))')
    source=source.replace(String.raw`else if(/^\/api\/trips\/\d+$/.test(p))`,"else if(p.startsWith('/api/trips/')&&Number.isInteger(Number(p.split('/').at(-1))))")
    source=source.replace("await call('Page.enable');",`await call('Page.enable');
      await call('Runtime.enable');
      ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.log('BROWSER_EXCEPTION '+String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,300));});
      await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
      ws.addEventListener('message',async e=>{const m=JSON.parse(e.data);if(m.method==='Fetch.requestPaused'){
        const permitted=new URL(m.params.request.url).origin==='http://127.0.0.1:5198';
        await call(permitted?'Fetch.continueRequest':'Fetch.failRequest',{requestId:m.params.requestId,...(permitted?{}:{errorReason:'BlockedByClient'})});
      }});`)
    source=source.replace("if(p==='/api/me')", "if(p==='/api/me'&&window.__role==='signedout'){status=401;data={message:'Sign in'}}else if(p==='/api/me')")
    source=source.replace("else if(p==='/api/buses'&&m==='GET')",`else if(p==='/api/login'){data={mfaRequired:true,challenge:'synthetic-ui-challenge'}}
      else if(p==='/api/admin-mfa/verify'){if(body.code!=='123456'){status=401;data={message:'Invalid verification'}}else{window.__role='admin';data={user:{id:7,role:'admin',username:'synthetic',fullName:'Synthetic User',permissions:{home:true,log:true,info:true,passengers:true,cargo:true,trips:true}}}}}
      else if(p==='/api/buses'&&m==='GET')`)
    source=source.replace('dailyRevenue:[],expenses:[],smsGateway','dailyRevenue:[],expenses:[],duties:[],dutyTrips:[],crewMembers:[],passengerRecords:[],regularCustomers:[],cargoRecords:[],passengers:{},cargo:{},sms:{},smsGateway')
    source=source.replace("else if(p==='/api/admin/staff')data={staff:[]};",`else if(p==='/api/admin/staff'&&m==='GET')data={staff:window.__staff||[]};
      else if(p==='/api/admin/staff'&&m==='POST'){const staff={id:88,...body};window.__staff=[staff];status=201;data={staff};}
      else if(p.startsWith('/api/admin/staff/')&&m==='PATCH'){const staff=window.__staff.find(s=>s.id===Number(p.split('/').at(-1)));Object.assign(staff,body);data={staff};}
      else if(p==='/api/logout'){window.__role='signedout';data={ok:true};}`)
    source=source.replace("else if(p==='/api/bookings')",`else if(p==='/api/bookings'&&m==='POST'){status=201;data={booking:{id:901,booking_ref:'SYNTHETIC',...body}}}
      else if(p==='/api/admin/smslenz/balance'){status=503;data={message:'Synthetic SMS balance unavailable'}}
      else if(p==='/api/cargo'&&m==='POST'){status=201;data={cargo:{id:902,cargo_ref:'SYNTHETIC-CARGO',...body}}}
      else if(p==='/api/bookings')`)
    source=source.replace("await wait(`!!document.querySelector('.nav-tabs')`);","await wait(role==='signedout'?`!!document.querySelector('#login-username')`:`!!document.querySelector('.nav-tabs')`);")
    source=source.replace("throw Error('Timed out: '+expression)","throw Error('Timed out: '+expression+' '+JSON.stringify(await evaluate('({body:document.body.innerText.slice(0,180),location:location.pathname})')))" )
    const extra=String.raw`
 const staffAdmin=await page('admin');try{
   await check('administrator can create and edit a synthetic staff account',async()=>{
     await staffAdmin.clickText('Staff');await staffAdmin.wait("!!document.querySelector('.staff-add-button')");
     await staffAdmin.evaluate("document.querySelector('.staff-add-button').click()");
     await staffAdmin.set('.staff-form-modal input[maxlength="80"]','Synthetic Dispatcher');
     await staffAdmin.set('.staff-form-modal input[maxlength="32"]','synthetic_dispatcher');
     await staffAdmin.set('.staff-form-modal input[type=password]','Synthetic-only-password');
     await staffAdmin.clickText('Create staff account',"document.querySelector('.staff-form-modal')");
     await staffAdmin.wait("!document.querySelector('.staff-form-modal')&&document.body.textContent.includes('synthetic_dispatcher')");
     await staffAdmin.clickText('Edit');await staffAdmin.set('.staff-form-modal input[maxlength="80"]','Synthetic Updated');
     await staffAdmin.clickText('Save staff details');await staffAdmin.wait("!document.querySelector('.staff-form-modal')&&document.body.textContent.includes('Synthetic Updated')");
     assert.equal(await staffAdmin.evaluate("window.__requests.some(r=>r.path==='/api/admin/staff/88'&&r.method==='PATCH')"),true);
   });
   await check('administrator logout returns to sign-in',async()=>{await staffAdmin.evaluate("document.querySelector('[aria-label=\"Log out\"]').click()");await staffAdmin.wait("!!document.querySelector('#login-username')");});
 }finally{await staffAdmin.close()}
 const h=await page('staff');try{
   await h.wait("!!document.querySelector('.reservation-panel') && document.querySelectorAll('.seat.available').length===49");
   const label=async(root,text,value)=>h.evaluate('('+((root,text,value)=>{
     const target=[...document.querySelectorAll(root+' label')].find(e=>e.querySelector('span')?.textContent===text)?.querySelector('input,select');
     if(!target)throw Error('Synthetic form field unavailable');
     Object.getOwnPropertyDescriptor(target.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(target,value);
     target.dispatchEvent(new Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));
   }).toString()+')('+JSON.stringify(root)+','+JSON.stringify(text)+','+JSON.stringify(value)+')');
   await check('booking form validates missing seats and saves synthetic selection',async()=>{
     await h.clickText('Save Passenger booking');await h.wait("!!document.querySelector('.reservation-panel [role=alert]')");
     const chosen=await h.evaluate("document.querySelector('.seat.available strong').textContent");
     await h.evaluate("document.querySelector('.seat.available').click()");
     await label('.reservation-panel','Passenger Name','Synthetic Passenger');
     await h.evaluate("document.querySelector('.reservation-panel input[type=radio]').click()");
     await h.clickText('Save Passenger booking');
     await h.wait("window.__requests.some(r=>r.path==='/api/bookings'&&r.method==='POST')");
     assert.equal(await h.evaluate("window.__requests.find(r=>r.path==='/api/bookings'&&r.method==='POST').body.seat_number"),chosen);
   });
   await check('cargo form validates missing goods and submits only synthetic data',async()=>{
     await h.clickText('Save Goods Booking');await h.wait("!!document.querySelector('.cargo-panel [role=alert]')");
     await label('.cargo-panel','Type of goods','Documents');
     await h.set('.cargo-panel input[type=number]','1');
     await label('.cargo-panel','Customer Name','Synthetic Sender');await label('.cargo-panel','Total Amount','100');
     await h.evaluate("document.querySelector('.cargo-panel input[type=radio]').click()");await h.clickText('Save Goods Booking');
     await h.wait("window.__requests.some(r=>r.path==='/api/cargo'&&r.method==='POST')");
     assert.equal(await h.evaluate("window.__requests.find(r=>r.path==='/api/cargo'&&r.method==='POST').body.description"),'Documents');
   });
   for(const width of [360,390,768,1440])await check('responsive booking and navigation '+width,async()=>{
     await h.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await pause(150);
     assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
     assert.equal(await h.evaluate("[...document.querySelectorAll('.reservation-panel input:not([type=radio]),.cargo-panel select')].every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.left>=-1&&b.right<=innerWidth+1})"),true);
     if(width<768){await h.evaluate("document.querySelector('.mobile-nav-toggle').click()");await h.wait("document.querySelector('.nav-tabs').classList.contains('is-open')");await h.clickText('Log');await h.wait("!document.querySelector('.nav-tabs').classList.contains('is-open')");await h.clickText('Home');}
   });
   await h.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await h.evaluate("document.querySelector('.reservation-panel').scrollIntoView()");await pause(250);
   fs.writeFileSync('artifacts/security-local/booking-mobile.png',Buffer.from((await h.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
   await check('staff logout returns to sign-in',async()=>{await h.evaluate("document.querySelector('[aria-label=\"Log out\"]').click()");await h.wait("!!document.querySelector('#login-username')");});
 }finally{await h.close()}
 const login=await page('signedout');try{
   for(const width of [360,390,768,1440])await check('responsive sign-in '+width,async()=>{
     await login.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await pause(100);
     assert.equal(await login.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
     assert.equal(await login.evaluate("['#login-username','#login-password','.login-submit'].every(s=>{const b=document.querySelector(s).getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=innerWidth+1})"),true);
   });
   await login.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await pause(250);
   fs.writeFileSync('artifacts/security-local/login-mobile.png',Buffer.from((await login.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
   await check('mobile MFA challenge withholds admin UI, displays failure and completes synthetic verification',async()=>{
     await login.set('#login-username','synthetic');await login.set('#login-password','synthetic-password');await login.clickText('Sign In');
     await login.wait("!!document.querySelector('#admin-mfa-code')");
     assert.equal(await login.evaluate("!!document.querySelector('.nav-tabs')"),false);
     assert.equal(await login.evaluate("(()=>{const b=document.querySelector('#admin-mfa-code').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth+1})()"),true);
     await login.set('#admin-mfa-code','111111');await login.clickText('Sign In');await login.wait("document.body.textContent.includes('Invalid verification')");
     await login.set('#admin-mfa-code','123456');await login.clickText('Sign In');await login.wait("!!document.querySelector('.nav-tabs')");
   });
 }finally{await login.close()}
 `
    source=source.replace("fs.writeFileSync('artifacts/security-local/browser-results.json'",extra+"\n fs.writeFileSync('artifacts/security-local/browser-results.json'")
    const boundedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(5000)})
    await vm.runInNewContext(source,{require,console,fetch:boundedFetch,WebSocket,URL,process,setTimeout,Buffer},{filename:'synthetic-current-browser.cjs'})
  } finally {
    try {
      const info=await(await fetch('http://127.0.0.1:9341/json/version',{signal:AbortSignal.timeout(1000)})).json(),socket=new WebSocket(info.webSocketDebuggerUrl)
      await new Promise(resolve=>socket.addEventListener('open',()=>{socket.send(JSON.stringify({id:1,method:'Browser.close'}));resolve()},{once:true}))
      socket.close()
    } catch {chrome.kill()}
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  }
}
main().catch(error=>{console.error('Synthetic browser validation failed: '+(error.code || error.message)+'. No real API was used.');process.exitCode=1})
