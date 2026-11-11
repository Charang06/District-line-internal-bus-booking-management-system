export function busRegistrations(buses = [], contacts = []) {
  const seen = new Set()
  return [...buses.map(bus => bus.registration_no), ...contacts.map(contact => contact.bus_no)]
    .map(value => String(value || '').trim())
    .filter(value => {
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
