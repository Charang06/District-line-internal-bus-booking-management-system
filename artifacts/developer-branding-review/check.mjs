import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const root = process.cwd(), output = path.join(root, 'artifacts/developer-branding-review')
fs.mkdirSync(output, { recursive: true })
const built = await build({ configFile: false, envFile: false, publicDir: false, plugins: [react()], build: { write: false }, logLevel: 'error' })
const files = new Map(built.output.map(f => [f.fileName, Buffer.from(f.type === 'asset' ? f.source : f.code)]))
console.log('Frontend production build passed (in memory; environment files disabled).')
const allowed = new Set(['logo.png', 'logo-transparent.png', 'InterVariable.woff2', 'bus.webp', 'login-tropical-sunset-v2.webp'])
let authenticated = false
const user = { id: 1, role: 'admin', username: 'synthetic', full_name: 'Synthetic Administrator', permissions: {} }
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1)
  if (name.startsWith('api/')) {
    let data = {}, status = 200
    if (name === 'api/me') { data = authenticated ? { user } : { message: 'Synthetic signed-out session' }; status = authenticated ? 200 : 401 }
    else if (name === 'api/admin/dashboard') data = { trips: [], buses: [], dailyRevenue: [], expenses: [], duties: [], dutyTrips: [], crewMembers: [], passengerRecords: [], cargoRecords: [], regularCustomers: [], passengers: {}, cargo: {}, sms: {}, smsGateway: { configured: true } }
    else if (name === 'api/admin/revenue-entries') data = { entries: [] }
    else if (name === 'api/admin/expense-submissions') data = { submissions: [] }
    else if (name === 'api/admin/smslenz/balance') data = { sender_id_balances: [], sms_credit_balance: 0, allocated_credit_total: 0, currency: 'LKR' }
    else data = { trips: [], buses: [], crew: [], contacts: [], staff: [], bookings: [], cargo: [], total: 0 }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); return
  }
  const data = files.get(name || 'index.html') || (allowed.has(name) ? fs.readFileSync(path.join(root, 'public', name)) : null)
  if (!data) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(name || 'index.html')] || 'application/octet-stream' }); res.end(data)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'district-branding-'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-default-apps', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9359', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(r => setTimeout(r, ms)), results = []
async function page(width) {
  const target = await (await fetch('http://127.0.0.1:9359/json/new?about:blank', { method: 'PUT', signal: AbortSignal.timeout(2000) })).json()
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
  await call('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 768 })
  await call('Page.navigate', { url: origin })
  return { call, evaluate, wait, errors, close: async () => { ws.close(); await fetch(`http://127.0.0.1:9359/json/close/${target.id}`) }, screenshot: async name => { const r = await call('Page.captureScreenshot', { captureBeyondViewport: true }); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(r.data, 'base64')) } }
}
async function check(p, width, screen, selector) {
  await pause(650)
  if (!await p.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) throw Error(JSON.stringify({screen,width,errors:p.errors,body:await p.evaluate('document.body.innerText.slice(0,500)')}))
  const result = await p.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();const s=getComputedStyle(e);return {text:e.innerText,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,creditOverflow:e.scrollWidth>e.clientWidth,rect:r.toJSON(),display:s.display,fontSize:s.fontSize,links:e.querySelectorAll('a').length,footerCount:document.querySelectorAll('.login-developer-credit,.footer-developer-credit').length}})()`)
  assert.equal(result.overflow, false, JSON.stringify({ screen, width, result }))
  assert.equal(result.creditOverflow, false)
  assert.ok(result.text.includes('Cintax Technologies (Pvt) Ltd.'))
  assert.equal(result.footerCount, 1)
  assert.equal(result.links, 0)
  assert.ok(result.rect.width > 0)
  if (screen === 'login') {
    const placement = await p.evaluate(`(()=>{const footer=document.querySelector('.login-developer-credit').getBoundingClientRect();const stage=document.querySelector('.login-stage').getBoundingClientRect();const form=document.querySelector('.login-card').getBoundingClientRect();const input=document.querySelector('#login-username');input.focus();return {outsideForm:!document.querySelector('.login-card .login-developer-credit'),belowStage:footer.top>=stage.bottom-1,belowForm:footer.top>=form.bottom,usable:document.activeElement===input&&!input.disabled}})()`)
    assert.deepEqual(placement, { outsideForm: true, belowStage: true, belowForm: true, usable: true })
    Object.assign(result, placement)
  }
  if (screen === 'info') {
    const details = await p.evaluate(`document.querySelector('.ig-system-details').innerText`)
    assert.ok(details.includes('District Line Internal Bus Booking Management System'))
    assert.ok(details.includes('Client\nDistrict Line'))
    assert.ok(await p.evaluate(`document.body.innerText.includes('Daily operational workflow')&&document.body.innerText.includes('Modules at a glance')`))
    result.details = details
  }
  assert.deepEqual(p.errors, [])
  await p.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'end'})`)
  await p.screenshot(screen + '-' + width)
  results.push({ screen, viewport: width, passed: true, ...result })
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
}
try {
  for (let i = 0; i < 80; i++) { try { await fetch('http://127.0.0.1:9359/json/version', { signal: AbortSignal.timeout(500) }); break } catch { await pause(100) } }
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    console.log('Checking width ' + width)
    authenticated = false
    const login = await page(width)
    try { await login.wait(`!!document.querySelector('#login-username')`); await login.wait(`!!document.querySelector('.login-background.is-ready')`); await check(login, width, 'login', '.login-developer-credit') } finally { await login.close() }
    authenticated = true
    const internal = await page(width)
    try {
      await internal.wait(`!!document.querySelector('.home-page-shell')`)
      await check(internal, width, 'home', '.footer-developer-credit')
      for (const screen of ['Dashboard', 'Info']) {
        await internal.evaluate(`(()=>{const b=[...document.querySelectorAll('.nav-tabs button')].find(b=>b.textContent.trim()===${JSON.stringify(screen)});if(!b)throw Error('Missing navigation');b.click()})()`)
        await internal.wait(screen === 'Dashboard' ? `!!document.querySelector('.admin-dashboard-shell')&&!document.querySelector('.admin-data-skeleton')` : `!!document.querySelector('.ig-system-details')`)
        await check(internal, width, screen.toLowerCase(), '.footer-developer-credit')
      }
    } finally { await internal.close() }
  }
  console.log(`PASS: ${results.length} screen/viewport checks; no runtime exceptions, credit overflow or document overflow.`)
} finally { chrome.kill(); server.close() }
