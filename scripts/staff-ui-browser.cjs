// Local Staff UI checks. All mutations use in-page fixtures; the reused runner
// serves static files and blocks requests outside its loopback origin.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const baseline = process.argv.includes('--baseline')
const output = 'artifacts/staff-ui-review'
fs.mkdirSync(output, { recursive: true })

function installReviewFixture() {
  window.__review = true
  const all = { home: true, log: true, info: true, passengers: true, cargo: true, trips: true }
  window.__staff = [
    { id: 11, full_name: 'Amina Rahman', username: 'amina.dispatch', status: 'active', permissions: { ...all } },
    { id: 12, full_name: 'Nimal Perera', username: 'nimal.ops', status: 'inactive', permissions: { ...all, cargo: false, trips: false } },
    { id: 13, full_name: 'Fathima Nazeer', username: 'fathima.bookings', status: 'active', permissions: { ...all, log: false, trips: false } },
  ]
  window.__crew = [
    { id: 21, full_name: 'Mohamed Riyas', role: 'driver' },
    { id: 22, full_name: 'Sunil Jayawardena', role: 'driver' },
    { id: 23, full_name: 'Abdul Haleem', role: 'conductor' },
    { id: 24, full_name: 'Ruwan Fernando', role: 'conductor' },
  ]
  window.__fleet = [
    { id: 1, registration_no: 'BUS-ONE', display_name: 'District Line Express', status: 'active' },
    { id: 2, registration_no: 'NE-3456', display_name: 'District Line Coach', status: 'active' },
    { id: 3, registration_no: 'ND-7812', display_name: 'Coastal Service', status: 'inactive' },
  ]
  window.__contacts = [{ bus_no: 'NE-3456', phone_number: '077 123 4567' }]
  let next = 100
  window.__reviewResponse = async (p, m, body) => {
    const result = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    if (m !== 'GET' && window.__delayWrite) await new Promise(resolve => setTimeout(resolve, window.__delayWrite))
    if (p === '/api/admin/staff') {
      if (m === 'GET') return window.__failLoad ? result({ message: 'Synthetic directory unavailable' }, 503) : result({ staff: window.__staff })
      if (m === 'POST') {
        if (window.__failStaff) return result({ message: 'Synthetic username already exists' }, 409)
        const staff = { ...body, id: next++ }; delete staff.password
        window.__staff.push(staff); return result({ staff }, 201)
      }
    }
    if (p.startsWith('/api/admin/staff/')) {
      const parts = p.split('/'), id = Number(parts[4]), staff = window.__staff.find(person => person.id === id)
      if (m === 'PATCH') {
        if (window.__failStaff) return result({ message: 'Synthetic update rejected' }, 409)
        Object.assign(staff, body); return result({ staff })
      }
      if (m === 'DELETE') { window.__staff = window.__staff.filter(person => person.id !== id); return result({ message: 'Staff account deleted.' }) }
      if (parts[5] === 'reset-password' && m === 'POST') return window.__failReset ? result({ message: 'Synthetic password reset failed' }, 400) : result({ message: 'Staff password reset.' })
    }
    if (p === '/api/admin/crew') {
      if (m === 'GET') return result({ crew: window.__crew })
      if (m === 'POST') {
        if (window.__failCrew) return result({ message: 'Synthetic crew registration failed' }, 409)
        const crewMember = { ...body, id: next++ }; window.__crew.push(crewMember); return result({ crewMember }, 201)
      }
    }
    if (p.startsWith('/api/admin/crew/') && m === 'DELETE') { window.__crew = window.__crew.filter(member => member.id !== Number(p.split('/').pop())); return result({ ok: true }) }
    if (p === '/api/buses') {
      if (m === 'GET') return result({ buses: window.__fleet })
      if (m === 'POST') {
        if (window.__failBus) return result({ message: 'Synthetic bus registration failed' }, 409)
        if (window.__fleet.some(bus => bus.registration_no === body.registration_no && bus.status === 'active')) return result({ message: 'A bus with that registration number already exists' }, 409)
        const bus = { ...body, id: next++, status: 'active' }; window.__fleet.push(bus); return result({ bus }, 201)
      }
    }
    if (p.startsWith('/api/buses/')) {
      const id = Number(p.split('/').pop())
      if (m === 'DELETE') { window.__fleet = window.__fleet.filter(bus => bus.id !== id); return result({ message: 'Bus removed.' }) }
      if (m === 'PATCH') { const bus = window.__fleet.find(bus => bus.id === id); Object.assign(bus, body); return result({ bus }) }
    }
    if (p === '/api/admin/bus-contacts') {
      if (m === 'POST') { window.__contacts.push(body); return result({ contact: body }, 201) }
      return result({ contacts: window.__contacts })
    }
    return null
  }
}

async function staffChecks({ page, check, assert, pause, fs, baseline }) {
  const p = await page('admin', false, true)
  const prefix = 'artifacts/staff-ui-review/' + (baseline ? 'before' : 'after')
  const click = (text, root = 'document') => p.clickText(text, root)
  const clickLabel = label => p.evaluate('document.querySelector(' + JSON.stringify('button[aria-label="' + label + '"]') + ').click()')
  const selectPerson = name => p.evaluate('Array.from(document.querySelectorAll(".staff-ui-directory-item")).find(e=>e.textContent.includes(' + JSON.stringify(name) + ')).click()')
  const escape = async () => { await p.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await p.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }) }
  const screenshot = async name => { const { cssContentSize } = await p.call('Page.getLayoutMetrics'); const shot = await p.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } }); fs.writeFileSync(prefix + '-' + name + '.png', Buffer.from(shot.data, 'base64')) }
  const countRequests = (route, method) => p.evaluate('window.__requests.filter(r=>r.path===' + JSON.stringify(route) + '&&r.method===' + JSON.stringify(method) + ').length')
  const setStaffForm = async () => { await p.set('.staff-form-modal input[maxlength="80"]', 'Synthetic Staff'); await p.set('.staff-form-modal input[maxlength="32"]', 'synthetic.staff'); await p.set('.staff-form-modal input[type=password]', 'Synthetic-password-99') }
  const confirm = text => click(text, 'document.querySelector(".staff-confirm-modal")')
  try {
    await click('Staff'); await p.wait('!!document.querySelector(".staff-add-button")'); await pause(250)
    for (const width of [1440, 768, 390, 320]) {
      await p.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 }); await p.evaluate('document.fonts.ready'); await pause(100)
      await screenshot('staff-' + width)
      if (!baseline) await check('Staff page layout and typography ' + width, async () => {
        const metrics = await p.evaluate('(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden";const buttons=[...document.querySelectorAll(".staff-ui-page button")].filter(visible);return {overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(document.querySelector(".staff-ui-page")).fontFamily,clipped:buttons.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent),smallTargets:buttons.filter(e=>e.getBoundingClientRect().height<35).length}})()')
        assert.equal(metrics.overflow, false); assert.match(metrics.font, /^Inter/); assert.deepEqual(metrics.clipped, []); assert.equal(metrics.smallTargets, 0)
      })
    }
    if (baseline) return
    for (const [width, height] of [[1440, 900], [768, 900], [390, 844], [320, 568]]) {
      await p.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
      for (const type of ['staff', 'bus']) await check(type + ' modal fits viewport and has labelled fields ' + width, async () => {
        if (type === 'staff') await p.evaluate('document.querySelector(".staff-add-button").click()')
        else await click('Add bus')
        await p.wait('!!document.querySelector("dialog[open]")')
        const metrics = await p.evaluate('(()=>{const d=document.querySelector("dialog"),r=d.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,overflow:d.scrollWidth>d.clientWidth+1,labelled:[...d.querySelectorAll("input,select")].every(e=>!!e.closest("label")),readableLabels:[...d.querySelectorAll("label>span")].every(e=>parseFloat(getComputedStyle(e).fontSize)>=13&&getComputedStyle(e).fontWeight==="500"),clipped:[...d.querySelectorAll("button")].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent)}})()')
        assert.equal(metrics.fits, true); assert.equal(metrics.overflow, false); assert.equal(metrics.labelled, true); assert.equal(metrics.readableLabels, true); assert.deepEqual(metrics.clipped, [])
        if (width === 390 || width === 1440) { const shot = await p.call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(prefix + '-' + type + '-modal-' + width + '.png', Buffer.from(shot.data, 'base64')) }
        await escape(); await p.wait('!document.querySelector("dialog")')
      })
    }
    await p.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await check('summary counts derive from fixture data and permissions are read-only', async () => {
      assert.deepEqual(await p.evaluate('[...document.querySelectorAll(".staff-ui-stat strong")].map(e=>e.textContent)'), ['3', '2', '1'])
      assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-page input[type=checkbox]").length'), 0)
      assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-permission-group li").length'), 6)
    })
    await check('staff search, selection, status filter and empty state', async () => {
      await selectPerson('Nimal'); assert.match(await p.evaluate('document.querySelector(".staff-ui-details").textContent'), /Nimal Perera/)
      assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-details .granted").length'), 4)
      await p.set('input[aria-label="Search staff"]', 'fathima.bookings'); assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-directory-item").length'), 1)
      await p.set('input[aria-label="Search staff"]', 'missing.person'); assert.match(await p.evaluate('document.querySelector(".staff-ui-directory").textContent'), /No matching staff/)
      await click('Clear filters'); await p.set('.staff-ui-filter select', 'inactive'); assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-directory-item").length'), 1)
      await p.set('.staff-ui-filter select', 'all'); await selectPerson('Amina')
    })
    await check('Add Staff dialog keyboard focus, trapping, Escape and restoration', async () => {
      await p.evaluate('document.querySelector(".staff-add-button").focus();document.querySelector(".staff-add-button").click()')
      await p.wait('!!document.querySelector("dialog[open]")')
      assert.equal(await p.evaluate('document.activeElement===document.querySelector(".staff-form-modal input")'), true, 'initial focus should enter the first field')
      await p.evaluate('document.querySelector(".staff-form-modal .staff-dialog-close").focus()')
      await p.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 })
      await p.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      assert.equal(await p.evaluate('document.activeElement===document.querySelector("dialog")||!!document.activeElement.closest("dialog")'), true, 'reverse Tab should stay in the dialog')
      await escape(); await p.wait('!document.querySelector("dialog")'); assert.equal(await p.evaluate('document.activeElement.classList.contains("staff-add-button")'), true, 'focus should return to Add Staff')
    })
    await check('staff creation validation, inline failure, disabled state and successful retry', async () => {
      await p.evaluate('document.querySelector(".staff-add-button").click()'); await click('Create staff account', 'document.querySelector(".staff-form-modal")')
      assert.equal(await countRequests('/api/admin/staff', 'POST'), 0)
      await setStaffForm(); await p.evaluate('document.querySelectorAll(".staff-form-modal input[type=checkbox]").forEach(e=>{if(e.checked)e.click()})')
      await click('Create staff account', 'document.querySelector(".staff-form-modal")'); assert.equal(await countRequests('/api/admin/staff', 'POST'), 0)
      assert.match(await p.evaluate('document.querySelector(".staff-form-modal [role=alert]").textContent'), /at least one page/)
      await p.evaluate('document.querySelector(".staff-form-modal input[type=checkbox]").click();window.__failStaff=true')
      await click('Create staff account', 'document.querySelector(".staff-form-modal")'); await p.wait('document.querySelector(".staff-form-modal [role=alert]")?.textContent.includes("Synthetic username")')
      await p.evaluate('window.__failStaff=false;window.__delayWrite=1000'); await click('Create staff account', 'document.querySelector(".staff-form-modal")')
      assert.equal(await p.evaluate('document.querySelector(".staff-form-modal button[type=submit]").disabled'), true, 'staff submit should be disabled during the pending request')
      await escape(); assert.equal(await p.evaluate('!!document.querySelector("dialog[open]")'), true, 'Escape should not close a saving staff dialog')
      await p.wait('!document.querySelector(".staff-form-modal")'); await p.evaluate('window.__delayWrite=0')
      assert.match(await p.evaluate('document.querySelector(".staff-ui-details").textContent'), /Synthetic Staff/)
    })
    await check('staff editing preserves the six permission names and saves changes only on submit', async () => {
      await click('Edit staff'); await p.set('.staff-form-modal input[maxlength="80"]', 'Synthetic Updated')
      const id = await p.evaluate('window.__staff.find(s=>s.username==="synthetic.staff").id')
      await p.evaluate('document.querySelectorAll(".staff-form-modal input[type=checkbox]")[1].click()'); assert.equal(await countRequests('/api/admin/staff/' + id, 'PATCH'), 0)
      await click('Save staff details'); await p.wait('!document.querySelector(".staff-form-modal")')
      const payload = await p.evaluate('window.__requests.find(r=>r.path==="/api/admin/staff/' + id + '"&&r.method==="PATCH").body')
      assert.deepEqual(Object.keys(payload.permissions).sort(), ['cargo', 'home', 'info', 'log', 'passengers', 'trips']); assert.equal(payload.permissions.log, true)
      assert.match(await p.evaluate('document.querySelector(".staff-ui-details").textContent'), /Synthetic Updated/)
    })
    await check('staff deactivate and activate require confirmation, Cancel leaves state intact', async () => {
      await selectPerson('Amina'); const before = await countRequests('/api/admin/staff/11', 'PATCH')
      await click('Deactivate'); await p.wait('!!document.querySelector(".staff-confirm-modal")'); assert.equal(await countRequests('/api/admin/staff/11', 'PATCH'), before)
      assert.equal(await p.evaluate('document.activeElement.textContent.trim()'), 'Cancel')
      await confirm('Cancel'); assert.equal(await countRequests('/api/admin/staff/11', 'PATCH'), before)
      await click('Deactivate'); await confirm('Deactivate'); await p.wait('document.querySelector(".staff-ui-details .staff-ui-status").textContent==="Inactive"')
      await click('Activate'); await confirm('Reactivate'); await p.wait('document.querySelector(".staff-ui-details .staff-ui-status").textContent==="Active"')
    })
    await check('password reset validates, announces failure and retries through the existing endpoint', async () => {
      await click('Reset password'); await click('Save new password'); assert.equal(await countRequests('/api/admin/staff/11/reset-password', 'POST'), 0)
      await p.set('.staff-reset-modal input[type=password]', 'Synthetic-new-password'); await p.evaluate('window.__failReset=true'); await click('Save new password')
      await p.wait('document.querySelector(".staff-reset-modal [role=alert]")?.textContent.includes("Synthetic password")')
      await p.evaluate('window.__failReset=false'); await click('Save new password'); await p.wait('!document.querySelector(".staff-reset-modal")')
      assert.equal(await countRequests('/api/admin/staff/11/reset-password', 'POST'), 2)
    })
    await check('staff deletion is confirmed and selection recovers after deletion', async () => {
      await selectPerson('Synthetic Updated'); const id = await p.evaluate('window.__staff.find(s=>s.username==="synthetic.staff").id')
      await click('Delete', 'document.querySelector(".staff-ui-sensitive-actions")'); assert.equal(await countRequests('/api/admin/staff/' + id, 'DELETE'), 0); await confirm('Cancel')
      await click('Delete', 'document.querySelector(".staff-ui-sensitive-actions")'); await confirm('Delete account'); await p.wait('!document.querySelector(".staff-ui-directory").textContent.includes("Synthetic Updated")')
      assert.match(await p.evaluate('document.querySelector(".staff-ui-details").textContent'), /Amina Rahman/)
    })
    await check('driver and conductor registration, failure feedback and crew deletion confirmation', async () => {
      await p.set('.staff-crew-add-form input', 'Synthetic Driver'); await p.evaluate('window.__failCrew=true'); await click('Add crew member')
      await p.wait('document.querySelector(".staff-crew-management-card [role=alert]")?.textContent.includes("Synthetic crew")')
      await p.evaluate('window.__failCrew=false'); await click('Add crew member'); await p.wait('document.querySelector(".staff-ui-crew-chips").textContent.includes("Synthetic Driver")')
      await p.set('.staff-crew-add-form input', 'Synthetic Conductor'); await p.set('.staff-crew-add-form select', 'conductor'); await click('Add crew member'); await p.wait('document.querySelectorAll(".staff-ui-crew-card")[1].textContent.includes("Synthetic Conductor")')
      await clickLabel('Remove Synthetic Driver'); assert.equal(await p.evaluate('window.__requests.filter(r=>r.path.startsWith("/api/admin/crew/")&&r.method==="DELETE").length'), 0)
      await confirm('Cancel'); await clickLabel('Remove Synthetic Driver'); await confirm('Remove name')
      await p.wait('![...document.querySelectorAll("button")].some(e=>e.getAttribute("aria-label")==="Remove Synthetic Driver")')
    })
    await check('bus search matches registration and display name', async () => {
      await p.set('input[aria-label="Search buses"]', 'District Line Coach'); assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-bus-card").length'), 1)
      await p.set('input[aria-label="Search buses"]', 'ne-3456'); assert.equal(await p.evaluate('document.querySelectorAll(".staff-ui-bus-card").length'), 1)
      assert.match(await p.evaluate('document.querySelector(".staff-ui-bus-card").textContent'), /077 123 4567/); await p.set('input[aria-label="Search buses"]', '')
    })
    await check('Register Bus validates, keeps optional fields optional, reports failure and prevents duplicate submit', async () => {
      await click('Add bus'); await click('Save bus'); assert.equal(await countRequests('/api/buses', 'POST'), 0)
      assert.equal(await p.evaluate('document.querySelectorAll(".staff-bus-modal input[required]").length'), 1)
      await p.set('.staff-bus-modal input[maxlength="40"]', 'SYNTH-9000'); await p.evaluate('window.__failBus=true'); await click('Save bus')
      await p.wait('document.querySelector(".staff-bus-modal [role=alert]")?.textContent.includes("Synthetic bus")')
      await p.evaluate('window.__failBus=false;window.__delayWrite=1000'); await click('Save bus')
      assert.equal(await p.evaluate('document.querySelector(".staff-bus-modal button[type=submit]").disabled'), true)
      await p.evaluate('document.querySelector(".staff-bus-modal form").requestSubmit()'); await p.wait('!document.querySelector(".staff-bus-modal")'); await p.evaluate('window.__delayWrite=0')
      assert.equal(await countRequests('/api/buses', 'POST'), 2); assert.match(await p.evaluate('document.querySelector(".staff-ui-bus-grid").textContent'), /SYNTH-9000/)
    })
    await check('bus contact and display name save via existing fields', async () => {
      await click('Add bus'); await p.set('.staff-bus-modal input[maxlength="40"]', 'SYNTH-9001'); await p.set('.staff-bus-modal input[type=tel]', '0771234567'); await p.set('.staff-bus-modal input[placeholder="District Line Coach"]', 'Synthetic Coast Coach'); await click('Save bus'); await p.wait('!document.querySelector(".staff-bus-modal")')
      assert.match(await p.evaluate('document.querySelector(".staff-ui-bus-grid").textContent'), /0771234567/)
      assert.match(await p.evaluate('document.querySelector(".staff-ui-bus-grid").textContent'), /Synthetic Coast Coach/)
    })
    await check('bus delete confirmation and inactive bus reactivation preserve existing workflows', async () => {
      await clickLabel('Delete bus SYNTH-9001'); assert.equal(await p.evaluate('window.__requests.filter(r=>r.path.startsWith("/api/buses/")&&r.method==="DELETE").length'), 0)
      await confirm('Cancel'); await clickLabel('Delete bus SYNTH-9001'); await confirm('Continue'); await p.wait('!document.querySelector(".staff-ui-bus-grid").textContent.includes("SYNTH-9001")')
      await click('Reactivate'); await p.wait('!document.querySelector(".staff-ui-bus-card.is-inactive")')
    })
    await check('new buses refresh Trip Controls and Bus No suggestions without duplicate entries', async () => {
      await click('Dashboard'); await p.wait('!!document.querySelector(".trip-controls-filters select")'); await pause(250)
      const options = await p.evaluate('[...document.querySelectorAll(".trip-controls-filters label:nth-child(2) select option")].map(e=>e.value)')
      assert.equal(options.filter(value => value === 'SYNTH-9000').length, 1)
      await click('Accounts'); await p.wait('!!document.querySelector(".accounts-revenue-mode")')
      const accountLists = await p.evaluate('[...document.querySelectorAll(".accounts-revenue-mode label")].filter(e=>e.textContent.startsWith("Bus number")).map(e=>[...e.querySelectorAll("option")].map(o=>o.value))')
      assert.equal(accountLists.length, 2); accountLists.forEach(values => { assert.equal(values.filter(value => value === 'SYNTH-9000').length, 1); assert.equal(new Set(values).size, values.length) })
      await click('Home'); await p.wait('!![...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Add crew details")'); await click('Add crew details'); await p.wait('!!document.querySelector("#crew-bus-numbers")')
      const values = await p.evaluate('[...document.querySelectorAll("#crew-bus-numbers option")].map(e=>e.value)')
      assert.equal(values.filter(value => value === 'SYNTH-9000').length, 1); assert.equal(new Set(values).size, values.length)
      assert.equal(await p.evaluate('[...document.querySelectorAll("#crew-conductor-names option")].some(e=>e.value==="Synthetic Conductor")'), true)
      assert.equal(await p.evaluate('document.querySelector("input[list=crew-bus-numbers]").value'), 'BUS-ONE'); await click('Close', 'document.querySelector(".modal")')
      await click('Staff')
    })
    await check('Staff data loading error is announced and Retry restores the directory', async () => {
      await p.evaluate('window.__failLoad=true'); await click('Home'); await click('Staff'); await p.wait('!!document.querySelector(".staff-ui-notice")')
      await p.evaluate('window.__failLoad=false'); await click('Retry'); await p.wait('!document.querySelector(".staff-ui-notice")')
    })
    await check('empty staff directory and crew and bus states remain usable', async () => {
      await p.evaluate('window.__staff=[];window.__crew=[];window.__fleet=[]'); await click('Home'); await click('Staff'); await p.wait('document.querySelectorAll(".staff-ui-directory-item").length===0')
      assert.match(await p.evaluate('document.querySelector(".staff-ui-directory").textContent'), /Your directory is ready/)
      assert.match(await p.evaluate('document.querySelector(".staff-ui-bus-contacts-card")?.textContent || document.querySelector(".staff-bus-contacts-card").textContent'), /No buses registered yet/)
    })
  } finally { await p.close() }

  const staff = await page('staff', false, true)
  try { await check('ordinary staff cannot see administrator Staff navigation or management controls', async () => { assert.equal(await staff.evaluate('[...document.querySelectorAll(".nav-button")].some(e=>e.textContent.trim()==="Staff")'), false); assert.equal(await staff.evaluate('!!document.querySelector(".staff-ui-page")'), false) }) } finally { await staff.close() }
}

let runner = fs.readFileSync(path.join(__dirname, 'security/browser-local.cjs'), 'utf8')
  .replace("path.resolve(__dirname, '../..')", "path.resolve(__dirname, '..')")
  .replaceAll('artifacts/security-local', output)
  .replace("await staffAdmin.clickText('Edit');", "await staffAdmin.clickText('Edit staff');")
if (baseline) runner = runner.replace("const dist = path.join(root, 'dist')", "const dist = path.join(root, 'artifacts/staff-ui-review/baseline-build')")

// Extend the current regression harness without modifying its release-candidate source.
const fixtureSource = '(' + installReviewFixture.toString() + ')();'
const additions = `
    source=source.replace('async function page(role,baseline=false){','async function page(role,baseline=false,review=false){');
    source=source.replace(${JSON.stringify("await a.clickText('Close',`document.querySelector('.modal')`)")},${JSON.stringify("await a.clickText('Cancel',`document.querySelector('.modal')`)")});
    source=source.replace(' window.fetch=async',${JSON.stringify(' if(${review}){' + fixtureSource + '}\n window.fetch=async').replace('\\n', '\\n')});
    source=source.replace(" if(p===", " if(window.__review){const response=await window.__reviewResponse(p,m,body);if(response)return response;}\\n if(p===");
    ${baseline ? "source=source.replace('for(const baseline of [false])','for(const baseline of [])');" : ''}
    source=source.replace("fs.writeFileSync('artifacts/staff-ui-review/browser-results.json'",${JSON.stringify('await (' + staffChecks.toString() + ')({page,check,assert,pause,fs,baseline:' + baseline + '});\n')}+"fs.writeFileSync('artifacts/staff-ui-review/browser-results.json'");
`
// Baseline capture uses only the immutable initial UI and fixture data, no actions.
if (baseline) {
  runner = runner.replace('    const extra=String.raw`', '    const unusedExtra=String.raw`')
    .replace('extra+"\\n fs.writeFileSync', '"\\n fs.writeFileSync')
}
runner = runner.replace('    const boundedFetch=', additions + '\n    const boundedFetch=')
const compiled = new Module(__filename, module)
compiled.filename = __filename
compiled.paths = module.paths
compiled._compile(runner, __filename)
