import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { ROUTES, SEAT_LAYOUT } from '../data/seatLayout'

const SEAT_CATEGORIES = ['Standard', 'Intermediate', 'Special', 'Agent / Extra']
const DEFAULT_CARGO_ROWS = [
  { description: 'Cash on Hand', tag: '', amount: '0' },
  { description: 'Pending Cash', tag: '', amount: '0' },
]

function RevenueRouteForm({ route, data, token, showMessage, onSaved, onPrint, knownBusNumbers }) {
  const [date, setDate] = useState(todayIso)
  const [busNo, setBusNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [conductorName, setConductorName] = useState('')
  const [seatCapacity, setSeatCapacity] = useState(String(SEAT_LAYOUT.totalSeats))
  const [seatRows, setSeatRows] = useState(SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })))
  const [cargoRows, setCargoRows] = useState(() => DEFAULT_CARGO_ROWS.map((row) => ({ ...row })))
  const [saving, setSaving] = useState(false)
  const trips = (data.trips || []).filter((trip) => trip.travel_date === date && trip.route_code === route.code)
  const staffNames = [...new Set((data.crewMembers || []).filter((member) => member.role === 'driver').map((member) => String(member.full_name || '').trim()).filter(Boolean))]
  const conductorNames = [...new Set((data.crewMembers || []).filter((member) => member.role === 'conductor').map((member) => String(member.full_name || '').trim()).filter(Boolean))]
  const selectedTrip = trips.find((trip) => String(trip.registration_no || trip.bus_no || '') === String(busNo))
  const seatCount = seatRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  const seatTotals = seatRows.map((row) => (Number(row.count) || 0) * (Number(row.amount) || 0))
  const seatSubtotal = seatTotals.reduce((sum, value) => sum + value, 0)
  const cargoSubtotal = cargoRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const totalRevenue = seatSubtotal + cargoSubtotal
  const resetRouteForm = () => {
    setDate(todayIso())
    setBusNo('')
    setDriverName('')
    setConductorName('')
    setSeatCapacity(String(SEAT_LAYOUT.totalSeats))
    setSeatRows(SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })))
    setCargoRows(DEFAULT_CARGO_ROWS.map((row) => ({ ...row })))
  }
  useEffect(() => {
    if (!selectedTrip) return
    setBusNo(selectedTrip.registration_no || selectedTrip.bus_no || '')
    setDriverName(selectedTrip.driver_name || '')
    setConductorName(selectedTrip.conductor_name || '')
  }, [selectedTrip])
  const updateSeat = (index, field, value) => setSeatRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  const updateCargo = (index, field, value) => setCargoRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  const submit = async (event) => {
    event.preventDefault()
    if (seatCount > Number(seatCapacity || 0)) return showMessage(`Seat quantities cannot exceed the entered bus capacity of ${seatCapacity || 0}.`, true)
    setSaving(true)
    try {
      const result = await api.createRevenueEntry(token, {
        travel_date: date, route_code: route.code, trip_id: selectedTrip?.id || null, bus_no: busNo,
        driver_name: driverName, conductor_name: conductorName,
        seat_rows: seatRows.map((row) => ({ count: Number(row.count) || 0, amount: Number(row.amount) || 0 })),
        cargo_rows: cargoRows.map((row) => ({ description: row.description, tag: row.tag, amount: Number(row.amount) || 0 })),
      })
      onSaved(result.entry)
      showMessage(`${result.entry.entry_code} saved and locked.`)
      setSeatRows(SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })))
      setCargoRows(DEFAULT_CARGO_ROWS.map((row) => ({ ...row })))
    } catch (error) { showMessage(error.message, true) }
    finally { setSaving(false) }
  }
  const exportCsv = () => {
    const rows = [
      ['Date', 'Bus number', 'Route', 'Entry type', 'Description', 'Quantity', 'Amount (Rs.)', 'Total (Rs.)'],
      ...seatRows.map((row, index) => [date, busNo, route.label, 'Seat', row.category, row.count, row.amount, seatTotals[index]]),
      ...cargoRows.map((row) => [date, busNo, route.label, 'Cargo', `${row.description} (${row.tag})`, 1, row.amount, row.amount]),
      ['', '', '', '', 'Gross total', '', '', totalRevenue],
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `revenue-${date}-${route.code}-${busNo || 'bus'}.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return <form onSubmit={submit} className="accounts-route-revenue-form">
    <section className="content-card accounts-trip-details">
      <h2>{route.label}</h2>
      <label>Trip date<input required type="date" value={date} onChange={(event) => { setDate(event.target.value); setBusNo(''); setDriverName(''); setConductorName('') }} /></label>
      <label>Bus number<select required value={busNo} onChange={(event) => setBusNo(event.target.value)}><option value="">Select a registered bus</option>{knownBusNumbers.map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
      <label>Driver<select value={driverName} onChange={(event) => setDriverName(event.target.value)}><option value="">Select a registered driver</option>{staffNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Conductor<select value={conductorName} onChange={(event) => setConductorName(event.target.value)}><option value="">Select a registered conductor</option>{conductorNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Number of seats<input type="number" min="1" max={SEAT_LAYOUT.totalSeats} step="1" value={seatCapacity} onChange={(event) => setSeatCapacity(event.target.value)} /><small>{seatCount} entered / {Math.max(0, Number(seatCapacity || 0) - seatCount)} remaining</small></label>
    </section>
    <div className="accounts-revenue-columns">
      <section className="content-card accounts-revenue-panel"><div className="accounts-panel-heading"><h2>Revenue from Seats</h2><span>PASS-MANIFEST</span></div><div className="daily-revenue-table-wrap"><table className="accounts-seat-table"><thead><tr><th>Number of seats</th><th>Amount (Rs.)</th><th>Total (Rs.)</th></tr></thead><tbody>{seatRows.map((row, index) => <tr key={row.category}><td className="accounts-seat-count-cell"><input aria-label={`${route.label} ${row.category} number of seats`} type="number" min="0" max={Number(seatCapacity || 0)} step="1" value={row.count} onChange={(event) => updateSeat(index, 'count', event.target.value)} /></td><td><input aria-label={`${route.label} ${row.category} fare amount`} type="number" min="0" step="1" value={row.amount} onChange={(event) => updateSeat(index, 'amount', event.target.value)} /></td><td>{money(seatTotals[index])}</td></tr>)}</tbody></table></div><div className="accounts-subtotal"><span>Subtotal</span><strong>{money(seatSubtotal)}</strong></div></section>
      <section className="content-card accounts-revenue-panel"><div className="accounts-panel-heading"><h2>Revenue from Cargo</h2><span>LUGGAGE &amp; WAYBILLS</span></div><div className="daily-revenue-table-wrap"><table className="accounts-cargo-table"><thead><tr><th>Description</th><th>Amount (Rs.)</th></tr></thead><tbody>{cargoRows.map((row, index) => <tr key={`cargo-${index}`}><td className="accounts-cargo-description"><input aria-label={`${route.label} cargo description`} maxLength="120" required value={row.description} onChange={(event) => updateCargo(index, 'description', event.target.value)} />{row.tag ? <span className="accounts-cargo-tag">{row.tag}</span> : null}<button type="button" className="accounts-remove-row" aria-label={`Remove ${row.description || 'cargo'} row`} onClick={() => setCargoRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></td><td><input aria-label={`${route.label} cargo amount`} type="number" min="0" step="1" value={row.amount} onChange={(event) => updateCargo(index, 'amount', event.target.value)} /></td></tr>)}</tbody></table></div><button type="button" className="accounts-add-row" onClick={() => setCargoRows((rows) => rows.length < 30 ? [...rows, { description: '', tag: '', amount: '0' }] : rows)}>+ Add custom cargo row</button><div className="accounts-subtotal"><span>Subtotal</span><strong>{money(cargoSubtotal)}</strong></div></section>
    </div>
    <section className="content-card accounts-total-card"><div className="accounts-total-main"><span className="accounts-currency-badge">LKR</span><div><span>GROSS SETTLEMENT AMOUNT</span><h2>Total Revenue</h2></div><strong>{money(totalRevenue)}</strong></div><div className="accounts-total-controls"><div className="accounts-draft-status"><strong>Status: Draft / Unreconciled</strong><span>Pending Station Master verification</span></div><div className="accounts-revenue-actions"><button type="button" className="ghost-button" onClick={resetRouteForm}>Reset Form</button><button type="button" className="secondary-button" onClick={onPrint}>Print Manifest Voucher</button><button type="button" className="secondary-button" onClick={exportCsv}>Export CSV</button></div><button type="submit" className="primary-button accounts-lock-submit" disabled={saving || !busNo.trim() || seatCount > Number(seatCapacity || 0) || totalRevenue <= 0}>{saving ? 'Saving revenue entry...' : 'Submit & Lock Revenue Entry'}</button>{totalRevenue <= 0 && <span className="accounts-submit-hint">Enter at least one seat or cargo amount to submit.</span>}</div></section>
  </form>
}

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const EXPENSE_CATEGORIES = ['Fuel (Diesel)', 'Driver Salary', 'Conductor Salary', 'Police / Patrol', 'Highway Toll', 'Commission', 'Staff Salary', 'Maintenance']
const DEFAULT_EXPENSE_ITEMS = EXPENSE_CATEGORIES.map((category) => ({ category, description: '', amount: '0' }))
const EXPENSE_DRAFT_KEY = 'district-line-expense-form-draft'

export default function AccountsRevenue({ data, token, showMessage, onPrint, onRefresh, monthlyExpenseForm, setMonthlyExpenseForm, monthlyExpenseSaving, onAddMonthlyExpense }) {
  const [activeSection, setActiveSection] = useState('revenue')
  const [date, setDate] = useState(todayIso)
  const [routeCode, setRouteCode] = useState(ROUTES[0].code)
  const [tripId, setTripId] = useState('')
  const [busNo, setBusNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [conductorName, setConductorName] = useState('')
  const [seatRows, setSeatRows] = useState(SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })))
  const [cargoRows, setCargoRows] = useState(() => DEFAULT_CARGO_ROWS.map((row) => ({ ...row })))
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [revenueDateSearch, setRevenueDateSearch] = useState('')
  const [revenueBusSearch, setRevenueBusSearch] = useState('')
  const [revenuePeriod, setRevenuePeriod] = useState('all')
  const [saving, setSaving] = useState(false)
  const [expenseDate, setExpenseDate] = useState(todayIso)
  const [firstLegDate, setFirstLegDate] = useState(todayIso)
  const [returnLegDate, setReturnLegDate] = useState(todayIso)
  const [expenseRouteCode, setExpenseRouteCode] = useState(ROUTES[0].code)
  const [expenseTripId, setExpenseTripId] = useState('')
  const [expenseRevenueEntryId, setExpenseRevenueEntryId] = useState('')
  const [expenseReturnTripId, setExpenseReturnTripId] = useState('')
  const [expenseReturnRevenueEntryId, setExpenseReturnRevenueEntryId] = useState('')
  const [expenseBusNo, setExpenseBusNo] = useState('')
  const [expenseDriverName, setExpenseDriverName] = useState('')
  const [expenseConductorName, setExpenseConductorName] = useState('')
  const [expenseItems, setExpenseItems] = useState(() => DEFAULT_EXPENSE_ITEMS.map((item) => ({ ...item })))
  const [divideExpenses, setDivideExpenses] = useState(true)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseSubmissions, setExpenseSubmissions] = useState([])
  const [loadingExpenseSubmissions, setLoadingExpenseSubmissions] = useState(true)
  const [expenseLedgerView, setExpenseLedgerView] = useState('trip')
  const [expenseDateSearch, setExpenseDateSearch] = useState('')
  const [expenseBusSearch, setExpenseBusSearch] = useState('')
  const [expensePeriod, setExpensePeriod] = useState('all')
  const [monthlyExpensesFilter, setMonthlyExpensesFilter] = useState('')

  const knownBusNumbers = [...new Set((data.buses || []).map((bus) => String(bus.registration_no || '').trim()).filter(Boolean))]

  const trips = useMemo(
    () => (data.trips || []).filter((trip) => trip.travel_date === date && trip.route_code === routeCode),
    [data.trips, date, routeCode],
  )
  const selectedTrip = trips.find((trip) => String(trip.id) === String(tripId)) || null

  useEffect(() => {
    if (tripId && !trips.some((trip) => String(trip.id) === String(tripId))) setTripId('')
  }, [trips, tripId])

  useEffect(() => {
    if (!selectedTrip) return
    setBusNo(selectedTrip.registration_no || selectedTrip.bus_no || '')
    setDriverName(selectedTrip.driver_name || '')
    setConductorName(selectedTrip.conductor_name || '')
  }, [selectedTrip])

  const seatCount = seatRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  const seatTotals = seatRows.map((row) => (Number(row.count) || 0) * (Number(row.amount) || 0))
  const seatSubtotal = seatTotals.reduce((sum, value) => sum + value, 0)
  const cargoSubtotal = cargoRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const totalRevenue = seatSubtotal + cargoSubtotal
  const expenseTotal = expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const firstLegAmount = divideExpenses ? Math.floor(expenseTotal / 2) : expenseTotal
  const returnLegAmount = divideExpenses ? expenseTotal - firstLegAmount : 0
  const pairedExpenseRouteCode = expenseRouteCode === 'KTY_CMB' ? 'CMB_KTY' : 'KTY_CMB'
  const expenseTrips = useMemo(
    () => (data.trips || []).filter((trip) => trip.travel_date === firstLegDate && trip.route_code === expenseRouteCode),
    [data.trips, firstLegDate, expenseRouteCode],
  )
  const returnExpenseTrips = useMemo(
    () => (data.trips || []).filter((trip) => trip.travel_date === returnLegDate && trip.route_code === pairedExpenseRouteCode),
    [data.trips, returnLegDate, pairedExpenseRouteCode],
  )
  const selectedExpenseTrip = expenseTrips.find((trip) => String(trip.id) === String(expenseTripId)) || null
  const selectedExpenseReturnTrip = returnExpenseTrips.find((trip) => String(trip.id) === String(expenseReturnTripId)) || null
  const expenseRevenueBusOptions = entries
    .filter((entry) => entry.travel_date === firstLegDate && entry.route_code === expenseRouteCode && String(entry.bus_no || '').trim())
    .filter((entry) => !expenseTrips.some((trip) => String(trip.registration_no || trip.bus_no || '').trim().toLowerCase() === String(entry.bus_no || '').trim().toLowerCase()))
  const returnExpenseRevenueBusOptions = entries
    .filter((entry) => entry.travel_date === returnLegDate && entry.route_code === pairedExpenseRouteCode && String(entry.bus_no || '').trim())
    .filter((entry) => !returnExpenseTrips.some((trip) => String(trip.registration_no || trip.bus_no || '').trim().toLowerCase() === String(entry.bus_no || '').trim().toLowerCase()))
  const selectedExpenseRevenueEntry = expenseRevenueBusOptions.find((entry) => String(entry.id) === String(expenseRevenueEntryId))
    || returnExpenseRevenueBusOptions.find((entry) => String(entry.id) === String(expenseReturnRevenueEntryId))
    || null
  const pairedExpenseTrip = (data.trips || []).find((trip) => trip.travel_date === returnLegDate
    && trip.route_code === pairedExpenseRouteCode
    && String(trip.registration_no || trip.bus_no || '').toLowerCase() === expenseBusNo.trim().toLowerCase()) || null
  const getLegRevenue = (code, legDate) => {
    const matchesBus = (value) => !expenseBusNo.trim() || String(value || '').trim().toLowerCase() === expenseBusNo.trim().toLowerCase()
    const daily = (data.dailyRevenue || []).filter((row) => row.travel_date === legDate && row.route_code === code && matchesBus(row.registration_no))
    const manual = entries.filter((row) => row.travel_date === legDate && row.route_code === code && matchesBus(row.bus_no))
    const source = manual.length ? manual : daily
    return source.reduce((sum, row) => sum + Number(row.total_revenue || 0), 0)
  }
  const firstLegRevenue = getLegRevenue(expenseRouteCode, firstLegDate)
  const returnLegRevenue = getLegRevenue(pairedExpenseRouteCode, returnLegDate)
  const roundRevenue = firstLegRevenue + returnLegRevenue
  const netReturn = roundRevenue - expenseTotal
  const filteredExpenseSubmissions = expenseSubmissions.filter((submission) => {
    const submissionDate = String(submission.expense_date || '').slice(0, 10)
    if (expenseDateSearch && submissionDate !== expenseDateSearch) return false
    if (expenseBusSearch && !String(submission.bus_no || '').toLowerCase().includes(expenseBusSearch.trim().toLowerCase())) return false
    if (expensePeriod !== 'all') {
      const parsedDate = new Date(`${submissionDate}T00:00:00`)
      if (Number.isNaN(parsedDate.getTime())) return false
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - (expensePeriod === 'week' ? 6 : 29))
      if (parsedDate < cutoff || parsedDate > today) return false
    }
    return true
  })
  const monthlyExpenseEntries = (data.expenses || []).filter((expense) => !expense.duty_id && (expense.expense_source === 'monthly' || expense.category === 'Monthly Expense')).sort((a, b) => String(b.expense_date || '').localeCompare(String(a.expense_date || '')) || Number(b.id) - Number(a.id))
  const selectedMonthlyExpensesFilter = monthlyExpensesFilter || String(monthlyExpenseEntries[0]?.expense_date || todayIso()).slice(0, 7)
  const filteredMonthlyExpenseEntries = monthlyExpenseEntries.filter((expense) => String(expense.expense_date || '').slice(0, 7) === selectedMonthlyExpensesFilter)
  const filteredMonthlyExpenseTotal = filteredMonthlyExpenseEntries.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const filteredRevenueEntries = entries.filter((entry) => {
    const entryDate = String(entry.travel_date || '').slice(0, 10)
    if (revenueDateSearch && entryDate !== revenueDateSearch) return false
    if (revenueBusSearch && !String(entry.bus_no || '').toLowerCase().includes(revenueBusSearch.trim().toLowerCase())) return false
    if (revenuePeriod !== 'all') {
      const parsedDate = new Date(`${entryDate}T00:00:00`)
      if (Number.isNaN(parsedDate.getTime())) return false
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - (revenuePeriod === 'week' ? 6 : 29))
      if (parsedDate < cutoff || parsedDate > today) return false
    }
    return true
  })
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(EXPENSE_DRAFT_KEY) || 'null')
      if (!draft || typeof draft !== 'object') return
      if (draft.expenseDate) setExpenseDate(draft.expenseDate)
      if (draft.firstLegDate) setFirstLegDate(draft.firstLegDate)
      if (draft.returnLegDate) setReturnLegDate(draft.returnLegDate)
      if (draft.expenseRouteCode && ROUTES.some((route) => route.code === draft.expenseRouteCode)) setExpenseRouteCode(draft.expenseRouteCode)
      if (Array.isArray(draft.expenseItems)) setExpenseItems(draft.expenseItems)
      if (draft.expenseBusNo) setExpenseBusNo(draft.expenseBusNo)
      if (draft.expenseDriverName) setExpenseDriverName(draft.expenseDriverName)
      if (draft.expenseConductorName) setExpenseConductorName(draft.expenseConductorName)
      if (typeof draft.divideExpenses === 'boolean') setDivideExpenses(draft.divideExpenses)
    } catch {
      localStorage.removeItem(EXPENSE_DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingEntries(true)
    api.adminRevenueEntries(token)
      .then((result) => { if (!cancelled) setEntries(result.entries || []) })
      .catch((error) => { if (!cancelled) showMessage(error.message, true) })
      .finally(() => { if (!cancelled) setLoadingEntries(false) })
    return () => { cancelled = true }
  }, [token, showMessage])

  useEffect(() => {
    let cancelled = false
    api.adminExpenseSubmissions(token)
      .then((result) => { if (!cancelled) setExpenseSubmissions(result.submissions || []) })
      .catch((error) => { if (!cancelled) showMessage(error.message, true) })
      .finally(() => { if (!cancelled) setLoadingExpenseSubmissions(false) })
    return () => { cancelled = true }
  }, [token, showMessage])

  useEffect(() => {
    const selectedBus = selectedExpenseTrip || selectedExpenseReturnTrip || selectedExpenseRevenueEntry
    if (!selectedBus) return
    setExpenseBusNo(selectedBus.registration_no || selectedBus.bus_no || '')
    setExpenseDriverName(selectedBus.driver_name || '')
    setExpenseConductorName(selectedBus.conductor_name || '')
  }, [selectedExpenseTrip, selectedExpenseReturnTrip, selectedExpenseRevenueEntry])

  const updateSeat = (index, field, value) => {
    setSeatRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  }

  const updateCargo = (index, field, value) => {
    setCargoRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  }

  const resetForm = () => {
    setDate(todayIso())
    setRouteCode(ROUTES[0].code)
    setTripId('')
    setBusNo('')
    setDriverName('')
    setConductorName('')
    setSeatRows(SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })))
    setCargoRows(DEFAULT_CARGO_ROWS.map((row) => ({ ...row })))
  }

  const exportCsv = () => {
    const csvRows = [
      ['Date', 'Bus number', 'Route', 'Entry type', 'Description', 'Quantity', 'Amount (Rs.)', 'Total (Rs.)'],
      ...seatRows.map((row, index) => [date, busNo, ROUTES.find((route) => route.code === routeCode)?.label, 'Seat', row.category, row.count, row.amount, seatTotals[index]]),
      ...cargoRows.map((row) => [date, busNo, ROUTES.find((route) => route.code === routeCode)?.label, 'Cargo', `${row.description} (${row.tag})`, 1, row.amount, row.amount]),
      ['', '', '', '', 'Gross total', '', '', totalRevenue],
    ]
    const csv = csvRows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `revenue-${date}-${busNo || 'bus'}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (seatCount > SEAT_LAYOUT.totalSeats) {
      showMessage(`Seat quantities cannot exceed ${SEAT_LAYOUT.totalSeats}.`, true)
      return
    }
    setSaving(true)
    try {
      const result = await api.createRevenueEntry(token, {
        travel_date: date,
        route_code: routeCode,
        trip_id: tripId || null,
        bus_no: busNo,
        driver_name: driverName,
        conductor_name: conductorName,
        seat_rows: seatRows.map((row) => ({ count: Number(row.count) || 0, amount: Number(row.amount) || 0 })),
        cargo_rows: cargoRows.map((row) => ({ description: row.description, tag: row.tag, amount: Number(row.amount) || 0 })),
      })
      setEntries((current) => [result.entry, ...current].slice(0, 100))
      showMessage(`${result.entry.entry_code} saved and locked.`)
      setSeatRows(SEAT_CATEGORIES.map((category) => ({ category, count: '0', amount: '0' })))
      setCargoRows(DEFAULT_CARGO_ROWS.map((row) => ({ ...row })))
    } catch (error) {
      showMessage(error.message, true)
    } finally {
      setSaving(false)
    }
  }

  const handleExpenseSubmit = async (event) => {
    event.preventDefault()
    if (!expenseBusNo.trim()) {
      showMessage('Choose a bus or enter its registration number.', true)
      return
    }
    if (expenseTotal <= 0) {
      showMessage('Enter at least one expense amount greater than zero.', true)
      return
    }
    setSavingExpense(true)
    try {
      const result = await api.createAdminExpenseSubmission(token, {
        expense_date: expenseDate,
        bus_no: expenseBusNo.trim(),
        driver_name: expenseDriverName.trim(),
        conductor_name: expenseConductorName.trim(),
        route_code: expenseRouteCode,
        first_leg_date: firstLegDate,
        return_leg_date: returnLegDate,
        first_trip_id: selectedExpenseTrip?.id || null,
        return_trip_id: selectedExpenseReturnTrip?.id || pairedExpenseTrip?.id || null,
        items: expenseItems.filter((item) => Number(item.amount) > 0).map((item) => ({ category: item.category, description: item.description, amount: Number(item.amount) || 0 })),
        gross_revenue: roundRevenue,
        divide_expense: divideExpenses,
      })
      setExpenseSubmissions((current) => [result.submission, ...current].slice(0, 100))
      setExpenseItems(DEFAULT_EXPENSE_ITEMS.map((item) => ({ ...item })))
      localStorage.removeItem(EXPENSE_DRAFT_KEY)
      showMessage(`${result.submission.submission_code} saved and locked.`)
      try {
        await onRefresh?.()
      } catch {
        showMessage('Expense saved, but account totals could not refresh.', true)
      }
    } catch (error) {
      showMessage(error.message, true)
    } finally {
      setSavingExpense(false)
    }
  }

  const resetExpenseForm = () => {
    setExpenseDate(todayIso())
    setFirstLegDate(todayIso())
    setReturnLegDate(todayIso())
    setExpenseRouteCode(ROUTES[0].code)
    setExpenseTripId('')
    setExpenseRevenueEntryId('')
    setExpenseReturnTripId('')
    setExpenseReturnRevenueEntryId('')
    setExpenseBusNo('')
    setExpenseDriverName('')
    setExpenseConductorName('')
    setExpenseItems(DEFAULT_EXPENSE_ITEMS.map((item) => ({ ...item })))
    setDivideExpenses(true)
    localStorage.removeItem(EXPENSE_DRAFT_KEY)
  }

  const saveExpenseDraft = () => {
    localStorage.setItem(EXPENSE_DRAFT_KEY, JSON.stringify({
      expenseDate, firstLegDate, returnLegDate, expenseRouteCode, expenseItems, expenseBusNo,
      expenseDriverName, expenseConductorName, divideExpenses,
    }))
    showMessage('Expense draft saved in this browser.')
  }

  const exportExpenseCsv = () => {
    const rows = [
      ['Date', 'Bus number', 'Corridor', 'Category', 'Description', 'Amount (Rs.)'],
      ...expenseItems.map((item) => [expenseDate, expenseBusNo, ROUTES.find((route) => route.code === expenseRouteCode)?.label, item.category, item.description, item.amount]),
      ['', '', '', 'Total expenses', '', expenseTotal],
      ['', '', '', 'First leg share', '', firstLegAmount],
      ['', '', '', 'Return leg share', '', returnLegAmount],
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `expenses-${expenseDate}-${expenseBusNo || 'bus'}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <main className="content-page accounts-revenue-page">
      <section className="content-card accounts-revenue-titlebar">
        <div><span className="accounts-kicker">PASSENGER AND CARGO ACCOUNTS</span><h1>Revenue and Expenses</h1></div>
        <div className="accounts-route-switch accounts-section-switch" aria-label="Select account section" role="tablist">
          <button type="button" role="tab" aria-selected={activeSection === 'revenue'} className={activeSection === 'revenue' ? 'active' : ''} onClick={() => setActiveSection('revenue')}>Revenue</button>
          <button type="button" role="tab" aria-selected={activeSection === 'expense'} className={activeSection === 'expense' ? 'active' : ''} onClick={() => setActiveSection('expense')}>Expense</button>
        </div>
      </section>

      {activeSection === 'revenue' ? <>
      <section className="content-card accounts-corridor-selector">
        <span className="accounts-kicker">REVENUE FOR BOTH CORRIDORS</span>
        <p>Complete the forms for each route below.</p>
      </section>

      <div className="accounts-route-revenue-stack">
        {ROUTES.map((route) => <RevenueRouteForm key={route.code} route={route} data={data} token={token} showMessage={showMessage} onSaved={(entry) => setEntries((current) => [entry, ...current].slice(0, 100))} onPrint={onPrint} knownBusNumbers={knownBusNumbers} />)}
      </div>

      <section className="content-card accounts-recent-card">
        <div className="accounts-panel-heading"><div><h2>RECENT OPERATIONAL REVENUE SUBMISSIONS</h2><p>Live ledger of manually submitted trip revenue.</p></div><span>{loadingEntries ? 'Loading...' : 'REVENUE LEDGER'}</span></div>
        <div className="accounts-revenue-ledger-filters">
          <label>Date<input type="date" aria-label="Search revenue by date" value={revenueDateSearch} onChange={(event) => setRevenueDateSearch(event.target.value)} /></label>
          <label>Bus No<input type="search" aria-label="Search revenue by bus number" value={revenueBusSearch} onChange={(event) => setRevenueBusSearch(event.target.value)} placeholder="Search bus number" /></label>
          <div className="accounts-revenue-period-filters" role="group" aria-label="Filter revenue by period">
            <button type="button" className={revenuePeriod === 'all' ? 'active' : ''} onClick={() => setRevenuePeriod('all')}>All</button>
            <button type="button" className={revenuePeriod === 'week' ? 'active' : ''} onClick={() => setRevenuePeriod('week')}>Last week</button>
            <button type="button" className={revenuePeriod === 'month' ? 'active' : ''} onClick={() => setRevenuePeriod('month')}>Last month</button>
          </div>
        </div>
        <div className="daily-revenue-table-wrap"><table><thead><tr><th>Date</th><th>Bus No</th><th>Route</th><th>Driver / Conductor</th><th>Seat Revenue</th><th>Cargo Revenue</th><th>Total Revenue</th></tr></thead><tbody>
          {filteredRevenueEntries.map((entry) => <tr key={entry.id}><td>{entry.travel_date}</td><td>{entry.bus_no}</td><td>{entry.route_label}</td><td>{entry.driver_name || '-'} / {entry.conductor_name || '-'}</td><td>{money(entry.seat_subtotal)}</td><td>{money(entry.cargo_subtotal)}</td><td><strong>{money(entry.total_revenue)}</strong></td></tr>)}
          {!loadingEntries && !filteredRevenueEntries.length && <tr><td colSpan="7" className="daily-revenue-empty">{entries.length ? 'No revenue submissions match these filters.' : 'No manual revenue submissions yet.'}</td></tr>}
        </tbody></table></div>
      </section>
      </> : <>
        <section className="accounts-expense-heading">
          <div>
            <span className="accounts-kicker">SELECT ACTIVE CORRIDOR <b>FORM DL-EXP</b></span>
            <h2>Expenses Form (KKY &amp; CMB Operations)</h2>
            <p>Daily highway operating expense reconciliation, driver allowances, toll logs, and twin-corridor cost apportionment.</p>
          </div>
          <div className="accounts-expense-route-tools">
            <span className="accounts-expense-draft-badge">● Status: Draft · Ready for Reconciliation</span>
          </div>
        </section>

        <section className="content-card accounts-expense-details">
          <label>Operating date<input required type="date" value={expenseDate} onChange={(event) => { setExpenseDate(event.target.value); setFirstLegDate(event.target.value); setExpenseTripId(''); setExpenseRevenueEntryId(''); setExpenseReturnTripId(''); setExpenseReturnRevenueEntryId(''); setExpenseBusNo('') }} /></label>
          <label>Bus number<select required value={expenseBusNo} onChange={(event) => {
            const busNo = event.target.value
            setExpenseBusNo(busNo)
            const normalizedBusNo = busNo.trim().toLowerCase()
            const firstTrip = expenseTrips.find((trip) => String(trip.registration_no || trip.bus_no || '').trim().toLowerCase() === normalizedBusNo)
            const returnTrip = returnExpenseTrips.find((trip) => String(trip.registration_no || trip.bus_no || '').trim().toLowerCase() === normalizedBusNo)
            const firstRevenue = expenseRevenueBusOptions.find((entry) => String(entry.bus_no || '').trim().toLowerCase() === normalizedBusNo)
            const returnRevenue = returnExpenseRevenueBusOptions.find((entry) => String(entry.bus_no || '').trim().toLowerCase() === normalizedBusNo)
            setExpenseTripId(firstTrip ? String(firstTrip.id) : '')
            setExpenseRevenueEntryId(!firstTrip && firstRevenue ? String(firstRevenue.id) : '')
            setExpenseReturnTripId(returnTrip ? String(returnTrip.id) : '')
            setExpenseReturnRevenueEntryId(!returnTrip && returnRevenue ? String(returnRevenue.id) : '')
            const crewSource = firstTrip || returnTrip || firstRevenue || returnRevenue
            setExpenseDriverName(crewSource?.driver_name || '')
            setExpenseConductorName(crewSource?.conductor_name || '')
            if (!busNo) { setExpenseDriverName(''); setExpenseConductorName('') }
          }}><option value="">Select a registered bus</option>{knownBusNumbers.map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
          <label>Lead driver<select value={expenseDriverName} onChange={(event) => setExpenseDriverName(event.target.value)}><option value="">Select a registered driver</option>{(data.crewMembers || []).filter((member) => member.role === 'driver').map((member) => <option key={member.id} value={member.full_name}>{member.full_name}</option>)}</select></label>
          <label>Trip conductor<select value={expenseConductorName} onChange={(event) => setExpenseConductorName(event.target.value)}><option value="">Select a registered conductor</option>{(data.crewMembers || []).filter((member) => member.role === 'conductor').map((member) => <option key={member.id} value={member.full_name}>{member.full_name}</option>)}</select></label>
        </section>

        <section className="accounts-expense-sector-grid">
          {[{ code: expenseRouteCode, label: 'SECTOR REFERENCE 01 · UP LEG', date: firstLegDate, setDate: setFirstLegDate, amount: firstLegRevenue, trip: selectedExpenseTrip }, { code: pairedExpenseRouteCode, label: 'SECTOR REFERENCE 02 · RETURN LEG', date: returnLegDate, setDate: setReturnLegDate, amount: returnLegRevenue, trip: pairedExpenseTrip }].map((sector, index) => {
            const route = ROUTES.find((item) => item.code === sector.code) || ROUTES[0]
            return <article className="content-card accounts-expense-sector" key={sector.code}>
              <span className="accounts-sector-arrow">{index === 0 ? '→' : '←'}</span>
              <div><small>{sector.label}</small><h3>{route.label}</h3><label className="accounts-sector-trip-date">Trip date<input type="date" value={sector.date} onChange={(event) => { sector.setDate(event.target.value); if (index === 0) { setExpenseDate(event.target.value); setExpenseTripId(''); setExpenseRevenueEntryId(''); setExpenseReturnTripId(''); setExpenseReturnRevenueEntryId(''); setExpenseBusNo('') } else { setExpenseReturnTripId(''); setExpenseReturnRevenueEntryId(''); if (expenseReturnTripId || expenseReturnRevenueEntryId) setExpenseBusNo('') } }} /></label><p>{sector.trip?.trip_code ? `Coach #${sector.trip.trip_code}` : expenseBusNo ? `Coach #${expenseBusNo}` : 'Select the trip date'}</p></div>
              <div className="accounts-sector-revenue"><small>LOGGED REVENUE</small><strong>{money(sector.amount)}</strong></div>
            </article>
          })}
        </section>

        <form className="accounts-expense-main-form" onSubmit={handleExpenseSubmit}>
          <section className="content-card accounts-expense-items-card">
            <div className="accounts-expense-items-heading"><div><h2>Highway Transit Expense Items</h2><p>Enter expense amounts for this bus and operating date.</p></div><span>Currency: Sri Lankan Rupee (LKR)</span></div>
            <div className="accounts-expense-items-grid">
              {expenseItems.map((item, index) => <div className="accounts-expense-item" key={`expense-item-${index}`}>
                {index < EXPENSE_CATEGORIES.length ? <label>{item.category}</label> : <label>Custom item<input aria-label="Expense category" required maxLength="80" value={item.category} onChange={(event) => setExpenseItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, category: event.target.value } : row))} placeholder="Category" /></label>}
                <div className="accounts-expense-amount"><span>Rs.</span><input aria-label={`${item.category} amount`} type="number" min="0" step="1" value={item.amount} onChange={(event) => setExpenseItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))} /></div>
                <input className="accounts-expense-item-note" aria-label={`${item.category} note`} maxLength="200" value={item.description} onChange={(event) => setExpenseItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} placeholder="Optional note" />
                {index >= EXPENSE_CATEGORIES.length && <button type="button" className="accounts-remove-row" aria-label={`Remove ${item.category || 'expense'} item`} onClick={() => setExpenseItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button>}
              </div>)}
            </div>
            <div className="accounts-expense-items-footer"><span>Default expense categories are preloaded. Add a row for any other cost.</span><button type="button" className="primary-button small" onClick={() => setExpenseItems((current) => current.length < 30 ? [...current, { category: '', description: '', amount: '0' }] : current)}>+ Add Expense Item</button></div>
          </section>

          <div className="accounts-expense-summary-grid">
            <section className="accounts-expense-grand-total">
              <small>AGGREGATE DISBURSAL</small><span>TOTAL EXPENSE LOGGED</span><strong>{money(expenseTotal)}</strong>
              <footer>Combined fuel, crew, toll and operating outlay <b>{expenseItems.filter((item) => Number(item.amount) > 0).length} line items</b></footer>
            </section>
            <section className="content-card accounts-expense-split-card">
              <div className="accounts-expense-split-heading"><button type="button" className={divideExpenses ? 'active' : ''} onClick={() => setDivideExpenses((value) => !value)}>▤ Divide Expense</button><span>Split pooled operating cost across return legs</span><b>{divideExpenses ? '50% / 50% APPORTIONMENT' : 'UNSPLIT'}</b></div>
              <div className="accounts-expense-leg-grid">
                {[{ routeCode: expenseRouteCode, amount: firstLegAmount, label: 'Leg 1' }, { routeCode: pairedExpenseRouteCode, amount: returnLegAmount, label: 'Leg 2' }].map((leg) => <article key={leg.label}><small>{expenseDate} <b>{leg.label}</b></small><h3>{ROUTES.find((route) => route.code === leg.routeCode)?.label}</h3><strong>{money(leg.amount)}</strong><span>{divideExpenses ? '50%' : leg.label === 'Leg 1' ? '100%' : '0%'}</span></article>)}
              </div>
              <div className="accounts-expense-balance"><div><small>GROSS ROUND REVENUE</small><strong>{money(roundRevenue)}</strong></div><div><small>TOTAL ROUND OUTFLOW</small><strong>{money(expenseTotal)}</strong></div><div><small>NET OPERATING BALANCE</small><strong>{money(netReturn)}{roundRevenue > 0 ? ` (${((netReturn / roundRevenue) * 100).toFixed(1)}% margin)` : ''}</strong></div></div>
            </section>
          </div>

          <section className="content-card accounts-expense-actions">
            <div><button type="button" className="ghost-button" onClick={resetExpenseForm}>Reset to Defaults</button><button type="button" className="secondary-button" onClick={onPrint}>Print Voucher</button><button type="button" className="secondary-button" onClick={exportExpenseCsv}>Export CSV</button></div>
            <div><button type="button" className="secondary-button" onClick={saveExpenseDraft}>Save Draft</button><button type="submit" className="primary-button" disabled={savingExpense || expenseTotal <= 0 || !expenseBusNo.trim()}>{savingExpense ? 'Saving expenses...' : '🔒 Submit & Lock Expenses'}</button></div>
          </section>
        </form>

        <section className="content-card accounts-recent-card accounts-expense-ledger">
          <div className="accounts-panel-heading"><div><h2>Recent Dispatch Expense Submissions</h2><p>Archived and locked ledger records for Highway Express Fleet accounts.</p></div><span>{loadingExpenseSubmissions ? 'Loading...' : `Showing ${Math.min(filteredExpenseSubmissions.length, 100)} of ${expenseSubmissions.length} entries`}</span></div>
          <div className="accounts-expense-ledger-switch" role="group" aria-label="Expense ledger view">
            <button type="button" className={expenseLedgerView === 'trip' ? 'active' : ''} aria-pressed={expenseLedgerView === 'trip'} onClick={() => setExpenseLedgerView('trip')}>Trip</button>
            <button type="button" className={expenseLedgerView === 'route' ? 'active' : ''} aria-pressed={expenseLedgerView === 'route'} onClick={() => setExpenseLedgerView('route')}>Route</button>
          </div>
          <div className="accounts-revenue-ledger-filters">
            <label>Date<input type="date" aria-label="Search expenses by date" value={expenseDateSearch} onChange={(event) => setExpenseDateSearch(event.target.value)} /></label>
            <label>Bus No<input type="search" aria-label="Search expenses by bus number" value={expenseBusSearch} onChange={(event) => setExpenseBusSearch(event.target.value)} placeholder="Search bus number" /></label>
            <div className="accounts-revenue-period-filters" role="group" aria-label="Filter expenses by period">
              <button type="button" className={expensePeriod === 'all' ? 'active' : ''} onClick={() => setExpensePeriod('all')}>All</button>
              <button type="button" className={expensePeriod === 'week' ? 'active' : ''} onClick={() => setExpensePeriod('week')}>Last week</button>
              <button type="button" className={expensePeriod === 'month' ? 'active' : ''} onClick={() => setExpensePeriod('month')}>Last month</button>
            </div>
          </div>
          <div className="daily-revenue-table-wrap"><table>
            {expenseLedgerView === 'trip' ? <>
              <thead><tr><th>Date</th><th>Bus No</th><th>Driver / Conductor</th><th>KKY to CMB date</th><th>CMB to KKY date</th><th>Fuel</th><th>Police</th><th>Total Expense</th><th>Net Return</th><th>Status</th></tr></thead>
              <tbody>
                {filteredExpenseSubmissions.slice(0, 100).map((submission) => {
                  const items = Array.isArray(submission.items) ? submission.items : []
                  const fuel = items.filter((item) => String(item.category || '').toLowerCase().includes('fuel')).reduce((sum, item) => sum + Number(item.amount || 0), 0)
                  const police = items.filter((item) => String(item.category || '').toLowerCase().includes('police')).reduce((sum, item) => sum + Number(item.amount || 0), 0)
                  const firstTrip = (data.trips || []).find((trip) => String(trip.id) === String(submission.first_trip_id))
                  const returnTrip = (data.trips || []).find((trip) => String(trip.id) === String(submission.return_trip_id))
                  const routeDates = { KTY_CMB: '', CMB_KTY: '' }
                  routeDates[submission.route_code] = submission.first_leg_date || submission.expense_date || ''
                  routeDates[submission.route_code === 'KTY_CMB' ? 'CMB_KTY' : 'KTY_CMB'] = submission.return_leg_date || ''
                  if (firstTrip?.route_code) routeDates[firstTrip.route_code] = firstTrip.travel_date || ''
                  if (returnTrip?.route_code) routeDates[returnTrip.route_code] = returnTrip.travel_date || ''
                  if (!routeDates[submission.route_code]) routeDates[submission.route_code] = submission.expense_date || ''
                  const net = Number(submission.gross_revenue || 0) - Number(submission.total_expense || 0)
                  return <tr key={submission.id}><td>{submission.expense_date}</td><td>{submission.bus_no}</td><td>{submission.driver_name || '-'} / {submission.conductor_name || '-'}</td><td>{routeDates.KTY_CMB || '—'}</td><td>{routeDates.CMB_KTY || '—'}</td><td>{money(fuel)}</td><td>{money(police)}</td><td><strong>{money(submission.total_expense)}</strong></td><td>{money(net)}</td><td><span className="accounts-entry-locked">{String(submission.status || 'locked').toUpperCase()} · {submission.submission_code}</span></td></tr>
                })}
                {!loadingExpenseSubmissions && !filteredExpenseSubmissions.length && <tr><td colSpan="10" className="daily-revenue-empty">{expenseSubmissions.length ? 'No expense submissions match these filters.' : 'No dispatch expense submissions yet.'}</td></tr>}
              </tbody>
            </> : <>
              <thead><tr><th>Date</th><th>Bus No</th><th>Route</th><th>Driver / Conductor</th><th>Route Revenue</th><th>Route Expense</th><th>Net Return</th><th>Status</th></tr></thead>
              <tbody>
                {filteredExpenseSubmissions.slice(0, 100).flatMap((submission) => {
                  const legs = [
                    { routeCode: submission.route_code, date: submission.first_leg_date || submission.expense_date, expense: Number(submission.first_leg_share ?? Math.floor(Number(submission.total_expense || 0) / 2)) },
                    { routeCode: submission.route_code === 'KTY_CMB' ? 'CMB_KTY' : 'KTY_CMB', date: submission.return_leg_date || submission.expense_date, expense: Number(submission.return_leg_share ?? (Number(submission.total_expense || 0) - Math.floor(Number(submission.total_expense || 0) / 2))) },
                  ]
                  return legs.map((leg, index) => {
                    const matches = (row) => String(row.bus_no || row.registration_no || '').trim().toLowerCase() === String(submission.bus_no || '').trim().toLowerCase()
                    const manualRevenue = entries.filter((entry) => entry.travel_date === leg.date && entry.route_code === leg.routeCode && matches(entry))
                    const dailyRevenue = (data.dailyRevenue || []).filter((row) => row.travel_date === leg.date && row.route_code === leg.routeCode && matches(row))
                    const routeRevenue = (manualRevenue.length ? manualRevenue : dailyRevenue).reduce((sum, row) => sum + Number(row.total_revenue || 0), 0)
                    return <tr key={`${submission.id}-${index}`}><td>{leg.date}</td><td>{submission.bus_no}</td><td>{ROUTES.find((route) => route.code === leg.routeCode)?.label || leg.routeCode}</td><td>{submission.driver_name || '-'} / {submission.conductor_name || '-'}</td><td>{money(routeRevenue)}</td><td><strong>{money(leg.expense)}</strong></td><td>{money(routeRevenue - leg.expense)}</td><td><span className="accounts-entry-locked">{String(submission.status || 'locked').toUpperCase()} · {submission.submission_code}</span></td></tr>
                  })
                })}
                {!loadingExpenseSubmissions && !filteredExpenseSubmissions.length && <tr><td colSpan="8" className="daily-revenue-empty">{expenseSubmissions.length ? 'No expense submissions match these filters.' : 'No dispatch expense submissions yet.'}</td></tr>}
              </tbody>
            </>}
          </table></div>
        </section>

        <section className="content-card accounts-monthly-expenses-card">
          <div className="accounts-panel-heading"><div><h2>Monthly expenses</h2><p>Monthly expenses entered here appear in the dashboard Profit report when its period is set to Month.</p></div></div>
          <form className="accounts-monthly-expenses-form" onSubmit={onAddMonthlyExpense}>
            <label>Exact date<input required type="date" value={monthlyExpenseForm.expense_date} onChange={(event) => setMonthlyExpenseForm((current) => ({ ...current, expense_date: event.target.value }))} /></label>
            <label>Bus No<select required value={monthlyExpenseForm.bus_no} onChange={(event) => setMonthlyExpenseForm((current) => ({ ...current, bus_no: event.target.value }))}><option value="">Select bus</option>{(data.buses || []).filter((bus) => bus.status !== 'inactive').map((bus) => <option key={bus.id} value={bus.registration_no}>{bus.registration_no}</option>)}</select></label>
            <label>Description<input required maxLength={240} value={monthlyExpenseForm.description} onChange={(event) => setMonthlyExpenseForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>Amount (Rs.)<input required type="number" min="1" step="1" value={monthlyExpenseForm.amount} onChange={(event) => setMonthlyExpenseForm((current) => ({ ...current, amount: event.target.value }))} /></label>
            <button type="submit" className="primary-button" disabled={monthlyExpenseSaving}>{monthlyExpenseSaving ? 'Saving...' : 'Add monthly expense'}</button>
          </form>
        </section>

        <section className="content-card accounts-monthly-expenses-card">
          <div className="accounts-panel-heading"><div><h2>Monthly expenses table</h2><p>Monthly expenses entered through the form above.</p></div><label>Month<input type="month" aria-label="Filter monthly expenses by month" value={selectedMonthlyExpensesFilter} onChange={(event) => setMonthlyExpensesFilter(event.target.value)} /></label></div>
          <div className="daily-revenue-table-wrap"><table><thead><tr><th>Date</th><th>Bus No</th><th>Description</th><th>Amount</th></tr></thead><tbody>
            {filteredMonthlyExpenseEntries.map((expense) => <tr key={expense.id}><td>{String(expense.expense_date || '').slice(0, 10)}</td><td>{expense.bus_no || '—'}</td><td>{expense.description}</td><td><strong>{money(expense.amount)}</strong></td></tr>)}
            {!filteredMonthlyExpenseEntries.length && <tr><td colSpan="3" className="daily-revenue-empty">No monthly expenses for this month.</td></tr>}
            <tr><th colSpan="3">Monthly total</th><th>{money(filteredMonthlyExpenseTotal)}</th></tr>
          </tbody></table></div>
        </section>
      </>}
    </main>
  )
}
