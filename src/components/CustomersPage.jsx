import './CustomersPage.css'

const routes = [
  { code: 'KTY_CMB', title: 'Kattankudy to Colombo' },
  { code: 'CMB_KTY', title: 'Colombo to Kattankudy' },
]

function CustomerIcon({ departure = false }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {departure ? <><path d="M4 20V5m0 0 5 4-5 4M11 17h10m-4-4 4 4-4 4" /></> : <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-13a3 3 0 0 1 0 6m4 7v-3a5 5 0 0 0-3-4" /></>}
  </svg>
}

function PeriodFilter({ id, label, value, onChange, disabled }) {
  return <label className="customers-period-filter" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
    <option value="week">Last week</option><option value="1">Last month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option>
  </select></label>
}

function EmptyState({ departure = false, children }) {
  return <div className="customers-empty"><span className="customers-empty-icon"><CustomerIcon departure={departure} /></span><p>{children}</p></div>
}

function LoadingState({ children }) {
  return <div className="customers-loading" role="status"><span className="customers-loading-placeholder" aria-hidden="true" /><p>{children}</p></div>
}

// Presentation only: App supplies the existing filtered/ranked analytics.
export default function CustomersPage({ departuresByRoute, customers, departurePeriod, onDeparturePeriodChange, customerPeriod, onCustomerPeriodChange, loading, error, onRetry }) {
  // A shared visual scale makes equal booking counts equal bar lengths in both routes.
  const barMaximum = Math.max(1, ...routes.flatMap(route => (departuresByRoute[route.code] || []).map(item => item.count)))
  const ready = !loading && !error

  return <main className="content-page customers-ui-page" aria-labelledby="customers-page-title">
    <header className="customers-page-header"><span className="customers-page-icon"><CustomerIcon /></span><div><h1 id="customers-page-title">Customers</h1><p>View popular departure points and regular customers.</p></div></header>

    {error ? <section className="customers-error" role="alert"><div><h2>Unable to load customer analytics</h2><p>{error}</p></div><button type="button" onClick={onRetry}>Retry customer analytics</button></section> : <>
      <section className="customers-section customers-departures" aria-labelledby="popular-departure-title" aria-busy={loading}>
        <header className="customers-section-header"><div className="customers-section-copy"><span className="customers-section-icon"><CustomerIcon departure /></span><div><h2 id="popular-departure-title">Popular Departure</h2><p>Confirmed bookings by departure point within each route.</p></div></div><PeriodFilter id="customers-departure-period" label="Departure period" value={departurePeriod} onChange={onDeparturePeriodChange} disabled={loading} /></header>
        {ready ? <div className="customers-route-grid">{routes.map(route => {
          const departures = departuresByRoute[route.code] || []
          return <section key={route.code} className="customers-route-card" aria-labelledby={'customers-route-' + route.code}>
            <header><span className="customers-route-eyebrow">Departure bookings</span><h3 id={'customers-route-' + route.code}>{route.title}</h3></header>
            {departures.length ? <ol className="customers-departure-list" aria-label={'Confirmed departure bookings for ' + route.title}>
              {departures.map(item => <li key={item.departure} className="customers-departure-row"><div className="customers-departure-label"><span>{item.departure}</span><strong aria-label={item.count + (item.count === 1 ? ' confirmed booking' : ' confirmed bookings')}>{item.count}<small>{item.count === 1 ? 'booking' : 'bookings'}</small></strong></div><div className="customers-bar-track" aria-hidden="true"><span className="customers-bar-fill" style={{ width: (item.count / barMaximum * 100) + '%' }} /></div></li>)}
            </ol> : <EmptyState departure>No confirmed departure bookings in this period.</EmptyState>}
          </section>
        })}</div> : <LoadingState>Loading popular departure bookings…</LoadingState>}
      </section>

      <section className="customers-section customers-regular" aria-labelledby="regular-customers-title" aria-busy={loading}>
        <header className="customers-section-header"><div className="customers-section-copy"><span className="customers-section-icon"><CustomerIcon /></span><div><h2 id="regular-customers-title">Regular Customers</h2><p>Customers are grouped by mobile number. Counts and rankings use confirmed trips in the selected period; multiple seats on one trip count once. “Months travelled” is the number of different calendar months in that period with a trip.</p></div></div><div className="customers-regular-controls"><PeriodFilter id="customers-regular-period" label="Customer period" value={customerPeriod} onChange={onCustomerPeriodChange} disabled={loading} /><span className="customers-count" aria-live="polite">{ready ? customers.length : '—'} regular customer{!ready || customers.length !== 1 ? 's' : ''}</span></div></header>
        {!ready ? <LoadingState>Loading regular customers…</LoadingState> : customers.length ? <>
          <p id="customers-scroll-hint" className="customers-scroll-hint">Scroll horizontally to view all columns.</p>
          <div className="customers-table-scroll" role="region" aria-labelledby="regular-customers-title" aria-describedby="customers-scroll-hint" tabIndex={0}>
            <table className="customers-table"><caption>Regular customers ranked by confirmed trips in the selected period</caption><thead><tr><th scope="col">Rank</th><th scope="col">Customer</th><th scope="col">Mobile No.</th><th scope="col" className="customers-number">Confirmed Trips</th><th scope="col" className="customers-number">Months Travelled</th><th scope="col">Most Recent Trip</th></tr></thead><tbody>
              {customers.map((customer, index) => <tr key={(customer.contact || customer.passenger_name) + '-' + index}><td><span className={'customers-rank' + (index === 0 ? ' is-first' : '')}>{index + 1}</span></td><th scope="row" className="customers-name">{customer.passenger_name || 'Unknown'}</th><td className="customers-mobile">{customer.contact || '—'}</td><td className="customers-number"><strong>{customer.trip_count}</strong></td><td className="customers-number">{customer.month_count}</td><td className="customers-date">{customer.last_trip_date || '—'}</td></tr>)}
            </tbody></table>
          </div>
        </> : <EmptyState>No repeat customers with a mobile number found.</EmptyState>}
      </section>
    </>}
  </main>
}
