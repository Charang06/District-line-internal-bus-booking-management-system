// Local Chromium/CDP review. Every API is mocked before application code loads.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  for(const prior of await(await fetch('http://127.0.0.1:9228/json/list')).json())
    if(prior.url.startsWith('http://127.0.0.1:5191/')) await fetch(`http://127.0.0.1:9228/json/close/${prior.id}`);
  const tab=await(await fetch('http://127.0.0.1:9228/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let next=0;const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,80));}throw Error('Browser assertion timed out: '+expression);};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__profileRequests=[];window.__verified=false;window.__retryAfter=0;window.__profileUser={id:7,username:'local_admin',role:'admin',fullName:'Local Administrator',recoveryEmail:'owner@example.test',permissions:{home:true},profilePhoto:''};window.fetch=async(url,options={})=>{const p=String(url).split('?')[0],body=options.body?JSON.parse(options.body):{};let result={},status=200;window.__profileRequests.push({path:p,method:options.method||'GET'});if(p.endsWith('/status')){result={email:window.__profileUser.recoveryEmail,verified:window.__verified,retryAfter:window.__retryAfter};if(window.__statusError){status=503;result={message:'Status unavailable'};}}else if(p.endsWith('/request')){result={message:'Verification email requested.',retryAfter:60};window.__retryAfter=60;}else if(p.endsWith('/confirm')){if(body.token!=='a'.repeat(43)||window.__used){status=400;result={message:'This verification link is invalid or expired. Request a new link.'};}else{window.__used=true;window.__verified=true;result={message:'Email verified'};}}else if(p.endsWith('/recovery-email')){window.__profileUser.recoveryEmail=body.email;window.__verified=false;window.__retryAfter=0;result={message:'Recovery email saved.'};}else{status=401;result={message:'Preview signed out'};}return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});};`});
  await call('Page.navigate',{url:'http://127.0.0.1:5191/'});await wait(`!!document.querySelector('#login-username')`);
  await evaluate(`import('/artifacts/admin-profile-review/preview.jsx')`);await wait(`!!document.querySelector('#profile-review-open')`);
  await click('#profile-review-open');await wait(`!!document.querySelector('.cintex-admin-profile:modal')`);await click('#profile-tab-recovery');
  await wait(`!!document.querySelector('.profile-verification-actions button')&&!document.querySelector('.profile-verification-actions button').disabled`);
  assert.equal(await evaluate(`document.querySelector('.profile-verification strong').textContent`),'Email ownership not verified');
  const sizes=[];
  for(const[width,height]of[[1440,1000],[768,1024],[390,844],[360,800]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await new Promise(r=>setTimeout(r,200));
    const size=await evaluate(`(()=>{const e=document.querySelector('.cintex-admin-profile'),r=e.getBoundingClientRect(),b=e.querySelector('.profile-verification-actions button').getBoundingClientRect();return {width:innerWidth,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:e.scrollWidth>e.clientWidth,buttonInside:b.left>=r.left&&b.right<=r.right};})()`);
    assert.ok(size.inside&&!size.overflow&&size.buttonInside,JSON.stringify(size));sizes.push(size);
  }
  await click('.profile-verification-actions button');await wait(`document.querySelector('.profile-verification-actions button').textContent.includes('Resend in')`);
  assert.equal(await evaluate(`!!document.querySelector('.profile-verification.verified')`),false);
  assert.equal(await evaluate(`document.querySelector('.profile-verification-actions button').disabled`),true);
  await evaluate(`window.__retryAfter=0;window.dispatchEvent(new Event('focus'))`);
  await wait(`document.querySelector('.profile-verification-actions button').textContent==='Resend Verification Email'`);
  await click('.profile-verification-actions button');await wait(`window.__profileRequests.filter(x=>x.path.endsWith('/request')).length===2`);
  await evaluate(`window.__retryAfter=0;window.__verified=true;window.dispatchEvent(new Event('focus'))`);await wait(`!!document.querySelector('.profile-verification.verified')`);
  assert.equal(await evaluate(`document.querySelector('.profile-verification strong').textContent`),'Email verified');
  await set('#profile-recovery-email','new@example.test');await wait(`!document.querySelector('.profile-verification.verified')`);
  assert.equal(await evaluate(`document.querySelector('.profile-verification-actions button').disabled`),true);
  await evaluate(`document.querySelector('#profile-panel-recovery form').requestSubmit()`);await wait(`document.querySelector('.profile-feedback.success')?.textContent==='Recovery email saved.'`);
  await wait(`!!document.querySelector('.profile-verification-actions button')&&!document.querySelector('.profile-verification-actions button').disabled`);
  assert.equal(await evaluate(`!!document.querySelector('.profile-verification.verified')`),false);
  await evaluate(`window.__statusError=true;window.dispatchEvent(new Event('focus'))`);await wait(`document.querySelector('.profile-verification').textContent.includes('Status unavailable')`);
  assert.equal(await evaluate(`document.querySelector('.profile-verification-actions button').disabled`),true);
  await call('Page.navigate',{url:'about:blank'});
  await call('Page.navigate',{url:'http://127.0.0.1:5191/#verify-recovery-email?token='+'a'.repeat(43)});
  await wait(`!!document.querySelector('.recovery-email-card')`);
  assert.equal(await evaluate('location.hash'),'');assert.equal(await evaluate(`window.__profileRequests.filter(x=>x.path.endsWith('/confirm')).length`),0);
  assert.equal(await evaluate(`document.querySelector('meta[name=referrer]').content`),'no-referrer');
  await evaluate(`document.querySelector('.recovery-email-card form').requestSubmit()`);await wait(`!!document.querySelector('.recovery-email-success')`);
  assert.equal(await evaluate(`window.__profileRequests.filter(x=>x.path.endsWith('/confirm')).length`),1);
  await call('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  const dir=path.join(process.cwd(),'artifacts/recovery-email-review');
  const report={sizes,unverifiedStatus:true,sendDoesNotVerify:true,cooldown:true,resend:true,backendVerifiedStatus:true,dirtyEmailBlocked:true,changedEmailClearsProof:true,statusFailureFailsClosed:true,confirmationExplicit:true,fragmentStripped:true,noReferrer:true,mobileConfirmation:true,allApisMocked:true,remoteOperations:0};
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  ws.close();await fetch(`http://127.0.0.1:9228/json/close/${tab.id}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
