// Synthetic browser regression suite. No application request reaches a real API.
const assert=require('node:assert/strict'),fs=require('node:fs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function page(role,baseline=false){
 const tab=await(await fetch('http://127.0.0.1:9331/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Browser expression failed');return r.result.value};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(60)}throw Error('Timed out: '+expression)};
 const clickText=(text,root='document')=>evaluate(`(()=>{const e=[...${root}.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Button missing');e.click()})()`);
 const set=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);
 await call('Page.enable');await call('Emulation.setTimezoneOverride',{timezoneId:'Asia/Colombo'});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
 const today=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
 window.__today=today;window.__requests=[];window.__fleet=[{id:1,registration_no:'BUS-ONE',status:'active'}];
 window.__trips=[{id:101,trip_code:'TRP-101',travel_date:today,route_code:'KTY_CMB',bus_id:1,bus_no:'BUS-ONE',registration_no:'BUS-ONE',booked_count:0,status:'scheduled'},
 {id:102,trip_code:'TRP-102',travel_date:today,route_code:'CMB_KTY',bus_id:1,bus_no:'BUS-ONE',registration_no:'BUS-ONE',booked_count:0,status:'scheduled'},
 {id:103,trip_code:'TRP-103',travel_date:'2001-01-02',route_code:'KTY_CMB',bus_id:1,bus_no:'BUS-ONE',registration_no:'BUS-ONE',booked_count:0,status:'scheduled'}];
 window.__role=${JSON.stringify(role)};
 window.fetch=async(url,options={})=>{const u=new URL(url,location.origin),p=u.pathname,m=options.method||'GET',body=options.body?JSON.parse(options.body):{};window.__requests.push({path:p,query:u.search,method:m,body});let data={},status=200;
 if(p==='/api/me')data={user:{id:7,role:window.__role==='admin'?'admin':'staff',username:'synthetic',fullName:'Synthetic User',permissions:{home:true,log:true,info:true,passengers:true,cargo:true,trips:window.__role!=='restricted'}}};
 else if(p==='/api/buses'&&m==='GET')data={buses:window.__fleet.map(b=>({...b}))};
 else if(p==='/api/buses'&&m==='POST'){if(window.__failRegistration){status=409;data={message:'Synthetic registration rejected'}}else{const bus={id:2,registration_no:body.registration_no,status:'active'};window.__fleet.push(bus);data={bus};status=201}}
 else if(p==='/api/admin/bus-contacts')data={contacts:[{bus_no:' bus-one ',phone_number:''}]};
 else if(p==='/api/admin/crew')data={crew:[]};else if(p==='/api/admin/staff')data={staff:[]};
 else if(p==='/api/admin/revenue-entries')data={entries:[]};else if(p==='/api/admin/expense-submissions')data={submissions:[]};
 else if(p==='/api/admin/dashboard')data={trips:window.__trips.filter(t=>t.travel_date===today),buses:window.__fleet.map(b=>({...b})),dailyRevenue:[],expenses:[],smsGateway:{configured:true}};
 else if(p==='/api/trips'&&m==='GET'){if(window.__failTrips){status=503;data={message:'Synthetic trips unavailable'}}else{if(window.__tripDelay)await new Promise(r=>setTimeout(r,window.__tripDelay));data={trips:window.__trips.filter(t=>(!u.searchParams.get('date')||t.travel_date===u.searchParams.get('date'))&&(!u.searchParams.get('route')||t.route_code===u.searchParams.get('route')))}}}
 else if(/^\/api\/trips\/\d+$/.test(p)){const trip=window.__trips.find(t=>t.id===Number(p.split('/').at(-1)));if(m==='PATCH'){if(window.__role==='restricted'){status=403;data={message:'Not permitted'}}else{Object.assign(trip,body,{registration_no:body.bus_no});data={trip}}}else data={trip,bookings:[]}}
 else if(p==='/api/bookings')data={bookings:[],total:0};else if(p==='/api/cargo')data={cargo:[]};
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})};
 })()`});
 await call('Page.navigate',{url:'http://127.0.0.1:5195/'+(baseline?'artifacts/ui-refresh-review/baseline.html':'')});
 await wait(`!!document.querySelector('.nav-tabs')`);
 return{evaluate,wait,clickText,set,call,close:async()=>{ws.close();await fetch('http://127.0.0.1:9331/json/close/'+tab.id)}};
}
const results=[];async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(e){results.push({name,passed:false,error:e.message});console.log('FAIL '+name+': '+e.message)}}
(async()=>{
 for(const baseline of [true,false]){
 const a=await page('admin',baseline);const prefix=baseline?'baseline':'fixed';
 try{
 await a.clickText('Dashboard');await a.wait(`!!document.querySelector('.trip-controls-filters select')`);await pause(300);
 const labels=['bus','route','trip'];const select=i=>'.trip-controls-filters label:nth-child('+(i+2)+') select';
 await a.set(select(2),'101');await a.set('.trip-controls-filters input[type=date]','2001-01-02');await pause(400);
 await check(prefix+' date changes clear an obsolete trip selection',async()=>assert.equal(await a.evaluate(`document.querySelector(${JSON.stringify(select(2))}).value`),''));
 await check(prefix+' date query retrieves trips absent from the 200-trip summary',async()=>assert.equal(await a.evaluate(`!![...document.querySelectorAll(${JSON.stringify(select(2)+' option')})].find(o=>o.value==='103')`),true));
 if(!baseline){
 await a.set(select(2),'103');await a.wait(`document.querySelectorAll('.trip-overview-trip-card').length===1`);
 await check('fixed combined date/bus/route/trip result',async()=>{await a.set(select(0),'BUS-ONE');await a.set(select(2),'103');await a.wait(`document.querySelectorAll('.trip-overview-trip-card').length===1`);assert.match(await a.evaluate(`document.querySelector('.trip-overview-trip-card').textContent`),/TRP-103/)});
 await a.clickText('Reset filters');await a.wait(`document.querySelector('.trip-controls-filters input[type=date]').value===window.__today&&document.querySelectorAll('.trip-overview-trip-card').length===1`);
 await check('fixed reset and route selection',async()=>{await a.set(select(1),'CMB_KTY');await a.wait(`document.querySelector('.trip-overview-trip-card')?.textContent.includes('TRP-102')`);assert.equal(await a.evaluate(`document.querySelector(${JSON.stringify(select(2))}).value`),'')});
 await check('fixed API failure is shown and retry recovers',async()=>{await a.evaluate(`window.__failTrips=true`);await a.set(select(1),'KTY_CMB');await a.wait(`document.querySelector('.trip-overview [role=alert]')?.textContent.includes('Synthetic trips unavailable')`);await a.evaluate(`window.__failTrips=false`);await a.clickText('Retry trips');await a.wait(`document.querySelectorAll('.trip-overview-trip-card').length===1`)});
 }
 await a.clickText('Staff');await a.wait(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Add bus')`);await a.clickText('Add bus');await a.set('.modal input[maxlength="40"]','BUS-TWO');await a.clickText('Save bus');await a.wait(`!document.querySelector('.modal')`);await a.clickText('Dashboard');await pause(400);
 await check(prefix+' registration invalidates cached dashboard bus numbers',async()=>assert.equal(await a.evaluate(`!![...document.querySelectorAll(${JSON.stringify(select(0)+' option')})].find(o=>o.value==='BUS-TWO')`),true));
 if(!baseline){
 await check('fixed failed registration leaves bus list unchanged',async()=>{await a.clickText('Staff');await a.wait(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Add bus')`);await a.evaluate(`window.__failRegistration=true`);await a.clickText('Add bus');await a.set('.modal input[maxlength="40"]','FAILED-BUS');await a.clickText('Save bus');await a.wait(`document.body.textContent.includes('Synthetic registration rejected')`);assert.equal(await a.evaluate(`window.__fleet.some(b=>b.registration_no==='FAILED-BUS')`),false);await a.clickText('Close',`document.querySelector('.modal')`)});
 }
 }finally{await a.close()}
 const s=await page('staff',baseline);
 try{
 await s.wait(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Add crew details')`);
 await s.evaluate(`window.__fleet.push({id:2,registration_no:'BUS-TWO',status:'active'})`);await s.clickText('Add crew details');await pause(300);
 await check(prefix+' staff dropdown refreshes when opened',async()=>assert.equal(await s.evaluate(`!![...document.querySelectorAll('#crew-bus-numbers option')].find(o=>o.value==='BUS-TWO')`),true));
 if(!baseline){
 await check('fixed valid selected bus preserved and suggestions deduplicated',async()=>{assert.equal(await s.evaluate(`document.querySelector('input[list="crew-bus-numbers"]').value`),'BUS-ONE');assert.equal(await s.evaluate(`document.querySelectorAll('#crew-bus-numbers option').length`),2)});
 await check('fixed authorized edit uses the selected bus ID',async()=>{await s.set('input[list="crew-bus-numbers"]','BUS-TWO');await s.clickText('Save bus and crew details');await s.wait(`!document.querySelector('input[list="crew-bus-numbers"]')`);assert.equal(await s.evaluate(`window.__requests.find(r=>r.method==='PATCH'&&r.path==='/api/trips/102').body.bus_id`),2)});
 }
 }finally{await s.close()}
 }
 const restricted=await page('restricted');try{await pause(300);await check('restricted staff cannot see trip actions',async()=>assert.equal(await restricted.evaluate(`[...document.querySelectorAll('button')].some(b=>['Add crew details','Delete bus','+ Add another bus'].includes(b.textContent.trim()))`),false))}finally{await restricted.close()}
 fs.writeFileSync('artifacts/ui-refresh-review/browser-results.json',JSON.stringify(results,null,2)+'\n');
 if(results.some(r=>r.name.startsWith('fixed')&&!r.passed)||results.some(r=>r.name.startsWith('baseline')&&r.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
