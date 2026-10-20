import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { ROUTES, SEAT_LAYOUT } from '../data/seatLayout'

const SEAT_CATEGORIES = ['Standard', 'Intermediate', 'Special', 'Agent / Extra']
const DEFAULT_CARGO_ROWS = [
  { description: 'Cash on Hand', tag: 'Immediate', amount: '0' },
  { description: 'Pending', tag: 'COD / Receive', amount: '0' },
  { description: 'Waybill Commercial', tag: 'Heavy Cartons', amount: '0' },
  { description: 'Unaccompanied Luggage', tag: 'Bicycle / Bag', amount: '0' },
]

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AccountsRevenue({ data, token, showMessage, onPrint }) {
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
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    setLoadingEntries(true)
    api.adminRevenueEntries(token)
      .then((result) => { if (!cancelled) setEntries(result.entries || []) })
      .catch((error) => { if (!cancelled) showMessage(error.message, true) })
      .finally(() => { if (!cancelled) setLoadingEntries(false) })
    return () => { cancelled = true }
  }, [token, showMessage])

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

  return (
    <main className="content-page accounts-revenue-page">
      <section className="content-card accounts-revenue-titlebar">
        <div><span className="accounts-kicker">● SELECT ACTIVE CORRIDOR</span><h1>Revenue Form ({ROUTES.find((route) => route.code === routeCode)?.short})</h1></div>
        <div className="accounts-route-switch" aria-label="Select route">
          {ROUTES.map((route) => <button key={route.code} type="button" className={routeCode === route.code ? 'active' : ''} onClick={() => { setRouteCode(route.code); setTripId(''); setBusNo(''); setDriverName(''); setConductorName('') }}>{route.label}</button>)}
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        <section className="content-card accounts-trip-details">
          <label>Date<input required type="date" value={date} onChange={(event) => { setDate(event.target.value); setTripId(''); setBusNo(''); setDriverName(''); setConductorName('') }} /></label>
          <label>Bus number<select value={tripId} onChange={(event) => { setTripId(event.target.value); if (!event.target.value) { setBusNo(''); setDriverName(''); setConductorName('') } }}>
            <option value="">Enter bus number manually</option>
            {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.registration_no || trip.bus_no || trip.trip_code}{trip.display_name ? ` (${trip.display_name})` : ''}</option>)}
          </select><input aria-label="Bus number" required maxLength="40" value={busNo} onChange={(event) => { setBusNo(event.target.value); if (tripId) setTripId('') }} placeholder="Bus registration number" /></label>
          <label>Driver<input maxLength="80" value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Driver name" /></label>
          <label>Conductor<input maxLength="80" value={conductorName} onChange={(event) => setConductorName(event.target.value)} placeholder="Conductor name" /></label>
          <label>Number of seats<input readOnly value={`${SEAT_LAYOUT.totalSeats} seats (${seatCount} entered / ${Math.max(0, SEAT_LAYOUT.totalSeats - seatCount)} remaining)`} /></label>
          <label>Route<input readOnly value={ROUTES.find((route) => route.code === routeCode)?.short || ''} /></label>
        </section>

        <div className="accounts-revenue-columns">
          <section className="content-card accounts-revenue-panel">
            <div className="accounts-panel-heading"><h2>Revenue from Seats</h2><span>PASS-MANIFEST</span></div>
            <div className="daily-revenue-table-wrap"><table className="accounts-seat-table"><thead><tr><th>Number of seats</th><th>Amount (Rs.)</th><th>Total (Rs.)</th></tr></thead><tbody>
              {seatRows.map((row, index) => <tr key={row.category}>
                <td className="accounts-seat-count-cell"><input aria-label={`${row.category} number of seats`} type="number" min="0" max="49" step="1" value={row.count} onChange={(event) => updateSeat(index, 'count', event.target.value)} /><span>{row.category}</span></td>
                <td><input aria-label={`${row.category} fare amount`} type="number" min="0" step="1" value={row.amount} onChange={(event) => updateSeat(index, 'amount', event.target.value)} /></td>
                <td>{money(seatTotals[index])}</td>
              </tr>)}
            </tbody></table></div>
            <div className="accounts-subtotal"><span>Sub total</span><strong>{money(seatSubtotal)}</strong></div>
          </section>

          <section className="content-card accounts-revenue-panel">
            <div className="accounts-panel-heading"><h2>Revenue from Cargo</h2><span>LUGGAGE & WAYBILLS</span></div>
            <div className="daily-revenue-table-wrap"><table className="accounts-cargo-table"><thead><tr><th>Description</th><th>Amount (Rs.)</th></tr></thead><tbody>
              {cargoRows.map((row, index) => <tr key={`cargo-${index}`}>
                <td className="accounts-cargo-description"><input aria-label="Cargo description" maxLength="120" required value={row.description} onChange={(event) => updateCargo(index, 'description', event.target.value)} />{row.tag ? <span className="accounts-cargo-tag">{row.tag}</span> : null}<button type="button" className="accounts-remove-row" aria-label={`Remove ${row.description || 'cargo'} row`} onClick={() => setCargoRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button></td>
                <td><input aria-label="Cargo amount" type="number" min="0" step="1" value={row.amount} onChange={(event) => updateCargo(index, 'amount', event.target.value)} /></td>
              </tr>)}
            </tbody></table></div>
            <button type="button" className="accounts-add-row" onClick={() => setCargoRows((current) => current.length < 30 ? [...current, { description: '', tag: '', amount: '0' }] : current)}>+ Add custom cargo row</button>
            <div className="accounts-subtotal"><span>Sub total</span><strong>{money(cargoSubtotal)}</strong></div>
          </section>
        </div>

        <section className="content-card accounts-total-card">
          <div><span>GROSS SETTLEMENT AMOUNT</span><h2>Total Revenue</h2></div><strong>{money(totalRevenue)}</strong>
          <div className="accounts-revenue-actions">
            <span className="accounts-live-status">● Draft / Unreconciled · Entry locks after submission</span>
            <button type="button" className="ghost-button" onClick={resetForm}>Reset form</button>
            <button type="button" className="secondary-button" onClick={onPrint}>Print manifest voucher</button>
            <button type="button" className="secondary-button" onClick={exportCsv}>Export CSV</button>
            <button type="submit" className="primary-button" disabled={saving || !busNo.trim() || seatCount > SEAT_LAYOUT.totalSeats}>{saving ? 'Saving…' : '✓ Submit & lock revenue entry'}</button>
          </div>
        </section>
      </form>

      <section className="content-card accounts-recent-card">
        <div className="accounts-panel-heading"><div><h2>Recent operational revenue submissions</h2><p>Locked manual revenue entries.</p></div><span>{loadingEntries ? 'Loading…' : `${entries.length} ENTRIES`}</span></div>
        <div className="daily-revenue-table-wrap"><table><thead><tr><th>Entry</th><th>Date</th><th>Bus No</th><th>Corridor</th><th>Seat revenue (Rs.)</th><th>Cargo revenue (Rs.)</th><th>Gross total (Rs.)</th><th>Status</th></tr></thead><tbody>
          {entries.map((entry) => <tr key={entry.id}><td>{entry.entry_code}</td><td>{entry.travel_date}</td><td>{entry.bus_no}</td><td>{entry.route_label}</td><td>{money(entry.seat_subtotal)}</td><td>{money(entry.cargo_subtotal)}</td><td><strong>{money(entry.total_revenue)}</strong></td><td><span className="accounts-live-status">Locked</span></td></tr>)}
          {!loadingEntries && !entries.length && <tr><td colSpan="8" className="daily-revenue-empty">No manual revenue submissions yet.</td></tr>}
        </tbody></table></div>
      </section>
    </main>
  )
}
