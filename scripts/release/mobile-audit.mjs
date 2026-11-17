import {acceptanceHelpers} from './browser-acceptance.mjs'

export async function mobileAudit(ctx, capture) {
  const {check,click,evaluate,call,pause,wait}=ctx
  const {responsive,keyboard,assert}=acceptanceHelpers(ctx)
  await check('drawer focus stays contained and desktop resize unlocks scrolling',async()=>{
    await call('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true})
    await evaluate('document.querySelector(".mobile-nav-toggle").click()')
    await assert('document.activeElement.classList.contains("nav-button")','Opening drawer did not focus navigation')
    await evaluate('[...document.querySelectorAll(".nav-button")].at(-1).focus()')
    await keyboard('Tab')
    await assert('document.activeElement.classList.contains("mobile-nav-toggle")','Tab escaped navigation')
    await keyboard('Tab',8)
    await assert('document.activeElement===document.querySelector(".nav-button:last-child")','Shift+Tab escaped navigation')
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
    await pause(120)
    await assert('document.body.style.overflow===""&&!document.querySelector(".nav-tabs").classList.contains("is-open")','Desktop resize retained scroll lock')
  })
  await check('dashboard statistic labels have separate rows on small phones',async()=>{
    await click('Dashboard')
    await call('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true})
    await pause(100)
    await assert('[...document.querySelectorAll(".trip-overview-route-seat-counts")].every(e=>getComputedStyle(e).gridTemplateColumns.split(" ").length===1)','Statistics still squeeze into columns')
  })
  for(const [name,open,selector] of [
    ['staff-create',async()=>{await click('Staff');await evaluate('document.querySelector(".staff-add-button").click()')},'dialog.staff-form-modal'],
    ['bus-registration',async()=>{await click('Staff');await click('Add bus')},'dialog'],
    ['admin-profile',async()=>{await evaluate('document.querySelector(".topbar-profile-button").click()')},'.cintex-admin-profile'],
  ])await check(name+' dialog all widths, landscape and Escape',async()=>{
    await open();await wait('!!document.querySelector('+JSON.stringify(selector)+')')
    try {
      await responsive()
      for(const width of [320,768,1440])await capture(name,width)
      await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true})
      await assert('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return r.top>=-2&&r.bottom<=innerHeight+2&&r.width<=innerWidth})()','Landscape dialog clipped')
      if(name==='admin-profile')for(const tab of ['Security','Recovery','Account Details']){await click(tab);await responsive()}
      await keyboard('Escape')
      await assert('!document.querySelector('+JSON.stringify(selector)+')','Escape did not dismiss dialog')
    }finally{if(await evaluate('!!document.querySelector('+JSON.stringify(selector)+')'))await keyboard('Escape')}
  })
  for(const tab of ['Home','Log','Info','Dashboard','Customers','Staff'])await check(tab+' landscape and increased text',async()=>{
    await click(tab)
    for(const [width,height] of [[667,375],[844,390],[1024,768]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768})
      await pause(80)
      await assert('document.documentElement.scrollWidth<=innerWidth+2','Landscape page overflow')
    }
    await evaluate('document.documentElement.style.fontSize="125%"')
    try{await responsive()}finally{await evaluate('document.documentElement.style.fontSize=""')}
  })
}

export async function recoveryAudit(ctx,capture){
  const {check,click}=ctx,{responsive}=acceptanceHelpers(ctx)
  await check('password recovery request at all widths',async()=>{
    await click('Forgot Password?')
    try {
      await responsive()
      for(const width of [320,768,1440])await capture('password-recovery',width)
    }finally{await click('Back to sign in')}
  })
}
