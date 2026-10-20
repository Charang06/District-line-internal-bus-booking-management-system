import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { AsyncLocalStorage } from 'async_hooks'
import { loadEnv } from './env.js'
import { sendSms, buildConfirmationMessage, smsConfig } from './sms.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')
loadEnv(rootDir)

const { Pool } = pg
const app = express()
const transactionContext = new AsyncLocalStorage()
app.use((req, res, next) => transactionContext.run({ client: null }, next))
const IS_VERCEL = Boolean(process.env.VERCEL)
const localUploadDir = path.join(__dirname, '..', 'public', 'uploads')
if (!IS_VERCEL) fs.mkdirSync(path.join(localUploadDir, 'profiles'), { recursive: true })
const PORT = process.env.PORT || 3001
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'district-line-dev-only-change-me')
if (IS_PRODUCTION && JWT_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random value with at least 32 characters before starting in production.')
}
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('Set DATABASE_URL to the Supabase PostgreSQL connection string before starting the server.')
}

const DEFAULT_STAFF_PERMISSIONS = {
  home: true,
  log: true,
  info: true,
  passengers: true,
  cargo: true,
  trips: true,
}
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024
const DUTY_EXPENSE_CATEGORIES = new Set([
  'Fuel', 'Driver allowance', 'Conductor allowance', 'Driver wage', 'Conductor wage',
  'Driver salary', 'Conductor salary', 'Maintenance', 'Toll / parking charge', 'Other expenses',
  'Supplies', 'Salaries', 'Tolls', 'Other',
])
const DUTY_ADJUSTMENT_TYPES = new Set(['refund', 'cancellation_fee', 'other_income'])

const SEAT_LAYOUT_ID = 'super-luxury-49-sleeper'
const VALID_SEATS = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
])

const ROUTES = {
  KTY_CMB: { code: 'KTY_CMB', label: 'Kattankudy to Colombo', short: 'KKY to CMB' },
  CMB_KTY: { code: 'CMB_KTY', label: 'Colombo to Kattankudy', short: 'CMB to KKY' },
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: IS_VERCEL ? 1 : 10,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
})

if (IS_VERCEL) {
  const { attachDatabasePool } = await import('@vercel/functions')
  attachDatabasePool(pool)
}

function currentClient() {
  return transactionContext.getStore()?.client || pool
}

function postgresSql(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

function run(sql, params = []) {
  const isInsert = /^\s*INSERT\b/i.test(sql)
  const statement = postgresSql(sql)
  return currentClient().query(isInsert ? `${statement} RETURNING id` : statement, params)
    .then((result) => ({ id: result.rows[0]?.id, changes: result.rowCount }))
}

function get(sql, params = []) {
  return currentClient().query(postgresSql(sql), params).then((result) => result.rows[0])
}

function all(sql, params = []) {
  return currentClient().query(postgresSql(sql), params).then((result) => result.rows)
}

function isUniqueViolation(error) {
  return error?.code === '23505' || String(error?.message || '').toUpperCase().includes('UNIQUE')
}

function exec(sql) {
  if (sql === 'BEGIN IMMEDIATE') {
    const context = transactionContext.getStore()
    if (!context) throw new Error('Database transaction requested outside an API request context.')
    if (context.client) throw new Error('Nested database transactions are not supported.')
    return pool.connect().then(async (client) => {
      try {
        await client.query('BEGIN')
        context.client = client
      } catch (error) {
        client.release()
        throw error
      }
    })
  }
  if (sql === 'COMMIT' || sql === 'ROLLBACK') {
    const context = transactionContext.getStore()
    if (!context?.client) throw new Error('No active database transaction.')
    const client = context.client
    context.client = null
    return client.query(sql).finally(() => client.release())
  }
  return currentClient().query(sql).then(() => undefined)
}

function padSeat(value) {
  return String(value || '').trim().padStart(2, '0')
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\s+/g, '')
  return digits
}

function isValidPhone(value) {
  const digits = normalizePhone(value).replace(/^\+/, '')
  return /^(0?7\d{8}|94?7\d{8})$/.test(digits)
}

function minutesOf(time) {
  if (!time) return null
  const [h, m] = String(time).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function tripsOverlap(a, b) {
  if (a.travel_date !== b.travel_date) return false
  const aStart = minutesOf(a.departure_time)
  const bStart = minutesOf(b.departure_time)
  if (aStart == null || bStart == null) return true
  const duration = 8 * 60
  return aStart < bStart + duration && bStart < aStart + duration
}

function parsePermissions(role, raw) {
  if (role === 'admin') return { ...DEFAULT_STAFF_PERMISSIONS }
  let parsed = {}
  try {
    parsed = JSON.parse(raw || '{}')
  } catch {
    parsed = {}
  }
  return {
    home: parsed.home !== false,
    log: parsed.log !== false,
    info: parsed.info !== false,
    passengers: parsed.passengers === true,
    cargo: parsed.cargo === true,
    trips: parsed.trips === true,
  }
}

function sanitizePermissions(input = {}) {
  return {
    home: input.home !== false,
    log: input.log !== false,
    info: input.info !== false,
    passengers: input.passengers === true,
    cargo: input.cargo === true,
    trips: input.trips === true,
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    status: user.status || 'active',
    profilePhoto: user.profile_photo_url || '',
    permissions: parsePermissions(user.role, user.permissions),
  }
}

function serializeStaff(person) {
  return {
    id: person.id,
    username: person.username,
    full_name: person.full_name,
    role: person.role,
    status: person.status || 'active',
    permissions: parsePermissions('staff', person.permissions),
  }
}

function validateUsername(username) {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(String(username || ''))) {
    return 'Username must be 3-32 letters, numbers, dots, hyphens, or underscores.'
  }
  return null
}

function validatePassword(password) {
  if (!password || String(password).length < 8) {
    return 'Password must be at least 8 characters.'
  }
  return null
}

function validateFullName(name) {
  const value = String(name || '').trim()
  if (value.length < 2 || value.length > 80) return 'Full name must be between 2 and 80 characters.'
  return null
}

function decodeImageDataUrl(image) {
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return { error: 'Image data URL is required' }
  }
  const match = image.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return { error: 'Invalid image data' }
  const mime = match[1].toLowerCase()
  const ext = ALLOWED_IMAGE_TYPES[mime]
  if (!ext) return { error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' }
  let buffer
  try {
    buffer = Buffer.from(match[2], 'base64')
  } catch {
    return { error: 'Invalid image data' }
  }
  if (!buffer.length) return { error: 'Invalid image data' }
  if (buffer.length > MAX_PROFILE_IMAGE_BYTES) return { error: 'Image must be 2 MB or smaller.' }
  return { buffer, ext }
}

function storageSettings() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'district-line-uploads'
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable image uploads.')
  return { url, key, bucket }
}

function storageObjectUrl(url, bucket, objectPath, isPublic = false) {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/')
  return `${url}/storage/v1/object/${isPublic ? 'public/' : ''}${encodeURIComponent(bucket)}/${encodedPath}`
}

async function storeImage(objectPath, buffer, contentType) {
  if (!IS_VERCEL && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    const localPath = path.join(localUploadDir, objectPath)
    fs.mkdirSync(path.dirname(localPath), { recursive: true })
    fs.writeFileSync(localPath, buffer)
    return `/uploads/${objectPath}`
  }
  const { url, key, bucket } = storageSettings()
  const response = await fetch(storageObjectUrl(url, bucket, objectPath), {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('Supabase Storage upload failed:', response.status, detail.slice(0, 300))
    throw new Error('Could not store the uploaded image.')
  }
  return storageObjectUrl(url, bucket, objectPath, true)
}

async function removeStoredUpload(fileUrl) {
  if (!fileUrl) return
  if (String(fileUrl).startsWith('/uploads/')) {
    if (IS_VERCEL) return
    const relative = String(fileUrl).slice('/uploads/'.length)
    if (relative.includes('..') || path.isAbsolute(relative)) return
    const localPath = path.join(localUploadDir, relative)
    if (fs.existsSync(localPath)) {
      try { fs.unlinkSync(localPath) } catch { /* ignore cleanup errors */ }
    }
    return
  }
  if (!String(fileUrl).startsWith('http')) return
  const { url, key, bucket } = storageSettings()
  const prefix = `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/`
  if (!fileUrl.startsWith(prefix)) return
  const objectPath = fileUrl.slice(prefix.length).split('/').map(decodeURIComponent).join('/')
  if (!objectPath || objectPath.includes('..')) return
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  })
  if (!response.ok && response.status !== 404) {
    console.error('Supabase Storage cleanup failed:', response.status)
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' })
    try {
      const user = await get('SELECT * FROM users WHERE id = ?', [decoded.id])
      if (!user) return res.status(401).json({ message: 'Invalid token' })
      if ((user.status || 'active') === 'inactive') {
        return res.status(403).json({ message: 'This account has been deactivated.' })
      }
      req.user = publicUser(user)
      next()
    } catch (error) {
      next(error)
    }
  })
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }
  next()
}

function requireStaffPermission(permission) {
  return async (req, res, next) => {
    if (req.user?.role === 'admin') return next()
    try {
      const row = await get('SELECT role, permissions, status FROM users WHERE id = ?', [req.user?.id])
      if (!row || (row.status || 'active') === 'inactive') {
        return res.status(403).json({ message: 'This account has been deactivated.' })
      }
      const permissions = parsePermissions(row.role, row.permissions)
      if (permissions[permission] !== true) {
        return res.status(403).json({ message: 'Your staff account does not have permission for this action.' })
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

async function nextCode(prefix, table, column) {
  const row = await get(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${table}`)
  const n = Number(row?.max_id || 0) + 1
  return `${prefix}-${String(n).padStart(4, '0')}`
}

async function audit(user, action, entityType, entityId, details) {
  await run(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [user?.id || null, action, entityType, String(entityId || ''), details || ''],
  )
}

async function seedDatabase() {
  const migrationSql = fs.readFileSync(path.join(__dirname, 'migrations', '001_initial_postgres.sql'), 'utf8')
  await pool.query(migrationSql)

  const configuredAdminUsername = String(process.env.ADMIN_USERNAME || 'admin_kt').trim()
  const configuredAdminPassword = process.env.ADMIN_PASSWORD || ''
  if (validateUsername(configuredAdminUsername)) throw new Error('ADMIN_USERNAME must be 3-32 letters, numbers, dots, hyphens, or underscores.')
  let admin = await get('SELECT id, username, password_hash FROM users WHERE username = ?', [configuredAdminUsername])
  if (!admin && IS_PRODUCTION) {
    const legacyAdmin = await get('SELECT id, username, password_hash FROM users WHERE username = ?', ['admin_kt'])
    if (legacyAdmin && await bcrypt.compare('admin123', legacyAdmin.password_hash)) {
      if (configuredAdminPassword.length < 12) throw new Error('Replace the seeded admin password by setting ADMIN_PASSWORD to at least 12 characters.')
      const hash = await bcrypt.hash(configuredAdminPassword, 12)
      await run('UPDATE users SET username = ?, password_hash = ? WHERE id = ?', [configuredAdminUsername, hash, legacyAdmin.id])
      admin = { ...legacyAdmin, username: configuredAdminUsername, password_hash: hash }
    }
  }
  if (admin && IS_PRODUCTION && await bcrypt.compare('admin123', admin.password_hash)) {
    if (configuredAdminPassword.length < 12) throw new Error('Replace the seeded admin password by setting ADMIN_PASSWORD to at least 12 characters.')
    const hash = await bcrypt.hash(configuredAdminPassword, 12)
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, admin.id])
  } else if (!admin) {
    if (IS_PRODUCTION && configuredAdminPassword.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters before initializing the production admin account.')
    const password = IS_PRODUCTION ? configuredAdminPassword : 'admin123'
    const hash = await bcrypt.hash(password, 12)
    await run('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)', [
      configuredAdminUsername, hash, 'admin', IS_PRODUCTION ? (process.env.ADMIN_FULL_NAME || 'System Administrator') : 'Capt. R. Ameen',
    ])
  }
  if (!IS_PRODUCTION) {
    const staff = await get('SELECT id FROM users WHERE username = ?', ['staff_kt'])
    if (!staff) {
      const hash = await bcrypt.hash('staff123', 10)
      await run('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)', [
        'staff_kt', hash, 'staff', 'Dispatcher Staff',
      ])
    }
  } else {
    const legacyStaff = await get('SELECT id, password_hash FROM users WHERE username = ?', ['staff_kt'])
    if (legacyStaff && await bcrypt.compare('staff123', legacyStaff.password_hash)) {
      await run("UPDATE users SET status = 'inactive' WHERE id = ?", [legacyStaff.id])
    }
  }

  const busCount = await get('SELECT COUNT(*) as count FROM buses')
  if (!Number(busCount?.count || 0) && !IS_PRODUCTION) {
    await run(
      `INSERT INTO buses (bus_code, registration_no, display_name, image_url, logo_url, driver_name, driver_phone, conductor_name, conductor_phone, seat_layout_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['BUS-0001', 'DL-7784', 'Scania VIP Club', '/bus.jpg', '/logo.png', 'Capt. K. Naufal', '0779040300', 'M. Rizwan', '0771234567', SEAT_LAYOUT_ID, 'active'],
    )
    await run(
      `INSERT INTO buses (bus_code, registration_no, display_name, image_url, logo_url, driver_name, driver_phone, conductor_name, conductor_phone, seat_layout_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['BUS-0002', 'NE-3456', 'District Line Coach', '/bus.jpg', '/logo.png', 'Capt. R. Ameen', '0779040300', 'M. Rizwan', '0771234567', SEAT_LAYOUT_ID, 'active'],
    )
  }
}

function tripJoinSelect() {
  return `
    SELECT t.*, COALESCE(t.bus_no, b.registration_no) as registration_no,
      b.display_name as bus_name, b.image_url, b.logo_url, b.status as bus_status,
      b.driver_name as bus_driver_name, b.driver_phone as bus_driver_phone,
      b.conductor_name as bus_conductor_name, b.conductor_phone as bus_conductor_phone,
      (SELECT COUNT(*) FROM bookings bk WHERE bk.trip_id = t.id AND bk.status = 'confirmed') as booked_count
    FROM trips t
    LEFT JOIN buses b ON b.id = t.bus_id
  `
}

async function hydrateTrip(trip) {
  if (!trip) return null
  return {
    ...trip,
    booked_count: Number(trip.booked_count || 0),
    available_count: 49 - Number(trip.booked_count || 0),
  }
}

async function dutyTrip(tripId) {
  return get(`
    SELECT t.*, COALESCE(t.bus_no, b.registration_no) as registration_no,
      COALESCE(t.bus_id, (SELECT fallback_bus.id FROM buses fallback_bus WHERE lower(fallback_bus.registration_no) = lower(t.bus_no) LIMIT 1)) as resolved_bus_id
    FROM trips t LEFT JOIN buses b ON b.id = t.bus_id WHERE t.id = ?
  `, [tripId])
}

async function tripRevenue(tripId) {
  const row = await get(`
    SELECT
      COALESCE(SUM(CASE WHEN bk.status = 'confirmed' AND bk.confirmation_status = 'confirmed' THEN bk.fare ELSE 0 END), 0) as total,
      COALESCE(SUM(CASE WHEN bk.status = 'confirmed' AND bk.confirmation_status = 'confirmed' AND lower(COALESCE(bk.payment_status, '')) = 'paid' THEN bk.fare ELSE 0 END), 0) as collected
    FROM bookings bk WHERE bk.trip_id = ?
  `, [tripId])
  const total = Number(row?.total || 0)
  const collected = Number(row?.collected || 0)
  return { total, collected, outstanding: total - collected }
}

async function refreshDutyStatus(duty, firstTrip, returnTrip) {
  if (duty.status === 'finalized') return duty
  const status = firstTrip.status === 'completed' && returnTrip.status === 'completed'
    ? 'awaiting_financial_review'
    : firstTrip.status === 'completed' ? 'awaiting_return' : 'in_progress'
  const completionDate = status === 'awaiting_financial_review' ? returnTrip.travel_date : null
  await run('UPDATE bus_duties SET status = ?, completion_date = ? WHERE id = ? AND status != \'finalized\'', [status, completionDate, duty.id])
  return { ...duty, status, completion_date: completionDate }
}

async function serializeDuty(duty) {
  let snapshot = null
  if (duty.status === 'finalized' && duty.snapshot_json) {
    try { snapshot = JSON.parse(duty.snapshot_json) } catch { snapshot = null }
  }
  const firstTrip = await dutyTrip(duty.first_trip_id)
  const returnTrip = await dutyTrip(duty.return_trip_id)
  if (!firstTrip || !returnTrip) return null
  const [firstRevenue, returnRevenue] = snapshot
    ? [snapshot.first_journey.revenue, snapshot.return_journey.revenue]
    : await Promise.all([tripRevenue(firstTrip.id), tripRevenue(returnTrip.id)])
  const expenses = snapshot?.expenses || await all(
    'SELECT id, expense_date, category, description, amount, trip_id FROM daily_expenses WHERE duty_id = ? ORDER BY expense_date, id',
    [duty.id],
  )
  const adjustments = snapshot?.adjustments || await all(
    'SELECT id, adjustment_date, type, description, amount, trip_id, seat_number FROM duty_adjustments WHERE duty_id = ? ORDER BY adjustment_date, id',
    [duty.id],
  )
  const adjustmentTotals = snapshot?.adjustment_totals || adjustments.reduce((totals, adjustment) => {
    const amount = Number(adjustment.amount || 0)
    if (adjustment.type === 'refund') totals.refunds += amount
    else if (adjustment.type === 'cancellation_fee') totals.cancellation_fees += amount
    else totals.other_income += amount
    return totals
  }, { refunds: 0, cancellation_fees: 0, other_income: 0 })
  const totalRevenue = snapshot?.total_revenue ?? firstRevenue.total + returnRevenue.total
  const totalCollected = snapshot?.total_collected ?? firstRevenue.collected + returnRevenue.collected
  const totalOutstanding = snapshot?.total_outstanding ?? firstRevenue.outstanding + returnRevenue.outstanding
  const totalExpenses = snapshot?.total_expenses ?? expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const bus = await get('SELECT id, registration_no FROM buses WHERE id = ?', [duty.bus_id])
  const tripView = (trip, revenue) => ({
    id: trip.id,
    trip_code: trip.trip_code,
    route_code: trip.route_code,
    route_label: trip.route_label,
    travel_date: trip.travel_date,
    status: trip.status,
    revenue: snapshot
      ? (trip.id === duty.first_trip_id ? snapshot.first_journey.revenue : snapshot.return_journey.revenue)
      : revenue,
  })
  return {
    id: duty.id,
    duty_code: duty.duty_code,
    bus_id: duty.bus_id,
    bus_no: snapshot?.bus_no || bus?.registration_no || firstTrip.registration_no || returnTrip.registration_no || 'Unassigned',
    first_trip: tripView(firstTrip, firstRevenue),
    return_trip: tripView(returnTrip, returnRevenue),
    start_date: duty.start_date,
    completion_date: duty.completion_date,
    status: duty.status,
    created_at: duty.created_at,
    finalized_at: duty.finalized_at,
    finalized_by: duty.finalized_by,
    expenses,
    adjustments,
    adjustment_totals: adjustmentTotals,
    total_revenue: totalRevenue,
    total_collected: totalCollected,
    total_outstanding: totalOutstanding,
    total_expenses: totalExpenses,
    net_profit: snapshot?.net_profit ?? totalRevenue - totalExpenses + adjustmentTotals.cancellation_fees + adjustmentTotals.other_income,
    snapshot,
  }
}

async function getAdminDutyData() {
  const duties = await all('SELECT * FROM bus_duties ORDER BY start_date DESC, id DESC')
  const serializedDuties = []
  for (const originalDuty of duties) {
    const firstTrip = await dutyTrip(originalDuty.first_trip_id)
    const returnTrip = await dutyTrip(originalDuty.return_trip_id)
    if (!firstTrip || !returnTrip) continue
    const duty = await refreshDutyStatus(originalDuty, firstTrip, returnTrip)
    const serialized = await serializeDuty(duty)
    if (serialized) serializedDuties.push(serialized)
  }
  const eligibleTrips = await all(`
    SELECT t.*, COALESCE(t.bus_no, b.registration_no) as registration_no,
      COALESCE(t.bus_id, (SELECT fallback_bus.id FROM buses fallback_bus WHERE lower(fallback_bus.registration_no) = lower(t.bus_no) LIMIT 1)) as resolved_bus_id
    FROM trips t LEFT JOIN buses b ON b.id = t.bus_id
    WHERE t.status != 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM bus_duties d WHERE d.first_trip_id = t.id OR d.return_trip_id = t.id)
    ORDER BY t.travel_date, t.id
  `)
  return { duties: serializedDuties, dutyTrips: eligibleTrips }
}

const allowedCorsOrigins = String(process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(cors({ origin: IS_PRODUCTION ? allowedCorsOrigins : true }))
app.use(express.json({ limit: '8mb' }))
if (!IS_VERCEL) app.use('/uploads', express.static(localUploadDir))
app.use((req, res, next) => databaseReady.then(() => next(), next))

app.get('/api/health', (req, res) => {
  const sms = smsConfig()
  res.json({ ok: true, sms: { configured: sms.configured, provider: sms.provider } })
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required' })
  try {
    const user = await get('SELECT * FROM users WHERE username = ?', [username])
    if (!user) return res.status(401).json({ message: 'Invalid username or password' })
    if ((user.status || 'active') === 'inactive') {
      return res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' })
    }
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ message: 'Invalid username or password' })
    const safeUser = publicUser(user)
    const token = jwt.sign(
      { id: safeUser.id, username: safeUser.username, role: safeUser.role },
      JWT_SECRET,
      { expiresIn: '8h' },
    )
    return res.json({ token, user: safeUser })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ message: 'Login failed' })
  }
})

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

app.patch('/api/profile', authMiddleware, requireAdmin, async (req, res) => {
  const fullName = String(req.body?.fullName || req.body?.full_name || '').trim()
  const nameError = validateFullName(fullName)
  if (nameError) return res.status(400).json({ message: nameError })
  await run('UPDATE users SET full_name = ? WHERE id = ?', [fullName, req.user.id])
  const next = await get('SELECT * FROM users WHERE id = ?', [req.user.id])
  await audit(req.user, 'profile.update', 'user', req.user.id, fullName)
  res.json({ user: publicUser(next) })
})

app.post('/api/profile/photo', authMiddleware, requireAdmin, async (req, res) => {
  const decoded = decodeImageDataUrl(req.body?.image)
  if (decoded.error) return res.status(400).json({ message: decoded.error })
  const current = await get('SELECT * FROM users WHERE id = ?', [req.user.id])
  const safeName = `profiles/profile-${req.user.id}-${Date.now()}.${decoded.ext}`
  const mime = decoded.ext === 'jpg' ? 'image/jpeg' : `image/${decoded.ext}`
  const profile_photo_url = await storeImage(safeName, decoded.buffer, mime)
  await run('UPDATE users SET profile_photo_url = ? WHERE id = ?', [profile_photo_url, req.user.id])
  if (current?.profile_photo_url && current.profile_photo_url !== profile_photo_url) {
    removeStoredUpload(current.profile_photo_url)
  }
  const next = await get('SELECT * FROM users WHERE id = ?', [req.user.id])
  await audit(req.user, 'profile.photo', 'user', req.user.id, safeName)
  res.json({ user: publicUser(next) })
})

app.post('/api/profile/password', authMiddleware, requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  const passwordError = validatePassword(newPassword)
  if (passwordError) return res.status(400).json({ message: passwordError })
  if (!currentPassword) return res.status(400).json({ message: 'Current password is required.' })
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id])
  const ok = await bcrypt.compare(String(currentPassword), user.password_hash)
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect.' })
  const hash = await bcrypt.hash(String(newPassword), 10)
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id])
  await audit(req.user, 'profile.password', 'user', user.id, 'password changed')
  res.json({ message: 'Password updated.' })
})

app.get('/api/admin/staff', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
  const staff = await all("SELECT id, username, full_name, role, permissions, status FROM users WHERE role = 'staff' ORDER BY full_name")
  res.json({ staff: staff.map(serializeStaff) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/staff', authMiddleware, requireAdmin, async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const full_name = String(req.body?.full_name || req.body?.fullName || '').trim()
  const password = req.body?.password
  const status = req.body?.status === 'inactive' ? 'inactive' : 'active'
  const usernameError = validateUsername(username)
  const nameError = validateFullName(full_name)
  const passwordError = validatePassword(password)
  if (usernameError) return res.status(400).json({ message: usernameError })
  if (nameError) return res.status(400).json({ message: nameError })
  if (passwordError) return res.status(400).json({ message: passwordError })
  if (req.body?.role && req.body.role !== 'staff') {
    return res.status(403).json({ message: 'Staff accounts cannot be created with admin privileges.' })
  }
  const permissions = sanitizePermissions({ ...DEFAULT_STAFF_PERMISSIONS, ...(req.body?.permissions || {}) })
  try {
    const hash = await bcrypt.hash(String(password), 10)
    const result = await run(
      'INSERT INTO users (username, password_hash, role, full_name, permissions, status) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hash, 'staff', full_name, JSON.stringify(permissions), status],
    )
    const person = await get('SELECT id, username, full_name, role, permissions, status FROM users WHERE id = ?', [result.id])
    await audit(req.user, 'staff.create', 'user', person.id, username)
    res.status(201).json({ staff: serializeStaff(person) })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'That username is already in use.' })
    }
    console.error(error)
    res.status(500).json({ message: 'Failed to create staff account.' })
  }
})

app.post('/api/admin/expenses', authMiddleware, requireAdmin, async (req, res) => {
  const expense_date = String(req.body?.expense_date || '').trim()
  const category = String(req.body?.category || '').trim()
  const description = String(req.body?.description || '').trim()
  const amount = Number(req.body?.amount)
  if (!isIsoCalendarDate(expense_date)) {
    return res.status(400).json({ message: 'Enter a valid expense date.' })
  }
  if (!category || category.length > 60) return res.status(400).json({ message: 'Enter an expense category (up to 60 characters).' })
  if (!description || description.length > 240) return res.status(400).json({ message: 'Enter a description (up to 240 characters).' })
  if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ message: 'Enter an amount greater than zero in whole rupees.' })
  const result = await run(
    'INSERT INTO daily_expenses (expense_date, category, description, amount, created_by) VALUES (?, ?, ?, ?, ?)',
    [expense_date, category, description, amount, req.user.id],
  )
  const expense = await get('SELECT id, expense_date, category, description, amount FROM daily_expenses WHERE id = ?', [result.id])
  await audit(req.user, 'expense.create', 'daily_expense', expense.id, `${category}: Rs. ${amount}`)
  res.status(201).json({ expense })
})

app.get('/api/admin/revenue-entries', authMiddleware, requireAdmin, async (req, res) => {
  const entries = await all(`
    SELECT id, entry_code, trip_id, travel_date, route_code, route_label, bus_no,
      driver_name, conductor_name, seat_rows_json, cargo_rows_json,
      seat_subtotal, cargo_subtotal, total_revenue, status, created_at, locked_at
    FROM revenue_entries
    ORDER BY travel_date DESC, id DESC
    LIMIT 100
  `)
  res.json({ entries })
})

app.post('/api/admin/revenue-entries', authMiddleware, requireAdmin, async (req, res) => {
  const travelDate = String(req.body?.travel_date || '').trim()
  const routeCode = String(req.body?.route_code || '').trim()
  const busNo = String(req.body?.bus_no || '').trim()
  const driverName = String(req.body?.driver_name || '').trim()
  const conductorName = String(req.body?.conductor_name || '').trim()
  const tripId = req.body?.trip_id ? Number(req.body.trip_id) : null
  const seatRows = req.body?.seat_rows
  const cargoRows = req.body?.cargo_rows

  if (!isIsoCalendarDate(travelDate)) return res.status(400).json({ message: 'Enter a valid travel date.' })
  if (!ROUTES[routeCode]) return res.status(400).json({ message: 'Choose a valid corridor.' })
  if (!busNo || busNo.length > 40) return res.status(400).json({ message: 'Enter a bus number (up to 40 characters).' })
  if (driverName.length > 80 || conductorName.length > 80) return res.status(400).json({ message: 'Driver and conductor names must be 80 characters or fewer.' })
  if (tripId !== null && (!Number.isSafeInteger(tripId) || tripId < 1)) return res.status(400).json({ message: 'Choose a valid trip.' })
  if (!Array.isArray(seatRows) || seatRows.length !== 4) return res.status(400).json({ message: 'Enter all four seat fare categories.' })
  if (!Array.isArray(cargoRows) || cargoRows.length > 30) return res.status(400).json({ message: 'Cargo rows are invalid or exceed the 30-row limit.' })

  if (tripId !== null) {
    const trip = await get('SELECT id, travel_date, route_code FROM trips WHERE id = ?', [tripId])
    if (!trip || trip.travel_date !== travelDate || trip.route_code !== routeCode) {
      return res.status(400).json({ message: 'The selected trip does not match the chosen date and corridor.' })
    }
  }

  const seatCategories = ['Standard', 'Intermediate', 'Special', 'Agent / Extra']
  const cleanSeatRows = []
  let seatCount = 0
  for (let index = 0; index < seatCategories.length; index += 1) {
    const row = seatRows[index] || {}
    const count = Number(row.count)
    const amount = Number(row.amount)
    if (!Number.isSafeInteger(count) || count < 0 || count > 49 || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
      return res.status(400).json({ message: `Enter a valid seat count and whole-rupee amount for ${seatCategories[index]}.` })
    }
    seatCount += count
    cleanSeatRows.push({ category: seatCategories[index], count, amount, total: count * amount })
  }
  if (seatCount > 49) return res.status(400).json({ message: 'Seat counts cannot exceed the 49-seat bus capacity.' })

  const cleanCargoRows = []
  for (const row of cargoRows) {
    const description = String(row?.description || '').trim()
    const tag = String(row?.tag || '').trim()
    const amount = Number(row?.amount)
    if (!description || description.length > 120 || tag.length > 40 || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
      return res.status(400).json({ message: 'Enter a description (up to 120 characters) and a valid whole-rupee amount for each cargo row.' })
    }
    cleanCargoRows.push({ description, tag, amount })
  }

  if (!seatCount && !cleanCargoRows.some((row) => row.amount > 0)) {
    return res.status(400).json({ message: 'Enter at least one seat or cargo amount before submitting.' })
  }

  const seatSubtotal = cleanSeatRows.reduce((sum, row) => sum + row.total, 0)
  const cargoSubtotal = cleanCargoRows.reduce((sum, row) => sum + row.amount, 0)
  const totalRevenue = seatSubtotal + cargoSubtotal
  try {
    const inserted = await run(`
      INSERT INTO revenue_entries (
        trip_id, travel_date, route_code, route_label, bus_no, driver_name, conductor_name,
        seat_rows_json, cargo_rows_json, seat_subtotal, cargo_subtotal, total_revenue,
        status, created_by, locked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'locked', ?, CURRENT_TIMESTAMP)
    `, [
      tripId, travelDate, routeCode, ROUTES[routeCode].label, busNo, driverName, conductorName,
      JSON.stringify(cleanSeatRows), JSON.stringify(cleanCargoRows), seatSubtotal, cargoSubtotal, totalRevenue, req.user.id,
    ])
    const entryCode = `REV-${String(inserted.id).padStart(6, '0')}`
    await run('UPDATE revenue_entries SET entry_code = ? WHERE id = ?', [entryCode, inserted.id])
    await audit(req.user, 'revenue_entry.lock', 'revenue_entry', inserted.id, `${entryCode}: Rs. ${totalRevenue}`)
    const entry = await get(`
      SELECT id, entry_code, trip_id, travel_date, route_code, route_label, bus_no,
        driver_name, conductor_name, seat_rows_json, cargo_rows_json,
        seat_subtotal, cargo_subtotal, total_revenue, status, created_at, locked_at
      FROM revenue_entries WHERE id = ?
    `, [inserted.id])
    return res.status(201).json({ entry })
  } catch (error) {
    console.error('Revenue entry save failed:', error)
    return res.status(500).json({ message: 'Could not save and lock the revenue entry.' })
  }
})

app.post('/api/admin/duties', authMiddleware, requireAdmin, async (req, res) => {
  const busNo = String(req.body?.bus_no || '').trim()
  const firstTripId = Number(req.body?.first_trip_id)
  const returnTripId = Number(req.body?.return_trip_id)
  if (!busNo || busNo.length > 40 || !Number.isInteger(firstTripId) || firstTripId < 1 || !Number.isInteger(returnTripId) || returnTripId < 1 || firstTripId === returnTripId) {
    return res.status(400).json({ message: 'Select a bus and two different journeys.' })
  }
  try {
    await exec('BEGIN IMMEDIATE')
    const firstTrip = await dutyTrip(firstTripId)
    const returnTrip = await dutyTrip(returnTripId)
    if (!firstTrip || !returnTrip) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'One of the selected journeys was not found.' })
    }
    if (firstTrip.status === 'cancelled' || returnTrip.status === 'cancelled') {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Cancelled journeys cannot be assigned to a duty.' })
    }
    if (String(firstTrip.registration_no || '').trim().toLocaleLowerCase() !== busNo.toLocaleLowerCase()
      || String(returnTrip.registration_no || '').trim().toLocaleLowerCase() !== busNo.toLocaleLowerCase()) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Both journeys must belong to the selected bus.' })
    }
    if (firstTrip.resolved_bus_id && returnTrip.resolved_bus_id
      && Number(firstTrip.resolved_bus_id) !== Number(returnTrip.resolved_bus_id)) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Both journeys must belong to the same bus.' })
    }
    const oppositeRoutes = (firstTrip.route_code === 'KTY_CMB' && returnTrip.route_code === 'CMB_KTY')
      || (firstTrip.route_code === 'CMB_KTY' && returnTrip.route_code === 'KTY_CMB')
    if (!oppositeRoutes || returnTrip.travel_date <= firstTrip.travel_date) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Choose the opposite-direction return journey on a later date.' })
    }
    let bus = await get('SELECT id, registration_no, status FROM buses WHERE lower(registration_no) = lower(?)', [busNo])
    if (bus?.status === 'inactive') {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'This bus is inactive. Activate it in Bus Management before creating a duty.' })
    }
    if (!bus) {
      const busCode = await nextCode('BUS', 'buses', 'bus_code')
      const createdBus = await run(
        `INSERT INTO buses (bus_code, registration_no, display_name, seat_layout_id, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [busCode, busNo, `Duty bus ${busNo}`, SEAT_LAYOUT_ID],
      )
      bus = { id: createdBus.id, registration_no: busNo, status: 'active' }
      await audit(req.user, 'duty.bus_identity.create', 'bus', bus.id, busNo)
    }
    await run('UPDATE trips SET bus_id = ? WHERE id IN (?, ?)', [bus.id, firstTripId, returnTripId])
    const sequence = Number((await get('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM bus_duties'))?.next_id || 1)
    const dutyCode = `DUTY-${String(sequence).padStart(5, '0')}`
    const initialStatus = firstTrip.status === 'completed' && returnTrip.status === 'completed'
      ? 'awaiting_financial_review' : firstTrip.status === 'completed' ? 'awaiting_return' : 'in_progress'
    const inserted = await run(
      `INSERT INTO bus_duties (duty_code, bus_id, first_trip_id, return_trip_id, start_date, completion_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [dutyCode, bus.id, firstTripId, returnTripId, firstTrip.travel_date, initialStatus === 'awaiting_financial_review' ? returnTrip.travel_date : null, initialStatus, req.user.id],
    )
    await audit(req.user, 'duty.create', 'bus_duty', inserted.id, dutyCode)
    await exec('COMMIT')
    const created = await get('SELECT * FROM bus_duties WHERE id = ?', [inserted.id])
    return res.status(201).json({ duty: await serializeDuty(created) })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    if (String(error.message).includes('already assigned') || isUniqueViolation(error)) {
      return res.status(409).json({ message: 'One of these journeys is already assigned to a bus duty.' })
    }
    console.error('Bus duty creation failed:', error)
    return res.status(500).json({ message: 'Failed to create bus duty.' })
  }
})

app.post('/api/admin/duties/:id/expenses', authMiddleware, requireAdmin, async (req, res) => {
  const expense_date = String(req.body?.expense_date || '').trim()
  const category = String(req.body?.category || '').trim()
  const description = String(req.body?.description || '').trim()
  const amount = Number(req.body?.amount)
  const tripId = req.body?.trip_id ? Number(req.body.trip_id) : null
  if (!isIsoCalendarDate(expense_date)) return res.status(400).json({ message: 'Enter a valid expense date.' })
  if (!DUTY_EXPENSE_CATEGORIES.has(category)) return res.status(400).json({ message: 'Choose a valid expense category.' })
  if (!description || description.length > 240) return res.status(400).json({ message: 'Enter a description (up to 240 characters).' })
  if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ message: 'Enter an amount greater than zero in whole rupees.' })
  if (tripId !== null && (!Number.isInteger(tripId) || tripId < 1)) return res.status(400).json({ message: 'Select a valid journey for this expense.' })
  try {
    await exec('BEGIN IMMEDIATE')
    const duty = await get('SELECT * FROM bus_duties WHERE id = ?', [req.params.id])
    if (!duty) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Bus duty not found.' })
    }
    if (duty.status === 'finalized') {
      await exec('ROLLBACK')
      return res.status(409).json({ message: 'Finalized duty expenses cannot be changed.' })
    }
    if (tripId !== null && tripId !== duty.first_trip_id && tripId !== duty.return_trip_id) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Journey expenses must belong to one of this duty’s two journeys.' })
    }
    const result = await run(
      'INSERT INTO daily_expenses (expense_date, category, description, amount, duty_id, trip_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [expense_date, category, description, amount, duty.id, tripId, req.user.id],
    )
    await audit(req.user, 'duty.expense.create', 'daily_expense', result.id, `${duty.duty_code} · ${category}: Rs. ${amount}`)
    await exec('COMMIT')
    const expense = await get('SELECT id, expense_date, category, description, amount, trip_id FROM daily_expenses WHERE id = ?', [result.id])
    const currentDuty = await get('SELECT * FROM bus_duties WHERE id = ?', [duty.id])
    return res.status(201).json({ expense, duty: await serializeDuty(currentDuty) })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error('Bus duty expense creation failed:', error)
    return res.status(500).json({ message: 'Failed to save bus duty expense.' })
  }
})

app.post('/api/admin/duties/:id/adjustments', authMiddleware, requireAdmin, async (req, res) => {
  const adjustment_date = String(req.body?.adjustment_date || '').trim()
  const type = String(req.body?.type || '').trim()
  const description = String(req.body?.description || '').trim()
  const amount = Number(req.body?.amount)
  const tripId = req.body?.trip_id ? Number(req.body.trip_id) : null
  const seatNumber = String(req.body?.seat_number || '').trim()
  if (!isIsoCalendarDate(adjustment_date)) return res.status(400).json({ message: 'Enter a valid adjustment date.' })
  if (!DUTY_ADJUSTMENT_TYPES.has(type)) return res.status(400).json({ message: 'Choose a valid adjustment type.' })
  if (!description || description.length > 240) return res.status(400).json({ message: 'Enter a description (up to 240 characters).' })
  if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ message: 'Enter an amount greater than zero in whole rupees.' })
  if (tripId !== null && (!Number.isInteger(tripId) || tripId < 1)) return res.status(400).json({ message: 'Select a valid journey for this adjustment.' })
  if (seatNumber && seatNumber.length > 12) return res.status(400).json({ message: 'Enter a valid seat number.' })
  try {
    await exec('BEGIN IMMEDIATE')
    const duty = await get('SELECT * FROM bus_duties WHERE id = ?', [req.params.id])
    if (!duty) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Bus duty not found.' })
    }
    if (duty.status === 'finalized') {
      await exec('ROLLBACK')
      return res.status(409).json({ message: 'Finalized duty adjustments cannot be changed.' })
    }
    if (tripId !== null && tripId !== duty.first_trip_id && tripId !== duty.return_trip_id) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Journey adjustments must belong to one of this duty’s two journeys.' })
    }
    const result = await run(
      'INSERT INTO duty_adjustments (duty_id, adjustment_date, trip_id, type, description, amount, seat_number, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [duty.id, adjustment_date, tripId, type, description, amount, seatNumber || null, req.user.id],
    )
    await audit(req.user, 'duty.adjustment.create', 'duty_adjustment', result.id, `${duty.duty_code} · ${type}: Rs. ${amount}`)
    await exec('COMMIT')
    const currentDuty = await get('SELECT * FROM bus_duties WHERE id = ?', [duty.id])
    return res.status(201).json({ adjustment: await get('SELECT id, adjustment_date, type, description, amount, trip_id, seat_number FROM duty_adjustments WHERE id = ?', [result.id]), duty: await serializeDuty(currentDuty) })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error('Bus duty adjustment creation failed:', error)
    return res.status(500).json({ message: 'Failed to save bus duty adjustment.' })
  }
})

app.delete('/api/admin/duties/:id/expenses/:expenseId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await exec('BEGIN IMMEDIATE')
    const duty = await get('SELECT * FROM bus_duties WHERE id = ?', [req.params.id])
    if (!duty) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Bus duty not found.' })
    }
    if (duty.status === 'finalized') {
      await exec('ROLLBACK')
      return res.status(409).json({ message: 'Finalized duty expenses cannot be changed.' })
    }
    const expense = await get('SELECT id, category, description, amount FROM daily_expenses WHERE id = ? AND duty_id = ?', [req.params.expenseId, duty.id])
    if (!expense) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Duty expense not found.' })
    }
    await run('DELETE FROM daily_expenses WHERE id = ? AND duty_id = ?', [expense.id, duty.id])
    await audit(req.user, 'duty.expense.delete', 'daily_expense', expense.id, `${duty.duty_code} · ${expense.category}: Rs. ${expense.amount} · ${expense.description}`)
    await exec('COMMIT')
    return res.json({ duty: await serializeDuty(await get('SELECT * FROM bus_duties WHERE id = ?', [duty.id])) })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error('Bus duty expense deletion failed:', error)
    return res.status(500).json({ message: 'Failed to delete bus duty expense.' })
  }
})

app.delete('/api/admin/duties/:id/adjustments/:adjustmentId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await exec('BEGIN IMMEDIATE')
    const duty = await get('SELECT * FROM bus_duties WHERE id = ?', [req.params.id])
    if (!duty) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Bus duty not found.' })
    }
    if (duty.status === 'finalized') {
      await exec('ROLLBACK')
      return res.status(409).json({ message: 'Finalized duty adjustments cannot be changed.' })
    }
    const adjustment = await get('SELECT id, type, description, amount FROM duty_adjustments WHERE id = ? AND duty_id = ?', [req.params.adjustmentId, duty.id])
    if (!adjustment) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Duty financial entry not found.' })
    }
    await run('DELETE FROM duty_adjustments WHERE id = ? AND duty_id = ?', [adjustment.id, duty.id])
    await audit(req.user, 'duty.adjustment.delete', 'duty_adjustment', adjustment.id, `${duty.duty_code} · ${adjustment.type}: Rs. ${adjustment.amount} · ${adjustment.description}`)
    await exec('COMMIT')
    return res.json({ duty: await serializeDuty(await get('SELECT * FROM bus_duties WHERE id = ?', [duty.id])) })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error('Bus duty adjustment deletion failed:', error)
    return res.status(500).json({ message: 'Failed to delete bus duty financial entry.' })
  }
})

app.post('/api/admin/duties/:id/finalize', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await exec('BEGIN IMMEDIATE')
    const duty = await get('SELECT * FROM bus_duties WHERE id = ?', [req.params.id])
    if (!duty) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Bus duty not found.' })
    }
    if (duty.status === 'finalized') {
      await exec('ROLLBACK')
      return res.status(409).json({ message: 'This duty has already been finalized.' })
    }
    const firstTrip = await dutyTrip(duty.first_trip_id)
    const returnTrip = await dutyTrip(duty.return_trip_id)
    if (!firstTrip || !returnTrip || firstTrip.status !== 'completed' || returnTrip.status !== 'completed') {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Both journeys must be completed before finalizing profit.' })
    }
    const expenses = await all('SELECT id, expense_date, category, description, amount, trip_id FROM daily_expenses WHERE duty_id = ? ORDER BY expense_date, id', [duty.id])
    const adjustments = await all('SELECT id, adjustment_date, type, description, amount, trip_id, seat_number FROM duty_adjustments WHERE duty_id = ? ORDER BY adjustment_date, id', [duty.id])
    if (!expenses.length && !adjustments.length && req.body?.acknowledge_no_expenses !== true) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Confirm that this duty has no expenses before finalizing.', needs_expense_acknowledgement: true })
    }
    const [firstRevenue, returnRevenue] = await Promise.all([tripRevenue(firstTrip.id), tripRevenue(returnTrip.id)])
    const totalRevenue = firstRevenue.total + returnRevenue.total
    const totalCollected = firstRevenue.collected + returnRevenue.collected
    const totalOutstanding = firstRevenue.outstanding + returnRevenue.outstanding
    const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    const adjustmentTotals = adjustments.reduce((totals, adjustment) => {
      const amount = Number(adjustment.amount || 0)
      if (adjustment.type === 'refund') totals.refunds += amount
      else if (adjustment.type === 'cancellation_fee') totals.cancellation_fees += amount
      else totals.other_income += amount
      return totals
    }, { refunds: 0, cancellation_fees: 0, other_income: 0 })
    const netProfit = totalRevenue - totalExpenses + adjustmentTotals.cancellation_fees + adjustmentTotals.other_income
    const monetaryTotals = [firstRevenue.total, firstRevenue.collected, firstRevenue.outstanding, returnRevenue.total, returnRevenue.collected, returnRevenue.outstanding, totalRevenue, totalCollected, totalOutstanding, totalExpenses, adjustmentTotals.refunds, adjustmentTotals.other_income, netProfit]
    if (monetaryTotals.some((amount) => !Number.isSafeInteger(amount)) || monetaryTotals.slice(0, -1).some((amount) => amount < 0)) {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'The duty has invalid or out-of-range financial data and cannot be finalized.' })
    }
    const bus = await get('SELECT registration_no FROM buses WHERE id = ?', [duty.bus_id])
    const snapshot = {
      duty_code: duty.duty_code,
      bus_no: bus?.registration_no || firstTrip.registration_no || 'Unassigned',
      first_journey: { id: firstTrip.id, trip_code: firstTrip.trip_code, route_label: firstTrip.route_label, travel_date: firstTrip.travel_date, revenue: firstRevenue },
      return_journey: { id: returnTrip.id, trip_code: returnTrip.trip_code, route_label: returnTrip.route_label, travel_date: returnTrip.travel_date, revenue: returnRevenue },
      total_revenue: totalRevenue,
      total_collected: totalCollected,
      total_outstanding: totalOutstanding,
      expenses,
      adjustments,
      adjustment_totals: adjustmentTotals,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      finalized_at: new Date().toISOString(),
      finalized_by: { id: req.user.id, name: req.user.fullName },
    }
    await run(
      `UPDATE bus_duties SET status = 'finalized', completion_date = ?, finalized_at = CURRENT_TIMESTAMP,
       finalized_by = ?, snapshot_json = ? WHERE id = ? AND status != 'finalized'`,
      [returnTrip.travel_date, req.user.id, JSON.stringify(snapshot), duty.id],
    )
    await audit(req.user, 'duty.finalize', 'bus_duty', duty.id, `${duty.duty_code}: profit Rs. ${snapshot.net_profit}`)
    await exec('COMMIT')
    const finalizedDuty = await get('SELECT * FROM bus_duties WHERE id = ?', [duty.id])
    return res.json({ duty: await serializeDuty(finalizedDuty) })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error('Bus duty finalization failed:', error)
    return res.status(500).json({ message: 'Failed to finalize bus duty.' })
  }
})

app.patch('/api/admin/staff/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
  const person = await get('SELECT * FROM users WHERE id = ?', [req.params.id])
  if (!person) return res.status(404).json({ message: 'Staff account not found.' })
  if (person.role !== 'staff') {
    return res.status(403).json({ message: 'Administrator accounts cannot be edited from staff management.' })
  }
  if (req.body?.role && req.body.role !== 'staff') {
    return res.status(403).json({ message: 'Staff accounts cannot be granted admin privileges.' })
  }
  const updates = []
  const params = []
  if (req.body.full_name !== undefined || req.body.fullName !== undefined) {
    const full_name = String(req.body.full_name || req.body.fullName || '').trim()
    const nameError = validateFullName(full_name)
    if (nameError) return res.status(400).json({ message: nameError })
    updates.push('full_name = ?')
    params.push(full_name)
  }
  if (req.body.username !== undefined) {
    const username = String(req.body.username || '').trim()
    const usernameError = validateUsername(username)
    if (usernameError) return res.status(400).json({ message: usernameError })
    updates.push('username = ?')
    params.push(username)
  }
  if (req.body.status !== undefined) {
    if (!['active', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Status must be active or inactive.' })
    }
    updates.push('status = ?')
    params.push(req.body.status)
  }
  if (req.body.permissions) {
    updates.push('permissions = ?')
    params.push(JSON.stringify(sanitizePermissions(req.body.permissions)))
  }
  if (!updates.length) return res.json({ staff: serializeStaff(person) })
  params.push(person.id)
  try {
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    const next = await get('SELECT id, username, full_name, role, permissions, status FROM users WHERE id = ?', [person.id])
    await audit(req.user, 'staff.update', 'user', person.id, JSON.stringify(req.body))
    res.json({ staff: serializeStaff(next) })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'That username is already in use.' })
    }
    console.error(error)
    res.status(500).json({ message: 'Failed to update staff account.' })
  }
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/staff/:id/reset-password', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
  const person = await get("SELECT id, username, role FROM users WHERE id = ? AND role = 'staff'", [req.params.id])
  if (!person) return res.status(404).json({ message: 'Staff account not found.' })
  const passwordError = validatePassword(req.body?.password)
  if (passwordError) return res.status(400).json({ message: passwordError })
  const hash = await bcrypt.hash(String(req.body.password), 10)
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, person.id])
  await audit(req.user, 'staff.password.reset', 'user', person.id, person.username)
  res.json({ message: `Password reset for ${person.username}.` })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/staff/:id/permissions', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
  const person = await get("SELECT id, username, full_name, role, status FROM users WHERE id = ? AND role = 'staff'", [req.params.id])
  if (!person) return res.status(404).json({ message: 'Staff account not found.' })
  const permissions = sanitizePermissions(req.body?.permissions || {})
  await run('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), person.id])
  await audit(req.user, 'staff.permissions.update', 'user', person.id, JSON.stringify(permissions))
  res.json({ staff: serializeStaff({ ...person, permissions: JSON.stringify(permissions) }) })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/staff/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const person = await get("SELECT id, username, full_name, role FROM users WHERE id = ? AND role = 'staff'", [req.params.id])
    if (!person) return res.status(404).json({ message: 'Staff account not found.' })
    await run('DELETE FROM users WHERE id = ? AND role = \'staff\'', [person.id])
    await audit(req.user, 'staff.delete', 'user', person.id, person.username)
    res.json({ message: `Deleted staff account ${person.username}.` })
  } catch (error) {
    next(error)
  }
})

app.use('/api/admin/staff', (error, req, res, next) => {
  if (res.headersSent) return next(error)
  console.error('Staff management request failed:', error)
  res.status(500).json({ message: 'Staff management request failed. Check the server database schema and try again.' })
})

app.get('/api/buses', authMiddleware, async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' && req.user.role === 'admin'
  const buses = await all(
    includeInactive ? 'SELECT * FROM buses ORDER BY id' : "SELECT * FROM buses WHERE status = 'active' ORDER BY id",
  )
  res.json({ buses })
})

app.post('/api/buses', authMiddleware, requireAdmin, async (req, res) => {
  const {
    registration_no, display_name, image_url, logo_url, driver_name, driver_phone,
    conductor_name, conductor_phone, status,
  } = req.body || {}
  if (!registration_no) return res.status(400).json({ message: 'Registration number is required' })
  try {
    const bus_code = await nextCode('BUS', 'buses', 'bus_code')
    const result = await run(
      `INSERT INTO buses (bus_code, registration_no, display_name, image_url, logo_url, driver_name, driver_phone, conductor_name, conductor_phone, seat_layout_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bus_code,
        String(registration_no).trim(),
        display_name || '',
        image_url || '/bus.jpg',
        logo_url || '/logo.png',
        driver_name || '',
        driver_phone || '',
        conductor_name || '',
        conductor_phone || '',
        SEAT_LAYOUT_ID,
        status === 'inactive' ? 'inactive' : 'active',
      ],
    )
    const bus = await get('SELECT * FROM buses WHERE id = ?', [result.id])
    await audit(req.user, 'bus.create', 'bus', bus.id, bus.registration_no)
    res.status(201).json({ bus })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'A bus with that registration number already exists' })
    }
    console.error(error)
    res.status(500).json({ message: 'Failed to add bus' })
  }
})

app.patch('/api/buses/:id', authMiddleware, requireAdmin, async (req, res) => {
  const bus = await get('SELECT * FROM buses WHERE id = ?', [req.params.id])
  if (!bus) return res.status(404).json({ message: 'Bus not found' })
  const fields = [
    'registration_no', 'display_name', 'image_url', 'logo_url', 'driver_name', 'driver_phone',
    'conductor_name', 'conductor_phone', 'status',
  ]
  const updates = []
  const params = []
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(req.body[field])
    }
  }
  if (!updates.length) return res.json({ bus })
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(bus.id)
  try {
    await run(`UPDATE buses SET ${updates.join(', ')} WHERE id = ?`, params)
    const next = await get('SELECT * FROM buses WHERE id = ?', [bus.id])
    await audit(req.user, 'bus.update', 'bus', bus.id, JSON.stringify(req.body))
    res.json({ bus: next })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Registration number already in use' })
    }
    res.status(500).json({ message: 'Failed to update bus' })
  }
})

app.post('/api/buses/:id/image', authMiddleware, requireAdmin, async (req, res) => {
  const bus = await get('SELECT * FROM buses WHERE id = ?', [req.params.id])
  if (!bus) return res.status(404).json({ message: 'Bus not found' })
  const { image, filename } = req.body || {}
  const decoded = decodeImageDataUrl(image)
  if (decoded.error) return res.status(400).json({ message: decoded.error })
  const safeName = `buses/bus-${bus.id}-${Date.now()}.${decoded.ext}`
  const mime = decoded.ext === 'jpg' ? 'image/jpeg' : `image/${decoded.ext}`
  const image_url = await storeImage(safeName, decoded.buffer, mime)
  await run('UPDATE buses SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [image_url, bus.id])
  const next = await get('SELECT * FROM buses WHERE id = ?', [bus.id])
  await audit(req.user, 'bus.image', 'bus', bus.id, filename || safeName)
  res.json({ bus: next })
})

app.delete('/api/buses/:id', authMiddleware, requireAdmin, async (req, res) => {
  const bus = await get('SELECT * FROM buses WHERE id = ?', [req.params.id])
  if (!bus) return res.status(404).json({ message: 'Bus not found' })
  const trips = await get('SELECT COUNT(*) as count FROM trips WHERE bus_id = ?', [bus.id])
  if (Number(trips.count) > 0) {
    await run("UPDATE buses SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [bus.id])
    await audit(req.user, 'bus.deactivate', 'bus', bus.id, 'historical trips exist')
    return res.json({ deactivated: true, message: 'Bus has trip history and was deactivated instead of deleted.' })
  }
  await run('DELETE FROM buses WHERE id = ?', [bus.id])
  await audit(req.user, 'bus.delete', 'bus', bus.id, bus.registration_no)
  res.json({ deleted: true })
})

app.get('/api/trips', authMiddleware, async (req, res) => {
  const { date, route, busId } = req.query
  const clauses = []
  const params = []
  clauses.push("t.status != 'cancelled'")
  if (date) { clauses.push('t.travel_date = ?'); params.push(date) }
  if (route) { clauses.push('t.route_code = ?'); params.push(route) }
  if (busId) { clauses.push('t.bus_id = ?'); params.push(busId) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const trips = await all(`${tripJoinSelect()} ${where} ORDER BY t.travel_date DESC, t.id ASC`, params)
  res.json({ trips: await Promise.all(trips.map(hydrateTrip)) })
})

app.delete('/api/trips/:id', authMiddleware, requireStaffPermission('trips'), async (req, res) => {
  try {
    await exec('BEGIN IMMEDIATE')
    const trip = await get('SELECT * FROM trips WHERE id = ?', [req.params.id])
    if (!trip) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Bus section not found' })
    }
    const linkedDuty = await get('SELECT duty_code FROM bus_duties WHERE first_trip_id = ? OR return_trip_id = ? LIMIT 1', [trip.id, trip.id])
    if (linkedDuty) {
      await exec('ROLLBACK')
      return res.status(409).json({ message: `Journey is assigned to ${linkedDuty.duty_code} and cannot be deleted.` })
    }
    const bookingCount = await get('SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status = \'confirmed\'', [trip.id])
    const bookingHistoryCount = await get('SELECT COUNT(*) as count FROM bookings WHERE trip_id = ?', [trip.id])
    const cargoCount = await get('SELECT COUNT(*) as count FROM cargo WHERE trip_id = ?', [trip.id])
    if (Number(bookingCount.count) || Number(cargoCount.count)) {
      await exec('ROLLBACK')
      return res.status(409).json({ message: 'Cancel all active passenger bookings and delete all cargo entries before deleting this bus section.' })
    }
    const keepHistory = Number(bookingHistoryCount.count) > 0
    if (keepHistory) {
      await run("UPDATE trips SET status = 'cancelled' WHERE id = ?", [trip.id])
      await audit(req.user, 'trip.archive', 'trip', trip.id, trip.trip_code)
    } else {
      await audit(req.user, 'trip.delete', 'trip', trip.id, trip.trip_code)
      await run('DELETE FROM trips WHERE id = ?', [trip.id])
    }
    await exec('COMMIT')
    return res.json({ deleted: true, archived: keepHistory, trip_id: trip.id })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error('Bus section deletion failed:', error)
    return res.status(500).json({ message: 'Failed to delete bus section' })
  }
})

app.get('/api/trips/:id', authMiddleware, async (req, res) => {
  const trip = await get(`${tripJoinSelect()} WHERE t.id = ?`, [req.params.id])
  if (!trip) return res.status(404).json({ message: 'Trip not found' })
  const bookings = await all("SELECT * FROM bookings WHERE trip_id = ? ORDER BY seat_number", [trip.id])
  res.json({ trip: await hydrateTrip(trip), bookings })
})

app.post('/api/trips', authMiddleware, requireStaffPermission('trips'), async (req, res) => {
  const {
    travel_date, route_code, bus_id, bus_no, departure_time, status,
    driver_name, driver_phone, conductor_name, conductor_phone,
  } = req.body || {}
  if (!travel_date || !route_code) {
    return res.status(400).json({ message: 'Travel date and route are required' })
  }
  const route = ROUTES[route_code]
  if (!route) return res.status(400).json({ message: 'Unknown route' })
  if (status && !['scheduled', 'boarding', 'departed', 'completed'].includes(status)) return res.status(400).json({ message: 'Choose a valid journey status.' })
  const bus = bus_id ? await get("SELECT * FROM buses WHERE id = ?", [bus_id]) : null
  if (bus_id && !bus) return res.status(404).json({ message: 'Bus not found' })
  if (bus && bus.status !== 'active') return res.status(400).json({ message: 'Inactive buses cannot be assigned' })
  const enteredBusNo = String(bus_no || '').trim()
  const matchingBus = !bus && enteredBusNo
    ? await get('SELECT * FROM buses WHERE lower(registration_no) = lower(?)', [enteredBusNo])
    : null
  if (matchingBus && matchingBus.status !== 'active') return res.status(400).json({ message: 'Inactive buses cannot be assigned' })

  const assignedDriver = String(driver_name || '').trim()
  const assignedDriverPhone = String(driver_phone || '').trim()
  const assignedConductor = String(conductor_name || '').trim()
  const assignedConductorPhone = String(conductor_phone || '').trim()
  const assignedBusNo = String(bus_no || bus?.registration_no || '').trim()
  const existing = await all(
    'SELECT t.*, COALESCE(t.bus_no, b.registration_no) as registration_no FROM trips t LEFT JOIN buses b ON b.id = t.bus_id WHERE t.travel_date = ? AND t.status != ?',
    [travel_date, 'cancelled'],
  )
  const candidate = { travel_date, departure_time: departure_time || null }
  for (const trip of existing) {
    if ((bus && Number(trip.bus_id) === Number(bus.id)) || (
      assignedBusNo && trip.registration_no && trip.registration_no.toLowerCase() === assignedBusNo.toLowerCase()
    )) {
      if (tripsOverlap(trip, candidate)) {
        return res.status(409).json({ message: `Bus ${assignedBusNo || bus.registration_no} is already assigned to overlapping trip ${trip.trip_code}` })
      }
    }
    const sameCrew = (trip.driver_name && assignedDriver && trip.driver_name === assignedDriver)
      || (trip.conductor_name && assignedConductor && trip.conductor_name === assignedConductor)
    if (sameCrew && tripsOverlap(trip, candidate)) {
      return res.status(409).json({ message: 'Driver or conductor is already assigned to an overlapping trip' })
    }
  }

  const trip_code = await nextCode('TRP', 'trips', 'trip_code')
  const result = await run(
    `INSERT INTO trips (trip_code, travel_date, route_code, route_label, bus_id, bus_no, departure_time, status, driver_name, driver_phone, conductor_name, conductor_phone, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip_code, travel_date, route.code, route.label, bus?.id || matchingBus?.id || null, assignedBusNo || null, departure_time || null,
      status || 'scheduled', assignedDriver, assignedDriverPhone, assignedConductor, assignedConductorPhone, req.user.id,
    ],
  )
  const trip = await get(`${tripJoinSelect()} WHERE t.id = ?`, [result.id])
  await audit(req.user, 'trip.create', 'trip', trip.id, trip.trip_code)
  res.status(201).json({ trip: await hydrateTrip(trip) })
})

app.patch('/api/trips/:id', authMiddleware, requireStaffPermission('trips'), async (req, res) => {
  const trip = await get('SELECT t.*, COALESCE(t.bus_no, b.registration_no) as registration_no FROM trips t LEFT JOIN buses b ON b.id = t.bus_id WHERE t.id = ?', [req.params.id])
  if (!trip) return res.status(404).json({ message: 'Trip not found' })
  const linkedDuty = await get(`SELECT d.duty_code, d.status FROM bus_duties d WHERE d.first_trip_id = ? OR d.return_trip_id = ? LIMIT 1`, [trip.id, trip.id])
  if (linkedDuty?.status === 'finalized') return res.status(409).json({ message: `Journey is part of finalized duty ${linkedDuty.duty_code} and is locked.` })

  const {
    travel_date = trip.travel_date,
    route_code = trip.route_code,
    bus_id = trip.bus_id,
    bus_no = trip.bus_no,
    departure_time = trip.departure_time,
    driver_name = trip.driver_name,
    driver_phone = trip.driver_phone,
    conductor_name = trip.conductor_name,
    conductor_phone = trip.conductor_phone,
    status = trip.status,
  } = req.body || {}
  if (!travel_date || !route_code) {
    return res.status(400).json({ message: 'Travel date and route are required' })
  }
  const route = ROUTES[route_code]
  if (!route) return res.status(400).json({ message: 'Unknown route' })
  if (!['scheduled', 'boarding', 'departed', 'completed'].includes(status)) return res.status(400).json({ message: 'Choose a valid journey status.' })
  if (status === 'cancelled' && linkedDuty) return res.status(409).json({ message: `Journey is assigned to ${linkedDuty.duty_code} and cannot be cancelled.` })
  if (linkedDuty && (
    travel_date !== trip.travel_date
    || route_code !== trip.route_code
    || Number(bus_id || 0) !== Number(trip.bus_id || 0)
    || String(bus_no ?? trip.registration_no ?? '') !== String(trip.bus_no || trip.registration_no || '')
  )) return res.status(409).json({ message: `Bus, route, and date are locked while this journey belongs to ${linkedDuty.duty_code}.` })
  const bus = bus_id ? await get('SELECT * FROM buses WHERE id = ?', [bus_id]) : null
  if (bus_id && !bus) return res.status(404).json({ message: 'Bus not found' })
  if (bus && bus.status !== 'active' && (!linkedDuty || Number(bus.id) !== Number(trip.bus_id))) return res.status(400).json({ message: 'Inactive buses cannot be assigned' })
  const enteredBusNo = String(bus_no ?? '').trim()
  const matchingBus = !bus && enteredBusNo
    ? await get('SELECT * FROM buses WHERE lower(registration_no) = lower(?)', [enteredBusNo])
    : null
  if (matchingBus?.status !== 'active' && matchingBus) return res.status(400).json({ message: 'Inactive buses cannot be assigned' })

  const assignedDriver = String(driver_name ?? '').trim()
  const assignedDriverPhone = String(driver_phone ?? '').trim()
  const assignedConductor = String(conductor_name ?? '').trim()
  const assignedConductorPhone = String(conductor_phone ?? '').trim()
  const assignedBusNo = String(bus_no ?? bus?.registration_no ?? '').trim()
  const existing = await all(
    "SELECT t.*, COALESCE(t.bus_no, b.registration_no) as registration_no FROM trips t LEFT JOIN buses b ON b.id = t.bus_id WHERE t.travel_date = ? AND t.status != 'cancelled' AND t.id != ?",
    [travel_date, trip.id],
  )
  const candidate = { travel_date, departure_time: departure_time || null }
  for (const otherTrip of existing) {
    if ((bus && Number(otherTrip.bus_id) === Number(bus.id)) || (
      assignedBusNo && otherTrip.registration_no && otherTrip.registration_no.toLowerCase() === assignedBusNo.toLowerCase()
    )) {
      if (tripsOverlap(otherTrip, candidate)) {
        return res.status(409).json({ message: `Bus ${assignedBusNo || bus.registration_no} is already assigned to overlapping trip ${otherTrip.trip_code}` })
      }
    }
    const sameCrew = (otherTrip.driver_name && assignedDriver && otherTrip.driver_name === assignedDriver)
      || (otherTrip.conductor_name && assignedConductor && otherTrip.conductor_name === assignedConductor)
    if (sameCrew && tripsOverlap(otherTrip, candidate)) {
      return res.status(409).json({ message: 'Driver or conductor is already assigned to an overlapping trip' })
    }
  }

  await run(
    `UPDATE trips
     SET travel_date = ?, route_code = ?, route_label = ?, bus_id = ?, bus_no = ?, departure_time = ?, status = ?,
         driver_name = ?, driver_phone = ?, conductor_name = ?, conductor_phone = ?
     WHERE id = ?`,
    [
    travel_date, route.code, route.label, bus?.id || matchingBus?.id || null, assignedBusNo || null, departure_time || null, status,
      assignedDriver, assignedDriverPhone, assignedConductor, assignedConductorPhone, trip.id,
    ],
  )
  const updated = await get(`${tripJoinSelect()} WHERE t.id = ?`, [trip.id])
  await audit(req.user, 'trip.update', 'trip', trip.id, JSON.stringify(req.body || {}))
  res.json({ trip: await hydrateTrip(updated) })
})

app.get('/api/bookings', authMiddleware, async (req, res) => {
  const { date, route, bus, tripId, q, from, sms, status, page = 1, pageSize = 50 } = req.query
  const clauses = []
  const params = []
  if (tripId) { clauses.push('bk.trip_id = ?'); params.push(tripId) }
  if (date) { clauses.push('t.travel_date = ?'); params.push(date) }
  if (route) { clauses.push('t.route_code = ?'); params.push(route) }
  if (bus) { clauses.push('(COALESCE(t.bus_no, b.registration_no) LIKE ? OR b.bus_code LIKE ?)'); params.push(`%${bus}%`, `%${bus}%`) }
  if (from) {
    clauses.push('LOWER(TRIM(bk.boarding_point)) = LOWER(TRIM(?))')
    params.push(from)
    clauses.push("bk.status = 'confirmed' AND bk.confirmation_status = 'confirmed'")
  }
  if (sms) { clauses.push('bk.sms_status = ?'); params.push(sms) }
  if (status === 'confirmed' && !from) clauses.push("bk.status = 'confirmed' AND bk.confirmation_status = 'confirmed'")
  if (status === 'cancelled' && !from) { clauses.push("bk.status = 'cancelled'") }
  if (q) {
    const search = String(q).trim()
    clauses.push('(bk.passenger_name LIKE ? OR bk.contact LIKE ? OR bk.seat_number = ?)')
    params.push(`%${search}%`, `%${search}%`, padSeat(search))
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = tripId ? 500 : Math.min(Number(pageSize) || 50, 200)
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit
  const totalRow = await get(
    `SELECT COUNT(*) as count FROM bookings bk JOIN trips t ON t.id = bk.trip_id LEFT JOIN buses b ON b.id = t.bus_id ${where}`,
    params,
  )
  const bookings = await all(
    `SELECT bk.*, t.travel_date, t.route_code, t.route_label, t.trip_code, t.departure_time,
            COALESCE(t.bus_no, b.registration_no) as registration_no, b.display_name as bus_name,
            (SELECT sa.created_at FROM sms_attempts sa WHERE sa.booking_id = bk.id ORDER BY sa.id DESC LIMIT 1) as sms_sent_at
     FROM bookings bk
     JOIN trips t ON t.id = bk.trip_id
     LEFT JOIN buses b ON b.id = t.bus_id
     ${where}
     ORDER BY t.travel_date DESC, bk.created_at ASC, bk.id ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
  res.json({ bookings, total: Number(totalRow.count), page: Number(page) || 1, pageSize: limit })
})

app.post('/api/bookings', authMiddleware, requireStaffPermission('passengers'), async (req, res) => {
  const {
    trip_id, seat_number, passenger_name, contact, gender, boarding_point, destination, fare, notes, payment_status, booking_group_id,
  } = req.body || {}
  const seat = padSeat(seat_number)
  if (!trip_id || !VALID_SEATS.has(seat)) return res.status(400).json({ message: 'Valid trip and seat number are required' })
  if (!isValidPhone(contact)) return res.status(400).json({ message: 'Enter a valid customer contact number' })
  if (fare === undefined || fare === null || Number(fare) < 0 || Number.isNaN(Number(fare))) {
    return res.status(400).json({ message: 'Staff must enter a valid fare' })
  }

  try {
    await exec('BEGIN IMMEDIATE')
    const trip = await get(`${tripJoinSelect()} WHERE t.id = ?`, [trip_id])
    if (!trip || trip.status === 'cancelled') {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Trip is not available for booking' })
    }
    const finalizedDuty = await get(`SELECT duty_code FROM bus_duties WHERE status = 'finalized' AND (first_trip_id = ? OR return_trip_id = ?) LIMIT 1`, [trip.id, trip.id])
    if (finalizedDuty) {
      await exec('ROLLBACK')
      return res.status(409).json({ message: `Bookings cannot be added to finalized duty ${finalizedDuty.duty_code}.` })
    }
    const taken = await get("SELECT id FROM bookings WHERE trip_id = ? AND seat_number = ? AND status = 'confirmed'", [trip_id, seat])
    if (taken) {
      await exec('ROLLBACK')
      return res.status(409).json({ message: `Seat ${seat} is already booked on this trip` })
    }
    const booking_ref = `DL-P-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`
    const result = await run(
      `INSERT INTO bookings (booking_ref, booking_group_id, trip_id, seat_number, passenger_name, contact, gender, boarding_point, destination, fare, payment_status, notes, status, confirmation_status, sms_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'unconfirmed', 'pending', ?)`,
      [
        booking_ref, booking_group_id || null, trip_id, seat, String(passenger_name || '').trim(), normalizePhone(contact), gender || 'Male',
        boarding_point || '', destination || '', Number(fare), payment_status || 'unpaid', notes || '', req.user.id,
      ],
    )
    await exec('COMMIT')
    const booking = await get(
      `SELECT bk.*, t.travel_date, t.route_code, t.route_label, t.trip_code, COALESCE(t.bus_no, b.registration_no) as registration_no
       FROM bookings bk JOIN trips t ON t.id = bk.trip_id LEFT JOIN buses b ON b.id = t.bus_id WHERE bk.id = ?`,
      [result.id],
    )
    await audit(req.user, 'booking.create', 'booking', booking.id, booking.booking_ref)
    res.status(201).json({ booking })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Seat is already booked on this trip' })
    }
    console.error(error)
    res.status(500).json({ message: 'Failed to save booking' })
  }
})

app.post('/api/bookings/:id/cancel', authMiddleware, requireStaffPermission('passengers'), async (req, res) => {
  try {
    await exec('BEGIN IMMEDIATE')
    const booking = await get(
      `SELECT bk.*, t.travel_date, t.route_label, t.trip_code, COALESCE(t.bus_no, b.registration_no) as registration_no
       FROM bookings bk JOIN trips t ON t.id = bk.trip_id LEFT JOIN buses b ON b.id = t.bus_id WHERE bk.id = ?`,
      [req.params.id],
    )
    if (!booking) {
      await exec('ROLLBACK')
      return res.status(404).json({ message: 'Booking not found' })
    }
    if (booking.status === 'cancelled') {
      await exec('ROLLBACK')
      return res.status(400).json({ message: 'Booking is already cancelled' })
    }
    const finalizedDuty = await get(`SELECT d.duty_code FROM bus_duties d WHERE d.status = 'finalized' AND (d.first_trip_id = ? OR d.return_trip_id = ?) LIMIT 1`, [booking.trip_id, booking.trip_id])
    if (finalizedDuty) {
      await exec('ROLLBACK')
      return res.status(409).json({ message: `Booking is part of finalized duty ${finalizedDuty.duty_code} and cannot be changed.` })
    }
    await run(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.user.id, booking.id],
    )
    await exec('COMMIT')
    const next = await get('SELECT * FROM bookings WHERE id = ?', [booking.id])
    await audit(req.user, 'booking.cancel', 'booking', booking.id, booking.booking_ref)
    res.json({ booking: { ...booking, ...next } })
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error(error)
    res.status(500).json({ message: 'Failed to cancel booking' })
  }
})

app.patch('/api/bookings/:id/confirmation', authMiddleware, requireStaffPermission('passengers'), async (req, res) => {
  const confirmationStatus = req.body?.confirmation_status
  if (!['confirmed', 'unconfirmed'].includes(confirmationStatus)) {
    return res.status(400).json({ message: 'Choose confirmed or unconfirmed status.' })
  }
  const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
  if (!booking) return res.status(404).json({ message: 'Passenger booking not found.' })
  if (booking.status === 'cancelled') return res.status(400).json({ message: 'Cancelled bookings cannot be confirmed.' })
  const finalizedDuty = await get(`SELECT d.duty_code FROM bus_duties d WHERE d.status = 'finalized' AND (d.first_trip_id = ? OR d.return_trip_id = ?) LIMIT 1`, [booking.trip_id, booking.trip_id])
  if (finalizedDuty) return res.status(409).json({ message: `Booking is part of finalized duty ${finalizedDuty.duty_code} and cannot be changed.` })
  await run('UPDATE bookings SET confirmation_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [confirmationStatus, booking.id])
  const updated = await get('SELECT * FROM bookings WHERE id = ?', [booking.id])
  await audit(req.user, 'booking.confirmation.update', 'booking', booking.id, confirmationStatus)
  res.json({ booking: updated })
})

app.post('/api/bookings/:id/sms', authMiddleware, requireStaffPermission('passengers'), async (req, res) => {
  const bookingId = Number(req.params.id)
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return res.status(400).json({ message: 'Invalid booking ID.' })
  let group = []
  let message
  let idempotencyKey
  try {
    await exec('BEGIN IMMEDIATE')
    const selected = await get('SELECT * FROM bookings WHERE id = ?', [bookingId])
    if (!selected) { await exec('ROLLBACK'); return res.status(404).json({ message: 'Booking not found.' }) }
    const groupWhere = selected.booking_group_id ? 'bk.booking_group_id = ?' : 'bk.id = ?'
    const groupValue = selected.booking_group_id || selected.id
    group = await all(
      `SELECT bk.*, t.travel_date, t.route_label, t.trip_code, t.departure_time,
              COALESCE(t.bus_no, b.registration_no) as registration_no,
              t.conductor_phone as conductor_phone
       FROM bookings bk JOIN trips t ON t.id = bk.trip_id
       LEFT JOIN buses b ON b.id = t.bus_id
       WHERE ${groupWhere} AND bk.trip_id = ? AND bk.status = 'confirmed' AND bk.confirmation_status = 'confirmed'
       ORDER BY bk.id`,
      [groupValue, selected.trip_id],
    )
    if (!group.length) { await exec('ROLLBACK'); return res.status(400).json({ message: 'No confirmed active seats are available to send.' }) }
    if (group.some((item) => item.contact !== selected.contact)) {
      await exec('ROLLBACK'); return res.status(400).json({ message: 'Seats in this booking group have different customer phone numbers.' })
    }
    const booking = group[0]
    if (!isValidPhone(booking.contact)) { await exec('ROLLBACK'); return res.status(400).json({ message: 'The saved customer phone number is invalid.' }) }
    const required = [booking.boarding_point, booking.destination, booking.travel_date, booking.departure_time, booking.registration_no, booking.conductor_phone]
    if (required.some((value) => !String(value || '').trim())) {
      await exec('ROLLBACK'); return res.status(400).json({ message: 'SMS not sent: trip origin, destination, date, departure, assigned bus, and conductor phone must all be set.' })
    }
    const existingRows = await all(
      `SELECT status, provider_status FROM sms_attempts WHERE booking_id IN (${group.map(() => '?').join(',')}) ORDER BY id DESC`,
      group.map((item) => item.id),
    )
    if (existingRows.some((row) => ['sent', 'delivered'].includes(row.status))) {
      await exec('ROLLBACK'); return res.status(409).json({ message: 'A confirmation SMS was already accepted for these seats.' })
    }
    if (existingRows.some((row) => row.provider_status === 'timeout_unknown')) {
      await exec('ROLLBACK'); return res.status(409).json({ message: 'The previous request timed out and may have been accepted. Check your SmsLenz account before sending again.' })
    }
    if (existingRows.some((row) => row.status === 'queued')) {
      await exec('ROLLBACK'); return res.status(409).json({ message: 'A confirmation SMS is already sending for these seats.' })
    }
    const retry = req.body?.retry === true
    if (existingRows.some((row) => row.status === 'failed') && !retry) {
      await exec('ROLLBACK'); return res.status(409).json({ message: 'Previous SMS attempt failed. Confirm retry to send again.', canRetry: true })
    }
    const attemptNoRow = await get(`SELECT COUNT(*) as count FROM sms_attempts WHERE booking_id IN (${group.map(() => '?').join(',')})`, group.map((item) => item.id))
    idempotencyKey = `confirm-sms-group-${selected.booking_group_id || selected.id}-${Number(attemptNoRow.count || 0) + 1}`
    message = buildConfirmationMessage(booking, group, smsConfig().hotline)
    for (const item of group) {
      await run(
        `INSERT INTO sms_attempts (booking_id, idempotency_key, phone, message, status, created_by) VALUES (?, ?, ?, ?, 'queued', ?)`,
        [item.id, `${idempotencyKey}-booking-${item.id}`, booking.contact, message, req.user.id],
      )
      await run("UPDATE bookings SET sms_status = 'queued', sms_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id])
    }
    await exec('COMMIT')
  } catch (error) {
    try { await exec('ROLLBACK') } catch { /* ignore */ }
    console.error(error)
    return res.status(500).json({ message: 'Could not prepare the confirmation SMS.' })
  }

  const result = await sendSms({ to: group[0].contact, message, idempotencyKey })
  for (const item of group) {
    await run(
      `UPDATE sms_attempts SET status = ?, provider_status = ?, provider_response = ?, error = ? WHERE idempotency_key = ?`,
      [result.status, result.providerStatus || '', JSON.stringify(result.raw || {}), result.error || '', `${idempotencyKey}-booking-${item.id}`],
    )
    await run('UPDATE bookings SET sms_status = ?, sms_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [result.status, result.ok ? null : result.error, item.id])
    await audit(req.user, result.ok ? 'sms.sent' : 'sms.failed', 'booking', item.id, idempotencyKey)
  }
  const errorMessage = result.providerStatus === 'timeout_unknown'
    ? `${result.error} Automatic retry is disabled to avoid a duplicate.`
    : result.error
  if (!result.ok) return res.status(502).json({ message: errorMessage || 'SMS send failed.', canRetry: result.providerStatus !== 'timeout_unknown' })
  res.json({ ok: true, status: result.status, message: 'SmsLenz accepted the confirmation SMS.', seatCount: group.length })
})

app.get('/api/cargo', authMiddleware, async (req, res) => {
  const { date, route, bus, tripId, status, q } = req.query
  const clauses = []
  const params = []
  if (date) { clauses.push('c.travel_date = ?'); params.push(date) }
  if (route) { clauses.push('c.route_code = ?'); params.push(route) }
  if (tripId) { clauses.push('c.trip_id = ?'); params.push(tripId) }
  if (bus) { clauses.push('c.bus_registration LIKE ?'); params.push(`%${bus}%`) }
  if (status) { clauses.push('c.cargo_status = ?'); params.push(status) }
  if (q) {
    clauses.push('(c.cargo_ref LIKE ? OR c.sender_name LIKE ? OR c.receiver_name LIKE ? OR c.sender_phone LIKE ? OR c.receiver_phone LIKE ? OR c.description LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const items = await all(`SELECT c.* FROM cargo c ${where} ORDER BY c.created_at DESC`, params)
  res.json({ cargo: items })
})

app.post('/api/cargo', authMiddleware, requireStaffPermission('cargo'), async (req, res) => {
  const {
    trip_id, sender_name, sender_phone, receiver_name, receiver_phone, description, weight, charge, payment_status, cargo_status, notes,
  } = req.body || {}
  const contactNumber = String(sender_phone || receiver_phone || '').trim()
  const customerName = sender_name || receiver_name || ''
  const paymentStatus = String(payment_status || 'unpaid').trim().toLowerCase()
  if (!contactNumber || !description) {
    return res.status(400).json({ message: 'Contact number and goods description are required' })
  }
  if (!isValidPhone(contactNumber)) {
    return res.status(400).json({ message: 'Enter a valid Sri Lankan contact number' })
  }
  if (charge === undefined || Number(charge) < 0 || Number.isNaN(Number(charge))) {
    return res.status(400).json({ message: 'Cargo charge must be entered manually' })
  }
  let trip = null
  if (trip_id) {
    trip = await get(`${tripJoinSelect()} WHERE t.id = ?`, [trip_id])
    if (!trip) return res.status(404).json({ message: 'Trip not found' })
  }
  const temporaryCargoRef = `NEW-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`
  const result = await run(
    `INSERT INTO cargo (cargo_ref, trip_id, travel_date, route_code, route_label, bus_registration, sender_name, sender_phone, receiver_name, receiver_phone, description, weight, charge, payment_status, cargo_status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      temporaryCargoRef, trip?.id || null, trip?.travel_date || req.body.travel_date || null, trip?.route_code || req.body.route_code || null,
      trip?.route_label || req.body.route_label || null, trip?.registration_no || req.body.bus_registration || '',
      customerName, normalizePhone(contactNumber), '', '',
      description, weight || '', Number(charge), paymentStatus, cargo_status || 'registered', notes || '', req.user.id,
    ],
  )
  const cargo_ref = `B${result.id}`
  await run('UPDATE cargo SET cargo_ref = ? WHERE id = ?', [cargo_ref, result.id])
  const item = await get('SELECT * FROM cargo WHERE id = ?', [result.id])
  await audit(req.user, 'cargo.create', 'cargo', item.id, item.cargo_ref)
  res.status(201).json({ cargo: item })
})

app.delete('/api/cargo/:id', authMiddleware, requireStaffPermission('cargo'), async (req, res) => {
  const item = await get('SELECT id, cargo_ref FROM cargo WHERE id = ?', [req.params.id])
  if (!item) return res.status(404).json({ message: 'Cargo entry not found' })
  await run('DELETE FROM cargo WHERE id = ?', [item.id])
  await audit(req.user, 'cargo.delete', 'cargo', item.id, item.cargo_ref)
  res.json({ message: `Cargo ${item.cargo_ref} deleted.` })
})

app.get('/api/admin/dashboard', authMiddleware, requireAdmin, async (req, res) => {
  const trips = await all(`${tripJoinSelect()} WHERE t.status != 'cancelled' ORDER BY t.travel_date DESC, t.id DESC LIMIT 200`)
  const dutyData = await getAdminDutyData()
  const buses = await all('SELECT * FROM buses ORDER BY id')
  const expenses = await all('SELECT id, expense_date, category, description, amount, duty_id, trip_id FROM daily_expenses ORDER BY expense_date DESC, id DESC')
  const passengerRecords = await all(`SELECT bk.*, t.travel_date, t.route_code, t.route_label, t.trip_code, COALESCE(t.bus_no, b.registration_no) as registration_no FROM bookings bk JOIN trips t ON t.id = bk.trip_id LEFT JOIN buses b ON b.id = t.bus_id ORDER BY t.travel_date DESC, bk.created_at DESC LIMIT 200`)
  const recentCustomerBookings = await all(`
    SELECT bk.passenger_name, bk.contact, bk.trip_id, t.travel_date
    FROM bookings bk JOIN trips t ON t.id = bk.trip_id
    WHERE bk.status = 'confirmed'
      AND bk.confirmation_status = 'confirmed'
      AND TRIM(COALESCE(bk.contact, '')) != ''
    ORDER BY t.travel_date DESC
  `)
  const customerGroups = new Map()
  for (const booking of recentCustomerBookings) {
    let mobile = String(booking.contact || '').replace(/\D/g, '')
    if (mobile.startsWith('00')) mobile = mobile.slice(2)
    if (mobile.startsWith('0') && mobile.length === 10) mobile = `94${mobile.slice(1)}`
    else if (mobile.length === 9) mobile = `94${mobile}`
    const group = customerGroups.get(mobile) || {
      passenger_name: booking.passenger_name,
      contact: booking.contact,
      trips: new Map(),
      last_trip_date: booking.travel_date,
    }
    if (booking.trip_id != null) group.trips.set(String(booking.trip_id), booking.travel_date)
    customerGroups.set(mobile, group)
  }
  const regularCustomers = [...customerGroups.entries()]
    .filter(([mobile, group]) => mobile && group.trips.size >= 2)
    .map(([mobile, group]) => ({
      passenger_name: group.passenger_name,
      contact: mobile.startsWith('94') && mobile.length === 11 ? `+${mobile}` : group.contact,
      trip_dates: [...group.trips.values()].filter(Boolean),
      trip_count: group.trips.size,
      month_count: new Set([...group.trips.values()].filter(Boolean).map((date) => String(date).slice(0, 7))).size,
      last_trip_date: group.last_trip_date,
    }))
    .sort((a, b) => b.trip_count - a.trip_count || b.month_count - a.month_count || String(b.last_trip_date).localeCompare(String(a.last_trip_date)))
  const cargoRecords = await all(`SELECT c.*, t.trip_code, COALESCE(t.bus_no, b.registration_no, c.bus_registration) as registration_no, COALESCE(t.route_label, c.route_label) as route_label
    FROM cargo c LEFT JOIN trips t ON t.id = c.trip_id LEFT JOIN buses b ON b.id = t.bus_id
    ORDER BY c.travel_date DESC, c.created_at DESC LIMIT 200`)
  const passengerTotals = await get("SELECT COUNT(*) as count, COALESCE(SUM(fare),0) as revenue FROM bookings WHERE status = 'confirmed' AND confirmation_status = 'confirmed'")
  const cargoTotals = await get('SELECT COUNT(*) as count, COALESCE(SUM(charge),0) as revenue FROM cargo')
  const passengerDaily = await all(`
    SELECT t.id as trip_id, t.trip_code, t.travel_date, t.route_code, t.route_label,
      COALESCE(t.bus_no, b.registration_no) as registration_no,
      COUNT(*) as passenger_count, COALESCE(SUM(bk.fare), 0) as passenger_revenue
    FROM bookings bk JOIN trips t ON t.id = bk.trip_id
    LEFT JOIN buses b ON b.id = t.bus_id
    WHERE bk.status = 'confirmed' AND bk.confirmation_status = 'confirmed'
    GROUP BY t.id, t.trip_code, t.travel_date, t.route_code, t.route_label, t.bus_no, b.registration_no
  `)
  const cargoDaily = await all(`
    SELECT trip_id, travel_date, route_code, route_label, bus_registration,
      COUNT(*) as cargo_count, COALESCE(SUM(charge), 0) as cargo_revenue
    FROM cargo
    WHERE travel_date IS NOT NULL AND TRIM(travel_date) != ''
    GROUP BY trip_id, travel_date, route_code, route_label, bus_registration
  `)
  const dailyRevenueMap = new Map()
  for (const row of passengerDaily) {
    const key = row.trip_id ? `trip:${row.trip_id}` : `${row.travel_date}|${row.route_code || ''}|${row.registration_no || ''}`
    dailyRevenueMap.set(key, {
      trip_id: row.trip_id,
      trip_code: row.trip_code,
      registration_no: row.registration_no,
      travel_date: row.travel_date,
      route_code: row.route_code,
      route_label: row.route_label,
      passenger_count: Number(row.passenger_count) || 0,
      passenger_revenue: Number(row.passenger_revenue) || 0,
      cargo_count: 0,
      cargo_revenue: 0,
    })
  }
  for (const row of cargoDaily) {
    const key = row.trip_id ? `trip:${row.trip_id}` : `${row.travel_date}|${row.route_code || ''}|${row.bus_registration || ''}`
    const daily = dailyRevenueMap.get(key) || {
      trip_id: row.trip_id,
      trip_code: null,
      registration_no: row.bus_registration,
      travel_date: row.travel_date,
      route_code: row.route_code,
      route_label: row.route_label,
      passenger_count: 0,
      passenger_revenue: 0,
      cargo_count: 0,
      cargo_revenue: 0,
    }
    daily.cargo_count = Number(row.cargo_count) || 0
    daily.cargo_revenue = Number(row.cargo_revenue) || 0
    dailyRevenueMap.set(key, daily)
  }
  const dailyRevenue = [...dailyRevenueMap.values()]
    .map((row) => ({ ...row, total_revenue: row.passenger_revenue + row.cargo_revenue }))
    .sort((a, b) => b.travel_date.localeCompare(a.travel_date) || String(a.trip_code || '').localeCompare(String(b.trip_code || '')))
  const smsTotals = await get(`
    SELECT
      SUM(CASE WHEN sms_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN sms_status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN sms_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN sms_status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM bookings WHERE status = 'confirmed' AND confirmation_status = 'confirmed'
  `)
  res.json({
    ...dutyData,
    trips: await Promise.all(trips.map(hydrateTrip)),
    buses,
    expenses,
    passengerRecords,
    regularCustomers,
    cargoRecords,
    passengers: passengerTotals,
    cargo: cargoTotals,
    dailyRevenue,
    sms: smsTotals,
    smsGateway: { configured: smsConfig().configured, provider: smsConfig().provider },
  })
})

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }
  const buses = await all('SELECT * FROM buses ORDER BY id')
  const bookings = await all(
    `SELECT bk.*, t.travel_date, t.route_label, COALESCE(t.bus_no, b.registration_no) as registration_no FROM bookings bk
     JOIN trips t ON t.id = bk.trip_id LEFT JOIN buses b ON b.id = t.bus_id ORDER BY bk.created_at DESC LIMIT 100`,
  )
  const cargo = await all('SELECT * FROM cargo ORDER BY created_at DESC LIMIT 100')
  res.json({ buses, bookings, cargo, totals: { buses: buses.length, bookings: bookings.length, cargo: cargo.length } })
})

const databaseReady = seedDatabase()

if (!IS_VERCEL) {
  databaseReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`District Line API running on http://localhost:${PORT}`)
      })
    })
    .catch((error) => {
      console.error('Database setup error:', error)
      process.exit(1)
    })
}

export default app
