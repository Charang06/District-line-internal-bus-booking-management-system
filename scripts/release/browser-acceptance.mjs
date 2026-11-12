// Real DOM interactions; API persistence is synthetic and is not PostgreSQL acceptance.
export function acceptanceHelpers({evaluate,call,pause}) {
 const value=async(expression,text)=>{
  await evaluate(`(()=>{const e=(${expression});if(!e)throw Error('Missing input');const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}))})()`)
  await pause(60)
 }
 const field=async(scope,label,text)=>value(`(()=>{const l=[...document.querySelectorAll(${JSON.stringify(scope+' label')})].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}));return l?.control||l?.querySelector('input,select')})()`,text)
 const assert=async(expression,message)=>{if(!await evaluate('Boolean('+expression+')'))throw Error(message)}
 const responsive=async()=>{for(const width of [320,360,375,390,430,768,1024,1280,1440,1920]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await pause(60)
  const viewport=await evaluate('({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})')
  if(viewport.innerWidth!==width||viewport.scrollWidth>width+2){const staff=await evaluate('JSON.stringify([...document.querySelectorAll(".staff-ui-page,.staff-ui-page-header,.staff-ui-section-header,.staff-ui-header-actions,.staff-ui-search,.staff-ui-summary,.staff-ui-workspace,.staff-ui-directory,.staff-ui-details,.staff-ui-bus-grid,.staff-ui-bus-card")].map(e=>({className:e.className,x:Math.round(e.getBoundingClientRect().x),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width),scrollWidth:e.scrollWidth,minWidth:getComputedStyle(e).minWidth,columns:getComputedStyle(e).gridTemplateColumns})))');throw Error('Horizontal overflow or viewport expansion at '+width+': '+JSON.stringify(viewport)+' staff='+staff)}
  await assert('[...document.querySelectorAll("button,input,select")].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden").every(e=>e.getBoundingClientRect().height>=12)','Unusable control height at '+width)
  if(width<=1024){const targets=await evaluate('[...document.querySelectorAll("button,select,input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range])")].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden"&&e.getBoundingClientRect().height<44).map(e=>({tag:e.tagName,className:e.className,text:e.textContent.trim().slice(0,32),height:Math.round(e.getBoundingClientRect().height)}))');if(targets.length)throw Error('Touch targets below 44px at '+width+': '+JSON.stringify(targets))}
 }}
 const keyboard=async(key,modifiers=0)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers,windowsVirtualKeyCode:key==='Tab'?9:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers,windowsVirtualKeyCode:key==='Tab'?9:27});await pause(60)}
 const navigation=async(click)=>{
  for(const width of [320,360,375,390,430,768,1024]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});await pause(80)
   const viewport=await evaluate('({innerWidth,scrollWidth:document.documentElement.scrollWidth})')
   if(viewport.innerWidth!==width||viewport.scrollWidth>width+2)throw Error('Navigation overflow or viewport expansion at '+width+': '+JSON.stringify(viewport))
   await assert('document.querySelector(".mobile-nav-toggle").getBoundingClientRect().width>=44','Menu touch target below 44px at '+width)
   await assert('document.querySelector(".nav-tabs").getAttribute("aria-hidden")==="true"&&document.querySelector(".nav-tabs").inert','Closed navigation is not hidden/inert at '+width)
   await evaluate('document.querySelector(".mobile-nav-toggle").click()');await assert('document.querySelector(".nav-tabs").classList.contains("is-open")','Drawer did not open at '+width)
   await assert('document.body.style.overflow==="hidden"','Background scroll not locked at '+width)
   await assert('document.querySelector(".nav-tabs").getAttribute("aria-hidden")==="false"&&!document.querySelector(".nav-tabs").inert','Open drawer is inaccessible at '+width)
   await keyboard('Escape');await assert('!document.querySelector(".nav-tabs").classList.contains("is-open")','Escape did not close drawer at '+width)
   await assert('document.body.style.overflow===""&&document.activeElement.classList.contains("mobile-nav-toggle")','Escape did not restore scroll/focus at '+width)
   await evaluate('document.querySelector(".mobile-nav-toggle").click()');await click('Dashboard')
   await assert('!document.querySelector(".nav-tabs").classList.contains("is-open")&&document.body.style.overflow===""','Page selection did not close drawer at '+width)
  }
 }
 return {value,field,assert,responsive,keyboard,navigation}
}

export async function accountWorkflows(ctx,mode) {
 const {check,evaluate,click,wait,pause,call}=ctx,{value,field,assert,responsive,keyboard}=acceptanceHelpers(ctx)
 await check(mode+' manual revenue four categories, combined 49 cap, submit and locked ledger',async()=>{
  await field('.accounts-route-revenue-form','Bus number','SYN-BUS')
  await value('document.querySelectorAll(".accounts-seat-table input")[0]','25')
  await value('document.querySelectorAll(".accounts-seat-table input")[2]','25')
  await assert('document.querySelector(".accounts-lock-submit").disabled','Combined 50 seats did not block submission')
  await value('document.querySelectorAll(".accounts-seat-table input")[0]','24')
  await value('document.querySelectorAll(".accounts-seat-table input")[1]','100')
  await value('document.querySelectorAll(".accounts-seat-table input")[3]','100')
  const labels=await evaluate('[...document.querySelectorAll(".accounts-route-revenue-form:first-child .accounts-seat-count-cell input")].map(e=>e.getAttribute("aria-label"))')
  if(labels.length!==4||!['Standard','Intermediate','Special','Agent / Extra'].every((s,i)=>labels[i].includes(s)))throw Error('Original categories missing')
  await evaluate('document.querySelector(".accounts-route-revenue-form").requestSubmit()')
  await wait('window.__requests.some(r=>r.path==="/api/admin/revenue-entries"&&r.method==="POST")')
  await assert('window.__entries[0].seat_rows.reduce((n,r)=>n+r.count,0)===49','Submitted count not 49')
  await wait('document.querySelector(".accounts-revenue-ledger tbody").textContent.includes("4,900")')
 })
 await check(mode+' expense submission, locked ledger and refresh',async()=>{
  await click('Expense')
  await field('.accounts-expense-details','Bus number','SYN-BUS')
  await value('document.querySelector(".accounts-expense-amount input")','20')
  await evaluate('document.querySelector(".accounts-expense-main-form").requestSubmit()')
  await wait('window.__requests.some(r=>r.path==="/api/admin/expense-submissions"&&r.method==="POST")')
  await wait('document.body.textContent.includes("EXP-SYN")')
  await responsive()
  await click('Revenue')
 })
 await check(mode+' duty creation and refresh',async()=>{
  await field('.accounts-duty-panel','Duty bus','SYN-BUS')
  await field('.accounts-duty-panel','First journey','11')
  await field('.accounts-duty-panel','Return journey','12')
  await click('Create duty')
  await wait('window.__requests.some(r=>r.path==="/api/admin/duties"&&r.method==="POST")')
  await wait('document.body.textContent.includes("Add duty expense")')
 })
 await check(mode+' duty expense and adjustment actions with refresh',async()=>{
  await field('.accounts-duty-panel form:nth-of-type(1)','Description','Synthetic browser fuel')
  await field('.accounts-duty-panel','Expense amount','10')
  await click('Add duty expense')
  await wait('window.__requests.some(r=>r.path.endsWith("/expenses")&&r.method==="POST")')
  await wait('document.querySelector(".accounts-duty-panel table").textContent.includes("Synthetic browser fuel")')
  await field('.accounts-duty-panel form:nth-of-type(2)','Description','Synthetic browser income')
  await field('.accounts-duty-panel','Adjustment amount','5')
  await click('Add duty adjustment')
  await wait('document.querySelector(".accounts-duty-panel table").textContent.includes("Synthetic browser income")')
 })
 await check(mode+' duty entry deletion confirmation and refresh',async()=>{
  await evaluate('[...document.querySelectorAll(".accounts-duty-panel tr")].find(r=>r.textContent.includes("Synthetic browser income")).querySelector("button").click()')
  await wait('document.querySelector("[role=alertdialog]")')
  await evaluate('document.querySelector("[role=alertdialog] .danger-button").click()')
  await wait('window.__requests.some(r=>r.method==="DELETE"&&r.path.includes("/adjustments/"))')
  await wait('!document.querySelector(".accounts-duty-panel table").textContent.includes("Synthetic browser income")')
  await evaluate('[...document.querySelectorAll(".accounts-duty-panel tr")].find(r=>r.textContent.includes("Synthetic browser fuel")).querySelector("button").click()')
  await wait('document.querySelector("[role=alertdialog]")')
  await evaluate('document.querySelector("[role=alertdialog] .danger-button").click()')
  await wait('!document.querySelector(".accounts-duty-panel table").textContent.includes("Synthetic browser fuel")')
 })
 await check(mode+' finalization modal initial focus, tab containment and Escape',async()=>{
  await click('Review and finalize duty');await wait('document.querySelector(".duty-finalize-modal")')
  try {
   await assert('document.querySelector(".duty-finalize-modal").contains(document.activeElement)','Initial focus outside finalization dialog')
   await responsive()
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:360,deviceScaleFactor:1,mobile:true});await pause(80)
   const compactDialog=await evaluate('(()=>{const e=document.querySelector(".duty-finalize-modal"),r=e.getBoundingClientRect();return{viewport:innerHeight,top:r.top,bottom:r.bottom,height:e.clientHeight,scrollHeight:e.scrollHeight,overflow:getComputedStyle(e).overflowY}})()')
   if(compactDialog.top<0||compactDialog.bottom>compactDialog.viewport+1||compactDialog.height>compactDialog.viewport-20||compactDialog.overflow!=='auto')throw Error('Finalize dialog does not fit/scroll with compact keyboard viewport: '+JSON.stringify(compactDialog))
   await evaluate('document.querySelector(".duty-finalize-modal").scrollTop=document.querySelector(".duty-finalize-modal").scrollHeight')
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(60)
   await evaluate('document.querySelector(".duty-finalize-modal .primary-button").focus()')
   await keyboard('Tab')
   await assert('document.querySelector(".duty-finalize-modal").contains(document.activeElement)','Tab escaped finalization dialog')
   await keyboard('Escape');await wait('!document.querySelector(".duty-finalize-modal")')
  } finally {if(await evaluate('!!document.querySelector(".duty-finalize-modal")'))await click('Go back')}
 })
}

export async function adminWorkflows(ctx) {
 const {check,evaluate,click,wait,pause}=ctx,{field,assert,responsive,keyboard,navigation}=acceptanceHelpers(ctx)
 for(const tab of ['Home','Log','Info','Dashboard','Customers','Staff'])await check('admin '+tab+' layout at requested widths',async()=>{await click(tab);await responsive()})
 await check('admin mobile navigation drawer, keyboard and scroll locking',()=>navigation(click))
 await check('trip selection, seat selection and synthetic booking submission',async()=>{
  await click('Home');await wait('document.querySelector(".seat.available")')
  await evaluate('document.querySelector(".seat.available").click()')
  await field('.reservation-panel','Passenger Name','Synthetic Browser Passenger')
  await click('Save Passenger booking')
  await wait('window.__requests.some(r=>r.path==="/api/bookings"&&r.method==="POST")')
  await assert('document.querySelectorAll(".seat.selected").length===0','Seat selection did not reset')
 })
 await check('cancellation interface and Escape keeps booking',async()=>{
  await click('Log');await wait('document.body.textContent.includes("Synthetic Browser Passenger")')
  await evaluate('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Cancel").click()')
  await wait('document.body.textContent.includes("Confirm cancellation")')
  try {
   await assert('document.activeElement.closest("dialog,[role=dialog]")','Initial focus outside cancellation dialog')
   await responsive()
   await keyboard('Escape');await wait('!document.body.textContent.includes("Confirm cancellation")')
   await assert('!window.__requests.some(r=>r.path.endsWith("/cancel")&&r.method==="POST")','Escape cancelled booking')
  }finally{if(await evaluate('document.body.textContent.includes("Keep booking")'))await click('Keep booking')}
 })
 await check('dashboard loading, local error and retry',async()=>{
  await evaluate('window.__delay=400;window.__error=true')
  try {
   // Fresh page clears React's dashboard cache, retaining only this synthetic identity.
   await ctx.call('Page.reload');await wait('document.querySelector(".topbar-logout-button")')
   await evaluate('window.__delay=400;window.__error=true')
   await click('Dashboard')
   await assert('!!document.querySelector("[aria-busy=true],[role=status]")','Loading state absent')
   await wait('document.body.textContent.includes("Synthetic unavailable")')
   await evaluate('window.__delay=0;window.__error=false')
   await click('Retry dashboard load')
   await wait('document.body.textContent.includes("Trip Controls")')
  }finally{await evaluate('window.__delay=0;window.__error=false')}
 })
}

export async function loginWorkflows(ctx) {
 const {check,evaluate,click,wait}=ctx,{field,assert,responsive}=acceptanceHelpers(ctx)
 await check('login responsive at all four widths',responsive)
 await check('synthetic login, sign-out and expired-session transitions',async()=>{
  await field('.auth-form','Username','synthetic')
  await field('.auth-form','Password','Synthetic-only-password')
  await evaluate('document.querySelector(".auth-form").requestSubmit()')
  await wait('document.querySelector(".topbar-logout-button")')
  await evaluate('document.querySelector(".topbar-logout-button").click()')
  await wait('document.body.textContent.includes("Sign out?")')
  await click('Sign Out');await wait('document.querySelector("input[type=password]")')
  await assert('window.__requests.some(r=>r.path==="/api/logout"&&r.method==="POST")','Logout request absent')
  await field('.auth-form','Username','synthetic');await field('.auth-form','Password','Synthetic-only-password')
  await evaluate('document.querySelector(".auth-form").requestSubmit()');await wait('document.querySelector(".topbar-logout-button")')
  await evaluate('window.dispatchEvent(new Event("app:session-expired"))')
  await wait('document.querySelector("input[type=password]")')
 })
}
