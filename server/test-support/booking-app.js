// Test-only loader: run unchanged production route definitions with injected
// PostgreSQL and provider dependencies, but never startup migration/seeding.
import * as vm from 'node:vm'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { assertSyntheticFixture } from './isolated-postgres.js'

export function bookingRouteSource(source) {
  const end = '\nconst databaseReady = ensureDatabaseReady()'
  if (source.split(end).length !== 2 || source.split('let databaseIsReady = false').length !== 2)
    throw Error('Booking test loader requires review after entrypoint changes')
  // Only initialization wiring changes in this in-memory copy. Route source stays identical.
  return source.slice(0, source.indexOf(end)).replace('let databaseIsReady = false', 'let databaseIsReady = true') + '\nexport default app\n'
}

export function cookieSessionRequest(baseUrl, fetchLocal = fetch) {
  let cookie = ''
  return async (method, route, body, expectedStatus = 200) => {
    if (!/^\/api\//.test(route)) throw Error('Unexpected test request path')
    const response = await fetchLocal(`${baseUrl}${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    if (response.status !== expectedStatus) throw Error(`Synthetic API check failed: ${method} ${route.split('?')[0]} (${response.status})`)
    return response.json()
  }
}

export async function loadBookingTestApp(pool, testOptions = {}) {
  if (!vm.SourceTextModule) throw Error('Use --experimental-vm-modules for the isolated booking harness; no database startup performed')
  const entry = new URL('../server.js', import.meta.url)
  const source = bookingRouteSource(fs.readFileSync(entry, 'utf8'))
    + (testOptions.exerciseStartup ? '\nexport { initializeDatabaseWithRetry as startupProbe }\n' : '')
  const safeEnv = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://test.invalid/synthetic', SESSION_COOKIE_SAME_SITE: 'lax',
    ENABLE_ADMIN_USERNAME_RECOVERY: 'false', ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION: 'false' }
  if (testOptions.recordRecoveryEmail) Object.assign(safeEnv, {
    APP_URL: 'https://synthetic.example.test', RESEND_API_KEY: 'synthetic-not-a-key',
    RECOVERY_EMAIL_FROM: 'security@example.test', ENABLE_ADMIN_USERNAME_RECOVERY: 'true',
    ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION: 'true',
  })
  for (const key of ['ADMIN_MFA_MODE', 'ADMIN_MFA_ENCRYPTION_KEY', 'ENABLE_LOGIN_RATE_LIMIT', 'LOGIN_RATE_LIMIT_KEY']) {
    if (testOptions.securityEnv?.[key] !== undefined) safeEnv[key] = testOptions.securityEnv[key]
  }
  const recordingFetch = async (url, options) => {
    if (!testOptions.recordRecoveryEmail || url !== 'https://api.resend.com/emails')
      throw Error('External network calls are forbidden by the booking harness')
    testOptions.recordRecoveryEmail(JSON.parse(options.body))
    return { ok: true, status: 200 }
  }
  const context = vm.createContext({ process: { env: safeEnv, hrtime: process.hrtime.bind(process) }, Buffer,
    URL, AbortSignal, setTimeout, clearTimeout,
    console: { info() {}, log() {}, warn() {}, error() {} },
    fetch: recordingFetch })
  // hrtime.bigint is used by production metrics.
  context.process.hrtime.bigint = process.hrtime.bigint
  const module = new vm.SourceTextModule(source, { context, identifier: entry.href, initializeImportMeta(meta) { meta.url = entry.href } })
  const synthetic = object => new vm.SyntheticModule(Object.keys(object), function () {
    for (const [key, value] of Object.entries(object)) this.setExport(key, value)
  }, { context })
  await module.link(async specifier => {
    if (specifier === './env.js') return synthetic({ loadEnv() {} }) // never reads repo .env
    if (specifier === 'pg') return synthetic({ default: { Pool: class { constructor() { return pool } } } })
    if (specifier === 'fs') return synthetic({ default: { ...fs, mkdirSync() {} } })
    const url = specifier.startsWith('.') ? new URL(specifier, entry).href : specifier
    const namespace = { ...await import(url) }
    if (specifier === './admin-username-recovery.js') {
      const create = namespace.createUsernameRecoveryRouter
      namespace.createUsernameRecoveryRouter = options => create({ ...options, env: safeEnv,
        ...(testOptions.recordRecoveryEmail ? { service: namespace.createUsernameRecoveryService({
          store: namespace.createPostgresUsernameRecoveryStore(pool), config: namespace.usernameRecoveryConfig(safeEnv),
          sendEmail: namespace.createUsernameRecoveryEmailSender(namespace.usernameRecoveryConfig(safeEnv), recordingFetch),
        }) } : {}) })
    }
    if (specifier === './admin-recovery-email-verification.js') {
      const create = namespace.createEmailVerificationRouter
      namespace.createEmailVerificationRouter = options => create({ ...options, env: safeEnv,
        ...(testOptions.recordRecoveryEmail ? { service: namespace.createEmailVerificationService({
          store: namespace.createPostgresEmailVerificationStore(pool), config: namespace.recoveryEmailVerificationConfig(safeEnv),
          sendEmail: namespace.createVerificationEmailSender(namespace.recoveryEmailVerificationConfig(safeEnv), recordingFetch),
        }) } : {}) })
    }
    if (specifier === './sms.js') {
      namespace.sendSms = async () => ({ ok: true, status: 'sent', providerStatus: 'synthetic', raw: {} })
      namespace.smsConfig = () => ({ configured: false, provider: 'synthetic', hotline: '0000000000' })
    }
    return synthetic(namespace)
  })
  await module.evaluate()
  if (testOptions.exerciseStartup) await module.namespace.startupProbe('synthetic-startup')
  return module.namespace.default
}

export async function serveBookingTestApp(pool, testOptions) {
  const app = await loadBookingTestApp(pool, testOptions)
  const server = createServer(app).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  return { request: cookieSessionRequest(`http://127.0.0.1:${server.address().port}`),
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } }
}

// Only this harness's synthetic rows are removed. No TRUNCATE/schema/ACL/sequence resets.
export async function cleanupBookingFixtures(pool, fixture, busIds) {
  if (!fixture) return
  assertSyntheticFixture(fixture)
  const client = await pool.connect(), ids = [fixture.admin.id, fixture.staff.id]
  try {
    await client.query('BEGIN')
    for (const table of ['sms_attempts', 'daily_expenses', 'duty_adjustments', 'expense_submissions', 'revenue_entries', 'cargo', 'bus_duties', 'bookings', 'trips'])
      await client.query(`DELETE FROM ${table} WHERE created_by=ANY($1::int[])`, [ids])
    await client.query('DELETE FROM audit_logs WHERE user_id=ANY($1::int[])', [ids])
    await client.query('DELETE FROM buses WHERE id=ANY($1::int[])', [busIds])
    await client.query('DELETE FROM users WHERE (id=$1 AND username=$2) OR (id=$3 AND username=$4)',
      [fixture.admin.id, fixture.admin.username, fixture.staff.id, fixture.staff.username])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

