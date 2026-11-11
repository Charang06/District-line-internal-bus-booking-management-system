const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

function installDashboardFixture() {
  window.__review = true
  const RealDate = window.Date
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-10T06:00:00+05:30'])) }
    static now() { return new RealDate('2026-11-10T06:00:00+05:30').getTime() }
  }
  window.__today = '2026-11-10'
  window.__fleet = [{ id: 1, registration_no: 'BUS-ONE', status: 'active' }, { id: 2, registration_no: 'BUS-TWO', status: 'active' }]
  window.__trips = [
    { id: 101, trip_code: 'TRP-101', travel_date: '2026-11-10', route_code: 'KTY_CMB', route_label: 'Kattankudy to Colombo', bus_id: 1, registration_no: 'BUS-ONE', booked_count: 18, driver_name: 'Sunil Jayawardena', conductor_name: 'Abdul Haleem', status: 'scheduled' },
    { id: 102, trip_code: 'TRP-102', travel_date: '2026-11-10', route_code: 'CMB_KTY', route_label: 'Colombo to Kattankudy', bus_id: 1, registration_no: 'BUS-ONE', booked_count: 12, driver_name: 'Mohamed Riyas', conductor_name: 'Ruwan Fernando', status: 'scheduled' },
    { id: 103, trip_code: 'TRP-103', travel_date: '2026-11-10', route_code: 'KTY_CMB', route_label: 'Kattankudy to Colombo', bus_id: 2, registration_no: 'BUS-TWO', booked_count: 7, driver_name: 'Nimal Perera', conductor_name: 'Fazil Ahmed', status: 'scheduled' },
    { id: 111, trip_code: 'TRP-111', travel_date: '2026-11-11', route_code: 'CMB_KTY', bus_id: 1, registration_no: 'BUS-ONE', booked_count: 15, status: 'scheduled' },
  ]
  window.__ledger = [
    { id: 201, submission_code: 'ACC-0201', bus_no: 'BUS-ONE', expense_date: '2026-11-10', route_code: 'KTY_CMB', first_trip_id: 101, return_trip_id: 111, first_leg_date: '2026-11-10', return_leg_date: '2026-11-11', gross_revenue: 120000, total_expense: 60000, first_leg_share: 36000, return_leg_share: 24000, driver_name: 'Sunil Jayawardena', conductor_name: 'Abdul Haleem', status: 'locked' },
    { id: 202, submission_code: 'ACC-0202', bus_no: 'BUS-TWO', expense_date: '2026-11-09', route_code: 'CMB_KTY', first_leg_date: '2026-11-08', return_leg_date: '2026-11-09', gross_revenue: 40000, total_expense: 50000, first_leg_share: 25000, return_leg_share: 25000, driver_name: 'Nimal Perera', conductor_name: 'Fazil Ahmed', status: 'locked' },
  ]
  window.__revenues = [
    { id: 501, trip_id: 101, travel_date: '2026-11-10', route_code: 'KTY_CMB', bus_no: 'BUS-ONE', seat_subtotal: 80000, cargo_subtotal: 10000, total_revenue: 90000, status: 'locked' },
    { id: 502, trip_id: 111, travel_date: '2026-11-11', route_code: 'CMB_KTY', bus_no: 'BUS-ONE', seat_subtotal: 25000, cargo_subtotal: 5000, total_revenue: 30000, status: 'locked' },
  ]
  window.__dailyRevenue = [
    { trip_id: 101, travel_date: '2026-11-10', route_code: 'KTY_CMB', registration_no: 'BUS-ONE', passenger_count: 18, total_revenue: 90000 },
    { trip_id: 102, travel_date: '2026-11-10', route_code: 'CMB_KTY', registration_no: 'BUS-ONE', passenger_count: 12, total_revenue: 24000 },
    { trip_id: 103, travel_date: '2026-11-10', route_code: 'KTY_CMB', registration_no: 'BUS-TWO', passenger_count: 7, total_revenue: 14000 },
    { trip_id: 111, travel_date: '2026-11-11', route_code: 'CMB_KTY', registration_no: 'BUS-ONE', passenger_count: 15, total_revenue: 30000 },
    { travel_date: '2026-11-08', route_code: 'CMB_KTY', registration_no: 'BUS-TWO', passenger_count: 2, total_revenue: 10000 },
    { travel_date: '2026-11-09', route_code: 'KTY_CMB', registration_no: 'BUS-TWO', passenger_count: 6, total_revenue: 30000 },
  ]
  window.__expenses = [
    { expense_date: '2026-11-01', bus_no: 'BUS-ONE', expense_source: 'monthly', amount: 5000 },
    { expense_date: '2026-11-01', bus_no: 'BUS-TWO', expense_source: 'monthly', amount: 7000 },
  ]
  window.__dashboardScenario = 'populated'
  window.__smsRequests = 0
  window.__reviewResponse = async (p, m, body) => {
    const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    if (p === '/api/admin/dashboard') {
      if (window.__primaryDelay) await new Promise(resolve => setTimeout(resolve, window.__primaryDelay))
      if (window.__failPrimary) return response({ message: 'Synthetic dashboard unavailable' }, 503)
      return response({ trips: window.__dashboardScenario === 'empty' ? [] : window.__trips, buses: window.__fleet, dailyRevenue: window.__dashboardScenario === 'empty' ? [] : window.__dailyRevenue, expenses: window.__expenses, duties: [], dutyTrips: [], crewMembers: [], passengerRecords: [], regularCustomers: [], cargoRecords: [], passengers: {}, cargo: {}, sms: {}, smsGateway: { configured: true } })
    }
    if (p === '/api/admin/revenue-entries' || p === '/api/admin/expense-submissions') {
      if (window.__ledgerDelay) await new Promise(resolve => setTimeout(resolve, window.__ledgerDelay))
      if (window.__failLedger) return response({ message: 'Synthetic finalized ledger unavailable' }, 503)
      return response(p.endsWith('revenue-entries') ? { entries: window.__dashboardScenario === 'empty' ? [] : window.__revenues } : { submissions: window.__dashboardScenario === 'empty' ? [] : window.__ledger })
    }
    if (p === '/api/admin/smslenz/balance') {
      window.__smsRequests++
      if (window.__smsDelay) await new Promise(resolve => setTimeout(resolve, window.__smsDelay))
      if (window.__failSms) return response({ message: 'Synthetic SMS service unavailable' }, 503)
      return response({ sms_credit_balance: 1875.5 + (window.__smsRequests - 1) * 25, allocated_credit_total: 1500, status: 'active', sender_id_balances: [{ sender_id: 'DistrictLine', allocated_balance: 1500, active: true }], updated_at: '2026-11-10T06:00:00Z' })
    }
    if (p === '/api/trips' && m === 'GET') {
      if (window.__tripDelay) await new Promise(resolve => setTimeout(resolve, window.__tripDelay))
      if (window.__failTrips) return response({ message: 'Synthetic trips unavailable' }, 503)
      const last = window.__requests.at(-1)
      const params = new URLSearchParams(last.query)
      return response({ trips: window.__dashboardScenario === 'empty' ? [] : window.__trips.filter(trip => (!params.get('date') || trip.travel_date === params.get('date')) && (!params.get('route') || trip.route_code === params.get('route'))) })
    }
    if (p === '/api/buses' && m === 'GET') return response({ buses: window.__fleet })
    if (p === '/api/buses' && m === 'POST') {
      const bus = { ...body, id: 3, status: 'active' }; window.__fleet.push(bus); return response({ bus }, 201)
    }
    if (m !== 'GET') return response({ message: 'Only synthetic bus registration is allowed in the dashboard review' }, 405)
    return null
  }
}

async function dashboardChecks({ page, check, assert, pause, fs, baseline }) {
  const prefix = 'artifacts/dashboard-ui-review/' + (baseline ? 'before' : 'after')
  const p = await page('admin', false, true)
  const screenshot = async (target, name, full = true) => {
    const params = { format: 'png', captureBeyondViewport: full }
    if (full) { const { cssContentSize } = await target.call('Page.getLayoutMetrics'); params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } }
    const shot = await target.call('Page.captureScreenshot', params); fs.writeFileSync(prefix + '-' + name + '.png', Buffer.from(shot.data, 'base64'))
  }
  const kpi = index => p.evaluate('document.querySelectorAll(".dashboard-kpi-value")[' + index + '].textContent')
  const totals = () => p.evaluate('[...document.querySelectorAll(".profit-ledger-summary .metric-card strong")].map(e=>e.textContent)')
  const profit = () => p.evaluate('document.querySelector(".dashboard-profit-kpi-slot .dashboard-kpi-value").textContent')
  const tripSelect = i => '.trip-controls-filters label:nth-child(' + i + ') select'
  try {
    await p.clickText('Dashboard'); await p.wait('document.querySelectorAll(".trip-overview-trip-card").length===2'); await p.wait('!!document.querySelector(".sms-balance-main strong")'); await p.evaluate('document.fonts.ready')
    for (const width of [1440, 768, 390, 320]) {
      await p.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 }); await pause(120); await screenshot(p, 'dashboard-' + width)
      if (!baseline) await check('dashboard layout, KPI columns and contained charts/tables ' + width, async () => {
        const result = await p.evaluate('(()=>{const main=document.querySelector(".admin-dashboard-page"),k=document.querySelector(".dashboard-kpis"),o=document.querySelectorAll(".trip-overview-grid>section");return {overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(main).fontFamily,columns:getComputedStyle(k).gridTemplateColumns.split(" ").length,overviewColumns:getComputedStyle(document.querySelector(".trip-overview-grid")).gridTemplateColumns.split(" ").length,clipped:[...main.querySelectorAll("button")].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent.trim()),tableScroll:document.querySelector(".daily-revenue-table-wrap").scrollWidth>document.querySelector(".daily-revenue-table-wrap").clientWidth}})()')
        assert.equal(result.overflow, false); assert.match(result.font, /^Inter/); assert.equal(result.columns, width > 1100 ? 4 : width > 600 ? 2 : 1); assert.equal(result.overviewColumns, width > 850 ? 2 : 1); assert.deepEqual(result.clipped, []); if (width <= 768) assert.equal(result.tableScroll, true)
      })
    }
    if (baseline) return
    await check('SMS credit refresh bypasses automatic cache and retains last value on an error', async () => {
      const before = await p.evaluate('window.__smsRequests'); await p.evaluate('document.querySelector(".sms-balance-refresh").click()'); await p.wait('window.__smsRequests>' + before)
      await p.wait('document.querySelector(".sms-balance-main strong").textContent.includes("1,900.5")')
      await p.evaluate('window.__failSms=true;document.querySelector(".sms-balance-refresh").click()'); await p.wait('!!document.querySelector(".sms-balance-warning")')
      assert.match(await p.evaluate('document.querySelector(".sms-balance-main strong").textContent'), /1,900.5/)
      await p.evaluate('window.__failSms=false;document.querySelector(".sms-balance-refresh").click()'); await p.wait('!document.querySelector(".sms-balance-warning")')
      await p.evaluate('document.querySelector(".sms-balance-meta summary").click()'); assert.match(await p.evaluate('document.querySelector(".sms-balance-meta").textContent'), /DistrictLine/)
      await p.evaluate('document.querySelector(".sms-balance-meta summary").click()')
    })
    await check('seat KPI cards and donut use the active filtered trip totals', async () => {
      assert.equal(await kpi(0), '25'); assert.equal(await kpi(1), '73')
      assert.match(await p.evaluate('document.querySelector(".dashboard-seat-donut").getAttribute("aria-label")'), /25 booked seats, 73 available seats, 98 total capacity/)
      await p.set(tripSelect(2), 'BUS-ONE'); await p.wait('document.querySelectorAll(".trip-overview-trip-card").length===1')
      assert.equal(await kpi(0), '18'); assert.equal(await kpi(1), '31')
      await p.set(tripSelect(3), 'CMB_KTY'); await p.wait('document.querySelector(".trip-overview-trip-card")?.textContent.includes("TRP-102")')
      assert.equal(await kpi(0), '12'); assert.equal(await kpi(1), '37')
      await p.set(tripSelect(4), '102'); assert.equal(await kpi(0), '12')
      await p.clickText('Reset filters'); await p.wait('document.querySelectorAll(".trip-overview-trip-card").length===2'); assert.equal(await kpi(0), '25')
    })
    await check('Trip Details keeps trip fields and locked Accounts revenue', async () => {
      const text = await p.evaluate('document.querySelector(".trip-overview-trip-card").textContent')
      for (const value of ['TRP-101', '2026-11-10', 'Kattankudy to Colombo', 'BUS-ONE', 'Sunil Jayawardena', 'Abdul Haleem', '18 booked', '31 available', '80,000', '10,000', '90,000']) assert.ok(text.includes(value), value)
      await p.evaluate('document.querySelector(".dashboard-bus-breakdown summary").click()'); assert.equal(await p.evaluate('document.querySelectorAll(".trip-overview-route-pie-card").length'), 2)
      await p.evaluate('document.querySelector(".dashboard-bus-breakdown summary").click()')
    })
    await check('both monthly travel-date charts preserve counts and titles and Month filtering', async () => {
      const chart = await p.evaluate('[...document.querySelectorAll(".dashboard-seat-chart-card")].map(e=>({title:e.querySelector("h3").textContent,tooltips:[...e.querySelectorAll("rect title")].map(t=>t.textContent)}))')
      assert.equal(chart.length, 2); assert.equal(chart[0].title, 'Kattankudy to Colombo'); assert.equal(chart[1].title, 'Colombo to Kattankudy')
      assert.ok(chart[0].tooltips.includes('2026-11-10: 25 seats')); assert.ok(chart[1].tooltips.includes('2026-11-10: 12 seats'))
      await p.set('.dashboard-seat-chart-month input', '2026-10'); assert.equal(await p.evaluate('document.querySelectorAll(".dashboard-chart-empty").length'), 2)
      await p.set('.dashboard-seat-chart-month input', '2026-11')
    })
    await check('Trip and Route Profit Report totals agree with Net Profit KPI and retain locked rows', async () => {
      assert.deepEqual(await totals(), ['Rs. 160,000.00', 'Rs. 110,000.00', 'Rs. 50,000.00']); assert.equal(await profit(), 'Rs. 50,000.00')
      assert.equal(await p.evaluate('document.querySelectorAll(".dashboard-profit-report tbody tr").length'), 2)
      assert.equal(await p.evaluate('document.querySelectorAll(".accounts-entry-locked").length'), 2)
      await p.clickText('Route', 'document.querySelector(".accounts-expense-ledger-switch")')
      assert.equal(await p.evaluate('document.querySelectorAll(".dashboard-profit-report tbody tr").length'), 4); assert.equal(await profit(), 'Rs. 50,000.00')
      const cells = await p.evaluate('[...document.querySelectorAll(".dashboard-profit-report tbody tr")].map(tr=>[...tr.children].map(e=>e.textContent))')
      assert.ok(cells[0].includes('Rs. 90,000.00')); assert.ok(cells[1].includes('Rs. 30,000.00'))
      assert.match(await p.evaluate('document.querySelector(".dashboard-profit-kpi-slot .dashboard-kpi-scope").textContent'), /Route mode.*All periods.*All buses/)
      await p.clickText('Trip', 'document.querySelector(".accounts-expense-ledger-switch")')
    })
    await check('financial filters, negative profit, monthly costs and reset keep the original rules', async () => {
      const requests = await p.evaluate('window.__requests.length')
      await p.set('input[aria-label="Search expenses by date"]', '2026-11-09'); assert.equal(await profit(), 'Rs. -10,000.00')
      assert.equal(await p.evaluate('document.querySelectorAll(".profit-ledger-bar.negative").length'), 1)
      await p.set('input[aria-label="Search expenses by date"]', '')
      await p.set('select[aria-label="Filter expenses by period"]', 'month'); await p.set('select[aria-label="Filter expenses by bus number"]', 'BUS-ONE')
      assert.deepEqual(await totals(), ['Rs. 120,000.00', 'Rs. 5,000.00', 'Rs. 65,000.00', 'Rs. 55,000.00']); assert.equal(await profit(), 'Rs. 55,000.00')
      assert.match(await p.evaluate('document.querySelector(".dashboard-report-scope").textContent'), /2026-11.*BUS-ONE/)
      await p.clickText('Reset', 'document.querySelector(".accounts-revenue-ledger-filters")'); assert.equal(await p.evaluate('document.querySelectorAll(".accounts-revenue-ledger-filters select")[1].value'), 'week')
      assert.equal(await profit(), 'Rs. 50,000.00'); assert.equal(await p.evaluate('window.__requests.length'), requests)
      await p.set('input[aria-label="Search expenses by date"]', '2001-01-01'); assert.match(await p.evaluate('document.querySelector(".profit-ledger-chart").textContent'), /No matching ledger entries/)
      assert.equal(await profit(), 'Rs. 0.00'); await p.clickText('Reset', 'document.querySelector(".accounts-revenue-ledger-filters")')
    })
    await check('trip date errors and API failures suppress misleading KPI values and Retry recovers', async () => {
      await p.set('.trip-controls-filters input[type=date]', ''); await p.wait('document.querySelector(".trip-overview [role=alert]")?.textContent.includes("Choose a valid date")'); assert.equal(await kpi(0), '—')
      await p.clickText('Reset filters'); await p.wait('document.querySelectorAll(".trip-overview-trip-card").length===2')
      await p.evaluate('window.__failTrips=true'); await p.set(tripSelect(3), 'CMB_KTY'); await p.wait('document.querySelector(".trip-overview [role=alert]")?.textContent.includes("Synthetic trips unavailable")'); assert.equal(await kpi(0), '—')
      await p.evaluate('window.__failTrips=false'); await p.clickText('Retry trips'); await p.wait('document.querySelectorAll(".trip-overview-trip-card").length===1'); await p.clickText('Reset filters'); await p.wait('document.querySelectorAll(".trip-overview-trip-card").length===2')
    })
    await check('new synthetic bus appears once without refresh and preserves a valid Bus No selection', async () => {
      await p.set(tripSelect(2), 'BUS-ONE'); await p.clickText('Staff'); await p.wait('!!document.querySelector(".staff-add-button")'); await p.clickText('Add bus'); await p.set('.staff-bus-modal input[maxlength="40"]', 'BUS-THREE'); await p.clickText('Save bus'); await p.wait('!document.querySelector(".staff-bus-modal")'); await p.clickText('Dashboard'); await p.wait('!!document.querySelector(".trip-controls-filters")'); await pause(150)
      assert.equal(await p.evaluate('document.querySelector(".trip-controls-filters label:nth-child(2) select").value'), 'BUS-ONE')
      assert.equal(await p.evaluate('[...document.querySelectorAll(".trip-controls-filters label:nth-child(2) select option")].filter(e=>e.value==="BUS-THREE").length'), 1)
      await p.clickText('Reset filters')
    })
    await check('opaque sticky header stays above content and preserves mobile navigation', async () => {
      await p.evaluate('window.scrollTo(0,1500)'); await pause(100)
      assert.equal(await p.evaluate('(()=>{const r=document.querySelector(".topbar").getBoundingClientRect();return r.top>=-1&&r.top<=1})()'), true)
      assert.equal(await p.evaluate('getComputedStyle(document.querySelector(".topbar")).backgroundColor'), 'rgb(248, 250, 252)')
      assert.equal(await p.evaluate('(()=>{const r=document.querySelector(".topbar").getBoundingClientRect();return !!document.elementFromPoint(r.width/2,r.height/2).closest(".topbar")})()'), true)
      await p.evaluate('document.querySelector(".mobile-nav-toggle").click()'); await p.wait('document.querySelector(".nav-tabs").classList.contains("is-open")')
      await p.clickText('Dashboard'); await p.wait('!document.querySelector(".nav-tabs").classList.contains("is-open")')
      await screenshot(p, 'sticky-mobile', false); await p.evaluate('window.scrollTo(0,0)')
    })
    await check('footer logo loads and keyboard focus/table semantics remain accessible', async () => {
      await p.wait('document.querySelector(".footer-logo").complete'); assert.equal(await p.evaluate('document.querySelector(".footer-logo").naturalWidth>0'), true)
      await p.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await p.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await p.evaluate('document.querySelector(".trip-controls-filters select").focus()'); assert.equal(await p.evaluate('getComputedStyle(document.activeElement).outlineStyle!=="none"'), true)
      assert.equal(await p.evaluate('document.querySelectorAll(".dashboard-profit-report thead th[scope=col]").length'), 9)
      assert.equal(await p.evaluate('window.__requests.some(r=>r.method!=="GET"&&r.path!=="/api/buses")'), false)
    })
    await p.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true }); await p.evaluate('window.scrollTo(0,0)'); await screenshot(p, 'dashboard-top-mobile', false)
    await p.evaluate('document.querySelector(".dashboard-profit-report").scrollIntoView()'); await screenshot(p, 'profit-mobile', false)
  } finally { await p.close() }

  const empty = await page('admin', false, true)
  try { await check('empty dashboard shows genuine empty trip/chart/ledger states', async () => {
    await empty.evaluate('window.__dashboardScenario="empty"'); await empty.clickText('Dashboard'); await empty.wait('document.querySelector(".trip-overview")?.textContent.includes("No trips match")')
    assert.equal(await empty.evaluate('document.querySelectorAll(".dashboard-chart-empty").length'), 2)
    assert.equal(await empty.evaluate('document.querySelectorAll(".dashboard-kpi-value")[0].textContent'), '0')
    assert.match(await empty.evaluate('document.querySelector(".profit-ledger-chart").textContent'), /No matching ledger entries/); await screenshot(empty, 'empty')
  }) } finally { await empty.close() }

  const loading = await page('admin', false, true)
  try { await check('primary dashboard and ledger loading do not display stale totals', async () => {
    await loading.evaluate('window.__primaryDelay=900;window.__ledgerDelay=900'); await loading.clickText('Dashboard'); await loading.wait('!!document.querySelector(".admin-dashboard-page [role=status]")')
    assert.equal(await loading.evaluate('document.querySelectorAll(".dashboard-kpi-value")[0].textContent'), '—'); await screenshot(loading, 'loading')
    await loading.wait('!!document.querySelector(".trip-overview-trip-card")')
  }) } finally { await loading.close() }

  const failure = await page('admin', false, true)
  try { await check('primary API error is announced and dashboard Retry fetches fresh data', async () => {
    await failure.evaluate('window.__failPrimary=true'); await failure.clickText('Dashboard'); await failure.wait('document.querySelector(".admin-dashboard-page")?.textContent.includes("Synthetic dashboard unavailable")')
    assert.equal(await failure.evaluate('document.querySelectorAll(".trip-overview-trip-card").length'), 0)
    await screenshot(failure, 'primary-error'); await failure.evaluate('window.__failPrimary=false'); await failure.clickText('Retry dashboard load'); await failure.wait('!!document.querySelector(".trip-overview-trip-card")')
  }) } finally { await failure.close() }

  const ledger = await page('admin', false, true)
  try { await check('ledger failure hides financial rows and Net Profit until an explicit Retry succeeds', async () => {
    await ledger.evaluate('window.__failLedger=true'); await ledger.clickText('Dashboard'); await ledger.wait('document.querySelector(".profit-ledger-chart [role=alert]")?.textContent.includes("Synthetic finalized ledger")')
    assert.equal(await ledger.evaluate('document.querySelectorAll(".dashboard-profit-report tbody tr").length'), 0); assert.equal(await ledger.evaluate('document.querySelector(".dashboard-profit-kpi-slot .dashboard-kpi-value").textContent'), '—')
    await screenshot(ledger, 'ledger-error'); await ledger.evaluate('window.__failLedger=false'); await ledger.clickText('Retry profit report'); await ledger.wait('document.querySelectorAll(".dashboard-profit-report tbody tr").length===2')
  }) } finally { await ledger.close() }
}

let harness = fs.readFileSync(path.join(__dirname, 'staff-ui-browser.cjs'), 'utf8')
const fixtureStart = harness.indexOf('function installReviewFixture()')
const runnerStart = harness.indexOf('\nlet runner = fs.readFileSync')
if (fixtureStart < 0 || runnerStart < fixtureStart) throw Error('Existing browser harness boundaries changed')
harness = harness.slice(0, fixtureStart) + 'const installReviewFixture=' + installDashboardFixture.toString() + ';\nconst staffChecks=' + dashboardChecks.toString() + ';\n' + harness.slice(runnerStart)
harness = harness.replaceAll('artifacts/staff-ui-review', 'artifacts/dashboard-ui-review')
const compiled = new Module(__filename, module)
compiled.filename = __filename
compiled.paths = module.paths
compiled._compile(harness, __filename)
