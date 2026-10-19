import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { api, assetUrl } from './api'
import TripWorkspace from './components/TripWorkspace'
import StaffManagement from './components/StaffManagement'
import AdminProfile from './components/AdminProfile'
import { ROUTES, SEAT_LAYOUT, routeByCode } from './data/seatLayout'

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

function persistUser(nextUser) {
  if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
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
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
      return null
    }
  })
  const [activeTab, setActiveTab] = useState('Home')
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
  const [logsLoading, setLogsLoading] = useState(false)
  const [cargoLogs, setCargoLogs] = useState([])
  const [logFilters, setLogFilters] = useState({ q: '', from: '', sms: '', status: '' })
  const [smsBusyId, setSmsBusyId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [showCrewForm, setShowCrewForm] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [showBusForm, setShowBusForm] = useState(false)
  const [editingBus, setEditingBus] = useState(null)
  const [adminStats, setAdminStats] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [revenuePeriod, setRevenuePeriod] = useState('daily')
  const [revenueDate, setRevenueDate] = useState(todayIso())
  const [dashboardRoute, setDashboardRoute] = useState('')
  const [dashboardTrip, setDashboardTrip] = useState('')
  const [customerPeriod, setCustomerPeriod] = useState('6')
  const [customerToday] = useState(() => todayIso())
  const [monthlyExpenseMonth, setMonthlyExpenseMonth] = useState(() => todayIso().slice(0, 7))
  const [expenseForm, setExpenseForm] = useState({ expense_month: todayIso().slice(0, 7), category: 'Fuel', description: '', amount: '' })
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [dutyForm, setDutyForm] = useState({ bus_no: '', first_trip_id: '', return_trip_id: '' })
  const [dutyExpenseForm, setDutyExpenseForm] = useState({ expense_date: todayIso(), trip_id: '', category: 'Fuel', description: '', amount: '' })
  const [dutyAdjustmentForm, setDutyAdjustmentForm] = useState({ adjustment_date: todayIso(), trip_id: '', type: 'other_income', description: '', amount: '', seat_number: '' })
  const [dutySaving, setDutySaving] = useState(false)
  const [selectedDutyId, setSelectedDutyId] = useState(null)
  const [finalizeDutyTarget, setFinalizeDutyTarget] = useState(null)
  const [acknowledgeNoDutyExpenses, setAcknowledgeNoDutyExpenses] = useState(false)
  const [dutyFilters, setDutyFilters] = useState({ bus_id: '', status: '', start_from: '', start_to: '', completion_from: '', completion_to: '' })
  const [passengerRecordSearch, setPassengerRecordSearch] = useState('')
  const [passengerRecordStatus, setPassengerRecordStatus] = useState('')
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
  const bookedSeatCount = customerLogs.filter((log) => log.status !== 'cancelled').length

  const dashboardRange = useMemo(() => {
    const anchor = new Date(`${revenueDate}T00:00:00`)
    if (Number.isNaN(anchor.getTime())) return null
    let start = new Date(anchor)
    let end = new Date(anchor)
    if (revenuePeriod === 'weekly') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      end = new Date(start)
      end.setDate(end.getDate() + 6)
    } else if (revenuePeriod === 'monthly') {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    } else if (revenuePeriod === 'yearly') {
      start = new Date(anchor.getFullYear(), 0, 1)
      end = new Date(anchor.getFullYear(), 11, 31)
    }
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { start: iso(start), end: iso(end) }
  }, [revenueDate, revenuePeriod])

  const isInDashboardRange = (date) => Boolean(date && dashboardRange && date >= dashboardRange.start && date <= dashboardRange.end)
  const matchesDashboardRoute = (row) => !dashboardRoute || row.route_code === dashboardRoute
  const matchesDashboardTrip = (row) => !dashboardTrip || String(row.trip_id || '') === dashboardTrip
  const filteredRevenue = useMemo(() => (adminStats?.dailyRevenue || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row)), [adminStats, dashboardRange, dashboardRoute, dashboardTrip])
  const filteredTrips = useMemo(() => (adminStats?.trips || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row)), [adminStats, dashboardRange, dashboardRoute, dashboardTrip])
  const filteredPassengerRecords = useMemo(() => (adminStats?.passengerRecords || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row)), [adminStats, dashboardRange, dashboardRoute, dashboardTrip])
  const visiblePassengerRecords = useMemo(() => {
    const query = passengerRecordSearch.trim().toLocaleLowerCase()
    return filteredPassengerRecords.filter((row) => {
      const isCancelled = row.status === 'cancelled'
      const isConfirmed = row.status === 'confirmed' && row.confirmation_status === 'confirmed'
      if (passengerRecordStatus === 'confirmed' && !isConfirmed) return false
      if (passengerRecordStatus === 'cancelled' && !isCancelled) return false
      if (!query) return true
      return [row.passenger_name, row.contact, row.seat_number, row.route_label, row.registration_no, row.trip_code, row.travel_date, row.status, row.confirmation_status]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query))
    })
  }, [filteredPassengerRecords, passengerRecordSearch, passengerRecordStatus])
  const filteredCargoRecords = useMemo(() => (adminStats?.cargoRecords || []).filter((row) => isInDashboardRange(row.travel_date) && matchesDashboardRoute(row) && matchesDashboardTrip(row)), [adminStats, dashboardRange, dashboardRoute, dashboardTrip])
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
  const sortedRegularCustomers = useMemo(() => {
    const periodMonths = customerPeriod === 'all' ? 0 : Number(customerPeriod)
    const endDate = customerToday
    const [year, month, day] = customerToday.split('-').map(Number)
    const monthIndex = year * 12 + month - 1 - periodMonths
    const startYear = Math.floor(monthIndex / 12)
    const startMonth = ((monthIndex % 12) + 12) % 12 + 1
    const leapYear = startYear % 4 === 0 && (startYear % 100 !== 0 || startYear % 400 === 0)
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][startMonth - 1]
    const startDate = periodMonths ? `${startYear}-${String(startMonth).padStart(2, '0')}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}` : ''
    return [...(adminStats?.regularCustomers || [])]
      .map((customer) => {
        const dates = (customer.trip_dates || []).filter((date) => customerPeriod === 'all' || (date >= startDate && date <= endDate))
        const months = new Set(dates.map((date) => String(date).slice(0, 7)))
        return { ...customer, trip_count: dates.length, month_count: months.size, last_trip_date: dates.sort().at(-1) || '' }
      })
      .filter((customer) => customer.trip_count >= 2)
      .sort((a, b) => b.trip_count - a.trip_count || b.month_count - a.month_count || String(b.last_trip_date).localeCompare(String(a.last_trip_date)))
  }, [adminStats, customerPeriod, customerToday])

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
    return [...groups.values()].map((group) => ({
      ...group,
      seat_numbers: group.bookings.map((booking) => booking.seat_number).sort((a, b) => Number(a) - Number(b)),
      all_confirmed: group.bookings.every((booking) => booking.status !== 'cancelled' && booking.confirmation_status === 'confirmed'),
      any_active: group.bookings.some((booking) => booking.status !== 'cancelled'),
      fare_total: group.bookings.reduce((total, booking) => total + Number(booking.fare || 0), 0),
      sms_sent_at: group.bookings.map((booking) => booking.sms_sent_at).filter(Boolean).sort().at(-1) || null,
      sms_error: group.bookings.find((booking) => booking.sms_error)?.sms_error || '',
      sms_status: group.bookings.every((booking) => booking.sms_status === group.bookings[0].sms_status)
        ? group.bookings[0].sms_status
        : 'mixed',
    })).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id))
  }, [customerLogs])

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
    const data = await api.buses(authToken, true)
    setBuses(data.buses || [])
  }, [])

  const loadTrips = useCallback(async (authToken, date = selectedDate, routeValue = routeCode) => {
    const data = await api.trips(authToken, queryString({ date, route: routeValue }))
    setTrips(data.trips || [])
    return data.trips || []
  }, [routeCode, selectedDate])

  const loadLogs = useCallback(async (authToken, selectedTrip) => {
    setLogsLoading(true)
    if (!selectedTrip?.id) {
      setCustomerLogs([])
      setCargoLogs([])
      setLogsLoading(false)
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
      setCustomerLogs(visibleBookings.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id)))
      setCargoLogs(cargoData.cargo || [])
    } finally {
      setLogsLoading(false)
    }
  }, [logFilters])

  const persistSessionUser = useCallback((nextUser) => {
    persistUser(nextUser)
    setUser(nextUser)
  }, [])

  const bootstrap = useCallback(async (authToken) => {
    try {
      await loadFleet(authToken)
      const nextTrips = await loadTrips(authToken)
      const current = nextTrips.find((trip) => trip.id === activeTripId) || nextTrips[0]
      setActiveTripId(current?.id || null)
      if (current) await loadLogs(authToken, current)
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        setToken('')
        setUser(null)
      }
      showMessage(err.message, true)
    }
  }, [activeTripId, loadFleet, loadLogs, loadTrips, showMessage])

  useEffect(() => {
    if (token) bootstrap(token)
  }, [token, selectedDate, routeCode, bootstrap])

  useEffect(() => {
    if (!token) return undefined
    api.me(token).then((data) => {
      if (data?.user) persistSessionUser(data.user)
    }).catch((err) => {
      if (err.status === 401 || err.status === 403) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        setToken('')
        setUser(null)
      }
    })
    return undefined
  }, [token, persistSessionUser])

  useEffect(() => {
    if (!user) return
    const allowed = navTabs.includes(activeTab)
    if (!allowed) setActiveTab(navTabs[0] || 'Info')
  }, [user, activeTab, navTabs])

  useEffect(() => {
    if (token && activeTripId) {
      loadLogs(token, trips.find((trip) => trip.id === activeTripId))
    }
  }, [activeTripId, trips, token, loadLogs])

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
      localStorage.setItem(TOKEN_KEY, data.token)
      persistUser(data.user)
      setToken(data.token)
      setUser(data.user)
      const firstTab = data.user?.role === 'admin' || data.user?.permissions?.home !== false ? 'Home' : (data.user?.permissions?.log !== false ? 'Log' : 'Info')
      setActiveTab(firstTab)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUser(null)
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

  const handleSmsToggle = async (booking, checked) => {
    if (!checked) return
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

  const openCrewForm = (trip) => {
    setEditingTrip(trip)
    setTripForm({
      travel_date: trip?.travel_date || selectedDate,
      route_code: trip?.route_code || routeCode,
      bus_no: trip?.registration_no || '',
      departure_time: trip?.departure_time || '20:30',
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
        driver_name: '',
        driver_phone: '',
        conductor_name: '',
        conductor_phone: '',
      })
      showMessage(`Bus section ${data.trip.trip_code} added. Enter the bus number and crew when they are confirmed.`)
      const next = await loadTrips(token, selectedDate, routeCode)
      setActiveTripId(data.trip.id)
      setTrips(next)
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
    try {
      if (editingBus) {
        await api.updateBus(token, editingBus.id, busForm)
        showMessage('Bus details updated.')
      } else {
        await api.createBus(token, busForm)
        showMessage('Bus registered.')
      }
      setShowBusForm(false)
      setEditingBus(null)
      await loadFleet(token)
      if (activeTab === 'Dashboard') await openAdminDashboard()
    } catch (err) {
      showMessage(err.message, true)
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
    if (!isAdmin) {
      showMessage('Admin access required.', true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
      return
    }
    try {
      const [data, staffData] = await Promise.all([api.adminDashboard(token), api.adminStaff(token)])
      setAdminStats(data)
      setStaffList(staffData.staff || [])
    } catch (err) {
      showMessage(err.message, true)
      setActiveTab(staffPermissions.home ? 'Home' : (navTabs[0] || 'Info'))
    }
  }

  const handleAddExpense = async (event) => {
    event.preventDefault()
    setExpenseSaving(true)
    try {
      const expenseDate = `${expenseForm.expense_month}-01`
      await api.createAdminExpense(token, { ...expenseForm, expense_date: expenseDate, amount: Number(expenseForm.amount) })
      setMonthlyExpenseMonth(expenseForm.expense_month)
      setRevenueDate(expenseDate)
      setRevenuePeriod('monthly')
      const data = await api.adminDashboard(token)
      setAdminStats(data)
      setExpenseForm((current) => ({ ...current, description: '', amount: '' }))
      showMessage('Monthly expense saved.')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setExpenseSaving(false)
    }
  }

  const refreshAccountsData = async () => {
    const data = await api.adminDashboard(token)
    setAdminStats(data)
    return data
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
      const staffData = await api.adminStaff(token)
      setStaffList(staffData.staff || [])
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

  if (!token) {
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
        <nav className="nav-tabs">
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
                if (tab === 'Dashboard' || tab === 'Accounts' || tab === 'Customers') openAdminDashboard()
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
                {ROUTES.map((item, index) => {
                  const selected = item.code === routeCode
                  const routeTrip = selected ? activeTrip : null
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
                      <span className="log-corridor-kicker">Corridor {index === 0 ? 'Inbound' : 'Outbound'} · C-0{index + 1}<i>{selected ? '✓' : '○'}</i></span>
                      <strong>{item.label}</strong>
                      <small>{item.via.replace('Via ', '')}</small>
                      <span className="log-corridor-meta">{routeTrip?.departure_time ? `Dep: ${routeTrip.departure_time}` : 'Departure: —'} <b>·</b> {selected ? `${trips.length} bus section${trips.length === 1 ? '' : 's'}` : 'Select corridor to view buses'} {routeTrip?.registration_no ? <em>{routeTrip.registration_no}</em> : null}</span>
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
            <table className="print-passengers">
              <thead>
                <tr>
                  <th>Seat</th>
                  <th>Passenger</th>
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
                  const canSendSms = log.bookings.some((booking) => booking.status !== 'cancelled' && booking.confirmation_status === 'confirmed' && !['sent', 'delivered'].includes(booking.sms_status))
                  return (
                    <tr key={log.booking_group_id || log.id} className={isCancelled ? 'row-cancelled' : ''}>
                      <td>{log.seat_numbers.join(', ')}</td>
                      <td>{log.passenger_name}</td>
                      <td>{log.contact}</td>
                      <td>{log.boarding_point}</td>
                      <td>{log.destination}</td>
                      <td>{log.fare_total}</td>
                      <td>{log.notes || '—'}</td>
                      <td><span className={`confirmation-pill ${isCancelled ? 'cancelled' : (isConfirmed ? 'confirmed' : 'unconfirmed')}`}>{isCancelled ? 'cancelled' : (isConfirmed ? 'confirmed' : 'unconfirmed')}</span></td>
                      <td className="no-print">
                        <span className={`sms-pill ${log.sms_status === 'queued' ? 'sending' : log.sms_status}`}>{smsBusyId === log.id ? 'Sending' : ({ pending: 'Pending', queued: 'Sending', sent: 'Sent', delivered: 'Sent', failed: 'Failed', mixed: 'Mixed' }[log.sms_status] || log.sms_status)}</span>
                        {log.sms_sent_at ? <small className="sms-meta">{new Date(`${log.sms_sent_at.replace(' ', 'T')}Z`).toLocaleString()}</small> : null}
                        {log.sms_error ? <small className="sms-meta sms-error-text">{log.sms_error}</small> : null}
                        {isConfirmed && canSendSms && staffPermissions.passengers ? <label className="sms-send-control"><input type="checkbox" disabled={smsBusyId === log.id} onChange={(event) => handleSmsToggle(log, event.target.checked)} /> Send Confirmation SMS</label> : null}
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
            <table className="print-cargo cargo-log-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Goods Description</th>
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
                    <td className="cargo-goods-description"><strong>{item.description}</strong><small>{item.notes || `${item.weight || 'Cargo'}${item.weight ? ' kg' : ''}`}</small></td>
                    <td>{item.sender_name || item.receiver_name || '—'}</td>
                    <td>{item.sender_phone || item.receiver_phone || '—'}</td>
                    <td>{route.label.split(' to ')[1] || '—'}</td>
                    <td className="cargo-fee">{Number(item.charge || 0).toLocaleString('en-US')}</td>
                    <td><span className={`cargo-payment-badge ${String(item.payment_status || '').toLowerCase() === 'paid' ? 'paid' : 'cod'}`}>{String(item.payment_status || '').toLowerCase() === 'paid' ? '● Paid' : '● COD'}</span></td>
                    <td className="no-print cargo-action-cell">{staffPermissions.cargo ? <button type="button" className="cargo-delete-button" aria-label={`Delete luggage entry ${item.cargo_ref}`} title="Delete luggage entry" onClick={() => handleDeleteCargo(item)}><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg></button> : null}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="8">
                    <span>Total Registered Cargo: {cargoLogs.length} consignment{cargoLogs.length === 1 ? '' : 's'} · Collected / In Transit: <strong>Rs. {cargoLogs.reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</strong></span>
                    <span className="cargo-payment-totals"><span><i className="paid-dot" />Paid: Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() === 'paid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span><span><i className="cod-dot" />Collect on Delivery (COD): Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() !== 'paid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span></span>
                  </td>
                </tr>
              </tfoot>
            </table>
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
        <StaffManagement token={token} staffList={staffList} setStaffList={setStaffList} showMessage={showMessage} requestConfirmation={(details) => setConfirmDialog(details)} onSaved={(result) => {
          if (result.id === user?.id && result.permissions?.home === false && activeTab === 'Home') {
            const nextTab = result.permissions?.log !== false ? 'Log' : 'Info'
            setActiveTab(nextTab)
            if (nextTab === 'Log') loadLogs(token, activeTrip)
          }
        }} />
      )}

      {activeTab === 'Dashboard' && isAdmin && adminStats && (
        <main className="content-page dashboard-page">
          <section className="content-card dashboard-filter-bar">
            <div><h2>Dashboard filters</h2><p>Date range, route, bus, and trip apply to revenue, trips, passenger records, and cargo records.</p></div>
            <div className="revenue-filter-controls">
              <label>Period<select value={revenuePeriod} onChange={(event) => setRevenuePeriod(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
              <label>Choose date<input type="date" value={revenueDate} onChange={(event) => setRevenueDate(event.target.value)} /></label>
              <label>Route<select value={dashboardRoute} onChange={(event) => setDashboardRoute(event.target.value)}><option value="">All routes</option>{ROUTES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
              <label>Bus<select value={dashboardTrip} onChange={(event) => setDashboardTrip(event.target.value)}><option value="">All buses</option>{(adminStats.trips || []).filter((trip) => isInDashboardRange(trip.travel_date) && (!dashboardRoute || trip.route_code === dashboardRoute)).map((trip) => <option key={trip.id} value={String(trip.id)}>{trip.registration_no || 'Unassigned'} · {trip.trip_code}</option>)}</select></label>
              <strong>{dashboardRange ? `${dashboardRange.start} – ${dashboardRange.end}` : 'Choose a valid date'}</strong>
              <button type="button" className="dashboard-filter-reset" onClick={() => { setRevenuePeriod('daily'); setRevenueDate(todayIso()); setDashboardRoute(''); setDashboardTrip('') }}>Reset</button>
            </div>
          </section>
          <div className="stats-grid">
            <div className="metric-card"><span>Registered buses</span><strong>{adminStats.buses.length}</strong></div>
            <div className="metric-card"><span>Trips in selected filters</span><strong>{filteredTrips.length}</strong></div>
            <div className="metric-card"><span>Confirmed passengers in selected filters</span><strong>{filteredPassengerRecords.filter((item) => item.status === 'confirmed' && item.confirmation_status === 'confirmed').length}</strong></div>
            <div className="metric-card"><span>Passenger revenue (selected period)</span><strong>Rs. {revenueSummary.passenger.toLocaleString('en-US')}</strong></div>
            <div className="metric-card"><span>Cargo items in selected filters</span><strong>{filteredCargoRecords.length}</strong></div>
            <div className="metric-card"><span>Cargo revenue (selected period)</span><strong>Rs. {revenueSummary.cargo.toLocaleString('en-US')}</strong></div>
            <div className="metric-card"><span>SMS pending</span><strong>{adminStats.sms?.pending || 0}</strong></div>
            <div className="metric-card"><span>SMS sent / failed</span><strong>{adminStats.sms?.sent || 0} / {adminStats.sms?.failed || 0}</strong></div>
          </div>
          {!adminStats.smsGateway?.configured && <p className="hint">SMS gateway is pending configuration. Bookings still work.</p>}
          <section className="content-card location-analytics-card">
            <div className="dashboard-section-heading">
              <div><h2>Passenger Location Analytics</h2><p>Popular boarding and destination locations based on confirmed bookings in the selected filters.</p></div>
            </div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Rank</th><th>Location</th><th>Travel date(s)</th><th>Boarding bookings</th><th>Destination bookings</th><th>Total location activity</th></tr></thead>
              <tbody>
                {passengerLocationAnalytics.slice(0, 15).map((location, index) => (
                  <tr key={location.location.toLocaleLowerCase()}><td>{index + 1}</td><td>{location.location}</td><td>{location.travelDates.join(', ') || '—'}</td><td>{location.boardingCount}</td><td>{location.destinationCount}</td><td><strong>{location.totalBookings}</strong></td></tr>
                ))}
                {!passengerLocationAnalytics.length && <tr><td colSpan="6" className="daily-revenue-empty">No confirmed passenger location data for these filters.</td></tr>}
              </tbody>
            </table></div>
          </section>
          <section className="content-card daily-revenue-card">
            <div className="daily-revenue-heading">
              <div>
                <h2>Revenue report</h2>
                <p>Passenger and cargo totals for {filteredRevenue.length} trip(s) in the selected range</p>
              </div>
              <strong>Rs. {revenueSummary.total.toLocaleString('en-US')}</strong>
            </div>
            <div className="daily-revenue-table-wrap">
              <table>
                <thead><tr><th>Travel date</th><th>Bus No</th><th>Trip No</th><th>Route</th><th>Passengers</th><th>Passenger revenue</th><th>Cargo items</th><th>Cargo revenue</th><th>Total revenue</th></tr></thead>
                <tbody>
                  {filteredRevenue.map((day) => (
                    <tr key={day.trip_id ? `trip-${day.trip_id}` : `${day.travel_date}-${day.route_code || 'unknown'}-${day.registration_no || 'unassigned'}`}>
                      <td>{day.travel_date}</td>
                      <td>{day.registration_no || 'Unassigned'}</td>
                      <td>{day.trip_code || 'Unassigned'}</td>
                      <td>{day.route_label || 'Unassigned'}</td>
                      <td>{day.passenger_count}</td>
                      <td>Rs. {Number(day.passenger_revenue).toLocaleString('en-US')}</td>
                      <td>{day.cargo_count}</td>
                      <td>Rs. {Number(day.cargo_revenue).toLocaleString('en-US')}</td>
                      <td><strong>Rs. {Number(day.total_revenue).toLocaleString('en-US')}</strong></td>
                    </tr>
                  ))}
                  {!filteredRevenue.length && <tr><td colSpan="9" className="daily-revenue-empty">No revenue recorded for this period and route.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="content-card">
            <div className="dashboard-section-heading"><h2>Trip controls</h2><button type="button" className="primary-button small" onClick={handleAddBus}>Add trip / bus section</button></div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Code</th><th>Date</th><th>Route</th><th>Bus</th><th>Driver name</th><th>Conductor name</th><th>Booked</th><th>Available</th><th>Controls</th></tr></thead>
              <tbody>
              {filteredTrips.map((trip) => (
                  <tr key={trip.id}>
                    <td>{trip.trip_code}</td>
                    <td>{trip.travel_date}</td>
                    <td>{trip.route_label}</td>
                    <td>{trip.registration_no || 'Unassigned'}</td>
                    <td>{trip.driver_name || trip.bus_driver_name || 'Unassigned'}</td>
                    <td>{trip.conductor_name || trip.bus_conductor_name || 'Unassigned'}</td>
                    <td>{trip.booked_count}</td>
                    <td>{trip.available_count}</td>
                    <td><div className="toolbar-actions"><button type="button" className="ghost-button small" onClick={() => openCrewForm(trip)}>Edit crew / bus</button><button type="button" className="ghost-button small" onClick={() => handleDeleteTrip(trip)}>Delete</button></div></td>
                  </tr>
                ))}
                {!filteredTrips.length && <tr><td colSpan="9" className="daily-revenue-empty">No trips in this period.</td></tr>}
              </tbody>
            </table></div>
          </section>
          <div className="dashboard-record-grid">
            <section className="content-card">
              <div className="dashboard-section-heading passenger-record-heading">
                <h2>Passenger records</h2>
                <div className="revenue-filter-controls passenger-record-controls">
                  <label>Search<input type="search" placeholder="Name, mobile, seat, route..." value={passengerRecordSearch} onChange={(event) => setPassengerRecordSearch(event.target.value)} /></label>
                  <label>Booking status<select value={passengerRecordStatus} onChange={(event) => setPassengerRecordStatus(event.target.value)}><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></label>
                </div>
              </div>
              <div className="daily-revenue-table-wrap"><table><thead><tr><th>Date</th><th>Passenger</th><th>Mobile No.</th><th>Seat</th><th>Route</th><th>Bus No</th><th>Trip No</th><th>Fare</th><th>Status</th></tr></thead><tbody>
              {visiblePassengerRecords.slice(0, 12).map((item) => <tr key={item.id}><td>{item.travel_date}</td><td>{item.passenger_name}</td><td>{item.contact || '—'}</td><td>{item.seat_number}</td><td>{item.route_label}</td><td>{item.registration_no || 'Unassigned'}</td><td>{item.trip_code || 'Unassigned'}</td><td>Rs. {Number(item.fare || 0).toLocaleString('en-US')}</td><td>{item.status === 'cancelled' ? 'cancelled' : item.confirmation_status}</td></tr>)}
              {!visiblePassengerRecords.length && <tr><td colSpan="9" className="daily-revenue-empty">No passenger records match these filters.</td></tr>}
            </tbody></table></div></section>
            <section className="content-card"><h2>Cargo records</h2><div className="daily-revenue-table-wrap"><table><thead><tr><th>Date</th><th>Bill no</th><th>Route</th><th>Bus No</th><th>Trip No</th><th>Description</th><th>Customer Name</th><th>Contact Number</th><th>Charge</th></tr></thead><tbody>
              {filteredCargoRecords.slice(0, 12).map((item) => <tr key={item.id}><td>{item.travel_date || '—'}</td><td>{item.cargo_ref}</td><td>{item.route_label || 'Unassigned'}</td><td>{item.registration_no || 'Unassigned'}</td><td>{item.trip_code || 'Unassigned'}</td><td>{item.description}</td><td>{item.sender_name || item.receiver_name || '—'}</td><td>{item.sender_phone || item.receiver_phone || '—'}</td><td>Rs. {Number(item.charge || 0).toLocaleString('en-US')}</td></tr>)}
              {!filteredCargoRecords.length && <tr><td colSpan="9" className="daily-revenue-empty">No cargo records in this period.</td></tr>}
            </tbody></table></div></section>
          </div>
          <section className="content-card">
            <div className="dashboard-section-heading">
              <div>
                <h2>Staff accounts</h2>
                <p className="staff-permission-caption staff-page-caption">{staffList.length} staff account{staffList.length === 1 ? '' : 's'} · account creation, permissions, and password resets are on the Staff page.</p>
              </div>
              <button type="button" className="primary-button small" onClick={() => { setActiveTab('Staff'); openStaffManagement() }}>Manage staff</button>
            </div>
            <div className="daily-revenue-table-wrap"><table><thead><tr><th>Staff member</th><th>Status</th><th>Passenger</th><th>Cargo</th><th>Trips</th></tr></thead><tbody>
              {staffList.map((person) => <tr key={person.id}><td>{person.full_name}<small className="staff-username">{person.username}</small></td><td>{person.status || 'active'}</td><td>{person.permissions?.passengers ? 'Allowed' : 'Blocked'}</td><td>{person.permissions?.cargo ? 'Allowed' : 'Blocked'}</td><td>{person.permissions?.trips ? 'Allowed' : 'Blocked'}</td></tr>)}
              {!staffList.length && <tr><td colSpan="5" className="daily-revenue-empty">No staff accounts found.</td></tr>}
            </tbody></table></div>
          </section>
        </main>
      )}

      {activeTab === 'Accounts' && isAdmin && adminStats && (
        <main className="content-page dashboard-page">
          <section className="content-card expense-entry-card">
            <div className="dashboard-section-heading"><div><h2>Create bus duty</h2><p>Enter the bus number used on both journeys. It does not need to be registered in Bus Management.</p></div></div>
            <form className="expense-entry-form duty-create-form" onSubmit={handleCreateDuty}>
              <label>Bus No<input required list="duty-bus-number-options" value={dutyForm.bus_no} onChange={(event) => setDutyForm({ bus_no: event.target.value, first_trip_id: '', return_trip_id: '' })} placeholder="Enter or select bus number" /><datalist id="duty-bus-number-options">{[...new Set(unassignedDutyTrips.map((trip) => trip.registration_no).filter(Boolean))].map((busNo) => <option key={busNo} value={busNo} />)}</datalist></label>
              <label>First journey<select required value={dutyForm.first_trip_id} onChange={(event) => setDutyForm((current) => ({ ...current, first_trip_id: event.target.value, return_trip_id: '' }))}><option value="">Select first journey</option>{eligibleFirstDutyTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.travel_date} · {trip.route_label} · {trip.trip_code}</option>)}</select></label>
              <label>Return journey<select required value={dutyForm.return_trip_id} onChange={(event) => setDutyForm((current) => ({ ...current, return_trip_id: event.target.value }))} disabled={!firstDutyTrip}><option value="">Select return journey</option>{eligibleReturnDutyTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.travel_date} · {trip.route_label} · {trip.trip_code}</option>)}</select></label>
              <button type="submit" className="primary-button" disabled={dutySaving || !eligibleReturnDutyTrips.some((trip) => String(trip.id) === dutyForm.return_trip_id)}>{dutySaving ? 'Saving…' : 'Create duty'}</button>
            </form>
          </section>
          <section className="content-card">
            <div className="dashboard-section-heading"><div><h2>Bus duty financial review</h2><p>Booking revenue excludes cancelled and unconfirmed seats. Active duty profits update until finalized; finalized reports use a saved snapshot.</p></div></div>
            <div className="revenue-filter-controls duty-filter-controls">
              <label>Bus<select value={dutyFilters.bus_id} onChange={(event) => setDutyFilters((current) => ({ ...current, bus_id: event.target.value }))}><option value="">All buses</option>{(adminStats.buses || []).map((bus) => <option key={bus.id} value={bus.id}>{bus.registration_no}</option>)}</select></label>
              <label>Status<select value={dutyFilters.status} onChange={(event) => setDutyFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{Object.entries(DUTY_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Start date from<input type="date" value={dutyFilters.start_from} onChange={(event) => setDutyFilters((current) => ({ ...current, start_from: event.target.value }))} /></label>
              <label>Start date to<input type="date" value={dutyFilters.start_to} onChange={(event) => setDutyFilters((current) => ({ ...current, start_to: event.target.value }))} /></label>
              <label>Completion from<input type="date" value={dutyFilters.completion_from} onChange={(event) => setDutyFilters((current) => ({ ...current, completion_from: event.target.value }))} /></label>
              <label>Completion to<input type="date" value={dutyFilters.completion_to} onChange={(event) => setDutyFilters((current) => ({ ...current, completion_to: event.target.value }))} /></label>
            </div>
            <div className="stats-grid duty-totals-grid">
              <div className="metric-card"><span>Selected duty revenue</span><strong>Rs. {visibleDutyTotals.revenue.toLocaleString('en-US')}</strong></div>
              <div className="metric-card"><span>Selected duty expenses</span><strong>Rs. {visibleDutyTotals.expenses.toLocaleString('en-US')}</strong></div>
              <div className="metric-card"><span>Combined net profit</span><strong>Rs. {visibleDutyTotals.profit.toLocaleString('en-US')}</strong></div>
            </div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Duty ID</th><th>Bus No</th><th>First journey</th><th>Return journey</th><th>Total revenue</th><th>Total expenses</th><th>Net profit</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>
                {visibleDuties.map((duty) => <tr key={duty.id}><td>{duty.duty_code}</td><td>{duty.bus_no}</td><td>{duty.first_trip.travel_date} · {duty.first_trip.route_label}</td><td>{duty.return_trip.travel_date} · {duty.return_trip.route_label}</td><td>Rs. {Number(duty.total_revenue).toLocaleString('en-US')}</td><td>Rs. {Number(duty.total_expenses).toLocaleString('en-US')}</td><td><strong>Rs. {Number(duty.net_profit).toLocaleString('en-US')}</strong></td><td>{DUTY_STATUS_LABELS[duty.status] || duty.status}</td><td><button type="button" className="ghost-button small" onClick={() => setSelectedDutyId(duty.id)}>Review</button></td></tr>)}
                {!visibleDuties.length && <tr><td colSpan="9" className="daily-revenue-empty">No bus duties match these filters.</td></tr>}
              </tbody>
            </table></div>
          </section>
          {selectedDuty && (
            <section className="content-card duty-detail-card">
              <div className="dashboard-section-heading"><div><h2>{selectedDuty.duty_code} · {selectedDuty.bus_no}</h2><p>{DUTY_STATUS_LABELS[selectedDuty.status]}{selectedDuty.finalized_at ? ` · Finalized ${selectedDuty.finalized_at}` : ''}</p></div><button type="button" className="ghost-button small" onClick={() => setSelectedDutyId(null)}>Close details</button></div>
              <div className="duty-journey-grid">
                {[['First journey', selectedDuty.first_trip], ['Return journey', selectedDuty.return_trip]].map(([label, trip]) => <article key={trip.id}><h3>{label}</h3><p><strong>{trip.route_label}</strong></p><p>{trip.travel_date} · {trip.trip_code} · {trip.status}</p><p>Booking revenue: <strong>Rs. {Number(trip.revenue.total).toLocaleString('en-US')}</strong></p><p>Collected: Rs. {Number(trip.revenue.collected).toLocaleString('en-US')} · Outstanding: Rs. {Number(trip.revenue.outstanding).toLocaleString('en-US')}</p></article>)}
              </div>
              <div className="stats-grid duty-totals-grid">
                <div className="metric-card"><span>Total duty revenue</span><strong>Rs. {Number(selectedDuty.total_revenue).toLocaleString('en-US')}</strong></div>
                <div className="metric-card"><span>Collected / outstanding</span><strong>Rs. {Number(selectedDuty.total_collected).toLocaleString('en-US')} / {Number(selectedDuty.total_outstanding).toLocaleString('en-US')}</strong></div>
                <div className="metric-card"><span>Total duty expenses</span><strong>Rs. {Number(selectedDuty.total_expenses).toLocaleString('en-US')}</strong></div>
                <div className="metric-card"><span>Other income</span><strong>Rs. {Number(selectedDuty.adjustment_totals?.other_income || 0).toLocaleString('en-US')}</strong></div>
                <div className="metric-card"><span>Cancellation fees</span><strong>Rs. {Number(selectedDuty.adjustment_totals?.cancellation_fees || 0).toLocaleString('en-US')}</strong></div>
                <div className="metric-card"><span>Refunds</span><strong>Rs. {Number(selectedDuty.adjustment_totals?.refunds || 0).toLocaleString('en-US')}</strong></div>
                <div className="metric-card"><span>Net profit</span><strong>Rs. {Number(selectedDuty.net_profit).toLocaleString('en-US')}</strong></div>
              </div>
              <div className="dashboard-section-heading"><div><h3>Duty financial details</h3><p>Expenses reduce profit. Fees and other income increase it. Cancelled fares are already excluded from booking revenue, so refunds are shown here without subtracting them twice.</p></div></div>
              <div className="daily-revenue-table-wrap"><table><thead><tr><th>Date</th><th>Journey</th><th>Entry type</th><th>Description</th><th>Seat</th><th>Amount</th><th>Profit effect</th>{selectedDuty.status !== 'finalized' && <th>Action</th>}</tr></thead><tbody>
                {[...selectedDuty.expenses.map((expense) => ({ ...expense, kind: 'expense', entry_date: expense.expense_date, entry_type: `Expense · ${expense.category}`, seat_number: '', effect: -Number(expense.amount), key: `expense-${expense.id}` })), ...((selectedDuty.adjustments || []).map((adjustment) => ({ ...adjustment, kind: 'adjustment', entry_date: adjustment.adjustment_date, entry_type: ({ refund: 'Cancellation refund', cancellation_fee: 'Cancellation fee', replacement_booking: 'Replacement booking (existing entry)', other_income: 'Other income' })[adjustment.type], effect: adjustment.type === 'refund' ? 0 : Number(adjustment.amount), key: `adjustment-${adjustment.id}` })))].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.key.localeCompare(b.key)).map((entry) => <tr key={entry.key}><td>{entry.entry_date}</td><td>{entry.trip_id ? (entry.trip_id === selectedDuty.first_trip.id ? 'First journey' : 'Return journey') : 'Shared duty'}</td><td>{entry.entry_type}</td><td>{entry.description}</td><td>{entry.seat_number || '—'}</td><td>Rs. {Number(entry.amount).toLocaleString('en-US')}</td><td className={entry.kind === 'adjustment' && entry.type === 'refund' ? 'duty-neutral-amount' : entry.effect < 0 ? 'duty-loss-amount' : 'duty-income-amount'}>{entry.kind === 'adjustment' && entry.type === 'refund' ? 'No profit effect' : `${entry.effect < 0 ? '−' : '+'}Rs. ${Math.abs(entry.effect).toLocaleString('en-US')}`}</td>{selectedDuty.status !== 'finalized' && <td><button type="button" className="ghost-button small duty-entry-delete" disabled={dutySaving} onClick={() => handleDeleteDutyEntry(entry)}>Delete</button></td>}</tr>)}
                {!selectedDuty.expenses.length && !(selectedDuty.adjustments || []).length && <tr><td colSpan={selectedDuty.status === 'finalized' ? '7' : '8'} className="daily-revenue-empty">No financial details recorded for this duty yet.</td></tr>}
              </tbody></table></div>
              {selectedDuty.status !== 'finalized' && <form className="expense-entry-form duty-expense-form" onSubmit={handleAddDutyExpense}>
                <label>Expense date<input required type="date" value={dutyExpenseForm.expense_date} onChange={(event) => setDutyExpenseForm((current) => ({ ...current, expense_date: event.target.value }))} /></label>
                <label>Journey<select value={dutyExpenseForm.trip_id} onChange={(event) => setDutyExpenseForm((current) => ({ ...current, trip_id: event.target.value }))}><option value="">Shared duty cost</option><option value={selectedDuty.first_trip.id}>First journey</option><option value={selectedDuty.return_trip.id}>Return journey</option></select></label>
                <label>Category<select value={dutyExpenseForm.category} onChange={(event) => setDutyExpenseForm((current) => ({ ...current, category: event.target.value }))}><option>Fuel</option><option>Driver allowance</option><option>Conductor allowance</option><option>Driver wage</option><option>Conductor wage</option><option>Driver salary</option><option>Conductor salary</option><option>Maintenance</option><option>Toll / parking charge</option><option>Other expenses</option></select></label>
                <label>Description<input required maxLength="240" value={dutyExpenseForm.description} onChange={(event) => setDutyExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="Expense details" /></label>
                <label>Amount (Rs.)<input required type="number" min="1" step="1" value={dutyExpenseForm.amount} onChange={(event) => setDutyExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
                <button type="submit" className="primary-button" disabled={dutySaving}>{dutySaving ? 'Saving…' : 'Add duty expense'}</button>
              </form>}
              {selectedDuty.status !== 'finalized' && <form className="expense-entry-form duty-expense-form duty-adjustment-form" onSubmit={handleAddDutyAdjustment}>
                <label>Entry date<input required type="date" value={dutyAdjustmentForm.adjustment_date} onChange={(event) => setDutyAdjustmentForm((current) => ({ ...current, adjustment_date: event.target.value }))} /></label>
                <label>Journey<select value={dutyAdjustmentForm.trip_id} onChange={(event) => setDutyAdjustmentForm((current) => ({ ...current, trip_id: event.target.value }))}><option value="">Shared duty</option><option value={selectedDuty.first_trip.id}>First journey</option><option value={selectedDuty.return_trip.id}>Return journey</option></select></label>
                <label>Entry type<select value={dutyAdjustmentForm.type} onChange={(event) => setDutyAdjustmentForm((current) => ({ ...current, type: event.target.value }))}><option value="other_income">Other income</option><option value="refund">Cancellation refund</option><option value="cancellation_fee">Cancellation fee</option></select></label>
                <label>Description<input required maxLength="240" value={dutyAdjustmentForm.description} onChange={(event) => setDutyAdjustmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="e.g. luggage fee, cancelled seat refund" /></label>
                <label>Amount (Rs.)<input required type="number" min="1" step="1" value={dutyAdjustmentForm.amount} onChange={(event) => setDutyAdjustmentForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
                <label>Seat number (optional)<input maxLength="12" value={dutyAdjustmentForm.seat_number} onChange={(event) => setDutyAdjustmentForm((current) => ({ ...current, seat_number: event.target.value }))} placeholder="e.g. 12" /></label>
                <button type="submit" className="primary-button" disabled={dutySaving}>{dutySaving ? 'Saving…' : 'Add financial entry'}</button>
              </form>}
              {selectedDuty.status === 'awaiting_financial_review' && <div className="duty-finalize-actions"><p>Both journeys are marked completed. Review the figures before finalizing this historical profit report.</p><button type="button" className="primary-button" onClick={() => { setFinalizeDutyTarget(selectedDuty); setAcknowledgeNoDutyExpenses(false) }}>Finalize profit</button></div>}
              {selectedDuty.status === 'finalized' && <p className="hint">This report is finalized and uses its saved financial snapshot. Duty expenses and linked bookings are locked.</p>}
            </section>
          )}
          <div className="stats-grid">
            <div className="metric-card"><span>Passenger income</span><strong>Rs. {revenueSummary.passenger.toLocaleString('en-US')}</strong></div>
            <div className="metric-card"><span>Cargo income</span><strong>Rs. {revenueSummary.cargo.toLocaleString('en-US')}</strong></div>
            <div className="metric-card"><span>Total income</span><strong>Rs. {revenueSummary.total.toLocaleString('en-US')}</strong></div>
            <div className="metric-card"><span>General expenses</span><strong>Rs. {accountsExpenseTotal.toLocaleString('en-US')}</strong></div>
            <div className="metric-card"><span>Income after general expenses</span><strong>Rs. {(revenueSummary.total - accountsExpenseTotal).toLocaleString('en-US')}</strong></div>
          </div>
          <section className="content-card expense-entry-card monthly-expenses-card">
            <div className="dashboard-section-heading monthly-expenses-heading">
              <div><h2>Monthly expenses</h2><p>Record and review general expenses for the selected month.</p></div>
              <label>Month<input type="month" value={monthlyExpenseMonth} onChange={(event) => setMonthlyExpenseMonth(event.target.value)} /></label>
            </div>
            <form className="expense-entry-form" onSubmit={handleAddExpense}>
              <label>Expense month<input required type="month" value={expenseForm.expense_month} onChange={(event) => setExpenseForm((current) => ({ ...current, expense_month: event.target.value }))} /></label>
              <label>Category<select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}><option>Fuel</option><option>Driver allowance</option><option>Conductor allowance</option><option>Driver wage</option><option>Conductor wage</option><option>Driver salary</option><option>Conductor salary</option><option>Toll / parking charge</option><option>Other expenses</option><option>Maintenance</option><option>Supplies</option><option>Salaries</option><option>Tolls</option><option>Other</option></select></label>
              <label>Description<input required maxLength="240" value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="e.g. Monthly vehicle insurance" /></label>
              <label>Amount (Rs.)<input required type="number" min="1" step="1" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
              <button type="submit" className="primary-button" disabled={expenseSaving}>{expenseSaving ? 'Saving…' : 'Add expense'}</button>
            </form>
            <div className="daily-revenue-heading monthly-expenses-total"><div><h3>{monthlyExpenseMonth ? new Date(`${monthlyExpenseMonth}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Select a month'}</h3><p>{monthlyExpenses.length} expense record(s)</p></div><strong>Rs. {monthlyExpenseTotal.toLocaleString('en-US')}</strong></div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
              <tbody>
                {monthlyExpenses.map((expense) => <tr key={expense.id}><td>{expense.category}</td><td>{expense.description}</td><td><strong>Rs. {Number(expense.amount).toLocaleString('en-US')}</strong></td></tr>)}
                {!monthlyExpenses.length && <tr><td colSpan="3" className="daily-revenue-empty">No general expenses recorded for this month.</td></tr>}
              </tbody>
            </table></div>
          </section>
          <section className="content-card dashboard-filter-bar">
            <div><h2>Accounts filters</h2><p>Income follows the selected route and period. Expense totals follow the selected dates.</p></div>
            <div className="revenue-filter-controls">
              <label>Period<select value={revenuePeriod} onChange={(event) => setRevenuePeriod(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
              <label>Choose date<input type="date" value={revenueDate} onChange={(event) => setRevenueDate(event.target.value)} /></label>
              <label>Route<select value={dashboardRoute} onChange={(event) => setDashboardRoute(event.target.value)}><option value="">All routes</option>{ROUTES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
              <strong>{dashboardRange ? `${dashboardRange.start} – ${dashboardRange.end}` : 'Choose a valid date'}</strong>
            </div>
          </section>
          <section className="content-card daily-revenue-card">
            <div className="daily-revenue-heading"><div><h2>Income by trip</h2><p>{filteredRevenue.length} trip(s) in the selected period</p></div><strong>Rs. {revenueSummary.total.toLocaleString('en-US')}</strong></div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Travel date</th><th>Bus No</th><th>Trip No</th><th>Route</th><th>Passenger income</th><th>Cargo income</th><th>Total income</th></tr></thead>
              <tbody>
                {filteredRevenue.map((day) => <tr key={day.trip_id ? `account-trip-${day.trip_id}` : `${day.travel_date}-${day.route_code || 'unknown'}-${day.registration_no || 'unassigned'}`}><td>{day.travel_date}</td><td>{day.registration_no || 'Unassigned'}</td><td>{day.trip_code || 'Unassigned'}</td><td>{day.route_label || 'Unassigned'}</td><td>Rs. {Number(day.passenger_revenue).toLocaleString('en-US')}</td><td>Rs. {Number(day.cargo_revenue).toLocaleString('en-US')}</td><td><strong>Rs. {Number(day.total_revenue).toLocaleString('en-US')}</strong></td></tr>)}
                {!filteredRevenue.length && <tr><td colSpan="7" className="daily-revenue-empty">No income recorded for this period and route.</td></tr>}
              </tbody>
            </table></div>
          </section>
          <section className="content-card daily-revenue-card">
            <div className="daily-revenue-heading"><div><h2>General expenses in selected date range</h2><p>Expenses not associated with a bus duty · {accountsExpenses.length} record(s)</p></div><strong>Rs. {accountsExpenseTotal.toLocaleString('en-US')}</strong></div>
            <div className="daily-revenue-table-wrap"><table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
              <tbody>
                {accountsExpenses.map((expense) => <tr key={expense.id}><td>{expense.expense_date}</td><td>{expense.category}</td><td>{expense.description}</td><td><strong>Rs. {Number(expense.amount).toLocaleString('en-US')}</strong></td></tr>)}
                {!accountsExpenses.length && <tr><td colSpan="4" className="daily-revenue-empty">No expenses recorded for this period.</td></tr>}
              </tbody>
            </table></div>
          </section>
        </main>
      )}

      {activeTab === 'Customers' && isAdmin && adminStats && (
        <main className="content-page dashboard-page">
          <section className="content-card">
            <div className="dashboard-section-heading">
              <div>
                <h2>Regular customers</h2>
                <p>Customers are grouped by mobile number. Counts and rankings use confirmed trips in the selected period; multiple seats on one trip count once. “Months travelled” is the number of different calendar months in that period with a trip.</p>
              </div>
              <div className="revenue-filter-controls">
                <label>Period<select value={customerPeriod} onChange={(event) => setCustomerPeriod(event.target.value)}><option value="1">Last month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last year</option><option value="all">All time</option></select></label>
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
            <label><span>Bus No</span><input value={tripForm.bus_no} onChange={(event) => setTripForm((prev) => ({ ...prev, bus_no: event.target.value }))} /></label>
            <label><span>Departure time</span><input type="time" value={tripForm.departure_time} onChange={(event) => setTripForm((prev) => ({ ...prev, departure_time: event.target.value }))} /></label>
            <label><span>Journey status</span><select value={tripForm.status} onChange={(event) => setTripForm((prev) => ({ ...prev, status: event.target.value }))}><option value="scheduled">Scheduled</option><option value="boarding">Boarding</option><option value="departed">Departed</option><option value="completed">Completed</option></select></label>
            <label><span>Driver name</span><input value={tripForm.driver_name} onChange={(event) => setTripForm((prev) => ({ ...prev, driver_name: event.target.value }))} /></label>
            <label><span>Driver phone</span><input value={tripForm.driver_phone} onChange={(event) => setTripForm((prev) => ({ ...prev, driver_phone: event.target.value }))} /></label>
            <label><span>Conductor name</span><input value={tripForm.conductor_name} onChange={(event) => setTripForm((prev) => ({ ...prev, conductor_name: event.target.value }))} /></label>
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
            <label><span>Registration number</span><input value={busForm.registration_no} onChange={(event) => setBusForm((prev) => ({ ...prev, registration_no: event.target.value }))} /></label>
            <label><span>Display name</span><input value={busForm.display_name} onChange={(event) => setBusForm((prev) => ({ ...prev, display_name: event.target.value }))} /></label>
            <label><span>Driver name</span><input value={busForm.driver_name} onChange={(event) => setBusForm((prev) => ({ ...prev, driver_name: event.target.value }))} /></label>
            <label><span>Driver phone</span><input value={busForm.driver_phone} onChange={(event) => setBusForm((prev) => ({ ...prev, driver_phone: event.target.value }))} /></label>
            <label><span>Conductor name</span><input value={busForm.conductor_name} onChange={(event) => setBusForm((prev) => ({ ...prev, conductor_name: event.target.value }))} /></label>
            <label><span>Conductor phone</span><input value={busForm.conductor_phone} onChange={(event) => setBusForm((prev) => ({ ...prev, conductor_phone: event.target.value }))} /></label>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => setShowBusForm(false)}>Close</button>
              <button type="button" className="primary-button" onClick={handleSaveBus}>Save bus</button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="modal-backdrop no-print">
          <div className="modal">
            <h2>Cancel booking</h2>
            <p>Cancel {cancelTarget.passenger_name} on {cancelTarget.route_label} / {cancelTarget.travel_date} / {cancelTarget.registration_no} seat{cancelTarget.seat_numbers?.length === 1 ? '' : 's'} {(cancelTarget.seat_numbers || [cancelTarget.seat_number]).join(', ')}?</p>
            <p>No cancellation SMS will be sent. The record is kept.</p>
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
                    <td>{String(item.payment_status || '').toLowerCase() === 'paid' ? 'Paid' : 'Collect on delivery'}</td>
                    <td>{item.cargo_status || 'Registered'}</td>
                  </tr>
                ))}
                {cargoLogs.length === 0 ? <tr><td colSpan="9" className="cargo-manifest-empty">No luggage entries for this bus and date.</td></tr> : null}
              </tbody>
            </table>
            <footer className="cargo-manifest-summary">
              <strong>Total fees: Rs. {cargoLogs.reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</strong>
              <span>Paid: Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() === 'paid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span>
              <span>Collect on delivery: Rs. {cargoLogs.filter((item) => String(item.payment_status || '').toLowerCase() !== 'paid').reduce((sum, item) => sum + Number(item.charge || 0), 0).toLocaleString('en-US')}</span>
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
