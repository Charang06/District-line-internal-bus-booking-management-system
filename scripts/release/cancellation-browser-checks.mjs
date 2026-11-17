import fs from 'node:fs'
export async function cancellationChecks(ctx){
 const {evaluate,click,wait,pause,check}=ctx
 const stage=process.env.CANCELLATION_AUDIT,results=[]
 for(const size of [1,5])await check(`cancellation ${stage} ${size} seats: measured UI workflow`,async()=>{
  await evaluate(`(()=>{
   window.__bookings=Array.from({length:${size}},(_,i)=>({id:801+${size}*100+i,booking_ref:'SYN-CANCEL-'+i,booking_group_id:'synthetic-cancel-group',trip_id:11,seat_number:String(i+1).padStart(2,'0'),passenger_name:'Synthetic Cancellation',contact:'0770000001',fare:2700,status:'confirmed',confirmation_status:'confirmed',travel_date:new Date().toLocaleDateString('en-CA'),route_code:'KTY_CMB',created_at:new Date().toISOString()}));
   if(window.__cancelRestore)window.__cancelRestore();
   const original=window.fetch;window.__cancelRestore=()=>{window.fetch=original};window.__cancelTimes=[];
   window.fetch=async(input,options={})=>{const start=performance.now();await new Promise(r=>setTimeout(r,75));
    const path=new URL(String(input),location.origin).pathname;
    if(path.startsWith('/api/bookings/')&&path.endsWith('/cancel')){
     window.__requests.push({path,method:options.method});const id=Number(path.split('/')[3]);const booking=window.__bookings.find(b=>b.id===id);
     booking.status='cancelled';window.__cancelTimes.push({path,ms:performance.now()-start});return new Response(JSON.stringify({booking}),{status:200,headers:{'Content-Type':'application/json'}})
    }
    const result=await original(input,options);window.__cancelTimes.push({path,ms:performance.now()-start});return result;
   }
  })()`)
  await click('Home');await click('Log');await wait('document.body.textContent.includes("Synthetic Cancellation")');await pause(200)
  const before=await evaluate('window.__requests.length')
  await evaluate(`(()=>{window.__cancelClick=performance.now();const observer=new MutationObserver(()=>{if(document.querySelector('dialog')){window.__cancelDialogAt=performance.now();observer.disconnect()}});observer.observe(document.body,{childList:true,subtree:true});[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel').click()})()`)
  await wait('document.body.textContent.includes("Confirm cancellation")')
  const dialogMs=await evaluate('window.__cancelDialogAt-window.__cancelClick')
  await evaluate(`(()=>{window.__cancelBusyAt=null;window.__cancelConfirm=performance.now();const observer=new MutationObserver(()=>{if(!window.__cancelBusyAt&&document.body.textContent.includes('Cancelling'))window.__cancelBusyAt=performance.now();if([...document.querySelectorAll('tr')].some(r=>r.textContent.includes('Synthetic Cancellation')&&r.querySelector('.confirmation-pill.cancelled'))){window.__cancelUiAt=performance.now();observer.disconnect()}});observer.observe(document.body,{childList:true,subtree:true,characterData:true});const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Confirm cancellation');button.click();${stage==='after'?'button.click();':''}})()`)
  await pause(15)
  const busy=await evaluate('document.body.textContent.includes("Cancelling")')
  if(stage==='after'&&!await evaluate('!!document.querySelector(".confirmation-pill.confirmed")&&![...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Search").disabled'))throw Error('Premature cancellation or unrelated controls blocked')
  await wait('!document.querySelector("dialog")&&window.__bookings.every(b=>b.status==="cancelled")')
  await wait('[...document.querySelectorAll("tr")].some(r=>r.textContent.includes("Synthetic Cancellation")&&r.querySelector(".confirmation-pill.cancelled"))')
  const updateMs=await evaluate('window.__cancelUiAt-window.__cancelConfirm')
  await pause(500)
  const requests=await evaluate('window.__requests.slice('+before+')')
  results.push({size,dialogMs,updateMs,busy,busyMs:await evaluate('window.__cancelBusyAt?window.__cancelBusyAt-window.__cancelConfirm:null'),requests,requestCount:requests.length,api:await evaluate('window.__cancelTimes')})
  if(stage==='after'){
   if(requests.length!==size||requests.some(r=>!r.path.endsWith('/cancel')))throw Error('Unexpected cancellation refetches '+JSON.stringify(requests))
   if(!busy)throw Error('Per-booking loading feedback missing')
   await click('Search');await wait('!!document.querySelector(".confirmation-pill.cancelled")')
  }
 })
 await evaluate('window.__cancelRestore?.()')
 if(stage==='after')for(const fault of ['offline','lost'])await check('cancellation '+fault+' recovery preserves state and reconciles before retry',async()=>{
  await evaluate(`(()=>{
   window.__bookings=[{id:${fault==='offline'?9901:9902},trip_id:11,seat_number:'20',booking_ref:'SYN-FAULT',booking_group_id:'SYN-FAULT',passenger_name:'Synthetic Cancellation',status:'confirmed',confirmation_status:'confirmed',fare:2700,created_at:new Date().toISOString()}];
   const original=window.fetch;window.__cancelRestore=()=>{window.fetch=original};window.__cancelFault=${JSON.stringify(fault)};window.__faultWrites=0;
   window.fetch=async(input,options={})=>{const path=new URL(String(input),location.origin).pathname;
    if(path.endsWith('/cancel')){window.__faultWrites++;if(window.__cancelFault==='offline')throw new TypeError('Synthetic offline');const booking=window.__bookings[0];booking.status='cancelled';if(window.__cancelFault==='lost')throw new TypeError('Synthetic response loss');return new Response(JSON.stringify({booking}),{status:200,headers:{'Content-Type':'application/json'}})}
    if(path.startsWith('/api/trips/')&&window.__cancelFault==='offline')throw new TypeError('Synthetic reconciliation unavailable');
    return original(input,options)
   }
  })()`)
  await click('Home');await click('Log');await wait('document.body.textContent.includes("Synthetic Cancellation")')
  await click('Cancel');await click('Confirm cancellation')
  if(fault==='offline'){
   await wait('document.body.textContent.includes("Unable to confirm cancellation")')
   if(!await evaluate('window.__bookings[0].status==="confirmed"&&!!document.querySelector(".confirmation-pill.confirmed")'))throw Error('Failed cancellation freed the seat')
   await click('Cancel');await click('Confirm cancellation')
   if(await evaluate('window.__faultWrites')!==1)throw Error('Blind retry sent another mutation')
   await evaluate('window.__cancelFault=""');await click('Cancel');await click('Confirm cancellation')
  }
  await wait('!!document.querySelector(".confirmation-pill.cancelled")')
  if(fault==='lost'&&await evaluate('window.__faultWrites')!==1)throw Error('Lost response was retried instead of reconciled')
  await evaluate('window.__cancelRestore()')
 })
 fs.mkdirSync('artifacts/cancellation-performance',{recursive:true})
 fs.writeFileSync('artifacts/cancellation-performance/browser-'+stage+'.json',JSON.stringify(results,null,2))
 await evaluate('window.__cancelRestore?.()')
}
