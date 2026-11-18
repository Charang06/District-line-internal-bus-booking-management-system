import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { build } from 'vite'

const root = process.cwd(), output = path.join(root, 'artifacts/login-background-review')
const pause = ms => new Promise(r => setTimeout(r, ms))
let files = new Map([['index.html', Buffer.from('<!doctype html><title>Local image conversion</title>')]]), mode = 'normal', requests = []
const allowed = new Set(['logo.png', 'logo-transparent.png', 'InterVariable.woff2', 'login-tropical-sunset-v2.jpg', 'login-tropical-sunset-v2.webp'])
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1)
  requests.push(name)
  res.setHeader('Cache-Control', 'no-store')
  if (name.startsWith('api/')) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"message":"Synthetic signed-out session"}'); return }
  if (name.endsWith('.webp') && mode === 'failure') { res.writeHead(404); res.end(); return }
  const entry = files.get(name || 'index.html')
  const data = entry || (allowed.has(name) && fs.existsSync(path.join(root, 'public', name)) ? fs.readFileSync(path.join(root, 'public', name)) : null)
  if (!data) { res.writeHead(404); res.end(); return }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(name || 'index.html')] || 'application/octet-stream')
  res.setHeader('Content-Length', data.length)
  if (mode === 'slow' && /login-tropical.*\.(jpg|webp)$/.test(name)) {
    let at = 0
    const timer = setInterval(() => { res.write(data.subarray(at, at + 4096)); at += 4096; if (at >= data.length) { clearInterval(timer); res.end() } }, 90)
    res.on('close', () => clearInterval(timer))
  } else res.end(data)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'district-login-'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-default-apps', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9358', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const remaining = process.argv.includes('--remaining')
const results = remaining ? JSON.parse(fs.readFileSync(path.join(output, 'results.json'), 'utf8')).filter(r => !process.argv.includes('--recheck-decode') || r.scenario !== 'decode-gated') : []
async function tab(width = 1440, height = 900) {
  const target = await (await fetch('http://127.0.0.1:9358/json/new?about:blank', { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  const call = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })) })
  ws.addEventListener('message', async event => {
    const m = JSON.parse(event.data)
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result) }
    if (m.method === 'Fetch.requestPaused') await call(m.params.request.url.startsWith(origin + '/') ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: m.params.requestId, ...(m.params.request.url.startsWith(origin + '/') ? {} : { errorReason: 'BlockedByClient' }) })
  })
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'Evaluation failed'); return r.result.value }
  const wait = async expression => { for (let n = 0; n < 400; n++) { if (await evaluate(expression)) return; await pause(50) } throw Error('Timed out: ' + expression) }
  await call('Page.enable'); await call('Network.enable'); await call('Network.setCacheDisabled', { cacheDisabled: true }); await call('Network.clearBrowserCache')
  await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
  return { call, evaluate, wait, close: async () => { ws.close(); await fetch(`http://127.0.0.1:9358/json/close/${target.id}`) }, screenshot: async name => { const r = await call('Page.captureScreenshot'); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(r.data, 'base64')) } }
}
async function compile(baseline = false) {
  const original = baseline ? new Map(['src/App.jsx', 'src/App.css'].map(name => [path.join(root, name).replaceAll('\\', '/'), execFileSync('git', ['show', 'HEAD:' + name], { encoding: 'utf8' })])) : new Map()
  const built = await build({ configFile: false, envFile: false, publicDir: false, logLevel: 'error', plugins: [{ name: 'baseline-only', load(id) { return original.get(id) } }, (await import('@vitejs/plugin-react')).default()], build: { write: false } })
  files = new Map(built.output.map(f => [f.fileName, Buffer.from(f.type === 'asset' ? f.source : f.code)]))
}
try {
  for (let n = 0; n < 80; n++) { try { await fetch('http://127.0.0.1:9358/json/version'); break } catch { await pause(100) } }
  const converter = await tab()
  await converter.call('Page.navigate', { url: origin + '/' })
  await converter.wait(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`)
  const converted = await converter.evaluate(`(async()=>{const image=new Image();image.src='/login-tropical-sunset-v2.jpg';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);return {width:canvas.width,height:canvas.height,webp:canvas.toDataURL('image/webp',.80)}})()`)
  fs.writeFileSync(path.join(root, 'public/login-tropical-sunset-v2.webp'), Buffer.from(converted.webp.split(',')[1], 'base64'))
  if (!remaining) results.push({ image: { width: converted.width, height: converted.height, beforeBytes: fs.statSync('public/login-tropical-sunset-v2.jpg').size, afterBytes: fs.statSync('public/login-tropical-sunset-v2.webp').size } })
  console.log(JSON.stringify(results[0]))
  await converter.close()
  if (!remaining) {
  await compile(true)
  mode = 'slow'
  const baseline = await tab()
  await baseline.call('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 180000, uploadThroughput: 90000 })
  await baseline.call('Page.navigate', { url: origin })
  await baseline.wait(`!!document.querySelector('#login-username')`)
  const baselineTime = await baseline.evaluate('performance.now()')
  await pause(1800)
  await baseline.screenshot('before-partial')
  results.push({ baselineFormReadyMs: baselineTime })
  await baseline.close()
  }
  await compile()
  for (const scenario of [{ name: 'desktop-slow', width: 1440, height: 900 }, { name: 'mobile-slow', width: 390, height: 844 }, { name: 'tablet', width: 900, height: 1000 }, { name: 'reduced-motion', width: 1440, height: 900, reduced: true }, { name: 'failure', width: 390, height: 844, failure: true }, { name: 'decode-gated', width: 1440, height: 900, gate: true }]) {
    if (remaining && results.some(r => r.scenario === scenario.name && r.passed)) continue
    console.log('Testing ' + scenario.name)
    mode = scenario.failure ? 'failure' : scenario.name.includes('slow') ? 'slow' : 'normal'; requests = []
    const page = await tab(scenario.width, scenario.height)
    try {
      await page.call('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 180000, uploadThroughput: 90000 })
      if (scenario.reduced) await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `window.__shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true});${scenario.gate ? "const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=async function(){await decode.call(this);if(this.src.endsWith('.webp'))await new Promise(r=>{window.__releaseDecode=r})}" : ''}` })
      await page.call('Page.navigate', { url: origin })
      await page.wait(`!!document.querySelector('#login-username')`)
      const formReadyMs = await page.evaluate('performance.now()')
      // The existing login-stage entrance transform lasts 550ms; measure layout after it settles.
      await pause(650)
      const initialCls = await page.evaluate('window.__shifts.reduce((a,b)=>a+b,0)')
      const start = await page.evaluate(`(()=>{const layer=document.querySelector('.login-background');const field=document.querySelector('#login-username');field.focus();field.value='synthetic';return {formReadyMs:performance.now(),opacity:getComputedStyle(layer).opacity,navy:getComputedStyle(layer.parentElement).backgroundColor,rect:document.querySelector('.login-card').getBoundingClientRect().toJSON(),position:getComputedStyle(layer.querySelector('img')).objectPosition,transition:getComputedStyle(layer).transitionDuration,usable:document.activeElement===field&&!field.disabled}})()`)
      assert.equal(start.usable, true)
      if (scenario.name.includes('slow') || scenario.gate || scenario.failure) assert.equal(start.opacity, '0')
      assert.equal(start.navy, 'rgb(6, 24, 45)')
      // The app's global reduced-motion rule uses an effectively instant 0.01ms duration.
      if (scenario.reduced) assert.ok(parseFloat(start.transition) <= .00001)
      if (scenario.gate) { await page.wait('!!window.__releaseDecode'); assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.login-background')).opacity`), '0'); await page.evaluate('window.__releaseDecode()') }
      if (scenario.failure) { await pause(1200); assert.equal(await page.evaluate(`document.querySelector('.login-background').classList.contains('is-ready')`), false) }
      else { await page.wait(`document.querySelector('.login-background').classList.contains('is-ready')`); await pause(350); assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.login-background')).opacity`), '1') }
      const end = await page.evaluate(`({rect:document.querySelector('.login-card').getBoundingClientRect().toJSON(),cls:window.__shifts.reduce((a,b)=>a+b,0),resources:performance.getEntriesByType('resource').filter(e=>/login-tropical/.test(e.name)).map(e=>({name:e.name,start:e.startTime,end:e.responseEnd,bytes:e.encodedBodySize})),overflow:document.documentElement.scrollWidth>innerWidth})`)
      assert.deepEqual(end.rect, start.rect)
      assert.equal(end.cls - initialCls, 0, 'Image loading must not add layout shifts')
      assert.equal(end.overflow, false)
      assert.equal(requests.filter(n => n === 'login-tropical-sunset-v2.webp').length, 1, JSON.stringify({scenario:scenario.name,requests}))
      assert.equal(requests.some(n => n.endsWith('.jpg')), false)
      await page.screenshot(scenario.name)
      results.push({ scenario: scenario.name, passed: true, ...start, formReadyMs, ...end, initialCls, imageLoadingCls: end.cls - initialCls })
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
    } finally { await page.close() }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally { chrome.kill(); server.close() }
