const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE_URL || '').replace(/\/$/, '')

export function assetUrl(url) {
  return ASSET_BASE && String(url || '').startsWith('/uploads/') ? `${ASSET_BASE}${url}` : url
}

function apiFetch(url, options = {}) {
  // Authenticated API responses are frequently updated by form submissions.
  // Keep them out of the browser HTTP cache; React owns the in-memory tables.
  return fetch(url, { ...options, cache: 'no-store', credentials: 'include' })
}

function authHeaders(_token) {
  return { 'Content-Type': 'application/json' }
}

async function parse(response, onRead) {
  const raw = await response.text().catch(() => '')
  onRead?.(raw.length)
  let data = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = { message: raw || `Server returned an unreadable response (${response.status}).` }
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:session-expired'))
    }
    const error = new Error(data.message || `Request failed (${response.status} ${response.statusText}) at ${response.url || 'the API endpoint'}.`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

async function request(url, options) {
  let response
  try {
    response = await apiFetch(url, options)
  } catch {
    throw new Error('Could not reach the API server. Start the project with npm run dev so the staff request can connect.')
  }
  return parse(response)
}

async function timedRequest(name, url, options) {
  const startedAt = performance.now()
  let status = 0
  let responseChars = 0
  try {
    let response
    try {
      response = await apiFetch(url, options)
    } catch {
      throw new Error('Could not reach the API server. Start the project with npm run dev so the staff request can connect.')
    }
    status = response.status
    return await parse(response, (length) => { responseChars = length })
  } finally {
    console.info(JSON.stringify({
      kind: 'frontend_api_perf',
      request: name,
      duration_ms: Number((performance.now() - startedAt).toFixed(1)),
      status,
      response_chars: responseChars,
    }))
  }
}

export const api = {
  login: (body) => request(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  logout: () => request(`${API_BASE}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  buses: (token, includeInactive = false) =>
    apiFetch(`${API_BASE}/buses${includeInactive ? '?includeInactive=1' : ''}`, { headers: authHeaders(token) }).then(parse),
  createBus: (token, body) => apiFetch(`${API_BASE}/buses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  updateBus: (token, id, body) => apiFetch(`${API_BASE}/buses/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  deleteBus: (token, id) => apiFetch(`${API_BASE}/buses/${id}`, { method: 'DELETE', headers: authHeaders(token) }).then(parse),
  uploadBusImage: (token, id, image) => apiFetch(`${API_BASE}/buses/${id}/image`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ image }) }).then(parse),
  trips: (token, query = '') => apiFetch(`${API_BASE}/trips${query}`, { headers: authHeaders(token) }).then(parse),
  trip: (token, id) => apiFetch(`${API_BASE}/trips/${id}`, { headers: authHeaders(token) }).then(parse),
  createTrip: (token, body) => apiFetch(`${API_BASE}/trips`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  updateTrip: (token, id, body) => apiFetch(`${API_BASE}/trips/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  deleteTrip: (token, id) => apiFetch(`${API_BASE}/trips/${id}`, { method: 'DELETE', headers: authHeaders(token) }).then(parse),
  bookings: (token, query = '') => apiFetch(`${API_BASE}/bookings${query}`, { headers: authHeaders(token) }).then(parse),
  createBooking: (token, body) => request(`${API_BASE}/bookings`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  cancelBooking: (token, id) => apiFetch(`${API_BASE}/bookings/${id}/cancel`, { method: 'POST', headers: authHeaders(token), body: '{}' }).then(parse),
  setBookingConfirmation: (token, id, confirmation_status) => apiFetch(`${API_BASE}/bookings/${id}/confirmation`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ confirmation_status }) }).then(parse),
  updateBookingContact: (token, id, contact) => request(`${API_BASE}/bookings/${id}/contact`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ contact }) }),
  sendSms: (token, id, retry = false) => apiFetch(`${API_BASE}/bookings/${id}/sms`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ retry }) }).then(parse),
  sendCancellationSms: (token, id, retry = false) => apiFetch(`${API_BASE}/bookings/${id}/cancellation-sms`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ retry }) }).then(parse),
  cargo: (token, query = '') => apiFetch(`${API_BASE}/cargo${query}`, { headers: authHeaders(token) }).then(parse),
  createCargo: (token, body) => apiFetch(`${API_BASE}/cargo`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  deleteCargo: (token, id) => apiFetch(`${API_BASE}/cargo/${id}`, { method: 'DELETE', headers: authHeaders(token) }).then(parse),
  me: (token) => apiFetch(`${API_BASE}/me`, { headers: authHeaders(token) }).then(parse),
  updateProfile: (token, body) => apiFetch(`${API_BASE}/profile`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  uploadProfilePhoto: (token, image) => apiFetch(`${API_BASE}/profile/photo`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ image }) }).then(parse),
  changePassword: (token, body) => apiFetch(`${API_BASE}/profile/password`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }).then(parse),
  adminDashboard: (token) => timedRequest('admin_dashboard', `${API_BASE}/admin/dashboard`, { headers: authHeaders(token) }),
  smsLenzBalance: (token) => apiFetch(`${API_BASE}/admin/smslenz/balance`, { headers: authHeaders(token) }).then(parse),
  adminRevenueEntries: (token, { summary = false } = {}) => timedRequest(
    'admin_revenue_entries',
    `${API_BASE}/admin/revenue-entries${summary ? '?summary=1' : ''}`,
    { headers: authHeaders(token) },
  ),
  createRevenueEntry: (token, body) => request(`${API_BASE}/admin/revenue-entries`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  adminExpenseSubmissions: (token) => timedRequest('admin_expense_submissions', `${API_BASE}/admin/expense-submissions`, { headers: authHeaders(token) }),
  createAdminExpenseSubmission: (token, body) => request(`${API_BASE}/admin/expense-submissions`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  createAdminExpense: (token, body) => request(`${API_BASE}/admin/expenses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  createBusDuty: (token, body) => request(`${API_BASE}/admin/duties`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  addDutyExpense: (token, id, body) => request(`${API_BASE}/admin/duties/${id}/expenses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  deleteDutyExpense: (token, dutyId, expenseId) => request(`${API_BASE}/admin/duties/${dutyId}/expenses/${expenseId}`, { method: 'DELETE', headers: authHeaders(token) }),
  addDutyAdjustment: (token, id, body) => request(`${API_BASE}/admin/duties/${id}/adjustments`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  deleteDutyAdjustment: (token, dutyId, adjustmentId) => request(`${API_BASE}/admin/duties/${dutyId}/adjustments/${adjustmentId}`, { method: 'DELETE', headers: authHeaders(token) }),
  finalizeBusDuty: (token, id, acknowledge_no_expenses = false) => request(`${API_BASE}/admin/duties/${id}/finalize`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ acknowledge_no_expenses }) }),
  adminStaff: (token) => request(`${API_BASE}/admin/staff`, { headers: authHeaders(token) }),
  adminCrew: (token) => request(`${API_BASE}/admin/crew`, { headers: authHeaders(token) }),
  createCrewMember: (token, body) => request(`${API_BASE}/admin/crew`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  deleteCrewMember: (token, id) => request(`${API_BASE}/admin/crew/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
  adminBusContacts: (token) => request(`${API_BASE}/admin/bus-contacts`, { headers: authHeaders(token) }),
  createBusContact: (token, body) => request(`${API_BASE}/admin/bus-contacts`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  deleteBusContact: (token, id) => request(`${API_BASE}/admin/bus-contacts/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
  createStaff: (token, body) => request(`${API_BASE}/admin/staff`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) }),
  updateStaff: (token, id, body) => request(`${API_BASE}/admin/staff/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body) }),
  resetStaffPassword: (token, id, password) => request(`${API_BASE}/admin/staff/${id}/reset-password`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ password }) }),
  updateStaffPermissions: (token, id, permissions) => request(`${API_BASE}/admin/staff/${id}/permissions`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ permissions }) }),
  deleteStaff: (token, id) => request(`${API_BASE}/admin/staff/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
}
