import { useMemo, useState } from 'react'
import { ROUTES } from '../data/seatLayout'

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const summaryMoney = (value) => `Rs. ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }
const routeShortName = (code) => ROUTES.find((route) => route.code === code)?.short || code || 'Unassigned route'

export default function ExpenseSubmissionsTable({ className = '', submissions = [], trips = [], revenueEntries = [], dailyRevenue = [], monthlyExpenses = [], loading = false, error = '' }) {
  const [view, setView] = useState('trip')
  const [dateSearch, setDateSearch] = useState('')
  const [busSearch, setBusSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [monthSearch, setMonthSearch] = useState(currentMonth)
  const busOptions = [...new Set([
    ...submissions.map((submission) => submission.bus_no),
    ...revenueEntries.map((entry) => entry.bus_no),
    ...dailyRevenue.map((entry) => entry.registration_no || entry.bus_no),
    ...trips.map((trip) => trip.registration_no || trip.bus_no),
  ].map((bus) => String(bus || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const dateMatches = (dateValue) => {
    const date = String(dateValue || '').slice(0, 10)
    if (period === 'month') {
      if (!date.startsWith(monthSearch)) return false
    } else if (period === 'week') {
      const parsed = new Date(`${date}T00:00:00`)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 6)
      if (Number.isNaN(parsed.getTime()) || parsed < cutoff || parsed > today) return false
    }
    if (dateSearch && date !== dateSearch) return false
    return true
  }
  const matchesBus = (value) => !busSearch || String(value || '').trim().toLowerCase() === busSearch.trim().toLowerCase()
  const filtered = useMemo(() => submissions.filter((submission) => matchesBus(submission.bus_no) && dateMatches(submission.expense_date)), [submissions, dateSearch, busSearch, period, monthSearch])
  const routeRows = useMemo(() => submissions.filter((submission) => matchesBus(submission.bus_no) && dateMatches(submission.expense_date)).flatMap((submission) => {
    const legs = [
      { routeCode: submission.route_code, date: submission.first_leg_date || submission.expense_date, expense: Number(submission.first_leg_share ?? Math.floor(Number(submission.total_expense || 0) / 2)) },
      { routeCode: submission.route_code === 'KTY_CMB' ? 'CMB_KTY' : 'KTY_CMB', date: submission.return_leg_date || submission.expense_date, expense: Number(submission.return_leg_share ?? (Number(submission.total_expense || 0) - Math.floor(Number(submission.total_expense || 0) / 2))) },
    ]
    const routeRevenues = legs.map((leg) => {
      const sameBus = (row) => String(row.bus_no || row.registration_no || '').trim().toLowerCase() === String(submission.bus_no || '').trim().toLowerCase()
      const manual = revenueEntries.filter((entry) => entry.travel_date === leg.date && entry.route_code === leg.routeCode && sameBus(entry))
      const daily = dailyRevenue.filter((row) => row.travel_date === leg.date && row.route_code === leg.routeCode && sameBus(row))
      return (manual.length ? manual : daily).reduce((sum, row) => sum + Number(row.total_revenue || 0), 0)
    })
    const rawRevenueTotal = routeRevenues.reduce((sum, value) => sum + value, 0)
    const savedRevenue = Number(submission.gross_revenue || 0)
    const firstLegRevenue = rawRevenueTotal > 0
      ? Math.round(savedRevenue * routeRevenues[0] / rawRevenueTotal)
      : Math.round(savedRevenue * Number(submission.first_leg_share ?? legs[0].expense) / Math.max(1, Number(submission.total_expense || legs[0].expense + legs[1].expense)))
    const allocatedRevenues = [firstLegRevenue, savedRevenue - firstLegRevenue]
    return legs.map((leg, index) => ({ ...submission, id: `${submission.id}-${leg.routeCode}`, ledgerId: submission.id, expense_date: leg.date, route_code: leg.routeCode, gross_revenue: allocatedRevenues[index], total_expense: leg.expense }))
  }), [submissions, revenueEntries, dailyRevenue, busSearch, dateSearch, period, monthSearch])
  const activeRows = view === 'route' ? routeRows : filtered
  const summaryRevenue = activeRows.reduce((sum, row) => sum + Number(row.gross_revenue || 0), 0)
  const summaryLedgerExpenses = activeRows.reduce((sum, row) => sum + Number(row.total_expense || 0), 0)
  const summaryMonthlyExpenses = period === 'month'
    ? monthlyExpenses
      .filter((expense) => (expense.expense_source === 'monthly' || expense.category === 'Monthly Expense') && dateMatches(expense.expense_date) && matchesBus(expense.bus_no))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    : 0
  const summaryExpenses = summaryLedgerExpenses + summaryMonthlyExpenses
  const summaryProfit = summaryRevenue - summaryExpenses
  const chartEntries = period === 'month' && (activeRows.length || summaryMonthlyExpenses)
    ? [{ id: `monthly-total-${monthSearch}`, ledgerId: `Monthly total · ${monthSearch}`, expense_date: monthSearch, bus_no: busSearch || 'All buses', gross_revenue: summaryRevenue, total_expense: summaryExpenses }]
    : activeRows
  const chartValues = chartEntries.flatMap((entry) => [Number(entry.gross_revenue || 0), Number(entry.total_expense || 0), Number(entry.gross_revenue || 0) - Number(entry.total_expense || 0)])
  const chartMin = Math.min(0, ...chartValues)
  const chartMax = Math.max(0, ...chartValues)
  const chartSpan = Math.max(1, chartMax - chartMin)
  const chartTop = 22
  const chartHeight = 190
  const chartWidth = Math.max(720, chartEntries.length * 112 + 52)
  const yFor = (value) => chartTop + ((chartMax - value) / chartSpan) * chartHeight
  const formatAxis = (value) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `Rs. ${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `Rs. ${(value / 1_000).toFixed(0)}k`
    return `Rs. ${value.toFixed(0)}`
  }
  const axisTicks = Array.from({ length: 5 }, (_, index) => chartMax - (chartSpan * index / 4))
  return <section className={`content-card accounts-recent-card accounts-expense-ledger ${className}`}>
    <div className="accounts-panel-heading"><div><h2>Profit report</h2><p>Finalized bus duties with accounting totals from Accounts.</p></div><span>{loading ? 'Loading...' : `Showing ${Math.min(activeRows.length, 100)} of ${activeRows.length} entries`}</span></div>
    <div className="accounts-expense-ledger-switch" role="group" aria-label="Expense ledger view">
      <button type="button" className={view === 'trip' ? 'active' : ''} aria-pressed={view === 'trip'} onClick={() => setView('trip')}>Trip</button>
      <button type="button" className={view === 'route' ? 'active' : ''} aria-pressed={view === 'route'} onClick={() => setView('route')}>Route</button>
    </div>
    <div className="accounts-revenue-ledger-filters">
      <label>Date<input type="date" aria-label="Search expenses by date" value={dateSearch} onChange={(event) => setDateSearch(event.target.value)} /></label>
      <label>Bus No<select aria-label="Filter expenses by bus number" value={busSearch} onChange={(event) => setBusSearch(event.target.value)}><option value="">All buses</option>{busOptions.map((busNo) => <option key={busNo} value={busNo}>{busNo}</option>)}</select></label>
      <label>Period<select aria-label="Filter expenses by period" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">All</option><option value="week">Week</option><option value="month">Month</option></select></label>
      {period === 'month' && <label>Month<input type="month" aria-label="Select profit report month" value={monthSearch} onChange={(event) => setMonthSearch(event.target.value)} /></label>}
      <button type="button" className="profit-ledger-reset" onClick={() => { setDateSearch(''); setBusSearch(''); setPeriod('week'); setMonthSearch(currentMonth()); setView('trip') }}>Reset</button>
    </div>
    <div className={`stats-grid profit-ledger-summary${period === 'month' ? ' with-monthly' : ''}`}>
      <div className="metric-card"><span>Total revenue</span><strong>{summaryMoney(summaryRevenue)}</strong></div>
      {period === 'month' && <div className="metric-card"><span>Monthly expenses</span><strong>{summaryMoney(summaryMonthlyExpenses)}</strong></div>}
      <div className="metric-card"><span>Total expense</span><strong>{summaryMoney(summaryExpenses)}</strong></div>
      <div className="metric-card profit-ledger-profit-card"><span>Profit amount</span><strong className={summaryProfit < 0 ? 'negative' : 'positive'}>{summaryMoney(summaryProfit)}</strong></div>
    </div>
    <section className="profit-ledger-chart" aria-label="Profit and loss bar chart">
      <div className="profit-ledger-chart-heading"><h3>Profit &amp; Loss</h3><div className="profit-ledger-chart-legend"><span><i className="revenue" />Revenue</span><span><i className="expenses" />Expenses</span><span><i className="net-profit" />Net Profit</span></div></div>
      {error ? <p className="daily-revenue-empty" role="alert">Unable to load profit and loss data: {error}</p> : loading ? <p className="daily-revenue-empty" role="status">Loading profit and loss data…</p> : !chartEntries.length ? <p className="daily-revenue-empty">No matching ledger entries to chart.</p> : <div className="profit-ledger-chart-scroll"><svg className="profit-ledger-chart-svg" viewBox={`0 0 ${chartWidth} 300`} style={{ width: `max(100%, ${chartWidth}px)` }} role="img" aria-label={`Revenue, expenses and net profit for all ${chartEntries.length} matching ledger entries`}>
        {axisTicks.map((tick, index) => { const y = yFor(tick); return <g key={index}><line x1="48" y1={y} x2={chartWidth - 8} y2={y} className="profit-ledger-gridline" /><text x="43" y={y + 4} textAnchor="end" className="profit-ledger-axis-label">{formatAxis(tick)}</text></g> })}
        {chartEntries.map((entry, index) => {
          const values = [Number(entry.gross_revenue || 0), Number(entry.total_expense || 0), Number(entry.gross_revenue || 0) - Number(entry.total_expense || 0)]
          const colors = ['revenue', 'expenses', 'net-profit']
          const groupWidth = (chartWidth - 56) / chartEntries.length
          const center = 48 + groupWidth * (index + 0.5)
          const zeroY = yFor(0)
          const routeName = routeShortName(entry.route_code)
          const label = `${entry.expense_date || '—'} · ${entry.bus_no || 'Unassigned'}${view === 'route' ? ` · ${routeName}` : ''}`
          return <g key={entry.id}>
            {values.map((value, barIndex) => { const y = yFor(value); const height = Math.max(1, Math.abs(zeroY - y)); const negative = barIndex === 2 && value < 0; return <rect key={colors[barIndex]} x={center - 27 + barIndex * 19} y={Math.min(y, zeroY)} width="15" height={height} rx="2" className={`profit-ledger-bar ${colors[barIndex]}${negative ? ' negative' : ''}`}><title>{`${label}\nRevenue: ${money(values[0])}\nExpenses: ${money(values[1])}\nNet Profit: ${money(values[2])}`}</title></rect> })}
            <text x={center} y="235" textAnchor="middle" className="profit-ledger-entry-label"><tspan x={center}>{entry.expense_date || '—'}</tspan><tspan x={center} dy="14">{entry.bus_no || 'Unassigned'}</tspan>{view === 'route' ? <tspan x={center} dy="13">{routeName}</tspan> : null}</text>
          </g>
        })}
      </svg></div>}
    </section>
    <div className="daily-revenue-table-wrap"><table>{view === 'trip' ? <>
      <thead><tr><th>Date</th><th>Bus No</th><th>Driver / Conductor</th><th>KKY to CMB date</th><th>CMB to KKY date</th><th>Total revenue</th><th>Total Expense</th><th>Net Return</th><th>Status</th></tr></thead>
      <tbody>{filtered.slice(0, 100).map((submission) => {
        const firstTrip = trips.find((trip) => String(trip.id) === String(submission.first_trip_id))
        const returnTrip = trips.find((trip) => String(trip.id) === String(submission.return_trip_id))
        const dates = { KTY_CMB: '', CMB_KTY: '' }
        dates[submission.route_code] = submission.first_leg_date || submission.expense_date || ''
        dates[submission.route_code === 'KTY_CMB' ? 'CMB_KTY' : 'KTY_CMB'] = submission.return_leg_date || ''
        if (firstTrip?.route_code) dates[firstTrip.route_code] = firstTrip.travel_date || ''
        if (returnTrip?.route_code) dates[returnTrip.route_code] = returnTrip.travel_date || ''
        return <tr key={submission.id}><td>{submission.expense_date}</td><td>{submission.bus_no}</td><td>{submission.driver_name || '-'} / {submission.conductor_name || '-'}</td><td>{dates.KTY_CMB || '—'}</td><td>{dates.CMB_KTY || '—'}</td><td>{money(submission.gross_revenue)}</td><td><strong>{money(submission.total_expense)}</strong></td><td>{money(Number(submission.gross_revenue || 0) - Number(submission.total_expense || 0))}</td><td><span className="accounts-entry-locked">{String(submission.status || 'locked').toUpperCase()} · {submission.submission_code}</span></td></tr>
      })}{!loading && !filtered.length && <tr><td colSpan="9" className="daily-revenue-empty">{submissions.length ? 'No expense submissions match these filters.' : 'No dispatch expense submissions yet.'}</td></tr>}</tbody>
    </> : <>
      <thead><tr><th>Date</th><th>Bus No</th><th>Route</th><th>Driver / Conductor</th><th>Route Revenue</th><th>Route Expense</th><th>Net Return</th><th>Status</th></tr></thead>
      <tbody>{routeRows.slice(0, 100).map((submission) => <tr key={submission.id}><td>{submission.expense_date}</td><td>{submission.bus_no}</td><td>{ROUTES.find((route) => route.code === submission.route_code)?.label || submission.route_code}</td><td>{submission.driver_name || '-'} / {submission.conductor_name || '-'}</td><td>{money(submission.gross_revenue)}</td><td><strong>{money(submission.total_expense)}</strong></td><td>{money(Number(submission.gross_revenue || 0) - Number(submission.total_expense || 0))}</td><td><span className="accounts-entry-locked">{String(submission.status || 'locked').toUpperCase()} · {submission.submission_code}</span></td></tr>)}{!loading && !activeRows.length && <tr><td colSpan="8" className="daily-revenue-empty">{submissions.length ? 'No expense submissions match these filters.' : 'No dispatch expense submissions yet.'}</td></tr>}</tbody>
    </>}</table></div>
  </section>
}
