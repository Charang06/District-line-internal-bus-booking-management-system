export default function StaffIcon({ name = 'person' }) {
  const paths = {
    person: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    bus: <><rect x="4" y="3" width="16" height="17" rx="3" /><path d="M4 12h16M8 20v2m8-2v2M4 7h16" /><circle cx="8" cy="16" r=".75" /><circle cx="16" cy="16" r=".75" /></>,
    driver: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="m5 6 5 4m9-4-5 4m-2 5v6" /></>,
    conductor: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M9 5V3h6v2M4 10h16m-11 4h6m-6 3h3" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.person}</svg>
}
