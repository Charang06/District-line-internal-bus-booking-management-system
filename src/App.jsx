import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { api, assetUrl } from './api'
import TripWorkspace from './components/TripWorkspace'
import StaffManagement from './components/StaffManagement'
import AdminProfile from './components/AdminProfile'
import AccountsRevenue from './components/AccountsRevenue'
import ExpenseSubmissionsTable from './components/ExpenseSubmissionsTable'
import { ROUTES, SEAT_LAYOUT, routeByCode } from './data/seatLayout'
import { buildTripOverview, filterTripOverviewTrips } from './data/tripOverview'

const TOKEN_KEY = 'district-line-token'
const USER_KEY = 'district-line-user'
const COPYRIGHT_YEAR = new Date().getFullYear()
const DUTY_STATUS_LABELS = {
  in_progress: 'In Progress',
  awaiting_return: 'Awaiting Return',
  awaiting_financial_review: 'Awaiting Financial Review',
  finalized: 'Finalized',
}

function todayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function lkr(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function measureDashboardChart(name, calculate) {
  const startedAt = performance.now()
  const result = calculate()
  console.info(JSON.stringify({
    kind: 'dashboard_chart_calc_perf',
    chart: name,
    duration_ms: Number((performance.now() - startedAt).toFixed(1)),
  }))
  return result
}

function formatSmsDateTime(value) {
  if (!value) return ''
  const raw = String(value).trim()
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const parsed = new Date(hasTimezone ? normalized : `${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString()
}

function defaultDepartureTime(routeCode) {
  return routeCode === 'KTY_CMB' ? '22:30' : '20:30'
}

function queryString(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

function App() {
  const adminDashboardRequestRef = useRef(null)
  const sessionCheckStartedRef = useRef(false)
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState('checking')
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState('Home')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: 'admin_kt', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [selectedDate, setSelectedDate] = useState(todayIso())
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [routeCode, setRouteCode] = useState('CMB_KTY')
  const [buses, setBuses] = useState([])
  const [trips, setTrips] = useState([])
  const [activeTripId, setActiveTripId] = useState(null)
  const [customerLogs, setCustomerLogs] = useState([])
  const [editingContactId, setEditingContactId] = useState(null)
  const [contactDraft, setContactDraft] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const logsRequestIdRef = useRef(0)
  const [cargoLogs, setCargoLogs] = useState([])
  const [logFilters, setLogFilters] = useState({ q: '', from: '', sms: '', status: '' })
  const [smsBusyId, setSmsBusyId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [showCrewForm, setShowCrewForm] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [showBusForm, setShowBusForm] = useState(false)
  const [busSaving, setBusSaving] = useState(false)
  const [editingBus, setEditingBus] = useState(null)
  const [adminStats, setAdminStats] = useState(null)
  const [adminDataLoading, setAdminDataLoading] = useState(false)
  const [profitLedgerError, setProfitLedgerError] = useState('')
  const [profitLedgerLoaded, setProfitLedgerLoaded] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [crewList, setCrewList] = useState([])
  const [busContactList, setBusContactList] = useState([])
  const [revenueDate, setRevenueDate] = useState(todayIso())
  const [dashboardRoute, setDashboardRoute] = useState('KTY_CMB')
  const [dashboardBus, setDashboardBus] = useState('')
  const [dashboardTrip, setDashboardTrip] = useState('')
  const [profitPeriod, setProfitPeriod] = useState('day')
  const [profitDate, setProfitDate] = useState(todayIso())
  const [profitRoute, setProfitRoute] = useState('')
  const [profitTrip, setProfitTrip] = useState('')
  const [profitLedger, setProfitLedger] = useState({ revenueEntries: [], expenseSubmissions: [] })
  const [customerPeriod, setCustomerPeriod] = useState('6')
  const [customerChartPeriod, setCustomerChartPeriod] = useState('6')
  const [customerToday] = useState(() => todayIso())
  const [monthlyExpenseMonth, setMonthlyExpenseMonth] = useState(() => todayIso().slice(0, 7))
  const [expenseForm, setExpenseForm] = useState({ expense_date: todayIso(), bus_no: '', category: 'Fuel', description: '', amount: '' })
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [dutyForm, setDutyForm] = useState({ bus_no: '', first_trip_id: '', return_trip_id: '' })
  const [dutyExpenseForm, setDutyExpenseForm] = useState({ expense_date: todayIso(), trip_id: '', category: 'Fuel', description: '', amount: '' })
  const [dutyAdjustmentForm, setDutyAdjustmentForm] = useState({ adjustment_date: todayIso(), trip_id: '', type: 'other_income', description: '', amount: '', seat_number: '' })
  const [dutySaving, setDutySaving] = useState(false)
  const [selectedDutyId, setSelectedDutyId] = useState(null)
  const [finalizeDutyTarget, setFinalizeDutyTarget] = useState(null)
  const [acknowledgeNoDutyExpenses, setAcknowledgeNoDutyExpenses] = useState(false)
  const [dutyFilters, setDutyFilters] = useState({ bus_id: '', status: '', start_from: '', start_to: '', completion_from: '', completion_to: '' })
  const [printMode, setPrintMode] = useState(null)
  const [entryFocus, setEntryFocus] = useState(null)
  const [showProfile, setShowProfile] = useState(false)

  const [tripForm, setTripForm] = useState({
    travel_date: todayIso(),
    route_code: 'CMB_KTY',
    bus_no: '',
    departure_time: '20:30',
    status: 'scheduled',
    driver_name: '',
    driver_phone: '',
    conductor_name: '',
    conductor_phone: '',
  })
  const [busForm, setBusForm] = useState({
    registration_no: '',
    mobile_no: '',
    display_name: '',
    driver_name: '',
    driver_phone: '',
    conductor_name: '',
    conductor_phone: '',
    image_url: '/bus.jpg',
  })

  const isAdmin = user?.role === 'admin'
  const staffPermissions = isAdmin
    ? { home: true, log: true, info: true, passengers: true, cargo: true, trips: true }
    : { home: true, log: true, info: true, passengers: true, cargo: true, trips: true, ...(user?.permissions || {}) }
  const navTabs = ['Home', 'Log', 'Info', ...(isAdmin ? ['Dashboard', 'Accounts', 'Customers', 'Staff'] : [])].filter((tab) => {
    if (tab === 'Home') return staffPermissions.home
    if (tab === 'Log') return staffPermissions.log
    if (tab === 'Info') return staffPermissions.info
    return true
  })
  const route = routeByCode(routeCode)
  const activeTrip = trips.find((trip) => trip.id === activeTripId) || trips[0] || null
  const knownDriverNames = [...new Set([...(crewList || []).filter((member) => member.role === 'driver').map((member) => member.full_name), ...(adminStats?.crewMembers || []).filter((member) => member.role === 'driver').map((member) => member.full_name), ...trips.map((item) => item.driver_name), ...buses.map((item) => item.driver_name)].map((name) => String(name || '').trim()).filter(Boolean))]
  const knownConductorNames = [...new Set([...(crewList || []).filter((member) => member.role === 'conductor').map((member) => member.full_name), ...(adminStats?.crewMembers || []).filter((member) => member.role === 'conductor').map((member) => member.full_name), ...trips.map((item) => item.conductor_name), ...buses.map((item) => item.conductor_name)].map((name) => String(name || '').trim()).filter(Boolean))]

  useEffect(() => {
    if (!token) return
    api.adminBusContacts(token).then((contactResult) => setBusContactList(contactResult.contacts || [])).catch(() => {})
    if (isAdmin) api.adminCrew(token).then((crewResult) => setCrewList(crewResult.crew || [])).catch(() => {})
  }, [token, isAdmin])
  const bookedSeatCount = customerLogs.filter((log) => log.status !== 'cancelled').length

  const dashboardRange = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revenueDate)) return null
    return { start: revenueDate, end: revenueDate }
  }, [revenueDate])

  const isInDashboardRange = (date) => Boolean(date && dashboardRange && date >= dashboardRange.start && date <= dashboardRange.end)
  const matchesDashboardRoute = (row) => !dashboardRoute || row.route_code === dashboardRoute
  const matchesDashboardBus = (row) => {
    if (!dashboardBus) return true
    const busNo = String(row.registration_no || row.bus_no || '').trim()
    return dashboardBus === '__unassigned__' ? !busNo || busNo.toLowerCase() === 'unassigned' : busNo.toLowerCase() === dashboardBus.toLowerCase()
  }
  const matchesDashboardTrip = (row) => !dashboardTrip || String(row.trip_id ?? row.id ?? '') === dashboardTrip
  const filteredRevenue = useMemo(() => (adminStats?.dailyRevenue || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row) && matchesDashboardBus(row)), [adminStats, dashboardRange, dashboardRoute, dashboardBus, dashboardTrip])
  const seatBookingCharts = useMemo(() => {
    return measureDashboardChart('seat_bookings', () => {
      const anchor = new Date(`${revenueDate}T00:00:00`)
      if (Number.isNaN(anchor.getTime())) return []
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
      const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const dates = []
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(iso(cursor))
      const routes = ['KTY_CMB', 'CMB_KTY']
      return routes.map((code) => {
        const counts = new Map(dates.map((date) => [date, 0]))
        ;(adminStats?.dailyRevenue || []).forEach((row) => {
          if (row.route_code !== code || !counts.has(row.travel_date)) return
          if (dashboardTrip && String(row.trip_id || '') !== dashboardTrip) return
          counts.set(row.travel_date, counts.get(row.travel_date) + Number(row.passenger_count || 0))
        })
        return { code, dates, counts: dates.map((date) => counts.get(date) || 0) }
      })
    })
  }, [adminStats, revenueDate, dashboardTrip])
  const filteredTrips = useMemo(() => dashboardRange ? filterTripOverviewTrips(adminStats?.trips || [], { start: dashboardRange.start, end: dashboardRange.end, route: dashboardRoute, bus: dashboardBus, tripId: dashboardTrip }) : [], [adminStats, dashboardRange, dashboardRoute, dashboardBus, dashboardTrip])
  const filteredPassengerRecords = useMemo(() => (adminStats?.passengerRecords || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row) && matchesDashboardBus(row)), [adminStats, dashboardRange, dashboardRoute, dashboardBus, dashboardTrip])
  const filteredCargoRecords = useMemo(() => (adminStats?.cargoRecords || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row) && matchesDashboardBus(row)), [adminStats, dashboardRange, dashboardRoute, dashboardBus, dashboardTrip])
  const tripOverview = useMemo(() => buildTripOverview(filteredTrips, adminStats?.dailyRevenue || [], SEAT_LAYOUT.totalSeats, [], profitLedger.revenueEntries || []), [adminStats, filteredTrips, profitLedger.revenueEntries])
  const tripOverviewRoutes = useMemo(() => ROUTES.map((route) => {
    const busesByKey = new Map()
    tripOverview.rows.filter((row) => !row.unscheduled && row.trip.route_code === route.code).forEach((row) => {
      const registration = String(row.trip.registration_no || row.trip.bus_no || '').trim()
      const busId = row.trip.bus_id
      const key = busId != null ? `bus:${busId}` : registration ? `registration:${registration.toLowerCase()}` : `trip:${row.trip.id}`
      const bus = busesByKey.get(key) || { key, registration, busId, booked: 0, available: 0, totalSeats: 0, tripCount: 0 }
      bus.booked += row.booked
      bus.available += row.available
      bus.totalSeats += row.booked + row.available
      bus.tripCount += 1
      busesByKey.set(key, bus)
    })
    const buses = [...busesByKey.values()].map((bus) => ({
      ...bus,
      bookedPercent: bus.totalSeats ? bus.booked / bus.totalSeats * 100 : 0,
      availablePercent: bus.totalSeats ? bus.available / bus.totalSeats * 100 : 0,
    }))
    return { ...route, buses }
  }).filter((route) => route.buses.length), [tripOverview])
  const accountsExpenses = useMemo(() => (adminStats?.expenses || []).filter((expense) => !expense.duty_id && isInDashboardRange(expense.expense_date)), [adminStats, dashboardRange])
  const accountsExpenseTotal = useMemo(() => accountsExpenses.reduce((total, expense) => total + Number(expense.amount || 0), 0), [accountsExpenses])
  const monthlyExpenses = useMemo(() => (adminStats?.expenses || []).filter((expense) => !expense.duty_id && expense.expense_date?.slice(0, 7) === monthlyExpenseMonth), [adminStats, monthlyExpenseMonth])
  const monthlyExpenseTotal = useMemo(() => monthlyExpenses.reduce((total, expense) => total + Number(expense.amount || 0), 0), [monthlyExpenses])
  const visibleDuties = useMemo(() => (adminStats?.duties || []).filter((duty) => (
    (!dutyFilters.bus_id || String(duty.bus_id) === dutyFilters.bus_id)
    && (!dutyFilters.status || duty.status === dutyFilters.status)
    && (!dutyFilters.start_from || duty.start_date >= dutyFilters.start_from)
    && (!dutyFilters.start_to || duty.start_date <= dutyFilters.start_to)
    && (!dutyFilters.completion_from || (duty.completion_date && duty.completion_date >= dutyFilters.completion_from))
    && (!dutyFilters.completion_to || (duty.completion_date && duty.completion_date <= dutyFilters.completion_to))
  )), [adminStats, dutyFilters])
  const selectedDuty = (adminStats?.duties || []).find((duty) => duty.id === selectedDutyId) || null
  const unassignedDutyTrips = adminStats?.dutyTrips || []
  const firstDutyTrip = unassignedDutyTrips.find((trip) => String(trip.id) === dutyForm.first_trip_id) || null
  const eligibleFirstDutyTrips = unassignedDutyTrips.filter((trip) => dutyForm.bus_no && String(trip.registration_no || '').trim().toLocaleLowerCase() === dutyForm.bus_no.trim().toLocaleLowerCase())
  const eligibleReturnDutyTrips = firstDutyTrip ? unassignedDutyTrips.filter((trip) => (
    String(trip.registration_no || '').trim().toLocaleLowerCase() === dutyForm.bus_no.trim().toLocaleLowerCase()
    && trip.id !== firstDutyTrip.id
    && ((firstDutyTrip.route_code === 'KTY_CMB' && trip.route_code === 'CMB_KTY') || (firstDutyTrip.route_code === 'CMB_KTY' && trip.route_code === 'KTY_CMB'))
    && trip.travel_date > firstDutyTrip.travel_date
  )) : []
  const visibleDutyTotals = useMemo(() => visibleDuties.reduce((total, duty) => ({
    revenue: total.revenue + Number(duty.total_revenue || 0),
    expenses: total.expenses + Number(duty.total_expenses || 0),
    profit: total.profit + Number(duty.net_profit || 0),
  }), { revenue: 0, expenses: 0, profit: 0 }), [visibleDuties])
  const profitReport = useMemo(() => {
    const month = profitPeriod === 'month' ? profitDate.slice(0, 7) : ''
    const selectedDate = new Date(`${profitDate}T00:00:00`)
    const weekStart = new Date(selectedDate)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const toIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const groups = new Map()
    const matchesPeriod = (date) => {
      const value = String(date || '').slice(0, 10)
      if (profitPeriod === 'month') return value.startsWith(month)
      if (profitPeriod === 'week') return value >= toIso(weekStart) && value <= toIso(weekEnd)
      return value === profitDate
    }
    const keyFor = (date, bus, route) => `${String(date || '').slice(0, 10)}|${String(bus || '').trim().toLowerCase()}|${route || ''}`
    for (const entry of profitLedger.revenueEntries || []) {
      if (entry.status !== 'locked' || !matchesPeriod(entry.travel_date)) continue
      const key = keyFor(entry.travel_date, entry.bus_no, entry.route_code)
      const row = groups.get(key) || { id: key, report_date: entry.travel_date, bus_no: entry.bus_no, route_label: entry.route_label, route_code: entry.route_code, driver_name: entry.driver_name, conductor_name: entry.conductor_name, total_revenue: 0, total_expenses: 0 }
      row.total_revenue += Number(entry.total_revenue || 0)
      if (!row.driver_name) row.driver_name = entry.driver_name
      if (!row.conductor_name) row.conductor_name = entry.conductor_name
      groups.set(key, row)
    }
    for (const submission of profitLedger.expenseSubmissions || []) {
      if (submission.status !== 'locked' || !matchesPeriod(submission.expense_date)) continue
      const route = submission.route_code || ''
      const key = keyFor(submission.expense_date, submission.bus_no, route)
      const row = groups.get(key) || { id: key, report_date: submission.expense_date, bus_no: submission.bus_no, route_label: ROUTES.find((item) => item.code === route)?.label || route, route_code: route, driver_name: submission.driver_name, conductor_name: submission.conductor_name, total_revenue: Number(submission.gross_revenue || 0), total_expenses: 0 }
      row.total_expenses += Number(submission.total_expense || 0)
      if (!row.driver_name) row.driver_name = submission.driver_name
      if (!row.conductor_name) row.conductor_name = submission.conductor_name
      groups.set(key, row)
    }
    const monthlyExpenseRows = profitPeriod === 'month'
      ? (adminStats?.expenses || []).filter((expense) => !expense.duty_id && (expense.expense_source === 'monthly' || expense.category === 'Monthly Expense') && String(expense.expense_date || '').slice(0, 7) === month)
      : []
    const monthlyExpenseTotal = monthlyExpenseRows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    const monthlyHighwayExpenseTotal = profitPeriod === 'month'
      ? (profitLedger.expenseSubmissions || []).filter((submission) => submission.status === 'locked' && String(submission.expense_date || '').slice(0, 7) === month).reduce((sum, submission) => sum + Number(submission.total_expense || 0), 0)
      : 0
    if (profitPeriod === 'month') {
      for (const row of groups.values()) row.total_expenses = 0
      for (const submission of profitLedger.expenseSubmissions || []) {
        if (submission.status !== 'locked' || String(submission.expense_date || '').slice(0, 7) !== month) continue
        const route = submission.route_code || ''
        const key = keyFor(submission.expense_date, submission.bus_no, route)
        const row = groups.get(key) || { id: key, report_date: submission.expense_date, bus_no: submission.bus_no, route_label: ROUTES.find((item) => item.code === route)?.label || route, route_code: route, driver_name: submission.driver_name, conductor_name: submission.conductor_name, total_revenue: Number(submission.gross_revenue || 0), total_expenses: 0 }
        row.total_expenses += Number(submission.total_expense || 0)
        groups.set(key, row)
      }
      for (const expense of monthlyExpenseRows) {
        const expenseDate = String(expense.expense_date || '').slice(0, 10)
        const busNo = expense.bus_no || ''
        const key = keyFor(expenseDate, busNo, '')
        const row = groups.get(key) || { id: key, report_date: expenseDate, bus_no: busNo, route_label: '', route_code: '', driver_name: '', conductor_name: '', total_revenue: 0, total_expenses: 0 }
        row.total_expenses += Number(expense.amount || 0)
        groups.set(key, row)
      }
    }
    const rows = [...groups.values()]
      .filter((row) => !profitRoute || row.route_code === profitRoute)
      .map((row) => ({ ...row, net_profit: row.total_revenue - row.total_expenses }))
      .sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)))
    const totals = rows.reduce((sum, row) => ({ revenue: sum.revenue + Number(row.total_revenue || 0), expenses: sum.expenses + Number(row.total_expenses || 0), profit: sum.profit + Number(row.net_profit || 0) }), { revenue: 0, expenses: 0, profit: 0 })
    if (profitPeriod === 'month') {
      totals.expenses = monthlyExpenseTotal + monthlyHighwayExpenseTotal
      totals.profit = totals.revenue - totals.expenses
    }
    return { rows, monthlyExpenseTotal, totals }
  }, [profitLedger, profitDate, profitPeriod, profitRoute, adminStats])
  const profitChartRows = useMemo(() => {
    return measureDashboardChart('profit_report', () => {
      const byDate = new Map()
      for (const row of profitReport.rows) {
        const date = String(row.report_date || '').slice(0, 10)
        if (!date) continue
        const total = byDate.get(date) || { revenue: 0, profit: 0 }
        total.revenue += Number(row.total_revenue || 0)
        total.profit += Number(row.net_profit || 0)
        byDate.set(date, total)
      }
      return [...byDate.entries()].map(([date, total]) => ({
        date,
        percentage: total.revenue > 0 ? total.profit / total.revenue * 100 : 0,
      })).sort((a, b) => a.date.localeCompare(b.date))
    })
  }, [profitReport.rows])
  const profitChartMin = Math.min(0, ...profitChartRows.map((row) => row.percentage))
  const profitChartMax = Math.max(0, ...profitChartRows.map((row) => row.percentage))
  const profitChartSpan = Math.max(1, profitChartMax - profitChartMin)
  const profitChartTicks = Array.from({ length: 5 }, (_, index) => profitChartMax - (profitChartSpan * index / 4))
  const sortedRegularCustomers = useMemo(() => {
    const endDate = customerToday
    const start = new Date(`${customerToday}T00:00:00`)
    if (customerPeriod === 'week') start.setDate(start.getDate() - 6)
    else if (customerPeriod !== 'all') start.setMonth(start.getMonth() - Number(customerPeriod))
    const startDate = customerPeriod === 'all' ? '' : `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    return [...(adminStats?.regularCustomers || [])]
      .map((customer) => {
        const dates = (customer.trip_dates || []).filter((date) => customerPeriod === 'all' || (date >= startDate && date <= endDate))
        const months = new Set(dates.map((date) => String(date).slice(0, 7)))
        return { ...customer, trip_count: dates.length, month_count: months.size, last_trip_date: dates.sort().at(-1) || '' }
      })
      .filter((customer) => customer.trip_count >= 2)
      .sort((a, b) => b.trip_count - a.trip_count || b.month_count - a.month_count || String(b.last_trip_date).localeCompare(String(a.last_trip_date)))
  }, [adminStats, customerPeriod, customerToday])

  const popularDeparturesByRoute = useMemo(() => {
    const start = new Date(`${customerToday}T00:00:00`)
    if (customerChartPeriod === 'week') start.setDate(start.getDate() - 6)
    else start.setMonth(start.getMonth() - Number(customerChartPeriod))
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const byRoute = { KTY_CMB: new Map(), CMB_KTY: new Map() }
    ;(adminStats?.passengerRecords || []).forEach((booking) => {
      if (booking.status !== 'confirmed' || booking.confirmation_status !== 'confirmed' || !byRoute[booking.route_code]) return
      if (!booking.travel_date || booking.travel_date < startDate || booking.travel_date > customerToday) return
      const departure = String(booking.boarding_point || '').trim()
      if (!departure) return
      const key = departure.toLocaleLowerCase()
      const current = byRoute[booking.route_code].get(key) || { departure, count: 0 }
      current.count += 1
      byRoute[booking.route_code].set(key, current)
    })
    return Object.fromEntries(Object.entries(byRoute).map(([code, departures]) => [code, [...departures.values()].sort((a, b) => b.count - a.count || a.departure.localeCompare(b.departure))]))
  }, [adminStats, customerChartPeriod, customerToday])

  const revenueSummary = useMemo(() => filteredRevenue.reduce((total, day) => ({
    passenger: total.passenger + Number(day.passenger_revenue || 0),
    cargo: total.cargo + Number(day.cargo_revenue || 0),
    total: total.total + Number(day.total_revenue || 0),
  }), { passenger: 0, cargo: 0, total: 0 }), [filteredRevenue])

  const passengerLocationAnalytics = useMemo(() => {
    const locations = new Map()
    filteredPassengerRecords
      .filter((item) => item.status === 'confirmed' && item.confirmation_status === 'confirmed')
      .forEach((item) => {
        const boarding = String(item.boarding_point || '').trim()
        const destination = String(item.destination || '').trim()
        if (boarding) {
          const key = boarding.toLocaleLowerCase()
          const entry = locations.get(key) || { location: boarding, boardingCount: 0, destinationCount: 0, travelDates: new Set() }
          entry.boardingCount += 1
          if (item.travel_date) entry.travelDates.add(item.travel_date)
          locations.set(key, entry)
        }
        if (destination) {
          const key = destination.toLocaleLowerCase()
          const entry = locations.get(key) || { location: destination, boardingCount: 0, destinationCount: 0, travelDates: new Set() }
          entry.destinationCount += 1
          if (item.travel_date) entry.travelDates.add(item.travel_date)
          locations.set(key, entry)
        }
      })
    return [...locations.values()]
      .map((entry) => ({ ...entry, travelDates: [...entry.travelDates].sort(), totalBookings: entry.boardingCount + entry.destinationCount }))
      .sort((a, b) => b.totalBookings - a.totalBookings || a.location.localeCompare(b.location))
  }, [filteredPassengerRecords])

  const manifestSeats = useMemo(() => {
    const confirmedBookings = customerLogs.filter((log) => log.status === 'confirmed' && log.confirmation_status === 'confirmed')
    const normalized = Object.fromEntries(confirmedBookings.map((log) => [String(log.seat_number), log]))
    const ordered = []
    SEAT_LAYOUT.pairRows.forEach((row) => {
      ordered.push(...row.left.map((seatNumber) => ({ seatNumber, booking: normalized[seatNumber] })))
      ordered.push(...row.right.map((seatNumber) => ({ seatNumber, booking: normalized[seatNumber] })))
    })
    ordered.push(...SEAT_LAYOUT.rearRow.map((seatNumber) => ({ seatNumber, booking: normalized[seatNumber] })))
    return ordered
  }, [customerLogs])

  const customerLogRows = useMemo(() => {
    const groups = new Map()
    for (const booking of customerLogs) {
      const key = booking.booking_group_id ? `group:${booking.booking_group_id}` : `booking:${booking.id}`
      const group = groups.get(key)
      if (group) group.bookings.push(booking)
      else groups.set(key, { ...booking, bookings: [booking] })
    }
    return [...groups.values()].map((group) => {
      const latestSms = [...group.bookings].sort((a, b) => String(a.sms_sent_at || '').localeCompare(String(b.sms_sent_at || ''))).at(-1)
      return {
        ...group,
        seat_numbers: group.bookings.map((booking) => booking.seat_number).sort((a, b) => Number(a) - Number(b)),
        all_confirmed: group.bookings.every((booking) => booking.status !== 'cancelled' && booking.confirmation_status === 'confirmed'),
        any_active: group.bookings.some((booking) => booking.status !== 'cancelled'),
        fare_total: group.bookings.reduce((total, booking) => total + Number(booking.fare || 0), 0),
        sms_sent_at: latestSms?.sms_sent_at || null,
        sms_message_type: latestSms?.sms_message_type || 'confirmation',
        sms_error: group.bookings.find((booking) => booking.sms_error)?.sms_error || '',
        sms_status: group.bookings.every((booking) => booking.sms_status === group.bookings[0].sms_status)
          ? group.bookings[0].sms_status
          : 'mixed',
      }
    }).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id))
  }, [customerLogs])

  const showMessage = useCallback((text, isError = false) => {
    setNotice(isError ? '' : text)
    setError(isError ? text : '')
  }, [])

  useEffect(() => {
    if (!token || !isAdmin || activeTab !== 'Accounts') return undefined
    let cancelled = false
    api.adminCrew(token)
      .then((result) => { if (!cancelled) setCrewList(result.crew || []) })
      .catch((err) => { if (!cancelled) showMessage(err.message, true) })
    return () => { cancelled = true }
  }, [activeTab, token, isAdmin, showMessage])

  useEffect(() => {
    if (!notice && !error) return undefined
    const timeoutId = window.setTimeout(() => {
      setNotice('')
      setError('')
    }, 4500)
    return () => window.clearTimeout(timeoutId)
  }, [notice, error])

  const clearTripView = () => {
    setTrips([])
    setActiveTripId(null)
    setCustomerLogs([])
    setCargoLogs([])
  }

  const loadFleet = useCallback(async (authToken) => {
    const data = await api.buses(authToken, true)
    setBuses(data.buses || [])
  }, [])

  const loadTrips = useCallback(async (authToken, date = selectedDate, routeValue = routeCode) => {
    const data = await api.trips(authToken, queryString({ date, route: routeValue }))
    setTrips(data.trips || [])
    return data.trips || []
  }, [routeCode, selectedDate])

  const loadLogs = useCallback(async (authToken, selectedTrip) => {
    const requestId = ++logsRequestIdRef.current
    setLogsLoading(true)
    if (!selectedTrip?.id) {
      if (requestId === logsRequestIdRef.current) {
        setCustomerLogs([])
        setCargoLogs([])
        setLogsLoading(false)
      }
      return
    }

    const bookingQuery = queryString({
      tripId: selectedTrip.id,
      q: logFilters.q,
      from: logFilters.from,
      sms: logFilters.sms,
      status: logFilters.from ? 'confirmed' : logFilters.status,
    })
    const cargoQuery = queryString({
      tripId: selectedTrip.id,
      q: logFilters.q,
    })
    try {
      const [bookingData, cargoData] = await Promise.all([
        api.bookings(authToken, bookingQuery),
        api.cargo(authToken, cargoQuery),
      ])
      const returnedBookings = bookingData.bookings || []
      const visibleBookings = logFilters.from
        ? returnedBookings.filter((booking) => (
          String(booking.boarding_point || '').trim().toLocaleLowerCase() === logFilters.from.trim().toLocaleLowerCase()
          && booking.status === 'confirmed'
          && booking.confirmation_status === 'confirmed'
        ))
        : returnedBookings
      if (requestId === logsRequestIdRef.current) {
        setCustomerLogs(visibleBookings.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id)))
        setCargoLogs(cargoData.cargo || [])
      }
    } finally {
      if (requestId === logsRequestIdRef.current) setLogsLoading(false)
    }
  }, [logFilters])

  const persistSessionUser = useCallback((nextUser) => {
    setUser(nextUser)
  }, [])

  const clearAuthState = useCallback(() => {
    setToken('')
    setUser(null)
    setAuthStatus('unauthenticated')
    setAuthError('')
    setAdminStats(null)
    setProfitLedger({ revenueEntries: [], expenseSubmissions: [] })
    setProfitLedgerLoaded(false)
  }, [])

  const verifySession = useCallback(async () => {
    setAuthStatus('checking')
    setAuthError('')
    try {
      const data = await api.me()
      if (!data?.user) {
        clearAuthState()
        return
      }
      setUser(data.user)
      setToken('cookie-session')
      setAuthStatus('authenticated')
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        clearAuthState()
      } else {
        setAuthError(err.message || 'Could not verify the saved session.')
        setAuthStatus('error')
      }
    }
  }, [clearAuthState])

  useEffect(() => {
    if (sessionCheckStartedRef.current) return
    sessionCheckStartedRef.current = true
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch { /* storage may be unavailable; authentication uses the HttpOnly cookie */ }
    verifySession()
  }, [verifySession])

  useEffect(() => {
    const handleSessionExpired = () => clearAuthState()
    window.addEventListener('app:session-expired', handleSessionExpired)
    return () => window.removeEventListener('app:session-expired', handleSessionExpired)
  }, [clearAuthState])

  const bootstrap = useCallback(async (authToken) => {
    try {
      const nextTrips = await loadTrips(authToken)
      setActiveTripId((previousId) => nextTrips.find((trip) => trip.id === previousId)?.id || nextTrips[0]?.id || null)
    } catch (err) {
      if (err.status === 401) clearAuthState()
      showMessage(err.message, true)
    }
  }, [clearAuthState, loadTrips, showMessage])

  useEffect(() => {
    if (token) bootstrap(token)
  }, [token, selectedDate, routeCode, bootstrap])

  useEffect(() => {
    if (!token) return
    loadFleet(token).catch((err) => {
      if (err.status !== 401 && err.status !== 403) showMessage(err.message, true)
    })
  }, [token, loadFleet, showMessage])

  useEffect(() => {
    if (!user) return
    const allowed = navTabs.includes(activeTab)
    if (!allowed) setActiveTab(navTabs[0] || 'Info')
  }, [user, activeTab, navTabs])

  useEffect(() => {
    if (token && activeTripId) {
      loadLogs(token, trips.find((trip) => trip.id === activeTripId)).catch((err) => {
        if (err.status !== 401 && err.status !== 403) showMessage(err.message, true)
      })
    }
  }, [activeTripId, trips, token, loadLogs, showMessage])

  const calendarCells = useMemo(() => {
    const first = new Date(calendarCursor.year, calendarCursor.month, 1)
    const start = (first.getDay() + 6) % 7
    const days = new Date(calendarCursor.year, calendarCursor.month + 1, 0).getDate()
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - start + 1
      if (day < 1 || day > days) return { blank: true, key: `b-${index}` }
      const iso = `${calendarCursor.year}-${String(calendarCursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { day, iso, key: iso }
    })
  }, [calendarCursor])

  const handleLogin = async () => {
    setLoginError('')
    setLoginLoading(true)
    try {
      const data = await api.login(loginForm)
      setToken('cookie-session')
      setUser(data.user)
      setAuthStatus('authenticated')
      setAuthError('')
      const firstTab = data.user?.role === 'admin' || data.user?.permissions?.home !== false ? 'Home' : (data.user?.permissions?.log !== false ? 'Log' : 'Info')
      setActiveTab(firstTab)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch (err) {
      showMessage(err.message || 'Could not confirm sign out with the server.', true)
    } finally {
      clearAuthState()
      setActiveTab('Home')
    }
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    try {
      for (const booking of cancelTarget.bookings || [cancelTarget]) {
        if (booking.status !== 'cancelled') await api.cancelBooking(token, booking.id)
      }
      showMessage(`Cancelled ${cancelTarget.passenger_name}'s booking for seat${cancelTarget.seat_numbers?.length === 1 ? '' : 's'} ${(cancelTarget.seat_numbers || [cancelTarget.seat_number]).join(', ')}.`)
      setCancelTarget(null)
      await loadLogs(token, activeTrip)
      await loadTrips(token)
    } catch (err) {
      showMessage(err.message, true)
    }
  }

  const handleSendConfirmationSms = async (booking) => {
    const bookings = booking.bookings || [booking]
    const pending = bookings.filter((item) => !['sent', 'delivered'].includes(item.sms_status) && item.status !== 'cancelled' && item.confirmation_status === 'confirmed')
    if (!pending.length) return
    setSmsBusyId(booking.id)
    try {
      for (const item of pending) await api.sendSms(token, item.id, item.sms_status === 'failed')
      showMessage(`SMS requests sent for seat${pending.length === 1 ? '' : 's'} ${pending.map((item) => item.seat_number).join(', ')}.`)
      await loadLogs(token, activeTrip)
    } catch (err) {
      showMessage(err.message, true)
      await loadLogs(token, activeTrip)
    } finally {
      setSmsBusyId(null)
    }
  }

  const handleCancellationSms = async (booking) => {
    const bookings = booking.bookings || [booking]
    setSmsBusyId(booking.id)
    try {
      const retry = bookings.some((item) => item.sms_message_type === 'cancellation' && item.sms_status === 'failed')
      await api.sendCancellationSms(token, booking.id, retry)
      showMessage(`Cancellation SMS sent for seat${bookings.length === 1 ? '' : 's'} ${bookings.map((item) => item.seat_number).join(', ')}.`)
      await loadLogs(token, activeTrip)
    } catch (err) {
      showMessage(err.message, true)
      await loadLogs(token, activeTrip)
    } finally {
      setSmsBusyId(null)
    }
  }

  const handleBookingConfirmation = async (booking, checked) => {
    const bookings = booking.bookings || [booking]
    setSmsBusyId(booking.id)
    try {
      const confirmation_status = checked ? 'confirmed' : 'unconfirmed'
      const updated = []
      for (const item of bookings) {
        const data = await api.setBookingConfirmation(token, item.id, confirmation_status)
        updated.push(data.booking)
      }
      setCustomerLogs((current) => current.map((item) => updated.find((entry) => entry.id === item.id) || item))
      showMessage(`${booking.passenger_name}'s seats ${bookings.map((item) => item.seat_number).join(', ')} marked ${confirmation_status}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setSmsBusyId(null)
    }
  }

  const handleSaveCustomerContact = async (log) => {
    const value = contactDraft.trim()
    if (!value) return showMessage('Enter a customer mobile number.', true)
    setSmsBusyId(log.id)
    try {
      const data = await api.updateBookingContact(token, log.bookings[0].id, value)
      const updated = data.bookings || [data.booking]
      const byId = new Map(updated.map((booking) => [booking.id, booking]))
      setCustomerLogs((current) => current.map((item) => byId.get(item.id) || item))
      setEditingContactId(null)
      showMessage(`${log.passenger_name}'s mobile number updated.`)
      try {
        await loadLogs(token, activeTrip)
      } catch {
        // The contact update already succeeded and local rows are updated; a
        // transient log refresh failure should not present as a failed save.
      }
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setSmsBusyId(null)
    }
  }

  const openCrewForm = (trip) => {
    setEditingTrip(trip)
    setTripForm({
      travel_date: trip?.travel_date || selectedDate,
      route_code: trip?.route_code || routeCode,
      bus_no: trip?.registration_no || '',
      departure_time: trip?.departure_time || defaultDepartureTime(trip?.route_code || routeCode),
      status: trip?.status || 'scheduled',
      driver_name: trip?.driver_name || '',
      driver_phone: trip?.driver_phone || '',
      conductor_name: trip?.conductor_name || '',
      conductor_phone: trip?.conductor_phone || '',
    })
    setShowCrewForm(true)
  }

  const handleAddBus = async () => {
    if (!isAdmin && !staffPermissions.trips) {
      showMessage('Your staff account does not have permission for this action.', true)
      return
    }
    try {
      const data = await api.createTrip(token, {
        travel_date: selectedDate,
        route_code: routeCode,
        bus_no: '',
        departure_time: defaultDepartureTime(routeCode),
        driver_name: '',
        driver_phone: '',
        conductor_name: '',
        conductor_phone: '',
      })
      showMessage(`Bus section ${data.trip.trip_code} added. Enter the bus number and crew when they are confirmed.`)
      setTrips((current) => [...current, data.trip].sort((a, b) => (
        String(a.travel_date || '').localeCompare(String(b.travel_date || ''))
        || Number(a.id) - Number(b.id)
      )))
      setActiveTripId(data.trip.id)
      if (activeTab === 'Dashboard') await openAdminDashboard()
    } catch (err) {
      showMessage(err.message, true)
    }
  }

  const handleSaveCrewDetails = async () => {
    if (!editingTrip) return
    try {
      const data = await api.updateTrip(token, editingTrip.id, {
        travel_date: editingTrip.travel_date,
        route_code: editingTrip.route_code,
        bus_id: editingTrip.bus_id || null,
        bus_no: tripForm.bus_no,
        departure_time: tripForm.departure_time,
        status: tripForm.status,
        driver_name: tripForm.driver_name,
        driver_phone: tripForm.driver_phone,
        conductor_name: tripForm.conductor_name,
        conductor_phone: tripForm.conductor_phone,
      })
      setShowCrewForm(false)
      setEditingTrip(null)
      const next = await loadTrips(token, selectedDate, routeCode)
      setTrips(next)
      const updatedTrip = next.find((trip) => trip.id === data.trip.id) || data.trip
      setActiveTripId(updatedTrip.id)
      await loadLogs(token, updatedTrip)
      if (isAdmin) {
        await loadFleet(token)
        await refreshAccountsData()
      }
      showMessage('Bus number and crew details saved.')
    } catch (err) {
      showMessage(err.message, true)
    }
  }

  const handleWorkspaceSaved = async (trip) => {
    const next = await loadTrips(token, selectedDate, routeCode)
    const updatedTrip = next.find((item) => item.id === trip.id) || trip
    setActiveTripId(updatedTrip.id)
    await loadLogs(token, updatedTrip)
    if (isAdmin) await refreshAccountsData()
  }

  const handleDeleteTrip = async (trip) => {
    const busLabel = trip.registration_no || trip.trip_code
    setConfirmDialog({
      title: `Delete bus section ${busLabel}?`,
      message: 'Cancel active passenger bookings and remove its cargo entries first. Cancelled booking history will be preserved when applicable.',
      confirmLabel: 'Delete bus section',
      onConfirm: async () => {
    try {
      const result = await api.deleteTrip(token, trip.id)
      const next = await loadTrips(token, selectedDate, routeCode)
      setTrips(next)
      const nextActive = next.find((item) => item.id !== trip.id) || next[0] || null
      setActiveTripId(nextActive?.id || null)
      await loadLogs(token, nextActive)
      if (activeTab === 'Dashboard' || activeTab === 'Accounts') await openAdminDashboard()
      showMessage(result.archived
        ? `Bus section ${busLabel} deleted. Cancelled booking history was preserved.`
        : `Bus section ${busLabel} deleted.`)
    } catch (err) {
      showMessage(err.message, true)
    }
      },
    })
  }

  const handleDeleteCargo = async (item) => {
    setConfirmDialog({
      title: `Delete luggage entry ${item.cargo_ref}?`,
      message: 'This luggage record will be permanently removed.',
      confirmLabel: 'Delete luggage entry',
      onConfirm: async () => {
    try {
      const result = await api.deleteCargo(token, item.id)
      await loadLogs(token, activeTrip)
      showMessage(result.message || 'Luggage entry deleted.')
    } catch (err) {
      showMessage(err.message, true)
    }
      },
    })
  }

  const handleSaveBus = async () => {
    const registrationNo = String(busForm.registration_no || '').trim()
    const mobileNo = String(busForm.mobile_no || '').trim()
    if (!registrationNo) {
      showMessage('Enter a bus registration number.', true)
      return
    }
    setBusSaving(true)
    try {
      if (editingBus) {
        await api.updateBus(token, editingBus.id, { ...busForm, registration_no: registrationNo })
        if (mobileNo) await api.createBusContact(token, { bus_no: registrationNo, phone_number: mobileNo })
        showMessage('Bus details updated.')
      } else {
        const result = await api.createBus(token, { ...busForm, registration_no: registrationNo })
        if (mobileNo) await api.createBusContact(token, { bus_no: registrationNo, phone_number: mobileNo })
        showMessage(result.reactivated ? 'Inactive bus reactivated.' : 'Bus registered.')
      }
      setShowBusForm(false)
      setEditingBus(null)
      await loadFleet(token)
      const contacts = await api.adminBusContacts(token)
      setBusContactList(contacts.contacts || [])
      if (activeTab === 'Dashboard') await openAdminDashboard()
      else setAdminStats(await api.adminDashboard(token))
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusSaving(false)
    }
  }

  const handleDeactivateBus = async (bus) => {
    setConfirmDialog({
      title: `Deactivate or remove ${bus.registration_no}?`,
      message: 'If this bus has historical trips, it will be deactivated so its history remains available.',
      confirmLabel: 'Continue',
      onConfirm: async () => {
    try {
      const data = await api.deleteBus(token, bus.id)
      showMessage(data.message || 'Bus updated.')
      await loadFleet(token)
      if (activeTab === 'Dashboard') await openAdminDashboard()
    } catch (err) {
      showMessage(err.message, true)
    }
      },
    })
  }

  const handleActivateBus = async (bus) => {
    try {
      await api.updateBus(token, bus.id, { status: 'active' })
      await loadFleet(token)
      if (activeTab === 'Dashboard') await openAdminDashboard()
      showMessage(`${bus.registration_no} is active again.`)
    } catch (err) {
      showMessage(err.message, true)
    }
  }

  const handleBusImage = async (bus, file) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await api.uploadBusImage(token, bus.id, reader.result)
        await loadFleet(token)
        showMessage('Bus image updated.')
      } catch (err) {
        showMessage(err.message, true)
      }
    }
    reader.readAsDataURL(file)
  }

  const openAdminDashboard = async () => {
    if (adminDashboardRequestRef.current) return adminDashboardRequestRef.current
    if (!isAdmin) {
      showMessage('Admin access required.', true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
      return
    }
    const startedAt = performance.now()
    const pending = (async () => {
      setAdminDataLoading(true)
      setProfitLedgerError('')
      try {
        const [data, revenueData, expenseData] = await Promise.all([
          api.adminDashboard(token),
          api.adminRevenueEntries(token, { summary: true }),
          api.adminExpenseSubmissions(token),
        ])
        setAdminStats(data)
        setProfitLedger({ revenueEntries: revenueData.entries || [], expenseSubmissions: expenseData.submissions || [] })
        setProfitLedgerLoaded(true)
        setProfitLedgerError('')
        console.info(JSON.stringify({ kind: 'admin_dashboard_load_perf', duration_ms: Number((performance.now() - startedAt).toFixed(1)) }))
        requestAnimationFrame(() => requestAnimationFrame(() => {
          console.info(JSON.stringify({ kind: 'admin_dashboard_data_to_paint_perf', duration_ms: Number((performance.now() - startedAt).toFixed(1)) }))
        }))
      } catch (err) {
        setProfitLedgerError(err.message || 'Request failed')
        showMessage(err.message, true)
      } finally {
        setAdminDataLoading(false)
      }
    })()
    adminDashboardRequestRef.current = pending
    try {
      await pending
    } finally {
      if (adminDashboardRequestRef.current === pending) adminDashboardRequestRef.current = null
    }
  }

  const handleAddExpense = async (event) => {
    event.preventDefault()
    setExpenseSaving(true)
    try {
      const expenseDate = expenseForm.expense_date
      await api.createAdminExpense(token, { ...expenseForm, category: 'Monthly Expense', expense_date: expenseDate, amount: Number(expenseForm.amount), expense_source: 'monthly' })
      setMonthlyExpenseMonth(expenseDate.slice(0, 7))
      setRevenueDate(expenseDate)
      const [data, revenueData, expenseData] = await Promise.all([api.adminDashboard(token), api.adminRevenueEntries(token, { summary: true }), api.adminExpenseSubmissions(token)])
      setAdminStats(data)
      setProfitLedger({ revenueEntries: revenueData.entries || [], expenseSubmissions: expenseData.submissions || [] })
      setProfitLedgerLoaded(true)
      setProfitLedgerError('')
      setProfitLedger((current) => ({ ...current, monthlyExpenses: data.expenses || [] }))
      setExpenseForm((current) => ({ ...current, description: '', amount: '' }))
      showMessage('Monthly expense saved.')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setExpenseSaving(false)
    }
  }

  const refreshAccountsData = async () => {
    try {
      const [data, revenueData, expenseData] = await Promise.all([api.adminDashboard(token), api.adminRevenueEntries(token, { summary: true }), api.adminExpenseSubmissions(token)])
      setAdminStats(data)
      setProfitLedger({ revenueEntries: revenueData.entries || [], expenseSubmissions: expenseData.submissions || [] })
      setProfitLedgerLoaded(true)
      setProfitLedgerError('')
      return data
    } catch (err) {
      setProfitLedgerError(err.message || 'Request failed')
      throw err
    }
  }

  const handleCreateDuty = async (event) => {
    event.preventDefault()
    setDutySaving(true)
    try {
      const result = await api.createBusDuty(token, dutyForm)
      const data = await refreshAccountsData()
      setSelectedDutyId(result.duty.id)
      setDutyForm({ bus_no: '', first_trip_id: '', return_trip_id: '' })
      showMessage(`Created ${result.duty.duty_code}.`)
      return data
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setDutySaving(false)
    }
  }

  const handleAddDutyExpense = async (event) => {
    event.preventDefault()
    if (!selectedDuty) return
    setDutySaving(true)
    try {
      await api.addDutyExpense(token, selectedDuty.id, { ...dutyExpenseForm, amount: Number(dutyExpenseForm.amount), trip_id: dutyExpenseForm.trip_id || null })
      await refreshAccountsData()
      setDutyExpenseForm((current) => ({ ...current, description: '', amount: '', trip_id: '' }))
      showMessage(`Expense added to ${selectedDuty.duty_code}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setDutySaving(false)
    }
  }

  const handleAddDutyAdjustment = async (event) => {
    event.preventDefault()
    if (!selectedDuty) return
    setDutySaving(true)
    try {
      await api.addDutyAdjustment(token, selectedDuty.id, { ...dutyAdjustmentForm, amount: Number(dutyAdjustmentForm.amount), trip_id: dutyAdjustmentForm.trip_id || null })
      await refreshAccountsData()
      setDutyAdjustmentForm((current) => ({ ...current, description: '', amount: '', trip_id: '', seat_number: '' }))
      showMessage(`Financial adjustment added to ${selectedDuty.duty_code}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setDutySaving(false)
    }
  }

  const handleDeleteDutyEntry = async (entry) => {
    if (!selectedDuty || selectedDuty.status === 'finalized') return
    setConfirmDialog({
      title: `Delete ${entry.kind === 'expense' ? 'expense' : 'financial entry'}?`,
      message: `${entry.description} · Rs. ${Number(entry.amount).toLocaleString('en-US')}. This will update the duty totals and cannot be undone.`,
      confirmLabel: 'Delete entry',
      onConfirm: async () => {
    setDutySaving(true)
    try {
      if (entry.kind === 'expense') await api.deleteDutyExpense(token, selectedDuty.id, entry.id)
      else await api.deleteDutyAdjustment(token, selectedDuty.id, entry.id)
      await refreshAccountsData()
      showMessage('Duty financial entry deleted.')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setDutySaving(false)
    }
      },
    })
  }

  const handleFinalizeDuty = async () => {
    if (!finalizeDutyTarget) return
    setDutySaving(true)
    try {
      await api.finalizeBusDuty(token, finalizeDutyTarget.id, acknowledgeNoDutyExpenses)
      await refreshAccountsData()
      setFinalizeDutyTarget(null)
      setAcknowledgeNoDutyExpenses(false)
      showMessage(`${finalizeDutyTarget.duty_code} profit finalized and saved.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setDutySaving(false)
    }
  }

  const openStaffManagement = async () => {
    if (!isAdmin) {
      showMessage('Admin access required.', true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
      return
    }
    try {
      const [staffData, crewData, fleetData] = await Promise.all([api.adminStaff(token), api.adminCrew(token), api.buses(token, true)])
      setStaffList(staffData.staff || [])
      setCrewList(crewData.crew || [])
      setBuses(fleetData.buses || [])
    } catch (err) {
      showMessage(err.message, true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
    }
  }

  const printNow = (mode) => {
    if (!activeTrip) {
      showMessage('Select a trip first before printing the manifest.', true)
      return
    }
    setPrintMode(mode)
    setTimeout(() => window.print(), 50)
  }

  const openEntryForm = (section) => {
    if (!activeTrip) {
      showMessage('Select a bus section before adding an entry.', true)
      return
    }
    setEntryFocus({ tripId: activeTrip.id, section, key: Date.now() })
    setActiveTab('Home')
  }

  useEffect(() => {
    if (!printMode) return

    const handleAfterPrint = () => setPrintMode(null)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [printMode])

  if (authStatus === 'checking') {
    return <main className="auth-page" role="status" aria-live="polite"><section className="login-panel"><img className="brand-logo" src="/logo.png" alt="District Line" /><p>Checking your session…</p></section></main>
  }

  if (authStatus === 'error') {
    return <main className="auth-page"><section className="login-panel" role="alert"><img className="brand-logo" src="/logo.png" alt="District Line" /><h1>Unable to verify session</h1><p>{authError}</p><button type="button" className="primary-button wide" onClick={verifySession}>Retry</button></section></main>
  }

  if (authStatus !== 'authenticated' || !token) {
    return (
      <div className="auth-page">
        <div className="auth-backdrop" aria-hidden="true" />
        <section className="login-panel" aria-labelledby="login-title">
          <img className="brand-logo" src="/logo.png" alt="District Line" />
          <h1 id="login-title">District Line Admin</h1>
          <p>Sign in to manage fleet bookings and operations</p>
          <form onSubmit={(event) => { event.preventDefault(); handleLogin() }}>
            <label htmlFor="login-username">Username / Admin ID</label>
            <input id="login-username" required autoComplete="username" autoFocus value={loginForm.username} onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))} />
            <label htmlFor="login-password">Password</label>
            <input id="login-password" required type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))} />
            {loginError ? <div className="banner error" role="alert">{loginError}</div> : null}
            <button type="submit" className="primary-button wide login-submit" disabled={loginLoading}>{loginLoading ? 'Signing in…' : 'Sign In'}</button>
          </form>
          <p className="login-hint">Colombo | Kattankudy Express Service</p>
        </section>
      </div>
    )
  }

  return (
    <div className={`app-shell print-${printMode || 'screen'}`}>
      <header className="topbar no-print">
        <div className="topbar-brand">
          <img className="nav-logo" src="/logo-transparent.png" alt="District Line" />
          <div className="topbar-left">Operational date: {selectedDate}</div>
        </div>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <nav id="primary-navigation" className={`nav-tabs${mobileNavOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          {navTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'nav-button active' : 'nav-button'}
              onClick={() => {
                if ((tab === 'Dashboard' || tab === 'Accounts' || tab === 'Customers' || tab === 'Staff') && !isAdmin) {
                  showMessage('Staff cannot open admin-only pages.', true)
                  return
                }
                setActiveTab(tab)
                setMobileNavOpen(false)
                if ((tab === 'Dashboard' || tab === 'Accounts' || tab === 'Customers') && (!adminStats || !profitLedgerLoaded)) openAdminDashboard()
                if (tab === 'Staff') openStaffManagement()
                if (tab === 'Log') loadLogs(token, activeTrip)
              }}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="topbar-user">
          <button
            type="button"
            className="topbar-profile-button"
            onClick={() => { if (isAdmin) setShowProfile(true) }}
            disabled={!isAdmin}
            aria-label={isAdmin ? 'Open admin profile' : `${user?.fullName || 'User'} profile`}
          >
            {user?.profilePhoto ? (
              <img className="user-avatar user-avatar-photo" src={assetUrl(user.profilePhoto)} alt="" />
            ) : (
              <div className="user-avatar">{(user?.fullName || 'U').slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <strong>{user?.fullName}</strong>
              <small>{isAdmin ? 'Administrator' : 'Staff'} · Dispatcher HQ</small>
            </div>
          </button>
          <button type="button" className="topbar-logout-button" onClick={handleLogout} aria-label="Log out" title="Log out">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6" />
              <path d="M3 12h12m-4-4 4 4-4 4" />
            </svg>
          </button>
        </div>
      </header>

      {(notice || error) && (
        <div className={`action-toast ${error ? 'error' : 'success'} no-print`} role={error ? 'alert' : 'status'} aria-live="polite">
          <span className="action-toast-icon" aria-hidden="true">{error ? '!' : '✓'}</span>
          <span className="action-toast-text">{error || notice}</span>
          <button type="button" className="action-toast-close" aria-label="Dismiss notification" onClick={() => { setNotice(''); setError('') }}>×</button>
        </div>
      )}

      {activeTab === 'Home' && staffPermissions.home && (
        <main className="dashboard">
          <div className="left-panel compact-card no-print">
            <div className="mini-calendar">
              <div className="calendar-header">
                <span>{new Date(calendarCursor.year, calendarCursor.month).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</span>
                <div className="calendar-nav">
                  <button type="button" onClick={() => setCalendarCursor((prev) => ({ year: prev.month === 0 ? prev.year - 1 : prev.year, month: prev.month === 0 ? 11 : prev.month - 1 }))}>‹</button>
                  <button type="button" onClick={() => setCalendarCursor((prev) => ({ year: prev.month === 11 ? prev.year + 1 : prev.year, month: prev.month === 11 ? 0 : prev.month + 1 }))}>›</button>
                </div>
              </div>
              <div className="calendar-grid">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => <span key={day} className="calendar-day-name">{day}</span>)}
                {calendarCells.map((cell) => cell.blank ? <span key={cell.key} /> : (
                  <button
                    key={cell.key}
                    type="button"
                    className={`calendar-date ${cell.iso === selectedDate ? 'selected' : ''}`}
                    onClick={() => {
                      clearTripView()
                      setSelectedDate(cell.iso)
                    }}
                  >
                    {cell.day}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="main-panel">
            <div className="route-card no-print">
              <div className="route-header">
                <span className="route-tag">Selected active corridor</span>
                <span className="route-title">{route.label}</span>
              </div>
              <div className="route-boxes">
                {ROUTES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={`route-box ${routeCode === item.code ? 'active' : ''}`}
                    onClick={() => {
                      clearTripView()
                      setRouteCode(item.code)
                    }}
                  >
                    <div className="route-arrow">{item.code === 'KTY_CMB' ? '←' : '→'}</div>
                    <div className="route-text">
                      <strong>{item.label}</strong>
                      <small>{item.via}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="schedule-strip">
              <span className="schedule-badge">Scheduled run: {selectedDate}</span>
              <span>Super Luxury 49-Sleeper | {route.short}</span>
              <span>{trips.length} bus section{trips.length === 1 ? '' : 's'} | {trips.reduce((sum, trip) => sum + Number(trip.booked_count || 0), 0)} seats booked</span>
            </div>

            <div className="home-bus-banner">
              <img src="/bus.png" alt="District Line coach travelling along the coast" loading="lazy" />
              <div className="home-bus-banner-label">
                <span>District Line · Express Service</span>
                <strong>{route.label}</strong>
              </div>
            </div>
          </div>

          <div className="trip-workspaces">
            {trips.map((trip, index) => (
              <article className="trip-workspace-card" key={trip.id}>
                <h2>{trip.registration_no || 'Bus number not entered'}</h2>
                <TripWorkspace
                  token={token}
                  permissions={staffPermissions}
                  trip={trip}
                  formNumber={index + 1}
                  date={selectedDate}
                  route={route}
                  onEditCrew={staffPermissions.trips ? openCrewForm : undefined}
                  onDeleteTrip={staffPermissions.trips ? handleDeleteTrip : undefined}
                  onAddBus={staffPermissions.trips ? handleAddBus : undefined}
                  onSaved={handleWorkspaceSaved}
                  showMessage={showMessage}
                  entryFocus={entryFocus}
                />
              </article>
            ))}
            {trips.length === 0 ? (
              <div className="empty-trip-state">
                <p>No bus sections are set up for this date and route.</p>
                {staffPermissions.trips ? <button type="button" className="primary-button small add-another-bus" onClick={handleAddBus}>+ Add bus section</button> : null}
              </div>
            ) : null}
          </div>
        </main>
      )}

      {activeTab === 'Log' && staffPermissions.log && (
        <main className="content-page">
          <section className="log-context-panel no-print">
            <div className="log-calendar-card">
              <div className="log-calendar-topline">
                <strong><span aria-hidden="true">▦</span> {new Date(calendarCursor.year, calendarCursor.month).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</strong>
                <div className="log-calendar-controls">
                  <button type="button" aria-label="Previous month" onClick={() => setCalendarCursor((prev) => ({ year: prev.month === 0 ? prev.year - 1 : prev.year, month: prev.month === 0 ? 11 : prev.month - 1 }))}>‹</button>
                  <button type="button" className="log-today-button" onClick={() => {
                    const today = new Date()
                    clearTripView()
                    setSelectedDate(todayIso())
                    setCalendarCursor({ year: today.getFullYear(), month: today.getMonth() })
                  }}>Today ({new Date().getDate()})</button>
                  <button type="button" aria-label="Next month" onClick={() => setCalendarCursor((prev) => ({ year: prev.month === 11 ? prev.year + 1 : prev.year, month: prev.month === 11 ? 0 : prev.month + 1 }))}>›</button>
                </div>
              </div>
              <div className="log-calendar-grid">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => <span key={day} className="log-calendar-weekday">{day}</span>)}
                {calendarCells.map((cell) => cell.blank ? <span key={cell.key} /> : (
                  <button
                    key={cell.key}
                    type="button"
                    className={`log-calendar-date ${cell.iso === selectedDate ? 'selected' : ''}`}
                    onClick={() => {
                      clearTripView()
                      setSelectedDate(cell.iso)
                    }}
                  >{cell.day}</button>
                ))}
              </div>
              <div className="log-calendar-legend"><span><i /> Selected: {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            </div>

            <div className="corridor-allocation-card">
              <div className="corridor-allocation-heading">
                <span>Primary Corridor Allocation</span>
                <b>Night Super Express Service</b>
              </div>
              <div className="log-corridor-options">
                {ROUTES.map((item) => {
                  const selected = item.code === routeCode
                  return (
                    <button
                      key={item.code}
                      type="button"
                      className={`log-corridor-option ${selected ? 'selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => {
                        if (selected) return
                        clearTripView()
                      setLogFilters((prev) => ({ ...prev, from: '', status: prev.from ? '' : prev.status }))
                        setRouteCode(item.code)
                      }}
                    >
                      <strong>{item.label}</strong>
                    </button>
                  )
                })}
              </div>
              <div className="log-corridor-current-trip">
                <span>▦ Date: {selectedDate}</span>
                <span>▣ Coach: {activeTrip?.registration_no || 'Select bus'}{activeTrip?.bus_name ? ` (${activeTrip.bus_name})` : ''}</span>
                <span>◷ Departure: {activeTrip?.departure_time || '—'}</span>
                <span>♙ Lead Driver: {activeTrip?.driver_name || '—'}</span>
                <span>♧ Conductor: {activeTrip?.conductor_name || '—'}</span>
              </div>
            </div>
          </section>
          <section className="content-card log-card">
            <div className="logs-toolbar customer-log-toolbar">
              <div className="customer-log-heading">
                <div className="customer-log-title">
                  <span className="customer-log-code">C-1</span>
                  <h2>Customer Log · C1</h2>
                  <span className="booked-seat-count">{bookedSeatCount} Seats Booked</span>
                </div>
                <div className="customer-log-details">
                  <span>Date: {selectedDate}</span>
                  <span>Route: {route.label}</span>
                  <span>Bus No: {activeTrip?.registration_no || '—'}</span>
                  <span>Driver: {activeTrip?.driver_name || '—'}</span>
                  <span>Conductor: {activeTrip?.conductor_name || '—'}</span>
                </div>
              </div>
              <div className="toolbar-actions">
                <label className="date-picker-inline">
                  <span>Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      clearTripView()
                      setSelectedDate(event.target.value)
                    }}
                  />
                </label>
                <label className="bus-picker-inline">
                  <span>Bus</span>
                  <select
                    value={activeTrip?.id ?? ''}
                    onChange={(event) => setActiveTripId(Number(event.target.value) || null)}
                  >
                    <option value="">Select bus</option>
                    {trips.map((trip) => (
                      <option key={trip.id} value={trip.id}>{trip.registration_no || 'Unassigned'} · {trip.trip_code}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-button small customer-print-button" onClick={() => printNow('passengers')}><span aria-hidden="true">▣</span> Print Customer Manifest</button>
                {staffPermissions.passengers && <button type="button" className="primary-button small customer-entry-button" onClick={() => openEntryForm('passenger')}><span aria-hidden="true">⊕</span> Add Passenger</button>}
              </div>
            </div>
            <div className="filter-row no-print">
              <input placeholder="Search name, phone or seat" value={logFilters.q} onChange={(event) => setLogFilters((prev) => ({ ...prev, q: event.target.value }))} />
              <select value={logFilters.from} onChange={(event) => setLogFilters((prev) => ({ ...prev, from: event.target.value, status: event.target.value ? 'confirmed' : '' }))} aria-label="Filter by boarding point">
                <option value="">All From</option>
                {route.boarding.map((point) => <option key={point} value={point}>{point}</option>)}
              </select>
              {logFilters.from ? <span className="from-filter-count" role="status">{logsLoading ? 'Filtering…' : `${customerLogs.length} confirmed customer${customerLogs.length === 1 ? '' : 's'}`}</span> : null}
              <select value={logFilters.sms} onChange={(event) => setLogFilters((prev) => ({ ...prev, sms: event.target.value }))}>
                <option value="">All SMS</option>
                <option value="pending">Pending</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
              </select>
              <select value={logFilters.from ? 'confirmed' : logFilters.status} disabled={Boolean(logFilters.from)} onChange={(event) => setLogFilters((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="">All bookings</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button type="button" className="ghost-button small" onClick={() => loadLogs(token, activeTrip)}>Search</button>
            </div>
            <div className="log-table-scroll passenger-log-table-scroll">
            <table className="print-passengers">
              <thead>
                <tr>
                  <th>Seat</th>
                  <th>Passenger</th>
                  <th>Gender</th>
                  <th>Contact</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Fare</th>
                  <th>Remarks / Notes</th>
                  <th>Seat status</th>
                  <th className="no-print">SMS</th>
                  <th className="no-print">Confirm</th>
                  <th className="no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {customerLogRows.map((log) => {
                  const isConfirmed = log.all_confirmed
                  const isCancelled = !log.any_active
                  const formattedSmsDateTime = formatSmsDateTime(log.sms_sent_at)
                  const canSendSms = log.bookings.some((booking) => booking.status !== 'cancelled' && booking.confirmation_status === 'confirmed' && !['sent', 'delivered'].includes(booking.sms_status))
                  const cancellationSmsSent = log.bookings.every((booking) => booking.sms_message_type === 'cancellation' && ['sent', 'delivered'].includes(booking.sms_status))
                  const canSendCancellationSms = isCancelled && !cancellationSmsSent
                  const smsStatusLabel = log.sms_message_type === 'cancellation' && ['sent', 'delivered'].includes(log.sms_status)
                    ? 'Cancellation sent'
                    : ({ pending: 'Pending', queued: 'Sending', sent: 'Sent', delivered: 'Sent', failed: 'Failed', mixed: 'Mixed' }[log.sms_status] || log.sms_status)
                  return (
                    <tr key={log.booking_group_id || log.id} className={isCancelled ? 'row-cancelled' : ''}>
                      <td>{log.seat_numbers.join(', ')}</td>
                      <td>{log.passenger_name}</td>
                      <td>{log.gender || '—'}</td>
                      <td>{editingContactId === log.id ? <div className="customer-contact-edit"><input type="tel" maxLength={30} value={contactDraft} aria-label={`Mobile number for ${log.passenger_name}`} onChange={(event) => setContactDraft(event.target.value)} /><button type="button" className="ghost-button small" disabled={smsBusyId === log.id} onClick={() => handleSaveCustomerContact(log)}>Save</button><button type="button" className="ghost-button small" onClick={() => setEditingContactId(null)}>Cancel</button></div> : <>{log.contact}{staffPermissions.passengers && <button type="button" className="ghost-button small" onClick={() => { setEditingContactId(log.id); setContactDraft(log.contact || '') }}>Edit</button>}</>}</td>
                      <td>{log.boarding_point}</td>
                      <td>{log.destination}</td>
                      <td>{log.fare_total}</td>
                      <td>{log.notes || '—'}</td>
                      <td><span className={`confirmation-pill ${isCancelled ? 'cancelled' : (isConfirmed ? 'confirmed' : 'unconfirmed')}`}>{isCancelled ? 'cancelled' : (isConfirmed ? 'confirmed' : 'unconfirmed')}</span></td>
                      <td className="no-print">
                        <span className={`sms-pill ${log.sms_status === 'queued' ? 'sending' : log.sms_status}`}>{smsBusyId === log.id ? 'Sending' : smsStatusLabel}</span>
                        {formattedSmsDateTime ? <small className="sms-meta">{formattedSmsDateTime}</small> : null}
                        {log.sms_error ? <small className="sms-meta sms-error-text">{log.sms_error}</small> : null}
                        {isConfirmed && canSendSms && staffPermissions.passengers ? <button type="button" className="sms-send-button" disabled={smsBusyId === log.id} onClick={() => handleSendConfirmationSms(log)}>{log.sms_status === 'failed' ? 'Retry confirmation SMS' : 'Send confirmation SMS'}</button> : null}
                        {canSendCancellationSms && staffPermissions.passengers ? <button type="button" className="sms-send-button cancellation-sms-button" disabled={smsBusyId === log.id} onClick={() => handleCancellationSms(log)}>{smsBusyId === log.id ? 'Sending…' : (log.sms_message_type === 'cancellation' && log.sms_status === 'failed' ? 'Retry cancellation SMS' : 'Send cancellation SMS')}</button> : null}
                      </td>
                      <td className="no-print">
                        <input
                          type="checkbox"
                          checked={isConfirmed}
                          disabled={!log.any_active || smsBusyId === log.id || !staffPermissions.passengers}
                          aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} booking for ${log.passenger_name}`}
                          onChange={(event) => handleBookingConfirmation(log, event.target.checked)}
                        />
                      </td>
                      <td className="no-print">
                        {log.any_active && staffPermissions.passengers ? (
                          <button type="button" className="ghost-button small" onClick={() => setCancelTarget(log)}>Cancel</button>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </section>

          <section className="content-card log-card">
            <div className="logs-toolbar cargo-log-toolbar">
              <div className="customer-log-heading">
                <div className="customer-log-title">
                  <span className="customer-log-code cargo-log-code">L-1</span>
                  <h2>Luggage Log · L1</h2>
                  <span className="cargo-verified-badge">Cargo Bay Verified</span>
                </div>
                <div className="customer-log-details">
                  <span>Date: {selectedDate}</span>
                  <span>Route: {route.label}</span>
                  <span>Bus No: {activeTrip?.registration_no || '—'}</span>
                  <span>Driver: {activeTrip?.driver_name || '—'}</span>
                  <span>Conductor: {activeTrip?.conductor_name || '—'}</span>
                </div>
              </div>
              <div className="toolbar-actions">
                <button type="button" className="secondary-button small cargo-print-button" onClick={() => printNow('cargo')}>Print Luggage Manifest</button>
                {staffPermissions.cargo && <button type="button" className="primary-button small cargo-entry-button" onClick={() => openEntryForm('cargo')}>New Freight Entry</button>}
              </div>
            </div>
            <div className="log-table-scroll cargo-log-table-scroll">
            <table className="print-cargo cargo-log-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Goods Description</th>
                  <th>Quantity</th>
                  <th>Customer Name</th>
                  <th>Contact Number</th>
                  <th>Destination</th>
                  <th>Fees (Rs.)</th>
                  <th>Payment</th>
                  <th className="no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {cargoLogs.map((item) => (
                  <tr key={item.id}>
                    <td className="cargo-bill-number">{item.cargo_ref}</td>
                    <td className="cargo-goods-description"><strong>{item.description}</strong>{item.notes ? <small>{item.notes}</small> : null}</td>
                    <td>{item.weight || '—'}</td>
                    <td>{item.sender_name || item.receiver_name || '—'}</td>
                    <td>{item.sender_phone || item.receiver_phone || '—'}</td>
                    <td>{route.label.split(' to ')[1] || '—'}</td>
                    <td className="cargo-fee">{Number(item.charge || 0).toLocaleString('en-US')}</td>
                    <td><span className={`cargo-payment-badge ${String(item.payment_status || '').toLowerCase() === 'paid' ? 'paid' : String(item.payment_status || '').toLowerCase() === 'pass' ? 'pass' : 'cod'}`}>{String(item.payment_status || '').toLowerCase() === 'paid' ? '● Paid' : String(item.payment_status || '').toLowerCase() === 'pass' ? '● Pass' : '● COD'}</span></td>
                    <td className="no-print cargo-action-cell">{staffPermissions.cargo ? <button type="button" className="cargo-delete-button" aria-label={`Delete luggage entry ${item.cargo_ref}`} title="Delete luggage entry" onClick={() => handleDeleteCargo(item)}><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg></button> : null}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="9">
                    <span>Total Registered Cargo: {cargoLogs.length} consignment{cargoLogs.length === 1 ? '' : 's'} · Collected / In Transit: <strong>Rs. {cargoLogs.reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</strong></span>
                    <span className="cargo-payment-totals"><span><i className="paid-dot" />Paid: Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() === 'paid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span><span><i className="cod-dot" />Collect on Delivery (COD): Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() === 'unpaid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span></span>
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>
          </section>
        </main>
      )}

      {activeTab === 'Info' && staffPermissions.info && (
        <main className="content-page info-page">
          <section className="info-hero">
            <div className="info-hero-copy">
              <span className="info-eyebrow">DISTRICT LINE · EXPRESS SERVICE</span>
              <h1>Your journey, connected.</h1>
              <p>Plan a comfortable trip between Colombo and Kattankudy with a team that keeps every journey organised, from seat reservation to arrival.</p>
              <button type="button" className="primary-button" onClick={() => setActiveTab('Home')}>Explore trips <span aria-hidden="true">→</span></button>
            </div>
            <div className="info-route-art" aria-label="Service route from Colombo to Kattankudy">
              <div className="info-route-point"><span className="info-route-dot" /><strong>Colombo</strong><small>Western Province</small></div>
              <div className="info-route-line"><span>↔</span></div>
              <div className="info-route-point destination"><span className="info-route-dot" /><strong>Kattankudy</strong><small>Eastern Province</small></div>
              <span className="info-route-caption">A link between the coast and the capital</span>
            </div>
          </section>

          <section className="info-intro">
            <div><span className="info-eyebrow">TRAVEL WITH CONFIDENCE</span><h2>Every trip starts with a clear plan.</h2></div>
            <p>Choose your travel date, check available seats, and reserve for your preferred route. Our operations team coordinates passenger bookings, trip details, and luggage services in one place.</p>
          </section>

          <section className="info-directions" aria-label="Choose a travel direction">
            <button type="button" className="info-direction-card" onClick={() => { setRouteCode('CMB_KTY'); setActiveTab('Home') }}>
              <span className="info-direction-kicker">TRAVEL EAST</span><span className="info-direction-cities">Colombo <i aria-hidden="true">→</i> Kattankudy</span><span className="info-direction-action">Explore this direction <b aria-hidden="true">↗</b></span>
            </button>
            <button type="button" className="info-direction-card" onClick={() => { setRouteCode('KTY_CMB'); setActiveTab('Home') }}>
              <span className="info-direction-kicker">TRAVEL WEST</span><span className="info-direction-cities">Kattankudy <i aria-hidden="true">→</i> Colombo</span><span className="info-direction-action">Explore this direction <b aria-hidden="true">↗</b></span>
            </button>
          </section>

          <section className="info-feature-grid" aria-label="Our services">
            <article className="info-feature-card"><span className="info-feature-icon" aria-hidden="true">01</span><h3>Seat reservations</h3><p>View the seat layout and reserve a seat for the date and direction that suit your journey.</p></article>
            <article className="info-feature-card"><span className="info-feature-icon" aria-hidden="true">02</span><h3>Passenger support</h3><p>Keep your booking details together, including your contact number and boarding and destination points.</p></article>
            <article className="info-feature-card"><span className="info-feature-icon" aria-hidden="true">03</span><h3>Luggage & freight</h3><p>Arrange a consignment with sender, receiver, destination, and payment details recorded for the trip.</p></article>
          </section>

          <section className="info-booking-strip">
            <div><span className="info-eyebrow">HOW TO BOOK</span><h2>Three simple steps</h2></div>
            <ol><li><span>1</span><div><strong>Choose your trip</strong><small>Select the route and travel date.</small></div></li><li><span>2</span><div><strong>Pick your seat</strong><small>Choose from the available seats.</small></div></li><li><span>3</span><div><strong>Share your details</strong><small>Enter passenger information to complete the reservation.</small></div></li></ol>
            <button type="button" className="ghost-button" onClick={() => setActiveTab('Home')}>View available trips <span aria-hidden="true">→</span></button>
          </section>

        </main>
      )}

      {activeTab === 'Staff' && isAdmin && (
        <StaffManagement token={token} staffList={staffList} setStaffList={setStaffList} crewList={crewList} setCrewList={setCrewList} buses={buses} onRegisterBus={() => { setEditingBus(null); setBusForm({ registration_no: '', mobile_no: '', display_name: '', driver_name: '', driver_phone: '', conductor_name: '', conductor_phone: '', image_url: '/bus.jpg' }); setShowBusForm(true) }} onDeleteBus={handleDeactivateBus} onActivateBus={handleActivateBus} showMessage={showMessage} requestConfirmation={(details) => setConfirmDialog(details)} onSaved={(result) => {
          if (result.id === user?.id && result.permissions?.home === false && activeTab === 'Home') {
            const nextTab = result.permissions?.log !== false ? 'Log' : 'Info'
            setActiveTab(nextTab)
            if (nextTab === 'Log') loadLogs(token, activeTrip)
          }
        }} />
      )}

      {activeTab === 'Dashboard' && isAdmin && adminStats && (
        <main className="content-page dashboard-page">
          <ExpenseSubmissionsTable className="dashboard-profit-report" submissions={profitLedger.expenseSubmissions} trips={adminStats.trips || []} revenueEntries={profitLedger.revenueEntries} dailyRevenue={adminStats.dailyRevenue || []} monthlyExpenses={adminStats.expenses || []} loading={adminDataLoading} error={profitLedgerError} />
          <section className="content-card dashboard-seat-chart-section">
            <div className="dashboard-section-heading">
              <div><h2>Seats booked by travel date</h2><p>Confirmed seats for each route in the selected month.</p></div>
            </div>
            <div className="dashboard-seat-chart-grid">
              {seatBookingCharts.map((chart) => {
                const maximum = Math.max(0, ...chart.counts)
                const step = Math.max(1, Math.ceil(maximum / 4))
                const axisMaximum = Math.max(step * 4, 4)
                const plot = { left: 42, top: 16, width: 730, height: 210 }
                const bandWidth = plot.width / chart.dates.length
                const barWidth = Math.max(3, Math.min(24, bandWidth * 0.66))
                const showDateLabel = (index) => index % 5 === 0 || index === chart.dates.length - 1
                return <article className="dashboard-seat-chart-card" key={chart.code}>
                  <h3>{chart.code === 'KTY_CMB' ? 'Kattankudy to Colombo' : 'Colombo to Kattankudy'}</h3>
                  <svg className="dashboard-seat-chart" viewBox="0 0 800 285" role="img" aria-label={`Confirmed seats booked by date: ${chart.code === 'KTY_CMB' ? 'Kattankudy to Colombo' : 'Colombo to Kattankudy'}`}>
                    {[0, 1, 2, 3, 4].map((tick) => {
                      const value = axisMaximum - tick * step
                      const y = plot.top + (tick / 4) * plot.height
                      return <g key={`grid-${tick}`}><line x1={plot.left} y1={y} x2={plot.left + plot.width} y2={y} className="dashboard-seat-gridline" /><text x={plot.left - 8} y={y + 4} textAnchor="end" className="dashboard-seat-axis-label">{value}</text></g>
                    })}
                    <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.top + plot.height} className="dashboard-seat-axis" />
                    <line x1={plot.left} y1={plot.top + plot.height} x2={plot.left + plot.width} y2={plot.top + plot.height} className="dashboard-seat-axis" />
                    {chart.counts.map((count, index) => {
                      const height = (count / axisMaximum) * plot.height
                      const x = plot.left + index * bandWidth + (bandWidth - barWidth) / 2
                      const y = plot.top + plot.height - height
                      return <g key={chart.dates[index]}>
                        <rect x={x} y={y} width={barWidth} height={Math.max(count ? 2 : 0, height)} rx="2" className="dashboard-seat-bar"><title>{`${chart.dates[index]}: ${count} seats`}</title></rect>
                        {showDateLabel(index) && <text x={plot.left + index * bandWidth + bandWidth / 2} y={plot.top + plot.height + 22} textAnchor="middle" className="dashboard-seat-axis-label">{chart.dates[index].slice(5)}</text>}
                      </g>
                    })}
                  </svg>
                </article>
              })}
            </div>
          </section>
          {!adminStats.smsGateway?.configured && <p className="hint">SMS gateway is pending configuration. Bookings still work.</p>}
          <section className="content-card dashboard-trip-controls">
            <div className="dashboard-section-heading trip-controls-heading">
              <div><h2>Trip controls</h2><p>Filter trips by date, route, or individual trip.</p></div>
            </div>
            <div className="trip-controls-filters">
              <label>Choose date<input type="date" value={revenueDate} onChange={(event) => setRevenueDate(event.target.value)} /></label>
              <label>Bus No<select value={dashboardBus} onChange={(event) => { setDashboardBus(event.target.value); setDashboardTrip('') }}><option value="">All buses</option>{[...new Set((adminStats.buses || []).map((bus) => String(bus.registration_no || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((busNo) => <option key={busNo} value={busNo}>{busNo}</option>)}</select></label>
              <label>Route<select value={dashboardRoute} onChange={(event) => { setDashboardRoute(event.target.value); setDashboardTrip('') }}>{ROUTES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
              <label>Trip<select value={dashboardTrip} onChange={(event) => setDashboardTrip(event.target.value)}><option value="">All trips</option>{(adminStats.trips || []).filter((trip) => isInDashboardRange(trip.travel_date) && (!dashboardRoute || trip.route_code === dashboardRoute) && matchesDashboardBus(trip)).map((trip) => <option key={trip.id} value={String(trip.id)}>{trip.registration_no || 'Unassigned'} · {trip.trip_code}</option>)}</select></label>
              <strong>{dashboardRange ? `${dashboardRange.start} – ${dashboardRange.end}` : 'Choose a valid date'}</strong>
              <button type="button" className="dashboard-filter-reset" onClick={() => { setRevenueDate(todayIso()); setDashboardBus(''); setDashboardRoute('KTY_CMB'); setDashboardTrip('') }}>Reset filters</button>
            </div>
            <section className="trip-overview" aria-labelledby="trip-overview-heading">
              <div className="trip-overview-heading"><div><h3 id="trip-overview-heading">Trip Overview</h3><p>Seat availability and trip-linked revenue for the filtered trips.</p></div></div>
              {adminDataLoading ? <p className="daily-revenue-empty" role="status">Loading trip and revenue data…</p> : profitLedgerError ? <p className="daily-revenue-empty" role="alert">Unable to load Trip Overview: {profitLedgerError}</p> : !tripOverview.rows.length ? <p className="daily-revenue-empty">No trips match the selected filters.</p> : <div className="trip-overview-grid">
                <section className="trip-overview-seats" aria-label="Booked and available seats by bus and route">
                  <h4>Booked vs Available Seats</h4>
                  <div className="trip-overview-route-groups">
                    {tripOverviewRoutes.map((route) => <section className="trip-overview-route-group" key={route.code} aria-label={route.short || route.label}>
                      <h5>{route.short || route.label}</h5>
                      <div className="trip-overview-route-pies">
                        {route.buses.map((bus) => <article className="trip-overview-route-pie-card" key={bus.key}>
                          <h6>{bus.registration || (bus.busId != null ? `Bus ID ${bus.busId}` : 'Unassigned bus')}</h6>
                          <div className="trip-overview-route-chart-wrap">
                            <div className="trip-overview-pie" role="img" aria-label={`${route.short || route.label}, ${bus.registration || 'Bus'}: ${bus.booked} booked seats, ${bus.available} available seats, ${bus.totalSeats} total capacity`} style={{ background: `conic-gradient(#3B82F6 0 ${bus.bookedPercent}%, #16A34A ${bus.bookedPercent}% 100%)` }}><div><strong>{bus.totalSeats}</strong><span>Total seats</span></div></div>
                            <div className="trip-overview-route-pie-legend"><span><i className="booked" />Booked</span><span><i className="available" />Available</span></div>
                          </div>
                          <div className="trip-overview-route-seat-counts">
                            <div><span>Booked seats</span><strong>{bus.booked}</strong><small>{bus.bookedPercent.toFixed(1)}%</small></div>
                            <div><span>Available seats</span><strong>{bus.available}</strong><small>{bus.availablePercent.toFixed(1)}%</small></div>
                            <div><span>Total capacity</span><strong>{bus.totalSeats}</strong><small>{bus.tripCount} {bus.tripCount === 1 ? 'trip' : 'trips'} × {SEAT_LAYOUT.totalSeats}</small></div>
                          </div>
                        </article>)}
                      </div>
                    </section>)}
                  </div>
                </section>
                <section className="trip-overview-trip-list" aria-label="Filtered trip and vehicle details">
                  <h4>Trip details</h4>
                  {tripOverview.rows.map(({ trip, booked, available, seatRevenue, cargoRevenue, totalRevenue, unscheduled, busId }) => <article className="trip-overview-trip-card" key={unscheduled ? `bus-${busId}` : `trip-${trip.id}`}>
                    <div className="trip-overview-trip-heading"><h4>{trip.trip_code || `Trip ${trip.id}`}</h4><span>{unscheduled ? `Bus ID ${busId}` : `Trip ID ${trip.id}`}</span></div>
                    <div className="trip-overview-trip-details"><div><span>Date</span><strong>{trip.travel_date || 'No trip in selected range'}</strong></div><div><span>Route</span><strong>{trip.route_label || ROUTES.find((route) => route.code === trip.route_code)?.label || trip.route_code || 'No route assigned'}</strong></div><div><span>Bus</span><strong>{trip.registration_no || trip.bus_no || 'Unassigned'}</strong></div><div><span>Driver</span><strong>{trip.driver_name || trip.bus_driver_name || 'Unassigned'}</strong></div><div><span>Conductor</span><strong>{trip.conductor_name || trip.bus_conductor_name || 'Unassigned'}</strong></div><div><span>Seats</span><strong>{booked} booked · {available} available</strong></div></div>
                    <div className="trip-overview-revenue"><div><span>Seat Revenue</span><strong>{lkr(seatRevenue)}</strong></div><div><span>Cargo Revenue</span><strong>{lkr(cargoRevenue)}</strong></div><div className="total"><span>Total Revenue</span><strong>{lkr(totalRevenue)}</strong></div></div>
                  </article>)}
                </section>
              </div>}
            </section>
          </section>
        </main>
      )}

      {(activeTab === 'Dashboard' || activeTab === 'Accounts' || activeTab === 'Customers') && isAdmin && !adminStats && (
        <main className="content-page dashboard-page">
          <section className="content-card" role="status" aria-live="polite">
            {adminDataLoading ? 'Loading account data…' : profitLedgerError ? `Unable to load dashboard data: ${profitLedgerError}` : 'Account data is not available yet.'}
            {!adminDataLoading && profitLedgerError && <button type="button" className="primary-button small" onClick={openAdminDashboard}>Retry dashboard load</button>}
          </section>
        </main>
      )}

      {activeTab === 'Accounts' && isAdmin && adminStats && <AccountsRevenue
        data={{ ...adminStats, crewMembers: crewList }}
        token={token}
        showMessage={showMessage}
        onRefresh={refreshAccountsData}
        revenueEntries={profitLedger.revenueEntries}
        expenseSubmissionEntries={profitLedger.expenseSubmissions}
        ledgerLoading={adminDataLoading}
        onRevenueEntrySaved={(entry) => setProfitLedger((current) => ({ ...current, revenueEntries: [entry, ...current.revenueEntries].slice(0, 100) }))}
        onExpenseSubmissionSaved={(submission) => setProfitLedger((current) => ({ ...current, expenseSubmissions: [submission, ...current.expenseSubmissions].slice(0, 100) }))}
        monthlyExpenseForm={expenseForm}
        setMonthlyExpenseForm={setExpenseForm}
        monthlyExpenseSaving={expenseSaving}
        onAddMonthlyExpense={handleAddExpense}
        onPrint={() => { setPrintMode('accounts'); setTimeout(() => window.print(), 50) }}
      />}

      {activeTab === 'Customers' && isAdmin && adminStats && (
        <main className="content-page dashboard-page">
          <section className="customer-destination-section">
            <div className="customer-analytics-heading">
              <div><h2>Popular departure</h2><p>Confirmed bookings by departure point within each route.</p></div>
              <label>Period<select value={customerChartPeriod} onChange={(event) => setCustomerChartPeriod(event.target.value)}><option value="week">Last week</option><option value="1">Last month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option></select></label>
            </div>
            <div className="customer-destination-grid">
              {[{ code: 'KTY_CMB', title: 'Kattankudy to Colombo' }, { code: 'CMB_KTY', title: 'Colombo to Kattankudy' }].map((route) => {
                const departures = popularDeparturesByRoute[route.code] || []
                const maxCount = Math.max(1, ...departures.map((item) => item.count))
                return <section className="content-card customer-destination-chart" key={route.code}>
                  <h3>{route.title}</h3>
                  {departures.length ? <div className="customer-destination-bars" role="img" aria-label={`Departure booking counts for ${route.title}`}>
                    {departures.map((item) => <div className="customer-destination-bar-row" key={item.departure}>
                      <span title={item.departure}>{item.departure}</span><div className="customer-destination-bar-track"><div className="customer-destination-bar" style={{ width: `${(item.count / maxCount) * 100}%` }} /></div><strong>{item.count}</strong>
                    </div>)}
                  </div> : <p className="daily-revenue-empty">No confirmed departure bookings in this period.</p>}
                </section>
              })}
            </div>
          </section>
          <section className="content-card">
            <div className="dashboard-section-heading">
              <div>
                <h2>Regular customers</h2>
                <p>Customers are grouped by mobile number. Counts and rankings use confirmed trips in the selected period; multiple seats on one trip count once. “Months travelled” is the number of different calendar months in that period with a trip.</p>
              </div>
              <div className="revenue-filter-controls">
                <label>Period<select value={customerPeriod} onChange={(event) => setCustomerPeriod(event.target.value)}><option value="week">Last week</option><option value="1">Last month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option></select></label>
                <strong>{sortedRegularCustomers.length} regular customer{sortedRegularCustomers.length === 1 ? '' : 's'}</strong>
              </div>
            </div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Rank</th><th>Customer</th><th>Mobile No.</th><th>Confirmed trips</th><th>Months travelled</th><th>Most recent trip</th></tr></thead>
              <tbody>
                {sortedRegularCustomers.map((customer, index) => (
                  <tr key={`${customer.contact || customer.passenger_name}-${index}`}>
                    <td>{index + 1}</td><td>{customer.passenger_name || 'Unknown'}</td><td>{customer.contact || '—'}</td>
                    <td><strong>{customer.trip_count}</strong></td><td>{customer.month_count}</td><td>{customer.last_trip_date || '—'}</td>
                  </tr>
                ))}
                {!sortedRegularCustomers.length && <tr><td colSpan="6" className="daily-revenue-empty">No repeat customers with a mobile number found.</td></tr>}
              </tbody>
            </table></div>
          </section>
        </main>
      )}

      {showProfile && isAdmin && (
        <AdminProfile
          token={token}
          user={user}
          onUserUpdate={persistSessionUser}
          onClose={() => setShowProfile(false)}
          showMessage={showMessage}
        />
      )}

      {showCrewForm && editingTrip && (
        <div className="modal-backdrop no-print">
          <div className="modal">
            <h2>Bus and crew details</h2>
            <label><span>Bus No</span><input list="crew-bus-numbers" value={tripForm.bus_no} onChange={(event) => {
              const busNo = event.target.value
              const matched = busContactList.find((contact) => contact.bus_no.trim().toLocaleLowerCase() === busNo.trim().toLocaleLowerCase())
              setTripForm((prev) => ({ ...prev, bus_no: busNo, conductor_phone: matched?.phone_number || '' }))
            }} /></label>
            <datalist id="crew-bus-numbers">{[...new Set([...(buses || []).map((bus) => bus.registration_no), ...(busContactList || []).map((contact) => contact.bus_no)].filter(Boolean))].map((busNo) => <option key={busNo} value={busNo} />)}</datalist>
            <label><span>Departure time</span><input type="time" value={tripForm.departure_time} onChange={(event) => setTripForm((prev) => ({ ...prev, departure_time: event.target.value }))} /></label>
            <label><span>Journey status</span><select value={tripForm.status} onChange={(event) => setTripForm((prev) => ({ ...prev, status: event.target.value }))}><option value="scheduled">Scheduled</option><option value="boarding">Boarding</option><option value="departed">Departed</option><option value="completed">Completed</option></select></label>
            <label><span>Driver name</span><input list="crew-driver-names" value={tripForm.driver_name} onChange={(event) => setTripForm((prev) => ({ ...prev, driver_name: event.target.value }))} /></label>
            <datalist id="crew-driver-names">{knownDriverNames.map((name) => <option key={name} value={name} />)}</datalist>
            <label><span>Conductor name</span><input list="crew-conductor-names" value={tripForm.conductor_name} onChange={(event) => setTripForm((prev) => ({ ...prev, conductor_name: event.target.value }))} /></label>
            <datalist id="crew-conductor-names">{knownConductorNames.map((name) => <option key={name} value={name} />)}</datalist>
            <label><span>Conductor phone</span><input value={tripForm.conductor_phone} onChange={(event) => setTripForm((prev) => ({ ...prev, conductor_phone: event.target.value }))} /></label>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => { setShowCrewForm(false); setEditingTrip(null) }}>Close</button>
              <button type="button" className="primary-button" onClick={handleSaveCrewDetails}>Save bus and crew details</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-backdrop no-print" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDialog(null) }}>
          <section className="modal confirm-action-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description">
            <div className="confirm-action-icon" aria-hidden="true">!</div>
            <h2 id="confirm-action-title">{confirmDialog.title}</h2>
            <p id="confirm-action-description">{confirmDialog.message}</p>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button type="button" className={confirmDialog.destructive === false ? 'primary-button' : 'danger-button'} onClick={() => { const action = confirmDialog.onConfirm; setConfirmDialog(null); action() }}>{confirmDialog.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}

      {finalizeDutyTarget && (
        <div className="modal-backdrop no-print">
          <div className="modal duty-finalize-modal">
            <h2>Finalize {finalizeDutyTarget.duty_code} profit?</h2>
            <p>{finalizeDutyTarget.bus_no}: {finalizeDutyTarget.first_trip.route_label} ({finalizeDutyTarget.first_trip.travel_date}) and {finalizeDutyTarget.return_trip.route_label} ({finalizeDutyTarget.return_trip.travel_date})</p>
            <div className="duty-finalize-summary">
              <span>First journey revenue <strong>Rs. {Number(finalizeDutyTarget.first_trip.revenue.total).toLocaleString('en-US')}</strong></span>
              <span>Return journey revenue <strong>Rs. {Number(finalizeDutyTarget.return_trip.revenue.total).toLocaleString('en-US')}</strong></span>
              <span>Total revenue <strong>Rs. {Number(finalizeDutyTarget.total_revenue).toLocaleString('en-US')}</strong></span>
              <span>Total expenses <strong>Rs. {Number(finalizeDutyTarget.total_expenses).toLocaleString('en-US')}</strong></span>
              <span>Net profit <strong>Rs. {Number(finalizeDutyTarget.net_profit).toLocaleString('en-US')}</strong></span>
            </div>
            <span>Other income <strong>Rs. {Number(finalizeDutyTarget.adjustment_totals?.other_income || 0).toLocaleString('en-US')}</strong></span>
            <span>Cancellation fees <strong>Rs. {Number(finalizeDutyTarget.adjustment_totals?.cancellation_fees || 0).toLocaleString('en-US')}</strong></span>
            <span>Refunds <strong>Rs. {Number(finalizeDutyTarget.adjustment_totals?.refunds || 0).toLocaleString('en-US')}</strong></span>
            {(!finalizeDutyTarget.expenses.length && !(finalizeDutyTarget.adjustments || []).length) && <label className="duty-expense-acknowledgement"><input type="checkbox" checked={acknowledgeNoDutyExpenses} onChange={(event) => setAcknowledgeNoDutyExpenses(event.target.checked)} /> I reviewed this duty and confirm it has no expenses or financial adjustments to record.</label>}
            <p>Finalizing saves a historical financial snapshot. The report and its linked trips, bookings, expenses, and adjustments will be locked.</p>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" disabled={dutySaving} onClick={() => { setFinalizeDutyTarget(null); setAcknowledgeNoDutyExpenses(false) }}>Go back</button>
              <button type="button" className="primary-button" disabled={dutySaving || (!finalizeDutyTarget.expenses.length && !(finalizeDutyTarget.adjustments || []).length && !acknowledgeNoDutyExpenses)} onClick={handleFinalizeDuty}>{dutySaving ? 'Finalizing…' : 'Confirm and finalize'}</button>
            </div>
          </div>
        </div>
      )}

      {showBusForm && isAdmin && (
        <div className="modal-backdrop no-print">
          <div className="modal">
            <h2>{editingBus ? 'Edit bus' : 'Register bus'}</h2>
            <label><span>Registration number</span><input required maxLength={40} value={busForm.registration_no} onChange={(event) => setBusForm((prev) => ({ ...prev, registration_no: event.target.value }))} /></label>
            <label><span>Mobile No.</span><input type="tel" maxLength={30} value={busForm.mobile_no || ''} onChange={(event) => setBusForm((prev) => ({ ...prev, mobile_no: event.target.value }))} placeholder="Enter bus contact number" /></label>
            <label><span>Display name</span><input value={busForm.display_name} onChange={(event) => setBusForm((prev) => ({ ...prev, display_name: event.target.value }))} /></label>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => setShowBusForm(false)}>Close</button>
              <button type="button" className="primary-button" disabled={busSaving} onClick={handleSaveBus}>{busSaving ? 'Saving...' : 'Save bus'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="modal-backdrop no-print">
          <div className="modal">
            <h2>Cancel booking</h2>
            <p>Cancel {cancelTarget.passenger_name} on {cancelTarget.route_label} / {cancelTarget.travel_date} / {cancelTarget.registration_no} seat{cancelTarget.seat_numbers?.length === 1 ? '' : 's'} {(cancelTarget.seat_numbers || [cancelTarget.seat_number]).join(', ')}?</p>
            <p>After cancelling, you can send a cancellation notice from the SMS column.</p>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => setCancelTarget(null)}>Keep booking</button>
              <button type="button" className="primary-button" onClick={confirmCancel}>Confirm cancellation</button>
            </div>
          </div>
        </div>
      )}

      {printMode === 'passengers' && (
        <section className="print-passenger-manifest">
          <div className="manifest-paper">
            <div className="manifest-topbar">
              <div className="manifest-brand-wrap">
                <img className="manifest-brand-logo" src="/logo-transparent.png" alt="District Line" />
                <div className="manifest-tagline">Your Future Travel Redefined</div>
              </div>
              <div className="manifest-meta-row">
                <span>Driver Name: {activeTrip?.driver_name || '—'}</span>
                <span>Conductor Name: {activeTrip?.conductor_name || '—'}</span>
                <span>Bus No: {activeTrip?.registration_no || '—'}</span>
                <span>Date: {selectedDate}</span>
              </div>
            </div>

            <div className="manifest-seat-layout">
              {SEAT_LAYOUT.pairRows.map((row) => (
                <div className="manifest-row" key={row.aisle}>
                  <div className="manifest-seat-pair">
                    {[...row.left].reverse().map((seatNumber) => {
                      const booking = manifestSeats.find((item) => item.seatNumber === seatNumber)?.booking
                      return (
                        <div key={seatNumber} className="manifest-seat-card">
                          <div className="manifest-seat-number">{seatNumber}</div>
                          <div className="manifest-seat-field">
                            <span>Fr</span>
                            <strong>{booking?.boarding_point || ''}</strong>
                          </div>
                          <div className="manifest-seat-field">
                            <span>To</span>
                            <strong>{booking?.destination || ''}</strong>
                          </div>
                          <div className="manifest-seat-contact">
                            <span>C/No :</span>
                            <strong>{booking?.contact || ''}</strong>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="manifest-aisle">{row.aisle}</div>

                  <div className="manifest-seat-pair">
                    {row.right.map((seatNumber) => {
                      const booking = manifestSeats.find((item) => item.seatNumber === seatNumber)?.booking
                      return (
                        <div key={seatNumber} className="manifest-seat-card">
                          <div className="manifest-seat-number">{seatNumber}</div>
                          <div className="manifest-seat-field">
                            <span>Fr</span>
                            <strong>{booking?.boarding_point || ''}</strong>
                          </div>
                          <div className="manifest-seat-field">
                            <span>To</span>
                            <strong>{booking?.destination || ''}</strong>
                          </div>
                          <div className="manifest-seat-contact">
                            <span>C/No :</span>
                            <strong>{booking?.contact || ''}</strong>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div className="manifest-rear-row">
                {SEAT_LAYOUT.rearRow.map((seatNumber) => {
                  const booking = manifestSeats.find((item) => item.seatNumber === seatNumber)?.booking
                  return (
                    <div key={seatNumber} className="manifest-seat-card rear-seat-card">
                      <div className="manifest-seat-number">{seatNumber}</div>
                      <div className="manifest-seat-field">
                        <span>Fr</span>
                        <strong>{booking?.boarding_point || ''}</strong>
                      </div>
                      <div className="manifest-seat-field">
                        <span>To</span>
                        <strong>{booking?.destination || ''}</strong>
                      </div>
                      <div className="manifest-seat-contact">
                        <span>C/No :</span>
                        <strong>{booking?.contact || ''}</strong>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {printMode === 'cargo' && (
        <section className="print-cargo-manifest">
          <div className="cargo-manifest-paper">
            <header className="cargo-manifest-header">
              <div className="cargo-manifest-brand">
                <img className="cargo-manifest-logo" src="/logo-transparent.png" alt="District Line" />
                <span>Luggage & Freight Manifest</span>
              </div>
              <span className="cargo-manifest-trip-code">L-1</span>
            </header>
            <div className="cargo-manifest-meta">
              <span><b>Date</b>{selectedDate}</span>
              <span><b>Route</b>{route.label}</span>
              <span><b>Bus No</b>{activeTrip?.registration_no || '—'}</span>
              <span><b>Driver</b>{activeTrip?.driver_name || '—'}</span>
              <span><b>Conductor</b>{activeTrip?.conductor_name || '—'}</span>
              <span><b>Consignments</b>{cargoLogs.length}</span>
            </div>
            <table className="cargo-manifest-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Goods Description</th>
                  <th>Customer Name</th>
                  <th>Contact Number</th>
                  <th>Destination</th>
                  <th>Weight / PCS</th>
                  <th>Fee (Rs.)</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cargoLogs.map((item) => (
                  <tr key={item.id}>
                    <td className="cargo-manifest-bill">{item.cargo_ref}</td>
                    <td><strong>{item.description}</strong>{item.notes ? <small>{item.notes}</small> : null}</td>
                    <td>{item.sender_name || item.receiver_name || '—'}</td>
                    <td>{item.sender_phone || item.receiver_phone || '—'}</td>
                    <td>{item.route_label?.split(' to ')[1] || route.label.split(' to ')[1] || '—'}</td>
                    <td>{item.weight || '—'}</td>
                    <td className="cargo-manifest-amount">{Number(item.charge || 0).toLocaleString('en-US')}</td>
                    <td>{String(item.payment_status || '').toLowerCase() === 'pass' ? 'Pass' : String(item.payment_status || '').toLowerCase() === 'paid' ? 'Paid' : 'Collect on delivery'}</td>
                    <td>{item.cargo_status || 'Registered'}</td>
                  </tr>
                ))}
                {cargoLogs.length === 0 ? <tr><td colSpan="9" className="cargo-manifest-empty">No luggage entries for this bus and date.</td></tr> : null}
              </tbody>
            </table>
            <footer className="cargo-manifest-summary">
              <strong>Total fees: Rs. {cargoLogs.reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</strong>
              <span>Paid: Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() === 'paid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span>
              <span>Collect on delivery: Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() === 'unpaid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span>
            </footer>
          </div>
        </section>
      )}

      <footer className="site-footer no-print">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-logo-wrap">
              <img src="/logo.png" alt="District Line logo" className="footer-logo" />
            </div>
            <div className="footer-brand-copy">
              <strong>District Line</strong>
              <span>Colombo ↔ Kattankudy Express Service</span>
            </div>
          </div>

          <div className="footer-service">
            <span className="footer-eyebrow">Passenger & freight operations</span>
            <strong>One place to coordinate every trip.</strong>
            <span>Seat reservations · Customer manifests · Cargo entries</span>
          </div>

          <div className="footer-route">
            <span className="footer-eyebrow">Express corridor</span>
            <strong>Kattankudy</strong>
            <span className="footer-route-line" aria-hidden="true" />
            <strong>Colombo</strong>
          </div>

          <div className="footer-bottom">
            <span>© {COPYRIGHT_YEAR} District Line Express</span>
            <span>Travel connected. Operations in control.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
