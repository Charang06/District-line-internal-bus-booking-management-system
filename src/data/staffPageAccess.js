export const STAFF_PAGE_KEYS = ['home', 'log', 'info', 'dashboard', 'accounts', 'customers', 'staff']

const DEFAULT_VIEW_PAGES = new Set(['home', 'log', 'info'])

export function resolveStaffPageAccess(permissions = {}, isAdmin = false) {
  if (isAdmin) {
    return Object.fromEntries(STAFF_PAGE_KEYS.map((page) => [page, { view: true, manage: true }]))
  }

  const existing = permissions.pageAccess
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return Object.fromEntries(STAFF_PAGE_KEYS.map((page) => {
      const access = existing[page]
      const view = access?.view === true
      return [page, { view, manage: page !== 'staff' && view && access?.manage === true }]
    }))
  }

  const canPassenger = permissions.passengers === true
  const canCargo = permissions.cargo === true
  const canTrip = permissions.trips === true
  const legacyView = (page) => permissions[page] === true || (DEFAULT_VIEW_PAGES.has(page) && permissions[page] !== false)
  return Object.fromEntries(STAFF_PAGE_KEYS.map((page) => {
    const view = legacyView(page)
    const legacyManage = page === 'home' ? canPassenger || canCargo || canTrip
      : page === 'log' ? canPassenger || canCargo : false
    return [page, { view, manage: page !== 'staff' && view && legacyManage }]
  }))
}
