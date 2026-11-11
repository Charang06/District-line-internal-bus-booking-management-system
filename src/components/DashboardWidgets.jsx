export function DashboardIcon({ name = 'dashboard' }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    booked: <><path d="M5 3v10a3 3 0 0 0 3 3h10m-11 0-2 5m11-5 2 5M10 5v7h8v4" /><path d="m15 5 2 2 4-4" /></>,
    available: <><path d="M5 3v10a3 3 0 0 0 3 3h10m-11 0-2 5m11-5 2 5M10 5v7h8v4" /><path d="M16 3v6m-3-3h6" /></>,
    profit: <><path d="M3 20h18M5 16l5-5 4 3 6-9m-5 0h5v5" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.dashboard}</svg>
}

export function DashboardKpi({ name, title, value, detail, loading = false, error = '', negative = false }) {
  return <article className={'dashboard-kpi' + (negative ? ' is-negative' : '')} aria-busy={loading}>
    <div className="dashboard-kpi-heading"><span className="dashboard-kpi-icon"><DashboardIcon name={name} /></span><h2>{title}</h2></div>
    <strong className="dashboard-kpi-value">{loading || error ? '—' : value}</strong>
    <p className="dashboard-kpi-scope">{loading ? 'Loading…' : error ? 'Unavailable — see details below.' : detail}</p>
  </article>
}

export function DashboardSeatSummary({ overview }) {
  return <div className="dashboard-seat-summary">
    <div className="dashboard-seat-donut" role="img" aria-label={overview.booked + ' booked seats, ' + overview.available + ' available seats, ' + overview.totalSeats + ' total capacity'} style={{ background: 'conic-gradient(#10213B 0 ' + overview.bookedPercent + '%, #CDA15E ' + overview.bookedPercent + '% 100%)' }}><div><strong>{overview.totalSeats}</strong><span>Total capacity</span></div></div>
    <dl className="dashboard-seat-legend"><div><dt><i className="booked" />Booked seats</dt><dd>{overview.booked}<small>{overview.bookedPercent.toFixed(1)}%</small></dd></div><div><dt><i className="available" />Available seats</dt><dd>{overview.available}<small>{overview.availablePercent.toFixed(1)}%</small></dd></div><div><dt>Total capacity</dt><dd>{overview.totalSeats}</dd></div></dl>
  </div>
}
