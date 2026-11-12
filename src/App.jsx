import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './components/HomePage.css'
import './components/LogPage.css'
import './components/InfoGuide.css'
import { api, assetUrl } from './api'
import TripWorkspace from './components/TripWorkspace'
import StaffManagement from './components/StaffManagement'
import StaffDialog from './components/StaffDialog'
import CustomersPage from './components/CustomersPage'
import AdminProfile from './components/AdminProfile'
import AccountsRevenue from './components/AccountsRevenue'
import AccountsDuties from './components/AccountsDuties'
import ExpenseSubmissionsTable from './components/ExpenseSubmissionsTable'
import InfoGuide from './components/InfoGuide'
import SmsBalanceCard from './components/SmsBalanceCard'
import { DashboardIcon, DashboardKpi } from './components/DashboardWidgets'
import { resolveStaffPageAccess } from './data/staffPageAccess'

function TripVisualIcon({ name }) {
  const paths = {
    sliders: <><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><path d="M13 4v6M7 14v6"/></>,
    analytics: <><path d="M4 19h16M6 15l4-4 3 3 6-7"/><path d="M15 7h4v4"/></>,
    chart: <><path d="M4 19h16M6 16l4-5 3 3 5-8"/><path d="M15 6h3v3"/></>,
    bus: <><path d="M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M5 11h14M7 17h10"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></>,
    date: <><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 4v4m8-4v4M4 10h16"/></>,
    route: <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a3 3 0 0 1 3 3v2a3 3 0 0 0 3 3"/></>,
    trip: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></>,
    person: <><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
    seats: <><path d="M7 4v8a3 3 0 0 0 3 3h8M8 15l-2 5m11-5 2 5M11 5v6h7"/></>,
    revenue: <><path d="M12 3v18m4-14H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7"/></>,
    cargo: <><path d="M4 7h16v13H4zM8 7V4h8v3M4 12h16"/></>,
    reset: <><path d="M4 11a8 8 0 1 1 2 6M4 5v6h6"/></>,
  }
  return <svg className="trip-visual-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.trip}</svg>
}
import './components/AdminDashboard.css'
import UsernameRecoveryForm from './components/UsernameRecoveryForm'
import { ROUTES, SEAT_LAYOUT, routeByCode } from './data/seatLayout'
import { buildTripOverview, filterTripOverviewTrips } from './data/tripOverview'
import { busRegistrations } from './data/busRegistrations'

const TOKEN_KEY = 'district-line-token'
const USER_KEY = 'district-line-user'
const USERNAME_RECOVERY_ENABLED = import.meta.env.VITE_ENABLE_ADMIN_USERNAME_RECOVERY === 'true'
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

function firstAuthorizedPage(user) {
  if (user?.role === 'admin') return 'Home'
  const pages = [['Home', 'home'], ['Log', 'log'], ['Info', 'info'], ['Dashboard', 'dashboard'], ['Accounts', 'accounts'], ['Customers', 'customers'], ['Staff', 'staff']]
  return pages.find(([, key]) => user?.permissions?.[key] === true)?.[0] || 'Home'
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

function AdminPageSkeleton({ label }) {
  return (
    <div className="admin-data-skeleton" role="status" aria-label={`Loading ${label}`}>
      <span className="admin-skeleton-title" />
      <span />
      <span />
      <span className="admin-skeleton-short" />
    </div>
  )
}

function FullSystemLoader() {
  return (
    <main className="auth-page full-system-loading" role="status" aria-live="polite">
      <section className="login-panel">
        <img className="brand-logo" src="/logo.png" alt="District Line" />
        <span className="system-loading-spinner" aria-hidden="true" />
        <p>Preparing District Line…</p>
      </section>
    </main>
  )
}

function TripsLoadingState() {
  return (
    <div className="trips-loading-state" role="status" aria-label="Loading bus sections">
      <span className="system-loading-spinner" aria-hidden="true" />
      <span>Loading bus sections…</span>
    </div>
  )
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
  const [initialUsernameRecoveryToken, setInitialUsernameRecoveryToken] = useState(() => USERNAME_RECOVERY_ENABLED && window.location.hash.startsWith('#recover-username?')
    ? new URLSearchParams(window.location.hash.slice('#recover-username?'.length)).get('token') || '' : '')
  const [showUsernameRecovery, setShowUsernameRecovery] = useState(Boolean(initialUsernameRecoveryToken))
  useEffect(() => {
    if (initialUsernameRecoveryToken) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [initialUsernameRecoveryToken])
  const initialResetToken = window.location.hash.startsWith('#reset-password?')
    ? new URLSearchParams(window.location.hash.slice('#reset-password?'.length)).get('token') || ''
    : ''
  useEffect(() => {
    if (initialResetToken) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [initialResetToken])
  const adminDashboardRequestRef = useRef(null)
  const adminDashboardRequestIdRef = useRef(0)
  const profitLedgerRequestRef = useRef(null)
  const adminStatsCacheRef = useRef({})
  const fleetRequestIdRef = useRef(0)
  const sessionCheckStartedRef = useRef(false)
  const loginRequestInFlightRef = useRef(false)
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState('checking')
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState('Home')
  const [infoTopic, setInfoTopic] = useState('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isCompactNavigation, setIsCompactNavigation] = useState(() => window.matchMedia('(max-width: 1024px)').matches)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [mfaChallenge, setMfaChallenge] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [showRecovery, setShowRecovery] = useState(Boolean(initialResetToken))
  const [recoveryForm, setRecoveryForm] = useState({ email: '', token: initialResetToken, password: '', confirmPassword: '' })
  const [recoveryStep, setRecoveryStep] = useState(initialResetToken ? 'reset' : 'request')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [selectedDate, setSelectedDate] = useState(todayIso())
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [routeCode, setRouteCode] = useState('KTY_CMB')
  const [buses, setBuses] = useState([])
  const [trips, setTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(true)
  const [activeTripId, setActiveTripId] = useState(null)
  const [customerLogs, setCustomerLogs] = useState([])
  const [editingCustomerDetailsId, setEditingCustomerDetailsId] = useState(null)
  const [customerNameDraft, setCustomerNameDraft] = useState('')
  const [customerContactDraft, setCustomerContactDraft] = useState('')
  const [customerGenderDraft, setCustomerGenderDraft] = useState('')
  const [customerFromDraft, setCustomerFromDraft] = useState('')
  const [customerToDraft, setCustomerToDraft] = useState('')
  const [customerFareDraft, setCustomerFareDraft] = useState('')
  const [customerNotesDraft, setCustomerNotesDraft] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const logsRequestIdRef = useRef(0)
  const [cargoLogs, setCargoLogs] = useState([])
  const [logFilters, setLogFilters] = useState({ q: '', from: '', sms: '', status: '' })
  const [smsBusyId, setSmsBusyId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const logoutInFlightRef = useRef(false)
  const [showCrewForm, setShowCrewForm] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [showBusForm, setShowBusForm] = useState(false)
  const [busSaving, setBusSaving] = useState(false)
  const [busFormError, setBusFormError] = useState('')
  const [editingBus, setEditingBus] = useState(null)
  const [adminStats, setAdminStats] = useState(null)
  const [adminStatsScope, setAdminStatsScope] = useState('')
  const [adminDataLoading, setAdminDataLoading] = useState(false)
  const [dashboardDataError, setDashboardDataError] = useState('')
  const [dashboardProfitTarget, setDashboardProfitTarget] = useState(null)
  const [profitLedgerLoading, setProfitLedgerLoading] = useState(false)
  const [profitLedgerError, setProfitLedgerError] = useState('')
  const [profitLedgerLoaded, setProfitLedgerLoaded] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [staffPageLoading, setStaffPageLoading] = useState(false)
  const [staffPageError, setStaffPageError] = useState('')
  const [crewList, setCrewList] = useState([])
  const [busContactList, setBusContactList] = useState([])
  const [revenueDate, setRevenueDate] = useState(todayIso())
  const [seatChartMonth, setSeatChartMonth] = useState(() => todayIso().slice(0, 7))
  const [dashboardRoute, setDashboardRoute] = useState('KTY_CMB')
  const [dashboardBus, setDashboardBus] = useState('')
  const [dashboardTrip, setDashboardTrip] = useState('')
  const [dashboardTrips, setDashboardTrips] = useState([])
  const [dashboardTripsLoading, setDashboardTripsLoading] = useState(false)
  const [dashboardTripsError, setDashboardTripsError] = useState('')
  const [dashboardTripsRetry, setDashboardTripsRetry] = useState(0)
  const [profitPeriod, setProfitPeriod] = useState('day')
  const [profitDate, setProfitDate] = useState(todayIso())
  const [profitRoute, setProfitRoute] = useState('')
  const [profitTrip, setProfitTrip] = useState('')
  const [profitLedger, setProfitLedger] = useState({ revenueEntries: [], expenseSubmissions: [] })
  const [customerPeriod, setCustomerPeriod] = useState('6')
  const [customerChartPeriod, setCustomerChartPeriod] = useState('6')
  const [customerDataError, setCustomerDataError] = useState('')
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
  const rawStaffPermissions = isAdmin
    ? { home: true, log: true, info: true, dashboard: true, accounts: true, customers: true, staff: true, passengers: true, cargo: true, trips: true }
    : { home: true, log: true, info: true, dashboard: false, accounts: false, customers: false, staff: false, passengers: false, cargo: false, trips: false, ...(user?.permissions || {}) }
  const pageAccess = resolveStaffPageAccess(rawStaffPermissions, isAdmin)
  const staffPermissions = {
    ...rawStaffPermissions,
    pageAccess,
    home: pageAccess.home.view,
    log: pageAccess.log.view,
    info: pageAccess.info.view,
    dashboard: pageAccess.dashboard.view,
    accounts: pageAccess.accounts.view,
    customers: pageAccess.customers.view,
    staff: pageAccess.staff.view,
    homeManage: pageAccess.home.manage,
    logManage: pageAccess.log.manage,
    dashboardManage: pageAccess.dashboard.manage,
    accountsManage: pageAccess.accounts.manage,
    customersManage: pageAccess.customers.manage,
    staffManage: false,
    homePassengers: rawStaffPermissions.passengers && pageAccess.home.manage,
    homeCargo: rawStaffPermissions.cargo && pageAccess.home.manage,
    logPassengers: rawStaffPermissions.passengers && pageAccess.log.manage,
    logCargo: rawStaffPermissions.cargo && pageAccess.log.manage,
    customerActions: rawStaffPermissions.passengers && pageAccess.customers.manage,
    passengers: rawStaffPermissions.passengers && (pageAccess.home.manage || pageAccess.log.manage || pageAccess.customers.manage),
    cargo: rawStaffPermissions.cargo && (pageAccess.home.manage || pageAccess.log.manage),
    trips: rawStaffPermissions.trips && pageAccess.home.manage,
  }
  const canViewFinancialData = isAdmin || staffPermissions.accounts
  const homePermissions = { ...staffPermissions, passengers: staffPermissions.homePassengers, cargo: staffPermissions.homeCargo }
  const navTabs = ['Home', 'Log', 'Info', ...(staffPermissions.dashboard ? ['Dashboard'] : []), ...(staffPermissions.accounts ? ['Accounts'] : []), ...(staffPermissions.customers ? ['Customers'] : []), ...(staffPermissions.staff ? ['Staff'] : [])].filter((tab) => {
    if (tab === 'Home') return staffPermissions.home
    if (tab === 'Log') return staffPermissions.log
    if (tab === 'Info') return staffPermissions.info
    if (tab === 'Dashboard') return staffPermissions.dashboard
    if (tab === 'Accounts') return staffPermissions.accounts
    if (tab === 'Customers') return staffPermissions.customers
    if (tab === 'Staff') return staffPermissions.staff
    return true
  })
  const route = routeByCode(routeCode)
  const activeTrip = trips.find((trip) => trip.id === activeTripId) || trips[0] || null
  const activeTabAllowed = activeTab === 'Home' ? staffPermissions.home
    : activeTab === 'Log' ? staffPermissions.log
      : activeTab === 'Info' ? staffPermissions.info
        : activeTab === 'Dashboard' ? staffPermissions.dashboard
          : activeTab === 'Accounts' ? staffPermissions.accounts
            : activeTab === 'Customers' ? staffPermissions.customers
              : activeTab === 'Staff' ? staffPermissions.staff : true
  const fallbackTab = navTabs[0] || 'Home'
  const knownDriverNames = [...new Set([...(crewList || []).filter((member) => member.role === 'driver').map((member) => member.full_name), ...(adminStats?.crewMembers || []).filter((member) => member.role === 'driver').map((member) => member.full_name), ...trips.map((item) => item.driver_name), ...buses.map((item) => item.driver_name)].map((name) => String(name || '').trim()).filter(Boolean))]
  const knownConductorNames = [...new Set([...(crewList || []).filter((member) => member.role === 'conductor').map((member) => member.full_name), ...(adminStats?.crewMembers || []).filter((member) => member.role === 'conductor').map((member) => member.full_name), ...trips.map((item) => item.conductor_name), ...buses.map((item) => item.conductor_name)].map((name) => String(name || '').trim()).filter(Boolean))]

  useEffect(() => {
    if (!token) return
    if (!activeTabAllowed) {
      setActiveTab(fallbackTab)
    }
  }, [token, activeTab, activeTabAllowed, fallbackTab, isAdmin])

  useEffect(() => {
    if (!token) return
    api.adminBusContacts(token).then((contactResult) => setBusContactList(contactResult.contacts || [])).catch(() => {})
    setCrewList([])
    if (isAdmin) api.adminCrew(token).then((crewResult) => setCrewList(crewResult.crew || [])).catch(() => {})
    else if (staffPermissions.accountsManage) api.accountsCrewOptions(token).then((result) => setCrewList(result.crew || [])).catch((err) => showMessage(err.message, true))
  }, [token, isAdmin, staffPermissions.accountsManage])
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
      const anchor = new Date(`${seatChartMonth}-01T00:00:00`)
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
  }, [adminStats, seatChartMonth, dashboardTrip])
  const filteredTrips = useMemo(() => dashboardRange ? filterTripOverviewTrips(dashboardTrips, { start: dashboardRange.start, end: dashboardRange.end, route: dashboardRoute, bus: dashboardBus, tripId: dashboardTrip }) : [], [dashboardTrips, dashboardRange, dashboardRoute, dashboardBus, dashboardTrip])
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
  const editingCustomerLog = customerLogRows.find((log) => log.id === editingCustomerDetailsId) || null

  const showMessage = useCallback((text, isError = false) => {
    setNotice(isError ? '' : text)
    setError(isError ? text : '')
  }, [])

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
    const requestId = ++fleetRequestIdRef.current
    const data = await api.buses(authToken, true)
    if (requestId === fleetRequestIdRef.current) {
      const fleet = data.buses || []
      setBuses(fleet)
      setAdminStats((previous) => previous ? { ...previous, buses: fleet } : previous)
      for (const [scope, cached] of Object.entries(adminStatsCacheRef.current)) {
        adminStatsCacheRef.current[scope] = { ...cached, buses: fleet }
      }
    }
  }, [])

  const loadTrips = useCallback(async (authToken, date = selectedDate, routeValue = routeCode) => {
    setTripsLoading(true)
    try {
      const data = await api.trips(authToken, queryString({ date, route: routeValue }))
      setTrips(data.trips || [])
      return data.trips || []
    } finally {
      setTripsLoading(false)
    }
  }, [routeCode, selectedDate])

  useEffect(() => {
    if (!token || !staffPermissions.dashboard || activeTab !== 'Dashboard') return
    let active = true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revenueDate)) {
      setDashboardTrips([]); setDashboardTripsLoading(false); setDashboardTripsError('Choose a valid date.')
      return
    }
    setDashboardTrips([]); setDashboardTripsLoading(true); setDashboardTripsError('')
    // The dashboard summary contains only the latest 200 trips. Query the existing
    // Express endpoint by calendar date/route so older trips remain selectable.
    api.trips(token, queryString({ date: revenueDate, route: dashboardRoute, dashboard: '1' })).then(data => {
      if (active) setDashboardTrips(data.trips || [])
    }).catch(err => {
      if (active) setDashboardTripsError(err.message || 'Unable to load trips.')
    }).finally(() => { if (active) setDashboardTripsLoading(false) })
    return () => { active = false }
  }, [token, staffPermissions.dashboard, activeTab, revenueDate, dashboardRoute, dashboardTripsRetry])

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
    setAdminStatsScope('')
    adminStatsCacheRef.current = {}
    setTripsLoading(false)
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
      setActiveTab(firstAuthorizedPage(data.user))
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
    if (!isAdmin && !staffPermissions.home && !staffPermissions.log) {
      setTrips([])
      setActiveTripId(null)
      return
    }
    try {
      const nextTrips = await loadTrips(authToken)
      setActiveTripId((previousId) => nextTrips.find((trip) => trip.id === previousId)?.id || nextTrips[0]?.id || null)
    } catch (err) {
      if (err.status === 401) clearAuthState()
      showMessage(err.message, true)
    }
  }, [clearAuthState, isAdmin, loadTrips, showMessage, staffPermissions.home, staffPermissions.log])

  useEffect(() => {
    if (token) bootstrap(token)
  }, [token, selectedDate, routeCode, bootstrap])

  useEffect(() => {
    if (!token || (!isAdmin && !staffPermissions.home && !staffPermissions.log)) return
    loadFleet(token).catch((err) => {
      if (err.status !== 401 && err.status !== 403) showMessage(err.message, true)
    })
  }, [token, isAdmin, loadFleet, showMessage, staffPermissions.home, staffPermissions.log])

  useEffect(() => {
    if (!token || (!isAdmin && !staffPermissions.home && !staffPermissions.log)) return
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      loadFleet(token).catch(() => {})
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      fleetRequestIdRef.current++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [token, isAdmin, loadFleet, staffPermissions.home, staffPermissions.log])

  useEffect(() => {
    if (!user) return
    const allowed = navTabs.includes(activeTab)
    if (!allowed) setActiveTab(navTabs[0] || 'Info')
  }, [user, activeTab, navTabs])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)')
    const update = () => setIsCompactNavigation(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!mobileNavOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      setMobileNavOpen(false)
      document.querySelector('.mobile-nav-toggle')?.focus()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileNavOpen])

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
    if (loginRequestInFlightRef.current) return
    loginRequestInFlightRef.current = true
    setLoginError('')
    setLoginLoading(true)
    try {
      const data = mfaChallenge
        ? await api.verifyAdminMfa({ challenge: mfaChallenge, code: mfaCode })
        : await api.login(loginForm)
      if (data.mfaRequired) {
        setMfaChallenge(data.challenge)
        setMfaCode('')
        setLoginForm(prev => ({ ...prev, password: '' }))
        return
      }
      setMfaChallenge('')
      setMfaCode('')
      setToken('cookie-session')
      setUser(data.user)
      setAuthStatus('authenticated')
      setAuthError('')
      setActiveTab(firstAuthorizedPage(data.user))
    } catch (err) {
      setLoginError(err.message)
    } finally {
      loginRequestInFlightRef.current = false
      setLoginLoading(false)
    }
  }

  const handleAdminRecovery = async (event) => {
    event.preventDefault()
    setRecoveryError('')
    setRecoveryMessage('')
    setRecoveryLoading(true)
    try {
      if (recoveryStep === 'request') {
        const result = await api.requestAdminPasswordRecovery({ email: recoveryForm.email })
        setRecoveryMessage(result.message || 'If this address belongs to an active admin account, a reset link will be emailed.')
      } else {
        const result = await api.resetAdminPassword({ token: recoveryForm.token, password: recoveryForm.password, confirmPassword: recoveryForm.confirmPassword })
        setRecoveryMessage(result.message || 'Password updated. Sign in with your new password.')
        setRecoveryForm({ email: '', token: '', password: '', confirmPassword: '' })
        setRecoveryStep('request')
        setToken('')
        setUser(null)
        setAuthStatus('unauthenticated')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      }
    } catch (err) {
      setRecoveryError(err.message || 'Could not complete password recovery.')
    } finally {
      setRecoveryLoading(false)
    }
  }

  const handleLogout = async () => {
    if (logoutInFlightRef.current) return
    logoutInFlightRef.current = true
    setLogoutBusy(true)
    try {
      await api.logout()
    } catch (err) {
      showMessage(err.message || 'Could not confirm sign out with the server.', true)
    } finally {
      clearAuthState()
      setActiveTab('Home')
      setShowLogoutConfirm(false)
      logoutInFlightRef.current = false
      setLogoutBusy(false)
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

  const handleSaveCustomerDetails = async (log) => {
    const passengerName = customerNameDraft.trim()
    const contact = customerContactDraft.trim()
    const fare = Number(customerFareDraft)
    const notes = customerNotesDraft.trim()
    if (!passengerName && !contact) return showMessage('Enter a customer name or mobile number.', true)
    if (passengerName.length > 120) return showMessage('Customer names must be 120 characters or fewer.', true)
    if (contact.length > 30) return showMessage('Customer mobile numbers must be 30 characters or fewer.', true)
    if (!Number.isSafeInteger(fare) || fare < 0 || fare > 1_000_000_000) return showMessage('Enter a whole-number fare from Rs. 0 to Rs. 1,000,000,000.', true)
    if (notes.length > 1000) return showMessage('Customer notes must be 1,000 characters or fewer.', true)
    setSmsBusyId(log.id)
    try {
      const data = await api.updateBookingDetails(token, log.bookings[0].id, {
        passenger_name: passengerName,
        contact,
        gender: customerGenderDraft,
        boarding_point: customerFromDraft,
        destination: customerToDraft,
        fare,
        notes,
      })
      const byId = new Map((data.bookings || []).map((booking) => [booking.id, booking]))
      setCustomerLogs((current) => current.map((booking) => byId.get(booking.id) || booking))
      setEditingCustomerDetailsId(null)
      showMessage(`${passengerName}'s customer log details were updated.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setSmsBusyId(null)
    }
  }

  const openCrewForm = (trip) => {
    // A different administrator may have registered a bus since this session loaded.
    loadFleet(token).catch((err) => showMessage(err.message || 'Unable to refresh bus numbers.', true))
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
      if (activeTab === 'Dashboard') await openAdminDashboard('dashboard', false, true)
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
        bus_id: buses.find(bus => String(bus.registration_no || '').trim().toLowerCase() === tripForm.bus_no.trim().toLowerCase())?.id || null,
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
      if (activeTab === 'Dashboard' || activeTab === 'Accounts') await openAdminDashboard(activeTab === 'Accounts' ? 'accounts' : 'dashboard', false, true)
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
    if (busSaving) return
    setBusFormError('')
    const registrationNo = String(busForm.registration_no || '').trim()
    const mobileNo = String(busForm.mobile_no || '').trim()
    if (!registrationNo) {
      setBusFormError('Enter a bus registration number.')
      showMessage('Enter a bus registration number.', true)
      return
    }
    setBusSaving(true)
    try {
      const applySavedBus = (bus) => {
        fleetRequestIdRef.current++
        if (bus) setBuses((previous) => [...previous.filter((item) => item.id !== bus.id), bus])
        adminStatsCacheRef.current = {}
        setAdminStatsScope('')
      }
      if (editingBus) {
        const result = await api.updateBus(token, editingBus.id, { ...busForm, registration_no: registrationNo })
        applySavedBus(result.bus)
        if (mobileNo) await api.createBusContact(token, { bus_no: registrationNo, phone_number: mobileNo })
        showMessage('Bus details updated.')
      } else {
        const result = await api.createBus(token, { ...busForm, registration_no: registrationNo })
        applySavedBus(result.bus)
        if (mobileNo) await api.createBusContact(token, { bus_no: registrationNo, phone_number: mobileNo })
        showMessage(result.reactivated ? 'Inactive bus reactivated.' : 'Bus registered.')
      }
      setShowBusForm(false)
      setEditingBus(null)
      await loadFleet(token)
      const contacts = await api.adminBusContacts(token)
      setBusContactList(contacts.contacts || [])
      if (activeTab === 'Dashboard' || activeTab === 'Accounts') await openAdminDashboard(activeTab === 'Accounts' ? 'accounts' : 'dashboard', false, true)
    } catch (err) {
      setBusFormError(err.message)
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
      if (activeTab === 'Dashboard') await openAdminDashboard('dashboard', false, true)
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
      if (activeTab === 'Dashboard') await openAdminDashboard('dashboard', false, true)
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

  const loadProfitLedger = (force = false) => {
    if (profitLedgerLoaded && !force) return Promise.resolve()
    if (profitLedgerRequestRef.current) return profitLedgerRequestRef.current
    setProfitLedgerLoading(true)
    setProfitLedgerError('')
    const pending = Promise.all([
      api.adminRevenueEntries(token, { summary: true }),
      api.adminExpenseSubmissions(token),
    ]).then(([revenueData, expenseData]) => {
      setProfitLedger({ revenueEntries: revenueData.entries || [], expenseSubmissions: expenseData.submissions || [] })
      setProfitLedgerLoaded(true)
      setProfitLedgerError('')
    }).catch((err) => {
      setProfitLedgerError(err.message || 'Unable to load financial ledger data.')
      setProfitLedgerLoaded(true)
      showMessage(err.message || 'Unable to load financial ledger data.', true)
    }).finally(() => {
      setProfitLedgerLoading(false)
      profitLedgerRequestRef.current = null
    })
    profitLedgerRequestRef.current = pending
    return pending
  }

  const openAdminDashboard = async (scope = activeTab === 'Dashboard' ? 'dashboard' : activeTab === 'Accounts' ? 'accounts' : 'full', forceLedger = false, forceData = false) => {
    if (adminDashboardRequestRef.current?.scope === scope) return adminDashboardRequestRef.current.promise
    const pageAllowed = scope === 'dashboard' ? staffPermissions.dashboard
      : scope === 'accounts' ? staffPermissions.accounts
        : scope === 'customers' ? staffPermissions.customers : isAdmin
    if (!pageAllowed) {
      showMessage('Your staff account does not have access to this page.', true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
      return
    }
    const cachedScope = adminStatsCacheRef.current[scope] ? scope : scope !== 'full' && scope !== 'customers' && adminStatsCacheRef.current.full ? 'full' : ''
    if (cachedScope && !forceData && (scope !== 'accounts' || !(isAdmin || staffPermissions.accountsManage) || Array.isArray(adminStatsCacheRef.current[cachedScope].duties))) {
      if (scope === 'dashboard') setDashboardDataError('')
      if (scope === 'full' || scope === 'customers') setCustomerDataError('')
      setAdminStats(adminStatsCacheRef.current[cachedScope])
      setAdminStatsScope(cachedScope)
      setAdminDataLoading(false)
      return canViewFinancialData ? loadProfitLedger(forceLedger) : Promise.resolve()
    }
    const startedAt = performance.now()
    const requestId = ++adminDashboardRequestIdRef.current
    const pending = (async () => {
      setAdminDataLoading(true)
      if (scope === 'dashboard') setDashboardDataError('')
      if (scope === 'full' || scope === 'customers') setCustomerDataError('')
      if (canViewFinancialData) setProfitLedgerError('')
      const ledgerPending = canViewFinancialData ? loadProfitLedger(forceLedger) : Promise.resolve()
      try {
        const [data, dutyData] = await Promise.all([
          api.adminDashboard(token, scope === 'full' ? undefined : scope),
          scope === 'accounts' && (isAdmin || staffPermissions.accountsManage) ? api.accountsDutyData(token) : Promise.resolve(null),
        ])
        if (dutyData) Object.assign(data, dutyData)
        if (requestId === adminDashboardRequestIdRef.current) {
          if (scope === 'full') adminStatsCacheRef.current = { full: data, dashboard: data, accounts: data }
          else adminStatsCacheRef.current[scope] = data
          setAdminStats(data)
          setAdminStatsScope(scope)
          setAdminDataLoading(false)
          requestAnimationFrame(() => requestAnimationFrame(() => {
            console.info(JSON.stringify({ kind: 'admin_dashboard_primary_to_paint_perf', scope, duration_ms: Number((performance.now() - startedAt).toFixed(1)) }))
          }))
        }
        await ledgerPending
        console.info(JSON.stringify({ kind: 'admin_dashboard_all_sections_perf', scope, duration_ms: Number((performance.now() - startedAt).toFixed(1)) }))
      } catch (err) {
        if (requestId === adminDashboardRequestIdRef.current) {
          if (scope === 'dashboard') setDashboardDataError(err.message || 'Unable to load dashboard data.')
          if (scope === 'full' || scope === 'customers') setCustomerDataError(err.message || 'Unable to load customer analytics.')
          setProfitLedgerError(err.message || 'Request failed')
          showMessage(err.message, true)
        }
        await ledgerPending
      } finally {
        if (requestId === adminDashboardRequestIdRef.current) setAdminDataLoading(false)
      }
    })()
    adminDashboardRequestRef.current = { scope, promise: pending }
    try {
      await pending
    } finally {
      if (adminDashboardRequestRef.current?.promise === pending) adminDashboardRequestRef.current = null
    }
  }

  const handleAddExpense = async (event) => {
    event.preventDefault()
    setExpenseSaving(true)
    try {
      const expenseDate = expenseForm.expense_date
      const { expense } = await api.createAdminExpense(token, { ...expenseForm, category: 'Monthly Expense', expense_date: expenseDate, amount: Number(expenseForm.amount), expense_source: 'monthly' })
      setMonthlyExpenseMonth(expenseDate.slice(0, 7))
      setRevenueDate(expenseDate)
      setAdminStats((current) => {
        if (!current) return current
        const updated = { ...current, expenses: [expense, ...(current.expenses || [])] }
        for (const [scope, cached] of Object.entries(adminStatsCacheRef.current)) {
          adminStatsCacheRef.current[scope] = { ...cached, expenses: [expense, ...(cached.expenses || [])] }
        }
        if (adminStatsScope && !adminStatsCacheRef.current[adminStatsScope]) adminStatsCacheRef.current[adminStatsScope] = updated
        return updated
      })
      setExpenseForm((current) => ({ ...current, description: '', amount: '' }))
      showMessage('Monthly expense saved.')
      try {
        const [data, dutyData] = await Promise.all([
          api.adminDashboard(token, 'accounts'),
          isAdmin || staffPermissions.accountsManage ? api.accountsDutyData(token) : Promise.resolve(null),
        ])
        if (dutyData) Object.assign(data, dutyData)
        adminStatsCacheRef.current.accounts = data
        setAdminStats(data)
        setAdminStatsScope('accounts')
      } catch {
        showMessage('Monthly expense saved, but the account totals could not refresh.', true)
      }
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setExpenseSaving(false)
    }
  }

  const refreshAccountsData = async () => {
    try {
      const [data, revenueData, expenseData, dutyData] = await Promise.all([
        api.adminDashboard(token, 'accounts'), api.adminRevenueEntries(token, { summary: true }), api.adminExpenseSubmissions(token),
        isAdmin || staffPermissions.accountsManage ? api.accountsDutyData(token) : Promise.resolve(null),
      ])
      if (dutyData) Object.assign(data, dutyData)
      adminStatsCacheRef.current.accounts = data
      setAdminStats(data)
      setAdminStatsScope('accounts')
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
    if (!staffPermissions.staff) {
      showMessage('Your staff account does not have access to this page.', true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
      return
    }
    setStaffPageLoading(true)
    setStaffPageError('')
    try {
      const staffData = await api.adminStaff(token)
      setStaffList(staffData.staff || [])
      if (isAdmin) {
        const [crewData, fleetData] = await Promise.all([api.adminCrew(token), api.buses(token, true)])
        setCrewList(crewData.crew || [])
        setBuses(fleetData.buses || [])
      }
    } catch (err) {
      setStaffPageError(err.message || 'Unable to load staff management data.')
    } finally {
      setStaffPageLoading(false)
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
    return <FullSystemLoader />
  }

  if (authStatus === 'error') {
    return <main className="auth-page"><section className="login-panel" role="alert"><img className="brand-logo" src="/logo.png" alt="District Line" /><h1>Unable to verify session</h1><p>{authError}</p><button type="button" className="primary-button wide" onClick={verifySession}>Retry</button></section></main>
  }

  if (showUsernameRecovery || showRecovery || authStatus !== 'authenticated' || !token) {
    return (
      <main className={`auth-page auth-redesign login-page${showRecovery ? ' auth-recovery-mode' : ''}`}>
        <div className="auth-layout login-stage">
          <section className="auth-branding" aria-label="District Line">
            <img className="brand-logo" src="/logo-transparent.png" alt="District Line by CityLink, 077 90 40 300" />
            <span className="auth-brand-eyebrow">DISTRICT LINE · INTERNAL SYSTEM</span>
            <h1>Internal Bus <span>Booking System</span></h1>
            <p>Admin &amp; Staff Portal</p>
            <div className="auth-brand-bottom">
              <div className="auth-service-points" aria-label="Travel, Book, Manage"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10M5 12h14m-12 4v2m10-2v2M5 16l-1 2v2h16v-2l-1-2M8 8h8" /><circle cx="8" cy="14" r=".7" /><circle cx="16" cy="14" r=".7" /></svg>Travel</span><i /><span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7.5 3v4m9-4v4M4 9h16M8 13h2m4 0h2m-8 4h2m4 0h2" /></svg>Book</span><i /><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.2" /><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1h-13Zm13.2-6.5a5 5 0 0 1 5.8 5V20h-4" /></svg>Manage</span></div>
              <span className="auth-brand-note">Colombo · Kattankudy Express Service</span>
            </div>
          </section>

          <section className="login-panel" aria-labelledby="login-title">
            <div className="auth-login-card login-card">
            <div className="auth-login-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 001 1h1a1 1 0 001-1v-1h8v1a1 1 0 001 1h1a1 1 0 001-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3-3-4-8-4S4 3 4 6v10zm3.5 1a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm9 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM6 11V6h12v5H6z" /></svg></div>
            <span className="auth-login-eyebrow">SECURE STAFF ACCESS</span>
            <h2 id="login-title">{showUsernameRecovery ? 'Recover admin username' : showRecovery ? recoveryStep === 'reset' ? 'Set a new password' : 'Recover admin password' : 'Staff & Admin Login'}</h2>
            <p className="auth-login-subtitle">{showUsernameRecovery ? 'Recover your username through your registered email.' : showRecovery ? recoveryStep === 'reset' ? 'Choose a new password for your administrator account.' : 'We will email a single-use reset link to your registered recovery address.' : 'For Authorized Staff Members'}</p>
            {!showRecovery && <div className="auth-login-rule" aria-hidden="true" />}
            {showUsernameRecovery ? <UsernameRecoveryForm initialToken={initialUsernameRecoveryToken} onBack={() => { setShowUsernameRecovery(false); setInitialUsernameRecoveryToken('') }} /> : showRecovery ? <form className="auth-form" onSubmit={handleAdminRecovery}>
              {recoveryStep === 'request' ? <>
                <label htmlFor="recovery-email">Registered recovery email</label>
                <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">@</span><input id="recovery-email" required type="email" autoComplete="email" value={recoveryForm.email} onChange={(event) => setRecoveryForm((prev) => ({ ...prev, email: event.target.value }))} /></div>
              </> : null}
              {recoveryStep === 'reset' ? <>
                <label htmlFor="recovery-new-password">New password (at least 12 characters)</label>
                <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span><input id="recovery-new-password" required minLength={12} type="password" autoComplete="new-password" value={recoveryForm.password} onChange={(event) => setRecoveryForm((prev) => ({ ...prev, password: event.target.value }))} /></div>
                <label htmlFor="recovery-confirm-password">Confirm new password</label>
                <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span><input id="recovery-confirm-password" required minLength={12} type="password" autoComplete="new-password" value={recoveryForm.confirmPassword} onChange={(event) => setRecoveryForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} /></div>
              </> : null}
              {recoveryError ? <div className="banner error" role="alert">{recoveryError}</div> : null}
              {recoveryMessage ? <div className="banner success" role="status">{recoveryMessage}</div> : null}
              <button type="submit" className="primary-button wide login-submit" disabled={recoveryLoading}>{recoveryLoading ? 'Please wait…' : recoveryStep === 'request' ? 'Send reset link' : 'Reset password'}</button>
              <button type="button" className="recovery-back" onClick={() => { setShowRecovery(false); setRecoveryError(''); setRecoveryMessage(''); setRecoveryForm({ email: '', token: '', password: '', confirmPassword: '' }); setRecoveryStep('request') }}>Back to sign in</button>
            </form> : <form className="auth-form" onSubmit={(event) => { event.preventDefault(); handleLogin() }}>
              {!mfaChallenge && <><label className="auth-visually-hidden" htmlFor="login-username">Username / Admin ID</label>
              <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg></span><input id="login-username" required autoComplete="username" placeholder="Username / Admin ID" value={loginForm.username} onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))} /></div>
              <label className="auth-visually-hidden" htmlFor="login-password">Password</label>
              <div className="login-password-field auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
                <input id="login-password" required type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={loginForm.password} onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))} />
                <button type="button" className="login-password-toggle" aria-label={showLoginPassword ? 'Hide password' : 'Show password'} aria-pressed={showLoginPassword} onClick={() => setShowLoginPassword((visible) => !visible)}>
                  {showLoginPassword ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.8 4.5 10 7-.4.9-1.2 2-2.3 3M6.2 6.2C3.9 7.7 2.5 10 2 12c1.2 2.5 4.8 7 10 7 1.4 0 2.6-.3 3.7-.8" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
                </button>
              </div>
              </>}
              {mfaChallenge && <>
                <label htmlFor="admin-mfa-code">Authenticator or recovery code</label>
                <div className="auth-input-wrap"><input id="admin-mfa-code" required autoFocus autoComplete="one-time-code" maxLength={32} value={mfaCode} onChange={event => setMfaCode(event.target.value.trim())} /></div>
                <button type="button" className="recovery-back" onClick={() => { setMfaChallenge(''); setMfaCode(''); setLoginError('') }}>Back to sign in</button>
              </>}
              {loginError ? <div className="banner error" role="alert">{loginError}</div> : null}
              <button type="submit" className="primary-button wide login-submit" disabled={loginLoading} aria-busy={loginLoading}>
                {loginLoading ? <><span className="login-submit-spinner" aria-hidden="true" />Signing in…</> : 'Sign In'}
              </button>
              <button type="button" className="recovery-link" onClick={() => { setShowRecovery(true); setRecoveryStep('request'); setRecoveryForm({ email: '', token: '', password: '', confirmPassword: '' }); setRecoveryError(''); setRecoveryMessage('') }}>Forgot Password?</button>
              {USERNAME_RECOVERY_ENABLED && <button type="button" className="recovery-link" onClick={() => setShowUsernameRecovery(true)}>Forgot Username?</button>}
              <div className="auth-support"><strong>Need help?</strong><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 12h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Zm-2 7a6 6 0 0 1-6 2" /></svg>Contact IT Support</span></div>
              <p className="login-hint">Staff password resets are managed by your administrator.</p>
            </form>}
            <footer className="login-developer-credit">
              <span>Developed by <strong>Cintex</strong></span>
              <a href="mailto:cintextechpersonal@gmail.com" aria-label="Email Cintex technical support">cintextechpersonal@gmail.com</a>
            </footer>
            </div>
            <footer className="auth-login-footer">District Line <span /> Internal Booking System</footer>
          </section>
        </div>
      </main>
    )
  }

  return (
    <div className={`app-shell print-${printMode || 'screen'}${activeTab === 'Dashboard' ? ' admin-dashboard-shell' : ''}${activeTab === 'Home' ? ' home-page-shell' : ''}${activeTab === 'Log' ? ' log-page-shell' : ''}`}>
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
        {mobileNavOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)} />}
        <nav id="primary-navigation" className={`nav-tabs${mobileNavOpen ? ' is-open' : ''}`} aria-label="Main navigation" aria-hidden={!mobileNavOpen && isCompactNavigation} inert={!mobileNavOpen && isCompactNavigation}>
          {navTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'nav-button active' : 'nav-button'}
              onClick={() => {
                if ((tab === 'Dashboard' && !staffPermissions.dashboard)
                  || (tab === 'Accounts' && !staffPermissions.accounts)
                  || (tab === 'Customers' && !staffPermissions.customers)
                  || (tab === 'Staff' && !staffPermissions.staff)) {
                  showMessage('Your staff account does not have access to this page.', true)
                  return
                }
                setActiveTab(tab)
                setMobileNavOpen(false)
                if (tab === 'Dashboard' || tab === 'Accounts' || tab === 'Customers') {
                  const scope = tab === 'Dashboard' ? 'dashboard' : tab === 'Accounts' ? 'accounts' : 'customers'
                  if (!adminStats || adminStatsScope !== scope) openAdminDashboard(scope)
                }
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
          <button type="button" className="topbar-logout-button" onClick={() => setShowLogoutConfirm(true)} aria-label="Log out" title="Log out">
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
              <img src="/bus.webp" alt="District Line coach travelling along the coast" loading="lazy" />
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
                  permissions={homePermissions}
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
            {tripsLoading ? <TripsLoadingState /> : trips.length === 0 ? (
              <div className="empty-trip-state">
                <p>No bus sections are set up for this date and route.</p>
                {staffPermissions.trips ? <button type="button" className="primary-button small add-another-bus" onClick={handleAddBus}>+ Add bus section</button> : null}
              </div>
            ) : null}
          </div>
        </main>
      )}

      {activeTab === 'Log' && staffPermissions.log && (
        <main className="content-page log-page">
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
            </div>
            <section className="log-trip-summary-card" aria-label="Selected trip summary">
              <div className="log-trip-summary-heading">
                <span>Selected Trip</span>
                <strong>{route.label}</strong>
                <span className="log-trip-service">Night Super Express Service</span>
              </div>
              <div className="log-corridor-current-trip">
                <div><TripVisualIcon name="date" /><span><small>Date</small><strong>{selectedDate}</strong></span></div>
                <div><TripVisualIcon name="bus" /><span><small>Coach / Bus</small><strong>{activeTrip?.registration_no || 'Select bus'}{activeTrip?.bus_name ? ` (${activeTrip.bus_name})` : ''}</strong></span></div>
                <div><TripVisualIcon name="trip" /><span><small>Departure</small><strong>{activeTrip?.departure_time || '—'}</strong></span></div>
                <div><TripVisualIcon name="person" /><span><small>Driver</small><strong>{activeTrip?.driver_name || '—'}</strong></span></div>
                <div><TripVisualIcon name="person" /><span><small>Conductor</small><strong>{activeTrip?.conductor_name || '—'}</strong></span></div>
              </div>
            </section>
          </section>
          <section className="content-card log-card">
            <div className="logs-toolbar customer-log-toolbar">
              <div className="customer-log-heading">
                <div className="customer-log-title">
                  <span className="customer-log-code">C-1</span>
                  <h2>Customer Log · C1</h2>
                  <span className="booked-seat-count">{bookedSeatCount} Seats Booked</span>
                  {logsLoading && <span className="logs-loading-indicator" role="status"><span className="system-loading-spinner" aria-hidden="true" /> Loading logs…</span>}
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
                <button type="button" className="secondary-button small manifest-print-button customer-print-button" onClick={() => printNow('passengers')}><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M7 8V3h10v5M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/><path d="M18 11h.01"/></svg>Print Customer Manifest</button>
                {staffPermissions.logPassengers && <button type="button" className="primary-button small customer-entry-button" onClick={() => openEntryForm('passenger')}><span aria-hidden="true">⊕</span> Add Passenger</button>}
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
            <div className="log-table-scroll passenger-log-table-scroll" role="region" aria-label="Passenger manifest table" tabIndex={0}>
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
                      <td>{log.contact}</td>
                      <td>{log.boarding_point}</td>
                      <td>{log.destination}</td>
                      <td>{log.fare_total}</td>
                      <td>{log.notes || '—'}</td>
                      <td><span className={`confirmation-pill ${isCancelled ? 'cancelled' : (isConfirmed ? 'confirmed' : 'unconfirmed')}`}>{isCancelled ? 'cancelled' : (isConfirmed ? 'confirmed' : 'unconfirmed')}</span></td>
                      <td className="no-print">
                        <span className={`sms-pill ${log.sms_status === 'queued' ? 'sending' : log.sms_status}`}>{smsBusyId === log.id ? 'Sending' : smsStatusLabel}</span>
                        {formattedSmsDateTime ? <small className="sms-meta">{formattedSmsDateTime}</small> : null}
                        {log.sms_error ? <small className="sms-meta sms-error-text">{log.sms_error}</small> : null}
                        {isConfirmed && canSendSms && staffPermissions.logPassengers ? <button type="button" className="sms-send-button" disabled={smsBusyId === log.id} onClick={() => handleSendConfirmationSms(log)}>{log.sms_status === 'failed' ? 'Retry confirmation SMS' : 'Send confirmation SMS'}</button> : null}
                        {canSendCancellationSms && staffPermissions.logPassengers ? <button type="button" className="sms-send-button cancellation-sms-button" disabled={smsBusyId === log.id} onClick={() => handleCancellationSms(log)}>{smsBusyId === log.id ? 'Sending…' : (log.sms_message_type === 'cancellation' && log.sms_status === 'failed' ? 'Retry cancellation SMS' : 'Send cancellation SMS')}</button> : null}
                      </td>
                      <td className="no-print">
                        <input
                          type="checkbox"
                          checked={isConfirmed}
                          disabled={!log.any_active || smsBusyId === log.id || !staffPermissions.logPassengers}
                          aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} booking for ${log.passenger_name}`}
                          onChange={(event) => handleBookingConfirmation(log, event.target.checked)}
                        />
                      </td>
                      <td className="no-print">
                        {(staffPermissions.logPassengers || staffPermissions.customerActions) && <button type="button" className="ghost-button small" disabled={smsBusyId === log.id} onClick={() => { setEditingCustomerDetailsId(log.id); setCustomerNameDraft(log.passenger_name || ''); setCustomerContactDraft(log.contact || ''); setCustomerGenderDraft(log.gender || ''); setCustomerFromDraft(log.boarding_point || ''); setCustomerToDraft(log.destination || ''); setCustomerFareDraft(String(log.bookings[0]?.fare ?? '')); setCustomerNotesDraft(log.notes || '') }}>Edit</button>}
                        {log.any_active && staffPermissions.logPassengers ? (
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
                <button type="button" className="secondary-button small manifest-print-button cargo-print-button" onClick={() => printNow('cargo')}><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M7 8V3h10v5M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/><path d="M18 11h.01"/></svg>Print Luggage Manifest</button>
                {staffPermissions.logCargo && <button type="button" className="primary-button small customer-entry-button cargo-entry-button" onClick={() => openEntryForm('cargo')}>New Freight Entry</button>}
              </div>
            </div>
            <div className="log-table-scroll cargo-log-table-scroll" role="region" aria-label="Cargo manifest table" tabIndex={0}>
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
                    <td className="no-print cargo-action-cell">{staffPermissions.logCargo ? <button type="button" className="cargo-delete-button" aria-label={`Delete luggage entry ${item.cargo_ref}`} title="Delete luggage entry" onClick={() => handleDeleteCargo(item)}><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg></button> : null}</td>
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
        <InfoGuide topic={infoTopic} onTopicChange={setInfoTopic} />
      )}

      {activeTab === 'Staff' && staffPermissions.staff && (
        <StaffManagement token={token} staffList={staffList} setStaffList={setStaffList} crewList={crewList} setCrewList={setCrewList} buses={buses} busContacts={busContactList} loading={staffPageLoading} loadError={staffPageError} onRetry={openStaffManagement} onRegisterBus={() => { setBusFormError(''); setEditingBus(null); setBusForm({ registration_no: '', mobile_no: '', display_name: '', driver_name: '', driver_phone: '', conductor_name: '', conductor_phone: '', image_url: '/bus.jpg' }); setShowBusForm(true) }} onDeleteBus={handleDeactivateBus} onActivateBus={handleActivateBus} showMessage={showMessage} requestConfirmation={(details) => setConfirmDialog(details)} onSaved={(result) => {
          if (result.id === user?.id) {
            const pagePermission = { Home: 'home', Log: 'log', Info: 'info', Dashboard: 'dashboard', Accounts: 'accounts' }[activeTab]
            if (pagePermission && result.permissions?.[pagePermission] !== true) {
              const nextTab = firstAuthorizedPage({ ...user, permissions: result.permissions })
              setActiveTab(nextTab)
              if (nextTab === 'Log') loadLogs(token, activeTrip)
            }
          }
        }} readOnly={!isAdmin} />
      )}

      {activeTab === 'Dashboard' && staffPermissions.dashboard && (
        <main className="content-page dashboard-page admin-dashboard-page" aria-labelledby="admin-dashboard-title">
          <header className="admin-dashboard-header"><span><DashboardIcon /></span><div><h1 id="admin-dashboard-title">Admin Dashboard</h1><p>{canViewFinancialData ? 'Trip operations, seat availability and financial performance.' : 'Trip operations and seat availability.'}</p></div></header>
          <section className={`dashboard-kpis ${isAdmin ? 'is-four-card' : canViewFinancialData ? 'is-three-card' : 'is-two-card'}`} aria-label="Dashboard summary">
            {isAdmin && <SmsBalanceCard token={token} compact />}
            <DashboardKpi name="booked" title="Booked Seats" value={tripOverview.booked} loading={adminDataLoading || dashboardTripsLoading || !adminStats} error={dashboardTripsError || dashboardDataError} detail="Confirmed seats for the active Trip Controls filters." />
            <DashboardKpi name="available" title="Available Seats" value={tripOverview.available} loading={adminDataLoading || dashboardTripsLoading || !adminStats} error={dashboardTripsError || dashboardDataError} detail="Remaining capacity for the active Trip Controls filters." />
            {canViewFinancialData && <div className="dashboard-profit-kpi-slot" ref={setDashboardProfitTarget}>{!adminStats && <DashboardKpi name="profit" title="Net Profit" value="—" loading={adminDataLoading} error={dashboardDataError} detail="Profit Report totals will appear here." />}</div>}
          </section>
          {dashboardDataError && adminStats && <div className="dashboard-primary-error" role="alert">Unable to load dashboard data: {dashboardDataError}<button type="button" className="ghost-button" onClick={() => openAdminDashboard('dashboard', true, true)}>Retry dashboard load</button></div>}
          {adminStats ? <>
          {canViewFinancialData && <ExpenseSubmissionsTable className="dashboard-profit-report" submissions={profitLedger.expenseSubmissions} trips={adminStats.trips || []} revenueEntries={profitLedger.revenueEntries} dailyRevenue={adminStats.dailyRevenue || []} monthlyExpenses={adminStats.expenses || []} loading={profitLedgerLoading || adminDataLoading} error={profitLedgerError || dashboardDataError} summaryTarget={dashboardProfitTarget} onRetry={() => loadProfitLedger(true)} />}
          <section className="content-card dashboard-seat-chart-section">
            <div className="dashboard-section-heading">
              <div><h2>Seats booked by travel date</h2><p>Confirmed seats for each route in the selected month.</p></div>
              <label className="dashboard-seat-chart-month">Month<input type="month" value={seatChartMonth} onChange={(event) => setSeatChartMonth(event.target.value)} /></label>
            </div>
            {adminDataLoading ? <p className="daily-revenue-empty" role="status">Loading travel-date charts…</p> : dashboardDataError ? <p className="daily-revenue-empty" role="alert">Travel-date charts are unavailable: {dashboardDataError}</p> : <div className="dashboard-seat-chart-grid">
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
                  <div className="dashboard-seat-chart-scroll" role="region" aria-label={`Scrollable travel-date chart for ${chart.code === 'KTY_CMB' ? 'Kattankudy to Colombo' : 'Colombo to Kattankudy'}`} tabIndex={0}><svg className="dashboard-seat-chart" viewBox="0 0 800 285" role="img" aria-label={`Confirmed seats booked by date: ${chart.code === 'KTY_CMB' ? 'Kattankudy to Colombo' : 'Colombo to Kattankudy'}`}>
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
                        <rect x={x} y={y} width={barWidth} height={Math.max(count ? 2 : 0, height)} rx="2" className="dashboard-seat-bar" tabIndex={count ? 0 : undefined} aria-label={`${chart.dates[index]}: ${count} confirmed seats`}><title>{`${chart.dates[index]}: ${count} seats`}</title></rect>
                        {showDateLabel(index) && <text x={plot.left + index * bandWidth + bandWidth / 2} y={plot.top + plot.height + 22} textAnchor="middle" className="dashboard-seat-axis-label">{chart.dates[index].slice(5)}</text>}
                      </g>
                    })}
                  </svg></div>
                  {!chart.counts.some(Boolean) && <p className="dashboard-chart-empty">No confirmed seats in the selected month.</p>}
                </article>
              })}
            </div>}
          </section>
          {isAdmin && !adminStats.smsGateway?.configured && <p className="hint">SMS gateway is pending configuration. Bookings still work.</p>}
          <section className="content-card dashboard-trip-controls">
            <div className="dashboard-section-heading trip-controls-heading">
              <div className="trip-controls-title"><span className="trip-controls-icon"><TripVisualIcon name="sliders" /></span><div><h2>Trip Controls</h2><p>Filter trips by date, route, or individual trip.</p></div></div>
            </div>
            <div className="trip-controls-filters">
              <label><span className="trip-filter-label"><TripVisualIcon name="date" />Choose date</span><input type="date" value={revenueDate} onChange={(event) => { setRevenueDate(event.target.value); setDashboardTrip('') }} /></label>
              <label><span className="trip-filter-label"><TripVisualIcon name="bus" />Bus No</span><select value={dashboardBus} onChange={(event) => { setDashboardBus(event.target.value); setDashboardTrip('') }}><option value="">All buses</option>{busRegistrations(adminStats.buses || []).sort((a, b) => a.localeCompare(b)).map((busNo) => <option key={busNo} value={busNo}>{busNo}</option>)}</select></label>
              <label><span className="trip-filter-label"><TripVisualIcon name="route" />Route</span><select value={dashboardRoute} onChange={(event) => { setDashboardRoute(event.target.value); setDashboardTrip('') }}>{ROUTES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
              <label><span className="trip-filter-label"><TripVisualIcon name="trip" />Trip</span><select value={dashboardTrip} disabled={dashboardTripsLoading} onChange={(event) => setDashboardTrip(event.target.value)}><option value="">All trips</option>{dashboardTrips.filter((trip) => isInDashboardRange(trip.travel_date) && (!dashboardRoute || trip.route_code === dashboardRoute) && matchesDashboardBus(trip)).map((trip) => <option key={trip.id} value={String(trip.id)}>{trip.registration_no || 'Unassigned'} · {trip.trip_code}</option>)}</select></label>
              <strong className="dashboard-selected-range"><span>Selected date range</span>{dashboardRange ? `${dashboardRange.start} – ${dashboardRange.end}` : 'Choose a valid date'}</strong>
              <button type="button" className="dashboard-filter-reset" onClick={() => { setRevenueDate(todayIso()); setDashboardBus(''); setDashboardRoute('KTY_CMB'); setDashboardTrip('') }}><TripVisualIcon name="reset" />Reset filters</button>
            </div>
            <section className="trip-overview" aria-labelledby="trip-overview-heading">
              <div className="trip-overview-heading"><span className="trip-overview-heading-icon"><TripVisualIcon name="analytics" /></span><div><h3 id="trip-overview-heading">Trip Overview</h3><p>Seat availability and trip-linked revenue for the filtered trips.</p></div></div>
              {adminDataLoading || dashboardTripsLoading ? <p className="daily-revenue-empty" role="status">Loading trip data…</p> : dashboardTripsError || (canViewFinancialData && profitLedgerError) ? <p className="daily-revenue-empty" role="alert">Unable to load Trip Overview: {dashboardTripsError || profitLedgerError} {dashboardTripsError && <button type="button" className="ghost-button small" onClick={() => setDashboardTripsRetry(value => value + 1)}>Retry trips</button>}</p> : !tripOverview.rows.length ? <p className="daily-revenue-empty">No trips match the selected filters.</p> : <div className="trip-overview-grid">
                <section className="trip-overview-seats" aria-label="Booked and available seats by bus and route">
                  <h4 className="trip-card-title"><span className="trip-card-icon"><TripVisualIcon name="chart" /></span>Booked Vs Available Seats</h4>
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
                            <div><span><i className="trip-stat-icon booked"><TripVisualIcon name="seats" /></i>Booked seats</span><strong>{bus.booked}</strong><small>{bus.bookedPercent.toFixed(1)}%</small></div>
                            <div><span><i className="trip-stat-icon available"><TripVisualIcon name="seats" /></i>Available seats</span><strong>{bus.available}</strong><small>{bus.availablePercent.toFixed(1)}%</small></div>
                            <div><span>Total capacity</span><strong>{bus.totalSeats}</strong><small>{bus.tripCount} {bus.tripCount === 1 ? 'trip' : 'trips'} × {SEAT_LAYOUT.totalSeats}</small></div>
                          </div>
                        </article>)}
                      </div>
                    </section>)}
                  </div>
                </section>
                <section className="trip-overview-trip-list" aria-label="Filtered trip and vehicle details">
                  <h4 className="trip-card-title"><span className="trip-card-icon"><TripVisualIcon name="bus" /></span>Trip Details</h4>
                  {tripOverview.rows.map(({ trip, booked, available, seatRevenue, cargoRevenue, totalRevenue, unscheduled, busId }) => <article className="trip-overview-trip-card" key={unscheduled ? `bus-${busId}` : `trip-${trip.id}`}>
                    <div className="trip-overview-trip-heading"><h4><span className="trip-number-pill">{trip.trip_code || `Trip ${trip.id}`}</span></h4><span>{unscheduled ? `Bus ID ${busId}` : `Trip ID ${trip.id}`}</span></div>
                    <div className="trip-overview-trip-details"><div><span><TripVisualIcon name="date" />Date</span><strong>{trip.travel_date || 'No trip in selected range'}</strong></div><div><span><TripVisualIcon name="route" />Route</span><strong>{trip.route_label || ROUTES.find((route) => route.code === trip.route_code)?.label || trip.route_code || 'No route assigned'}</strong></div><div><span><TripVisualIcon name="bus" />Bus</span><strong>{trip.registration_no || trip.bus_no || 'Unassigned'}</strong></div><div><span><TripVisualIcon name="person" />Driver</span><strong>{trip.driver_name || trip.bus_driver_name || 'Unassigned'}</strong></div><div><span><TripVisualIcon name="person" />Conductor</span><strong>{trip.conductor_name || trip.bus_conductor_name || 'Unassigned'}</strong></div><div><span><TripVisualIcon name="seats" />Seats</span><strong>{booked} booked · {available} available</strong></div></div>
                    {canViewFinancialData && <div className="trip-overview-revenue"><div><span><TripVisualIcon name="revenue" />Seat Revenue</span><strong>{lkr(seatRevenue)}</strong></div><div><span><TripVisualIcon name="cargo" />Cargo Revenue</span><strong>{lkr(cargoRevenue)}</strong></div><div className="total"><span><TripVisualIcon name="revenue" />Total Revenue</span><strong>{lkr(totalRevenue)}</strong></div></div>}
                  </article>)}
                </section>
              </div>}
            </section>
          </section>
          </> : <section className="content-card" role="status" aria-live="polite">
            {adminDataLoading ? <AdminPageSkeleton label="dashboard" /> : dashboardDataError || (canViewFinancialData && profitLedgerError) ? `Unable to load dashboard data: ${dashboardDataError || profitLedgerError}` : 'Dashboard data is not available yet.'}
            {!adminDataLoading && (dashboardDataError || (canViewFinancialData && profitLedgerError)) && <button type="button" className="primary-button small" onClick={() => openAdminDashboard('dashboard', true, true)}>Retry dashboard load</button>}
          </section>}
        </main>
      )}

      {activeTab === 'Accounts' && staffPermissions.accounts && !adminStats && (
        <main className="content-page dashboard-page">
          <section className="content-card" role="status" aria-live="polite">
            {adminDataLoading ? <AdminPageSkeleton label="dashboard" /> : profitLedgerError ? `Unable to load dashboard data: ${profitLedgerError}` : 'Account data is not available yet.'}
            {!adminDataLoading && profitLedgerError && <button type="button" className="primary-button small" onClick={() => openAdminDashboard(activeTab === 'Accounts' ? 'accounts' : 'dashboard', true)}>Retry dashboard load</button>}
          </section>
        </main>
      )}

      {activeTab === 'Accounts' && staffPermissions.accounts && adminStats && <AccountsRevenue
        dutyPanel={(isAdmin || staffPermissions.accountsManage) && <AccountsDuties
          duties={visibleDuties} selectedDuty={selectedDuty} onSelect={setSelectedDutyId}
          form={dutyForm} setForm={setDutyForm} firstTrips={eligibleFirstDutyTrips} returnTrips={eligibleReturnDutyTrips}
          buses={[...new Set(unassignedDutyTrips.map(trip => trip.registration_no).filter(Boolean))]}
          expense={dutyExpenseForm} setExpense={setDutyExpenseForm} adjustment={dutyAdjustmentForm} setAdjustment={setDutyAdjustmentForm}
          saving={dutySaving} onCreate={handleCreateDuty} onExpense={handleAddDutyExpense} onAdjustment={handleAddDutyAdjustment}
          onDelete={handleDeleteDutyEntry} setFinalizeTarget={setFinalizeDutyTarget}
          setAcknowledged={setAcknowledgeNoDutyExpenses}
        />}
        readOnly={!isAdmin && !staffPermissions.accountsManage}
        data={{ ...adminStats, crewMembers: crewList }}
        token={token}
        showMessage={showMessage}
        onRefresh={refreshAccountsData}
        revenueEntries={profitLedger.revenueEntries}
        expenseSubmissionEntries={profitLedger.expenseSubmissions}
        ledgerLoading={profitLedgerLoading}
        onRevenueEntrySaved={(entry) => setProfitLedger((current) => ({ ...current, revenueEntries: [entry, ...current.revenueEntries].slice(0, 100) }))}
        onExpenseSubmissionSaved={(submission) => setProfitLedger((current) => ({ ...current, expenseSubmissions: [submission, ...current.expenseSubmissions].slice(0, 100) }))}
        monthlyExpenseForm={expenseForm}
        setMonthlyExpenseForm={setExpenseForm}
        monthlyExpenseSaving={expenseSaving}
        onAddMonthlyExpense={handleAddExpense}
        onPrint={() => { setPrintMode('accounts'); setTimeout(() => window.print(), 50) }}
      />}

      {activeTab === 'Customers' && staffPermissions.customers && (
        <CustomersPage
          departuresByRoute={popularDeparturesByRoute}
          customers={sortedRegularCustomers}
          departurePeriod={customerChartPeriod}
          onDeparturePeriodChange={setCustomerChartPeriod}
          customerPeriod={customerPeriod}
          onCustomerPeriodChange={setCustomerPeriod}
          loading={adminDataLoading || !adminStats || adminStatsScope !== 'customers'}
          error={customerDataError}
          onRetry={() => openAdminDashboard('customers', false, true)}
        />
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

      {showLogoutConfirm && (
        <StaffDialog
          title="Sign out?"
          subtitle="Are you sure you want to sign out of District Line? You will need to sign in again to access the system."
          className="logout-confirm-dialog"
          busy={logoutBusy}
          onClose={() => { if (!logoutBusy) setShowLogoutConfirm(false) }}
        >
          <footer className="staff-dialog-footer">
            <button type="button" className="ghost-button" autoFocus disabled={logoutBusy} onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
            <button type="button" className="primary-button" disabled={logoutBusy} onClick={handleLogout}>{logoutBusy ? 'Signing Out…' : 'Sign Out'}</button>
          </footer>
        </StaffDialog>
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
            <datalist id="crew-bus-numbers">{busRegistrations(buses, busContactList).map((busNo) => <option key={busNo} value={busNo} />)}</datalist>
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

      {confirmDialog && activeTab === 'Staff' ? (
        <StaffDialog title={confirmDialog.title} subtitle={confirmDialog.message} className="staff-confirm-modal" alert onClose={() => setConfirmDialog(null)}>
          <footer className="staff-dialog-footer"><button type="button" className="ghost-button" autoFocus onClick={() => setConfirmDialog(null)}>Cancel</button><button type="button" className={confirmDialog.destructive === false ? 'primary-button' : 'danger-button'} onClick={() => { const action = confirmDialog.onConfirm; setConfirmDialog(null); action() }}>{confirmDialog.confirmLabel}</button></footer>
        </StaffDialog>
      ) : confirmDialog && (
        <StaffDialog title={confirmDialog.title} subtitle={confirmDialog.message} className="confirm-action-modal" alert onClose={() => setConfirmDialog(null)}>
            <div className="confirm-action-icon" aria-hidden="true">!</div>
            <div className="reservation-actions staff-dialog-footer">
              <button type="button" className="ghost-button" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button type="button" className={confirmDialog.destructive === false ? 'primary-button' : 'danger-button'} onClick={() => { const action = confirmDialog.onConfirm; setConfirmDialog(null); action() }}>{confirmDialog.confirmLabel}</button>
            </div>
        </StaffDialog>
      )}

      {editingCustomerLog && (
        <div className="modal-backdrop no-print" onMouseDown={(event) => { if (event.target === event.currentTarget && smsBusyId !== editingCustomerLog.id) setEditingCustomerDetailsId(null) }}>
          <section className="modal customer-details-modal" role="dialog" aria-modal="true" aria-labelledby="customer-details-title">
            <h2 id="customer-details-title">Edit customer row</h2>
            <p>Update the customer details for seat{editingCustomerLog.seat_numbers.length === 1 ? '' : 's'} {editingCustomerLog.seat_numbers.join(', ')}.</p>
            <form onSubmit={(event) => { event.preventDefault(); handleSaveCustomerDetails(editingCustomerLog) }}>
              <div className="customer-details-form-grid">
                <label>Customer name<input autoFocus maxLength={120} value={customerNameDraft} onChange={(event) => setCustomerNameDraft(event.target.value)} /></label>
                <label>Contact number<input type="tel" maxLength={30} value={customerContactDraft} onChange={(event) => setCustomerContactDraft(event.target.value)} /></label>
                <label>Gender<select value={customerGenderDraft} onChange={(event) => setCustomerGenderDraft(event.target.value)}><option value="">Not specified</option><option value="Male">Male</option><option value="Female">Female</option>{customerGenderDraft && !['Male', 'Female'].includes(customerGenderDraft) && <option value={customerGenderDraft}>{customerGenderDraft}</option>}</select></label>
                <label>From<select value={customerFromDraft} onChange={(event) => setCustomerFromDraft(event.target.value)}><option value="">Select boarding point</option>{routeByCode(editingCustomerLog.route_code).boarding.map((point) => <option key={point} value={point}>{point}</option>)}{customerFromDraft && !routeByCode(editingCustomerLog.route_code).boarding.includes(customerFromDraft) && <option value={customerFromDraft}>{customerFromDraft}</option>}</select></label>
                <label>To<select value={customerToDraft} onChange={(event) => setCustomerToDraft(event.target.value)}><option value="">Select destination</option>{routeByCode(editingCustomerLog.route_code).alighting.map((point) => <option key={point} value={point}>{point}</option>)}{customerToDraft && !routeByCode(editingCustomerLog.route_code).alighting.includes(customerToDraft) && <option value={customerToDraft}>{customerToDraft}</option>}</select></label>
                <label>Fare per seat (Rs.)<input type="number" min="0" max="1000000000" step="1" value={customerFareDraft} onChange={(event) => setCustomerFareDraft(event.target.value)} /></label>
                <label className="customer-details-notes-field">Remark / Note<textarea maxLength={1000} value={customerNotesDraft} onChange={(event) => setCustomerNotesDraft(event.target.value)} /></label>
              </div>
              <div className="reservation-actions">
                <button type="button" className="ghost-button" disabled={smsBusyId === editingCustomerLog.id} onClick={() => setEditingCustomerDetailsId(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={smsBusyId === editingCustomerLog.id}>{smsBusyId === editingCustomerLog.id ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {finalizeDutyTarget && (
        <StaffDialog title={`Finalize ${finalizeDutyTarget.duty_code} profit?`} className="duty-finalize-modal" busy={dutySaving} onClose={() => { setFinalizeDutyTarget(null); setAcknowledgeNoDutyExpenses(false) }}>
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
            <div className="reservation-actions staff-dialog-footer">
              <button type="button" className="ghost-button" disabled={dutySaving} onClick={() => { setFinalizeDutyTarget(null); setAcknowledgeNoDutyExpenses(false) }}>Go back</button>
              <button type="button" className="primary-button" disabled={dutySaving || (!finalizeDutyTarget.expenses.length && !(finalizeDutyTarget.adjustments || []).length && !acknowledgeNoDutyExpenses)} onClick={handleFinalizeDuty}>{dutySaving ? 'Finalizing…' : 'Confirm and finalize'}</button>
            </div>
        </StaffDialog>
      )}

      {showBusForm && isAdmin && (
        <StaffDialog title={editingBus ? 'Edit bus' : 'Register bus'} subtitle="Register a bus for use across District Line forms." className="staff-bus-modal" busy={busSaving} onClose={() => setShowBusForm(false)}>
          <form onSubmit={event => { event.preventDefault(); handleSaveBus() }} onInvalid={event => setBusFormError(event.target.validationMessage)}>
            <fieldset className="staff-ui-fields staff-ui-bus-fields" disabled={busSaving}>
              <label><span>Registration number</span><input required maxLength={40} value={busForm.registration_no} onChange={event => { setBusFormError(''); setBusForm(prev => ({ ...prev, registration_no: event.target.value })) }} placeholder="NE-3456" /></label>
              <label><span>Mobile No. <small>(optional)</small></span><input type="tel" maxLength={30} value={busForm.mobile_no || ''} onChange={event => { setBusFormError(''); setBusForm(prev => ({ ...prev, mobile_no: event.target.value })) }} placeholder="077 123 4567" /></label>
              <label><span>Display name <small>(optional)</small></span><input value={busForm.display_name} onChange={event => setBusForm(prev => ({ ...prev, display_name: event.target.value }))} placeholder="District Line Coach" /></label>
            </fieldset>
            {busFormError && <p className="staff-ui-form-error" role="alert">{busFormError}</p>}
            <footer className="staff-dialog-footer"><button type="button" className="ghost-button" disabled={busSaving} onClick={() => setShowBusForm(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busSaving}>{busSaving ? 'Saving...' : 'Save bus'}</button></footer>
          </form>
        </StaffDialog>
      )}

      {cancelTarget && (
        <StaffDialog title="Cancel booking" onClose={() => setCancelTarget(null)}>
            <p>Cancel {cancelTarget.passenger_name} on {cancelTarget.route_label} / {cancelTarget.travel_date} / {cancelTarget.registration_no} seat{cancelTarget.seat_numbers?.length === 1 ? '' : 's'} {(cancelTarget.seat_numbers || [cancelTarget.seat_number]).join(', ')}?</p>
            <p>After cancelling, you can send a cancellation notice from the SMS column.</p>
            <div className="reservation-actions staff-dialog-footer">
              <button type="button" className="ghost-button" onClick={() => setCancelTarget(null)}>Keep booking</button>
              <button type="button" className="primary-button" onClick={confirmCancel}>Confirm cancellation</button>
            </div>
        </StaffDialog>
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
              <img src={activeTab === 'Home' || activeTab === 'Log' ? '/logo-transparent.png' : '/logo.png'} alt="District Line logo" className="footer-logo" />
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
