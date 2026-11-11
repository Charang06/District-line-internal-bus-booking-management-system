// Extends the existing isolated browser harness. No real API or database is used.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

function installCustomerFixture() {
  window.__review = true
  const RealDate = window.Date
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-10T06:00:00+05:30'])) }
    static now() { return new RealDate('2026-11-10T06:00:00+05:30').getTime() }
  }
  window.__today = '2026-11-10'
  const booking = (trip_id, travel_date, route_code, boarding_point, extra = {}) => ({ trip_id, travel_date, route_code, boarding_point, status: 'confirmed', confirmation_status: 'confirmed', ...extra })
  window.__customerBookings = [
    booking(101, '2026-11-10', 'KTY_CMB', 'Kattankudy', { passenger_name: 'Amina Rahman', contact: '0770000001' }),
    booking(101, '2026-11-10', 'KTY_CMB', 'kattankudy', { passenger_name: 'Amina R', contact: '+94770000001' }),
    booking(102, '2026-11-08', 'KTY_CMB', ' Kattankudy '), booking(103, '2026-11-05', 'KTY_CMB', 'Kattankudy'),
    booking(104, '2026-11-09', 'KTY_CMB', 'Batticaloa'), booking(105, '2026-10-09', 'KTY_CMB', 'Batticaloa'),
    booking(106, '2026-09-09', 'KTY_CMB', 'Araiyampathy'),
    booking(107, '2026-11-08', 'CMB_KTY', 'Colombo Fort'), booking(108, '2026-11-06', 'CMB_KTY', 'Colombo Fort'), booking(109, '2026-10-25', 'CMB_KTY', 'Colombo Fort'),
    booking(110, '2026-09-15', 'CMB_KTY', 'Wellawatte'),
    booking(111, '2026-11-07', 'KTY_CMB', 'A departure point with a longer name for wrapping validation'),
    booking(112, '2026-11-10', 'KTY_CMB', 'Kattankudy', { confirmation_status: 'pending' }),
    booking(113, '2026-11-10', 'CMB_KTY', 'Colombo Fort', { status: 'cancelled' }),
    booking(114, '2026-11-11', 'KTY_CMB', 'Future point'), booking(115, '2026-05-09', 'KTY_CMB', 'Old point'),
  ]
  // This is the existing API contract: normalized mobile profiles, with dates
  // already deduplicated by trip on the server. The frontend must not regroup it.
  window.__customerProfiles = [
    { passenger_name: 'Amina Rahman', contact: '+94770000001', trip_dates: ['2026-11-10', '2026-11-08', '2026-10-25', '2026-09-15'] },
    { passenger_name: 'Fathima Nazeer', contact: '+94770000003', trip_dates: ['2026-11-08', '2026-11-06', '2026-11-05'] },
    { passenger_name: 'Nimal Perera', contact: '+94770000002', trip_dates: ['2026-11-09', '2026-10-09', '2026-09-09'] },
  ]
  window.__customerScenario = 'populated'
  window.__customerPlan = []
  window.__reviewResponse = async (p, m) => {
    const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    if (p === '/api/admin/dashboard') {
      const plan = window.__customerPlan.shift() || { scenario: window.__customerScenario, delay: window.__customerDelay || 0 }
      const payload = {
        trips: window.__trips, buses: window.__fleet, dailyRevenue: [], expenses: [], duties: [], dutyTrips: [], crewMembers: [], cargoRecords: [], passengers: {}, cargo: {}, sms: {}, smsGateway: { configured: true },
        passengerRecords: plan.scenario === 'empty' ? [] : window.__customerBookings,
        regularCustomers: plan.scenario === 'empty' ? [] : window.__customerProfiles,
      }
      if (plan.delay) await new Promise(resolve => setTimeout(resolve, plan.delay))
      if (plan.scenario === 'error') return response({ message: 'Synthetic customer analytics unavailable' }, 503)
      return response(payload)
    }
    if (window.__customerLedgerError && p === '/api/admin/revenue-entries') return response({ message: 'Synthetic ledger unavailable' }, 503)
    if (m !== 'GET') return response({ message: 'Customer review never writes application records' }, 405)
    return null
  }
}

async function customerChecks({ page, check, assert, pause, fs, baseline }) {
  const prefix = 'artifacts/customers-ui-review/' + (baseline ? 'before' : 'after')
  const p = await page('admin', false, true)
  const screenshot = async (target, name) => { const { cssContentSize } = await target.call('Page.getLayoutMetrics'); const shot = await target.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } }); fs.writeFileSync(prefix + '-' + name + '.png', Buffer.from(shot.data, 'base64')) }
  const rows = () => p.evaluate('[...document.querySelectorAll(".customers-table tbody tr")].map(tr=>[...tr.children].map(e=>e.textContent.trim()))')
  const bars = () => p.evaluate('[...document.querySelectorAll(".customers-route-card")].map(card=>({title:card.querySelector("h3").textContent,rows:[...card.querySelectorAll(".customers-departure-row")].map(e=>({point:e.querySelector(".customers-departure-label>span").textContent,count:Number(e.querySelector("strong").childNodes[0].textContent),width:parseFloat(e.querySelector(".customers-bar-fill").style.width)}))}))')
  try {
    await p.clickText('Customers'); await p.wait('document.body.textContent.includes("Amina Rahman")'); await p.evaluate('document.fonts.ready')
    for (const width of [1440, 768, 390, 320]) {
      await p.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 }); await pause(100); await screenshot(p, 'customers-' + width)
      if (!baseline) await check('Customers layout, readable filters and contained table scrolling ' + width, async () => {
        const metrics = await p.evaluate('(()=>{const s=document.querySelector(".customers-table-scroll"),r=document.querySelectorAll(".customers-route-card"),a=r[0].getBoundingClientRect(),b=r[1].getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(document.querySelector(".customers-ui-page")).fontFamily,tableScroll:s.scrollWidth>s.clientWidth,stacked:b.top>=a.bottom,selects:[...document.querySelectorAll(".customers-ui-page select")].every(e=>e.getBoundingClientRect().height>=44),tabular:getComputedStyle(document.querySelector(".customers-table")).fontVariantNumeric}})()')
        assert.equal(metrics.overflow, false); assert.match(metrics.font, /^Inter/); assert.equal(metrics.selects, true); assert.match(metrics.tabular, /tabular-nums/)
        assert.equal(metrics.stacked, width <= 700); if (width <= 768) assert.equal(metrics.tableScroll, true)
      })
    }
    if (baseline) return
    await p.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await check('both routes show the actual confirmed counts and share an accurate bar scale', async () => {
      const result = await bars()
      assert.deepEqual(result.map(route => route.title), ['Kattankudy to Colombo', 'Colombo to Kattankudy'])
      assert.deepEqual(result[0].rows.map(row => row.count), [4, 2, 1, 1]); assert.deepEqual(result[1].rows.map(row => row.count), [3, 1])
      for (const route of result) for (const row of route.rows) assert.equal(row.width, row.count / 4 * 100)
      assert.equal(result[0].rows.some(row => row.point === 'Future point' || row.point === 'Old point'), false)
      assert.equal(await p.evaluate('document.querySelectorAll(".customers-departure-list[aria-label]").length'), 2)
    })
    await check('existing period options and independent immediate filtering make no additional API calls', async () => {
      assert.deepEqual(await p.evaluate('[...document.querySelectorAll("#customers-departure-period option")].map(e=>[e.value,e.textContent])'), [['week', 'Last week'], ['1', 'Last month'], ['3', 'Last 3 months'], ['6', 'Last 6 months']])
      assert.deepEqual(await p.evaluate('[...document.querySelectorAll("#customers-regular-period option")].map(e=>[e.value,e.textContent])'), [['week', 'Last week'], ['1', 'Last month'], ['3', 'Last 3 months'], ['6', 'Last 6 months']])
      const before = await p.evaluate('window.__requests.length')
      await p.set('#customers-departure-period', 'week'); assert.equal(await p.evaluate('document.querySelector("#customers-regular-period").value'), '6')
      assert.deepEqual((await bars())[0].rows.map(row => row.count), [4, 1, 1]); assert.deepEqual((await bars())[1].rows.map(row => row.count), [2])
      assert.equal((await rows()).length, 3)
      await p.set('#customers-regular-period', 'week'); assert.equal(await p.evaluate('document.querySelector("#customers-departure-period").value'), 'week')
      assert.deepEqual((await rows()).map(row => [row[1], row[3], row[4], row[5]]), [['Fathima Nazeer', '3', '1', '2026-11-08'], ['Amina Rahman', '2', '1', '2026-11-10']])
      for (const value of ['1', '3', '6']) { await p.set('#customers-departure-period', value); await p.set('#customers-regular-period', value) }
      assert.equal(await p.evaluate('window.__requests.length'), before)
    })
    await check('rankings, normalized mobile profiles, distinct trips, months and latest dates are preserved', async () => {
      assert.deepEqual(await rows(), [
        ['1', 'Amina Rahman', '+94770000001', '4', '3', '2026-11-10'],
        ['2', 'Nimal Perera', '+94770000002', '3', '3', '2026-11-09'],
        ['3', 'Fathima Nazeer', '+94770000003', '3', '1', '2026-11-08'],
      ])
      assert.equal((await rows()).filter(row => row[2] === '+94770000001').length, 1)
      assert.equal(await p.evaluate('document.querySelectorAll(".customers-table thead th[scope=col]").length'), 6)
      assert.equal(await p.evaluate('document.querySelectorAll(".customers-table tbody th[scope=row]").length'), 3)
      assert.match(await p.evaluate('document.querySelector(".customers-count").textContent'), /^3 regular customers$/)
    })
    await check('keyboard focus is visible on filters and the horizontal table region', async () => {
      await p.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await p.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await p.evaluate('document.querySelector("#customers-departure-period").focus()')
      assert.equal(await p.evaluate('getComputedStyle(document.activeElement).outlineStyle!=="none"'), true, 'period selector needs a keyboard focus outline')
      await p.evaluate('document.querySelector(".customers-table-scroll").focus()')
      assert.equal(await p.evaluate('document.activeElement.classList.contains("customers-table-scroll")'), true)
      assert.equal(await p.evaluate('getComputedStyle(document.activeElement).outlineStyle!=="none"'), true, 'table region needs a keyboard focus outline')
    })
    await check('existing footer logo loads and all footer information remains', async () => {
      await p.wait('document.querySelector(".footer-logo").complete')
      assert.equal(await p.evaluate('document.querySelector(".footer-logo").naturalWidth>0'), true)
      const footer = await p.evaluate('document.querySelector(".site-footer").textContent')
      assert.match(footer, /District Line/); assert.match(footer, /Passenger & freight operations/); assert.match(footer, /Express corridor/)
      assert.equal(await p.evaluate('document.querySelector(".footer-logo").getAttribute("src")'), '/logo.png')
    })
    await check('customer page and filter changes never write application records', async () => {
      assert.equal(await p.evaluate('window.__requests.some(r=>r.method!=="GET")'), false)
    })
  } finally { await p.close() }

  const pending = await page('admin', false, true)
  try {
    await check('loading shows feedback without no-results messages or old cached rows', async () => {
      await pending.clickText('Dashboard'); await pending.wait('!!document.querySelector(".trip-controls-filters")')
      await pending.evaluate('window.__customerDelay=800'); await pending.clickText('Customers')
      await pending.wait('!!document.querySelector(".customers-loading")')
      assert.equal(await pending.evaluate('document.querySelectorAll(".customers-table tbody tr").length'), 0)
      assert.equal(await pending.evaluate('document.querySelector(".customers-ui-page").textContent.includes("No repeat customers")'), false)
      assert.equal(await pending.evaluate('document.querySelectorAll(".customers-ui-page select:disabled").length'), 2)
      await screenshot(pending, 'loading'); await pending.wait('!!document.querySelector(".customers-table tbody tr")')
    })
  } finally { await pending.close() }

  const failed = await page('admin', false, true)
  try {
    await check('API error is distinct from empty results and Retry uses a fresh successful request', async () => {
      await failed.evaluate('window.__customerScenario="error"'); await failed.clickText('Customers'); await failed.wait('!!document.querySelector(".customers-error")')
      assert.equal(await failed.evaluate('document.querySelector(".customers-error").getAttribute("role")'), 'alert')
      assert.match(await failed.evaluate('document.querySelector(".customers-error").textContent'), /Synthetic customer analytics unavailable/)
      assert.equal(await failed.evaluate('document.querySelector(".customers-ui-page").textContent.includes("No repeat customers")'), false)
      await screenshot(failed, 'error'); await failed.evaluate('window.__customerScenario="populated"'); await failed.clickText('Retry customer analytics'); await failed.wait('!!document.querySelector(".customers-table tbody tr")')
      assert.equal(await failed.evaluate('window.__requests.filter(r=>r.path==="/api/admin/dashboard").length'), 2)
    })
  } finally { await failed.close() }

  const empty = await page('admin', false, true)
  try {
    await check('genuine empty responses show exact empty messages without fake data', async () => {
      await empty.evaluate('window.__customerScenario="empty"'); await empty.clickText('Customers'); await empty.wait('document.querySelector(".customers-ui-page")?.textContent.includes("No repeat customers")')
      assert.equal(await empty.evaluate('[...document.querySelectorAll(".customers-empty p")].filter(e=>e.textContent==="No confirmed departure bookings in this period.").length'), 2)
      assert.equal(await empty.evaluate('document.querySelectorAll(".customers-departure-row,.customers-table tbody tr,.customers-error").length'), 0)
      assert.match(await empty.evaluate('document.querySelector(".customers-count").textContent'), /^0 regular customers$/)
      await empty.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true }); await screenshot(empty, 'empty-mobile')
    })
  } finally { await empty.close() }

  const race = await page('admin', false, true)
  try {
    await check('late responses from an older navigation request cannot replace current Customers results', async () => {
      await race.evaluate('window.__customerPlan=[{scenario:"populated",delay:900},{scenario:"populated",delay:20},{scenario:"empty",delay:20}]')
      await race.clickText('Customers'); await race.wait('!!document.querySelector(".customers-loading")'); await race.clickText('Dashboard'); await race.wait('!!document.querySelector(".trip-controls-filters")')
      await race.clickText('Customers'); await race.wait('document.querySelector(".customers-ui-page")?.textContent.includes("No repeat customers")'); await pause(1000)
      assert.equal(await race.evaluate('document.querySelectorAll(".customers-table tbody tr").length'), 0)
      assert.match(await race.evaluate('document.querySelector(".customers-ui-page").textContent'), /No repeat customers with a mobile number found/)
    })
  } finally { await race.close() }

  const ledger = await page('admin', false, true)
  try {
    await check('unrelated ledger failure does not masquerade as a Customers analytics failure', async () => {
      await ledger.evaluate('window.__customerLedgerError=true'); await ledger.clickText('Customers'); await ledger.wait('!!document.querySelector(".customers-table tbody tr")')
      assert.equal(await ledger.evaluate('document.querySelectorAll(".customers-error").length'), 0)
    })
  } finally { await ledger.close() }

  const staff = await page('staff', false, true)
  try { await check('administrator-only Customers navigation remains unavailable to ordinary staff', async () => { assert.equal(await staff.evaluate('[...document.querySelectorAll(".nav-button")].some(e=>e.textContent.trim()==="Customers")'), false); assert.equal(await staff.evaluate('!!document.querySelector(".customers-ui-page")'), false) }) } finally { await staff.close() }
}

// Reuse launch/teardown, request isolation and existing release smoke tests.
// No previous Staff test or production source is edited by this wrapper.
let harness = fs.readFileSync(path.join(__dirname, 'staff-ui-browser.cjs'), 'utf8')
const fixtureStart = harness.indexOf('function installReviewFixture()')
const runnerStart = harness.indexOf('\nlet runner = fs.readFileSync')
if (fixtureStart < 0 || runnerStart < fixtureStart) throw Error('Existing browser harness boundaries changed')
harness = harness.slice(0, fixtureStart) + 'const installReviewFixture=' + installCustomerFixture.toString() + ';\nconst staffChecks=' + customerChecks.toString() + ';\n' + harness.slice(runnerStart)
harness = harness.replaceAll('artifacts/staff-ui-review', 'artifacts/customers-ui-review')
const compiled = new Module(__filename, module)
compiled.filename = __filename
compiled.paths = module.paths
compiled._compile(harness, __filename)
