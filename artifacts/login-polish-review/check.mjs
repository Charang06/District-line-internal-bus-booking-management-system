import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const root = process.cwd(), output = path.join(root, 'artifacts/login-polish-review')
fs.mkdirSync(output, { recursive: true })
const built = await build({ configFile: false, envFile: false, publicDir: false, define: { 'import.meta.env.VITE_ENABLE_ADMIN_USERNAME_RECOVERY': process.argv.includes('--flag-off') ? '"false"' : '"true"' }, plugins: [{ name: 'before-css', load(id) { if (process.argv.includes('--before') && id.replaceAll('\\', '/').endsWith('/src/App.css')) return fs.readFileSync(path.join(output, 'before.css'), 'utf8') } }, react()], build: { write: false }, logLevel: 'error' })
const files = new Map(built.output.map(f => [f.fileName, Buffer.from(f.type === 'asset' ? f.source : f.code)]))
console.log('Frontend production build passed (in memory; environment files disabled).')
const allowed = new Set(['logo.png', 'logo-transparent.png', 'InterVariable.woff2', 'bus.webp', 'login-tropical-sunset-v2.webp'])
let imageMode = 'normal', requests = [];
let authenticated = false
const user = { id: 1, role: 'admin', username: 'synthetic', full_name: 'Synthetic Administrator', permissions: {} }
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1)
  requests.push({name,method:req.method});
  if(name.startsWith('api/')) {
    const data = name==='api/me' ? {message:'Synthetic signed out'} : name==='api/login' ? {message:'Synthetic invalid credentials'} : {message:'Synthetic recovery request accepted'};
    res.writeHead(name==='api/me'||name==='api/login'?401:200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
  }
  if(name==='login-tropical-sunset-v2.webp'&&imageMode==='failure'){res.writeHead(404);res.end();return;}
  const data = files.get(name || 'index.html') || (allowed.has(name) ? fs.readFileSync(path.join(root, 'public', name)) : null)
  if (!data) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(name || 'index.html')] || 'application/octet-stream' }); res.end(data)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'district-polish-'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-default-apps', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9360', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(r => setTimeout(r, ms)), results = []
async function page(width, height = 844, setup) {
  const target = await (await fetch('http://127.0.0.1:9360/json/new?about:blank', { method: 'PUT', signal: AbortSignal.timeout(2000) })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0; const pending = new Map(), errors = []
  const call = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })) })
  ws.addEventListener('message', async e => {
    const m = JSON.parse(e.data)
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Fetch.requestPaused') { const safe = m.params.request.url.startsWith(origin + '/'); await call(safe ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: m.params.requestId, ...(safe ? {} : { errorReason: 'BlockedByClient' }) }) }
  })
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'Evaluation failed'); return r.result.value }
  const wait = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(50) } throw Error('Timed out: ' + expression) }
  await call('Page.enable'); await call('Runtime.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
  if (setup) await setup(call);
  await call('Page.navigate', { url: origin })
  return { call, evaluate, wait, errors, close: async () => { ws.close(); await fetch(`http://127.0.0.1:9360/json/close/${target.id}`) }, screenshot: async name => { const r = await call('Page.captureScreenshot'); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(r.data, 'base64')) } }
}
const before = process.argv.includes('--before')
const flagOff = process.argv.includes('--flag-off')
const label = (before ? 'before' : 'after') + (process.argv.includes('--short') ? '-short' : '') + (flagOff ? '-flag-off' : '')
async function metrics(p) {
  return p.evaluate(`(()=>{const rect=e=>e.getBoundingClientRect().toJSON();const links=[...document.querySelectorAll('.auth-form .recovery-link')];const footer=document.querySelector('.login-developer-credit');return {viewport:{width:innerWidth,height:innerHeight},documentHeight:document.documentElement.scrollHeight,scroll:document.documentElement.scrollHeight>innerHeight+1,overflow:document.documentElement.scrollWidth>innerWidth,card:rect(document.querySelector('.login-card')),footer:rect(footer),footerText:footer.textContent.trim(),linkRects:links.map(rect),linkGap:links.length>1?rect(links[1]).top-rect(links[0]).bottom:null,backgroundPosition:getComputedStyle(document.querySelector('.login-background img')).objectPosition}})()`)
}
const click = (p, text) => p.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click()})()`)
const set = (p, selector, value) => p.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
try {
  for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:9360/json/version',{signal:AbortSignal.timeout(500)});break}catch{await pause(100)}}
  const cases = flagOff ? [[390,844],[1440,768]] : process.argv.includes('--short') ? [[1440,720],[1366,650],[1280,600]] : [[320,640],[360,740],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[1440,768],[1366,768],[1280,720]]
  for(const [width,height] of cases) {
    const p=await page(width,height)
    try {
      await p.wait(`!!document.querySelector('#login-username')&&!!document.querySelector('.login-background.is-ready')`);await pause(650)
      const result=await metrics(p)
      assert.equal(result.overflow,false)
      assert.equal(result.footerText,'Developed by Cintax Technologies (Pvt) Ltd.')
      assert.ok(result.footer.top>=result.card.bottom)
      assert.equal(result.linkRects.length,flagOff?1:2)
      for(const r of result.linkRects)assert.ok(r.height>=44)
      if(!before&&width>=1024&&height>=650)assert.equal(result.scroll,false,JSON.stringify(result))
      await p.screenshot(`${label}-${width}x${height}`)
      if(!before) {
        await set(p,'#login-username','synthetic_user');await set(p,'#login-password','synthetic-password')
        await click(p,'Forgot Password?');await p.wait(`!!document.querySelector('#recovery-email')`)
        await set(p,'#recovery-email','synthetic@example.test');await click(p,'Send reset link');await p.wait(`document.body.textContent.includes('Synthetic recovery request accepted')`)
        await click(p,'Back to sign in');await p.wait(`!!document.querySelector('#login-username')`)
        if(!flagOff){
        await click(p,'Forgot Username?');await p.wait(`!!document.querySelector('#username-recovery-email')`)
        await set(p,'#username-recovery-email','synthetic@example.test');await click(p,'Send recovery link');await p.wait(`document.body.textContent.includes('Synthetic recovery request accepted')`)
        await click(p,'Back to sign in');await p.wait(`!!document.querySelector('#login-username')`)
        }
        await set(p,'#login-username','synthetic_user');await set(p,'#login-password','synthetic-password')
        await p.evaluate(`document.querySelector('.login-password-toggle').click()`);assert.equal(await p.evaluate(`document.querySelector('#login-password').type`),'text')
        await p.evaluate(`document.querySelector('.login-password-toggle').click()`);assert.equal(await p.evaluate(`document.querySelector('#login-password').type`),'password')
        await click(p,'Sign In');await p.wait(`document.body.textContent.includes('Synthetic invalid credentials')`)
        if(width<768){
          // A resized viewport approximates the usable space above an on-screen keyboard.
          await p.call('Emulation.setDeviceMetricsOverride',{width,height:360,deviceScaleFactor:1,mobile:true})
          await p.evaluate(`document.querySelector('#login-password').focus();document.querySelector('.login-submit').scrollIntoView({block:'center'})`)
          const visible=await p.evaluate(`(()=>{const r=document.querySelector('.login-submit').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()`)
          assert.equal(visible,true)
          await p.evaluate(`document.querySelector('.login-developer-credit').scrollIntoView({block:'end'})`)
          assert.ok(await p.evaluate(`document.querySelector('.login-developer-credit').getBoundingClientRect().bottom<=innerHeight+1`))
        }
      }
      assert.deepEqual(p.errors,[])
      results.push({...result,passed:true,interactions:!before})
      fs.writeFileSync(path.join(output,`${label}-results.json`),JSON.stringify(results,null,2))
      console.log(`${label} ${width}x${height}: card ${result.card.height.toFixed(1)}px, scroll ${result.scroll}, recovery gap ${result.linkGap}`)
    } finally {await p.close()}
  }
  if(!before&&!process.argv.includes('--short')&&!flagOff){
    for(const scenario of ['slow-decode','reduced-motion','failure']){
      imageMode=scenario==='failure'?'failure':'normal'
      const p=await page(1440,768,async call=>{
        await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Network.clearBrowserCache')
        if(scenario==='reduced-motion')await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
        if(scenario==='slow-decode'){
          await call('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:180000,uploadThroughput:90000})
          await call('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=async function(){await original.call(this);if(this.src.endsWith('.webp'))await new Promise(r=>window.__releaseDecode=r)}`})
        }
      })
      try{
        await p.wait(`!!document.querySelector('#login-username')`)
        if(scenario==='slow-decode'){
          assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('.login-background')).opacity`),'0')
          await set(p,'#login-username','usable-before-image')
          await p.wait('!!window.__releaseDecode');await p.screenshot('after-background-pending');await p.evaluate('window.__releaseDecode()')
        }
        if(scenario==='failure'){await pause(700);assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('.login-background')).opacity`),'0')}
        else{await p.wait(`!!document.querySelector('.login-background.is-ready')`);await pause(350);assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('.login-background')).opacity`),'1')}
        if(scenario==='reduced-motion')assert.ok(await p.evaluate(`parseFloat(getComputedStyle(document.querySelector('.login-background')).transitionDuration)<=.00001`))
        assert.deepEqual(p.errors,[])
        console.log('PASS background '+scenario)
      }finally{await p.close()}
    }
  }
  console.log(`PASS ${label}: ${results.length} viewport checks`)
}finally{chrome.kill();server.close()}
