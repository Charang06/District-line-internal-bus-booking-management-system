const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE_URL || '').replace(/\/$/, '')

export function assetUrl(url) {
  return ASSET_BASE && String(url || '').startsWith('/uploads/') ? `${ASSET_BASE}${url}` : url
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

async function parse(response) {
  const raw = await response.text().catch(() => '')
  let data = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = { message: raw || `Server returned an unreadable response (${response.status}).` }
  }
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status} ${response.statusText}).`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

async function request(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Could not reach the API server. Start the project with npm run dev so the staff request can connect.')
  }
  return parse(response)
}

export const api = {
  login: (body) => request(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  buses: (token, includeInactive = false) =>
    fetch(`${API_BASE}/buses${includeInactive ? '?includeInactive=1' : ''}`, { headers: authHeaders(token) }).then(parse),
  createBus: (token, body) => fetch(`${API_BASE}/buses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  updateBus: (token, id, body) => fetch(`${API_BASE}/buses/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  deleteBus: (token, id) => fetch(`${API_BASE}/buses/${id}`, { method: 'DELETE', headers: authHeaders(token) }).then(parse),
  uploadBusImage: (token, id, image) => fetch(`${API_BASE}/buses/${id}/image`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ image }) }).then(parse),
  trips: (token, query = '') => fetch(`${API_BASE}/trips${query}`, { headers: authHeaders(token) }).then(parse),
  trip: (token, id) => fetch(`${API_BASE}/trips/${id}`, { headers: authHeaders(token) }).then(parse),
  createTrip: (token, body) => fetch(`${API_BASE}/trips`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  updateTrip: (token, id, body) => fetch(`${API_BASE}/trips/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  deleteTrip: (token, id) => fetch(`${API_BASE}/trips/${id}`, { method: 'DELETE', headers: authHeaders(token) }).then(parse),
  bookings: (token, query = '') => fetch(`${API_BASE}/bookings${query}`, { headers: authHeaders(token) }).then(parse),
  createBooking: (token, body) => request(`${API_BASE}/bookings`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  cancelBooking: (token, id) => fetch(`${API_BASE}/bookings/${id}/cancel`, { method: 'POST', headers: authHeaders(token), body: '{}' }).then(parse),
  setBookingConfirmation: (token, id, confirmation_status) => fetch(`${API_BASE}/bookings/${id}/confirmation`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ confirmation_status }) }).then(parse),
  sendSms: (token, id, retry = false) => fetch(`${API_BASE}/bookings/${id}/sms`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ retry }) }).then(parse),
  cargo: (token, query = '') => fetch(`${API_BASE}/cargo${query}`, { headers: authHeaders(token) }).then(parse),
  createCargo: (token, body) => fetch(`${API_BASE}/cargo`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  deleteCargo: (token, id) => fetch(`${API_BASE}/cargo/${id}`, { method: 'DELETE', headers: authHeaders(token) }).then(parse),
  me: (token) => fetch(`${API_BASE}/me`, { headers: authHeaders(token) }).then(parse),
  updateProfile: (token, body) => fetch(`${API_BASE}/profile`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  uploadProfilePhoto: (token, image) => fetch(`${API_BASE}/profile/photo`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ image }) }).then(parse),
  changePassword: (token, body) => fetch(`${API_BASE}/profile/password`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  adminDashboard: (token) => fetch(`${API_BASE}/admin/dashboard`, { headers: authHeaders(token) }).then(parse),
  adminRevenueEntries: (token) => request(`${API_BASE}/admin/revenue-entries`, { headers: authHeaders(token) }),
  createRevenueEntry: (token, body) => request(`${API_BASE}/admin/revenue-entries`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  createAdminExpense: (token, body) => request(`${API_BASE}/admin/expenses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  createBusDuty: (token, body) => request(`${API_BASE}/admin/duties`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  addDutyExpense: (token, id, body) => request(`${API_BASE}/admin/duties/${id}/expenses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  deleteDutyExpense: (token, dutyId, expenseId) => request(`${API_BASE}/admin/duties/${dutyId}/expenses/${expenseId}`, { method: 'DELETE', headers: authHeaders(token) }),
  addDutyAdjustment: (token, id, body) => request(`${API_BASE}/admin/duties/${id}/adjustments`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  deleteDutyAdjustment: (token, dutyId, adjustmentId) => request(`${API_BASE}/admin/duties/${dutyId}/adjustments/${adjustmentId}`, { method: 'DELETE', headers: authHeaders(token) }),
  finalizeBusDuty: (token, id, acknowledge_no_expenses = false) => request(`${API_BASE}/admin/duties/${id}/finalize`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ acknowledge_no_expenses }) }),
  adminStaff: (token) => request(`${API_BASE}/admin/staff`, { headers: authHeaders(token) }),
  createStaff: (token, body) => request(`${API_BASE}/admin/staff`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  updateStaff: (token, id, body) => request(`${API_BASE}/admin/staff/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }),
  resetStaffPassword: (token, id, password) => request(`${API_BASE}/admin/staff/${id}/reset-password`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ password }) }),
  updateStaffPermissions: (token, id, permissions) => request(`${API_BASE}/admin/staff/${id}/permissions`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ permissions }) }),
  deleteStaff: (token, id) => request(`${API_BASE}/admin/staff/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
}
