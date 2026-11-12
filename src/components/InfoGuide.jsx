import './InfoGuide.css'

const TOPICS = [
  ['overview', 'System Overview', '01'],
  ['bookings', 'Passenger Bookings', '02'],
  ['cargo', 'Cargo & Parcels', '03'],
  ['logs', 'Customer & Luggage Logs', '04'],
  ['trips', 'Trip & Crew Management', '05'],
  ['accounts', 'Accounts & Reconciliation', '06'],
  ['security', 'Security & Access', '07'],
  ['tips', 'Tips & Best Practices', '08'],
]

const CONTENT = {
  overview: {
    label: 'START HERE', title: 'System Overview',
    intro: 'District Line is an internal application for authorized staff and administrators to manage passenger reservations, cargo and parcel bookings, trip and crew information, customer and luggage records, and (for authorized users) revenue and expenses.',
  },
  bookings: {
    label: 'HOME · PASSENGERS', title: 'Passenger Bookings',
    intro: 'Use the Home page passenger form for the selected trip. The seat map is the booking reference; only seats shown as available can be selected.',
    steps: ['Select the operating date and travel direction: Kattankudy → Colombo or Colombo → Kattankudy.', 'Choose the correct bus and trip from the available trip workspaces.', 'Review the seat map and select available seats. The current layout has 49 seats.', 'Enter the passenger name, contact, gender, boarding and destination points, fare, and any note as applicable.', 'Review the selected seats and entered details, then save the booking. Check the result message; SMS remains pending until confirmed in Customer Log.'],
    note: 'The date, route and bus determine which trip is being managed. A general workflow guide only; the application controls seat availability.',
  },
  cargo: {
    label: 'HOME · CARGO', title: 'Cargo & Parcels',
    intro: 'Cargo and parcel entries are recorded from the Cargo & Parcel form within a trip workspace.',
    steps: ['Open the correct date, direction and trip workspace.', 'Choose a goods type and enter the quantity and luggage description or additional details.', 'Enter the customer name and, if available, a contact number.', 'Enter the total amount and select the payment option presented by the form: Paid, Pay on Pickup, or Pass.', 'Review the entry and save the goods booking.'],
    note: 'Use the fields and payment choices currently shown in the form. The contact number is optional.',
  },
  logs: {
    label: 'LOG · RECORDS', title: 'Customer & Luggage Logs',
    intro: 'The Log page provides trip records for passenger bookings (Customer Log / C1) and cargo entries (Luggage Log / L1). Select the operating date and trip before reviewing records.',
    groups: [
      ['Customer Log (C1)', ['Search or filter passenger records using the available controls.', 'Review confirmation and SMS statuses. SMS is pending until confirmed in the customer log.', 'Use the existing Edit or Cancel actions where available and authorized.', 'Use Print Customer Manifest to print the passenger manifest for the selected trip.']],
      ['Luggage Log (L1)', ['Review cargo entries and their recorded payment statuses.', 'Use Print Luggage Manifest for the selected trip.', 'Use the existing freight-entry actions where available and authorized.']],
    ],
  },
  trips: {
    label: 'TRIP WORKSPACE', title: 'Trip & Crew Management',
    intro: 'Choose the operating date, switch between the two travel directions, then review the listed bus assignments and trip workspaces. Trip details show the assigned bus, driver, conductor and date when those details are recorded.',
    steps: ['Use the existing trip controls to review trips for the chosen date and direction.', 'Trip and crew changes are available only through authorized controls. Access varies by staff account permissions.', 'Ask an administrator if a trip or crew assignment needs attention and the required control is not available.'],
    note: 'The guide does not grant access; existing account permissions determine which controls are shown.',
  },
  accounts: {
    label: 'ACCOUNTS · AUTHORIZED USERS', title: 'Accounts & Reconciliation',
    intro: 'The Accounts page is available to authorized accounting users. It provides revenue entry, expense entry and historical submission views.',
    groups: [
      ['Revenue entries', ['Enter the four original seat categories with at most 49 seats combined; add cargo rows separately when needed.', 'Revenue entries are submitted and locked using the existing Submit & Lock Revenue Entry control.']],
      ['Expenses and records', ['Enter operating expenses and allocate expense between route legs using the existing form.', 'Save an expense draft when the draft control is available, then submit and lock expenses through the existing control.', 'Add and review monthly expenses in the monthly expenses section.', 'Review historical locked submissions in the available tables.']],
    ],
    note: 'Locked entries follow the application’s existing rules. This guide contains no financial records and does not change calculations or approval steps.',
  },
  security: {
    label: 'INTERNAL ACCESS', title: 'Security & Access',
    intro: 'District Line is an internal system. Use it only with your authorized staff or administrator account.',
    steps: ['Use your individual authorized account and protect your password.', 'Sign out after using a shared or unattended device.', 'Follow the existing password-recovery procedure if you cannot sign in.', 'Contact an administrator about access or permission issues.', 'Keep customer information within authorized work and avoid sharing it outside approved workflows.'],
  },
  tips: {
    label: 'DAILY REMINDERS', title: 'Tips & Best Practices',
    bullets: ['Verify the date, direction and bus before booking.', 'Check passenger details and seat availability before saving.', 'Confirm cargo details and payment information.', 'Review the selected trip records before printing manifests.', 'Follow existing approval and reconciliation procedures.', 'Protect passenger information.'],
  },
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

function GuideBody({ topic }) {
  const item = CONTENT[topic]
  return <article className="ig-article" key={topic}>
    <div className="ig-section-label"><span />{item.label}</div>
    <h2>{item.title}</h2><p className="ig-intro">{item.intro}</p>
    {topic === 'overview' ? <>
      <section className="ig-block"><h3>Daily operational workflow</h3><p className="ig-muted">A general overview to help staff navigate the system; this is not an enforced sequence.</p>
        <div className="ig-workflow">{['Set trip details', 'Create passenger bookings', 'Register cargo', 'Review logs and print manifests', 'Record revenue and expenses (authorized users)'].map((text, index) => <div className="ig-workflow-step" key={text}><span>{String(index + 1).padStart(2, '0')}</span><strong>{text}</strong></div>)}</div>
      </section>
      <section className="ig-block"><h3>Modules at a glance</h3><div className="ig-module-grid">{[['Bookings', 'Record passenger reservations against a selected trip and available seats.'], ['Cargo', 'Record goods, quantity, customer details and payment choice for a trip.'], ['Trips', 'Review dated trip workspaces, bus assignments and recorded crew details.'], ['Accounts', 'Authorized users record revenue and expenses and review submissions.'], ['Security', 'Access to pages and actions follows each account’s existing permissions.']].map(([title, body], i) => <div className="ig-module" key={title}><span>{['↗', '▧', '⇄', 'LKR', '◈'][i]}</span><h4>{title}</h4><p>{body}</p></div>)}</div></section>
    </> : null}
    {item.steps ? <section className="ig-block"><h3>{topic === 'bookings' ? 'Booking workflow' : topic === 'cargo' ? 'Cargo workflow' : topic === 'security' ? 'Access reminders' : 'What to do'}</h3><ol className="ig-steps">{item.steps.map((text, index) => <li key={text}><span>{String(index + 1).padStart(2, '0')}</span><p>{text}</p></li>)}</ol></section> : null}
    {item.groups ? item.groups.map(([title, rows]) => <section className="ig-block" key={title}><h3>{title}</h3><ul className="ig-check-list">{rows.map((text) => <li key={text}><CheckIcon /><span>{text}</span></li>)}</ul></section>) : null}
    {item.bullets ? <section className="ig-block"><ul className="ig-check-list">{item.bullets.map((text) => <li key={text}><CheckIcon /><span>{text}</span></li>)}</ul></section> : null}
    {item.note ? <aside className="ig-note"><span aria-hidden="true">i</span><p>{item.note}</p></aside> : null}
  </article>
}

export default function InfoGuide({ topic, onTopicChange }) {
  return <main className="content-page info-guide-page">
    <section className="ig-hero"><div className="ig-hero-copy"><span className="ig-kicker">DISTRICT LINE <i /> OPERATIONS RESOURCE</span><h1>Information &amp;<br />Operations Guide</h1><p>A central guide for administrators and staff to manage bookings, cargo, trip records, and daily operations.</p><span className="ig-internal"><b /> Internal Use — Authorized Staff &amp; Administrators</span></div><div className="ig-hero-art" aria-hidden="true"><img src="/bus.webp" alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} /><div className="ig-hero-art-overlay" /><span className="ig-art-caption">DISTRICT LINE <i /> DAILY OPERATIONS</span></div><div className="ig-hero-watermark">DL</div></section>
    <div className="ig-layout">
      <nav className="ig-nav" aria-label="Operations guide topics"><div className="ig-nav-title">OPERATIONS GUIDE</div>{TOPICS.map(([id, label, number]) => <button type="button" key={id} className={topic === id ? 'active' : ''} aria-current={topic === id ? 'page' : undefined} onClick={() => onTopicChange(id)}><span className="ig-nav-number">{number}</span><span>{label}</span><b aria-hidden="true">›</b></button>)}<div className="ig-nav-foot"><span className="ig-shield">◈</span><p>Internal staff resource<br /><small>Use your authorized account</small></p></div></nav>
      <div className="ig-center"><GuideBody topic={topic} /></div>
      <aside className="ig-aside"><section className="ig-side-card"><div className="ig-side-heading"><span className="ig-side-icon">✦</span><div><h3>Quick Guides</h3><p>Jump to a common task</p></div></div>{[['bookings', 'How to Create a Booking', 'Passenger seat reservation'], ['cargo', 'How to Register Cargo', 'Goods and parcel entry'], ['logs', 'How to Print Manifests', 'Customer and luggage logs']].map(([id, title, detail]) => <button type="button" className="ig-quick-link" key={id} onClick={() => onTopicChange(id)}><span><strong>{title}</strong><small>{detail}</small></span><b aria-hidden="true">↗</b></button>)}</section>
        <section className="ig-support-card"><span className="ig-support-icon">?</span><div><h3>Support &amp; Assistance</h3><p>For account, access or workflow assistance, contact your system administrator.</p><span className="ig-support-label"><i /> ADMINISTRATOR SUPPORT</span></div></section>
        <div className="ig-side-note"><span>DL</span><p>District Line<br /><small>Internal Operations Guide</small></p></div>
      </aside>
    </div>
  </main>
}
