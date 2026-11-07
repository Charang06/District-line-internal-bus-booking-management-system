// Test support only. Never loads .env, never falls back to DATABASE_URL.
import { createHash, randomBytes, randomInt } from 'node:crypto'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import verifiedTls from '../../scripts/lib/supabase-verified-tls.cjs'

export const sourceProjectFingerprint = '868295d24a51'
export const isolatedTestsEnabled = env => env.ISOLATED_REHEARSAL_ALLOW_WRITES === 'synthetic-fixtures-only'
  && Boolean(env.ISOLATED_REHEARSAL_DATABASE_URL && env.ISOLATED_REHEARSAL_PROJECT_FINGERPRINT)
export const isolatedTestOptions = { skip: isolatedTestsEnabled(process.env) ? false : 'Requires separately approved isolated PostgreSQL rehearsal; no remote connection in local tests.' }

export function projectFingerprint(value) {
  try {
    const u = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(u.protocol)) return null
    const hostRef = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
    const userRef = decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
    if (!hostRef && !u.hostname.endsWith('.pooler.supabase.com')) return null
    if (hostRef && userRef && hostRef !== userRef) return null
    const ref = hostRef || userRef
    return ref ? createHash('sha256').update(ref).digest('hex').slice(0, 12) : null
  } catch { return null }
}

export function isolatedConnectionConfig(env) {
  if (!isolatedTestsEnabled(env)) throw Error('Isolated rehearsal is not explicitly enabled')
  const fingerprint = projectFingerprint(env.ISOLATED_REHEARSAL_DATABASE_URL)
  if (!fingerprint || fingerprint === sourceProjectFingerprint || fingerprint !== env.ISOLATED_REHEARSAL_PROJECT_FINGERPRINT
    || (env.DATABASE_URL && fingerprint === projectFingerprint(env.DATABASE_URL))) throw Error('Isolated target identity rejected')
  return { ...verifiedTls.verifiedPostgresConfig(env.ISOLATED_REHEARSAL_DATABASE_URL, env), max: 5, connectionTimeoutMillis: 15000,
    application_name: 'district-synthetic-rehearsal',
    options: '-c lock_timeout=3000 -c statement_timeout=15000 -c transaction_timeout=600000 -c idle_in_transaction_session_timeout=60000 -c search_path=public,pg_catalog' }
}

export async function openIsolatedPool(env = process.env) {
  const pool = boundedTestPool(new pg.Pool(isolatedConnectionConfig(env)))
  try {
    const { rows } = await pool.query('SELECT version FROM public.schema_meta ORDER BY version')
    if (![1, 2, 3, 4, 5, 6].every(v => rows.some(x => x.version === v))) throw Error('Approved baseline migrations 1–6 are required; tests never apply them')
    return pool
  } catch { await pool.end(); throw Error('Isolated database preflight failed; no fixtures written') }
}

export function boundedTestPool(raw) {
  // The approved preflight showed startup options can be ignored by the pooler.
  // Initialize every acquired session explicitly before exposing it to a test.
  const connect = async () => {
    const client = await raw.connect()
    try {
      await client.query(`SET lock_timeout='3s'; SET statement_timeout='15s';
        SET transaction_timeout='10min'; SET idle_in_transaction_session_timeout='60s';
        SET search_path=public,pg_catalog`)
      return client
    } catch { client.release(true); throw Error('Isolated session initialization failed') }
  }
  return { connect, async query(sql, params) { const client = await connect(); try { return await client.query(sql, params) } finally { client.release() } },
    end: () => raw.end(), on: (...args) => raw.on(...args),
    get waitingCount() { return raw.waitingCount }, get totalCount() { return raw.totalCount }, get idleCount() { return raw.idleCount } }
}

export async function requireEmptyApplication(pool) {
  const { rows } = await pool.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> 'schema_meta' ORDER BY c.relname`)
  if (!rows.length) throw Error('Application schema is missing')
  for (const { relname } of rows) {
    const name = '"' + relname.replaceAll('"', '""') + '"'
    if ((await pool.query(`SELECT EXISTS (SELECT 1 FROM public.${name}) AS occupied`)).rows[0].occupied)
      throw Error('Booking integration requires a separately approved empty application database; existing records are protected')
  }
}

export async function syntheticAccounts(client) {
  const suffix = randomBytes(6).toString('hex')
  const id = -randomInt(1000000000, 1900000000)
  const password = `Synthetic-${randomBytes(18).toString('hex')}`
  const passwordHash = await bcrypt.hash(password, 4)
  const admin = { id, username: `test_admin_${suffix}`, email: `admin-${suffix}@example.test` }
  const staff = { id: id - 1, username: `test_staff_${suffix}`, email: `staff-${suffix}@example.test` }
  // One atomic INSERT; collision fails rather than reusing/updating an account.
  await client.query(`INSERT INTO users (id,username,password_hash,role,full_name,status,recovery_email)
    VALUES ($1,$2,$3,'admin','Synthetic administrator','active',$4),
           ($5,$6,$3,'staff','Synthetic staff','active',$7)`,
  [admin.id, admin.username, passwordHash, admin.email, staff.id, staff.username, staff.email])
  return { suffix, password, admin, staff }
}

export async function removeSyntheticAccounts(pool, fixture) {
  if (!fixture) return
  assertSyntheticFixture(fixture)
  // Exact ID and generated username guard cleanup. No broad role/email selection.
  await pool.query('DELETE FROM users WHERE (id=$1 AND username=$2) OR (id=$3 AND username=$4)',
    [fixture.admin.id, fixture.admin.username, fixture.staff.id, fixture.staff.username])
}

export function assertSyntheticFixture(fixture) {
  if (!/^[a-f0-9]{12}$/.test(fixture?.suffix || '') || !Number.isInteger(fixture.admin?.id) || fixture.admin.id >= -999999999
    || fixture.staff?.id !== fixture.admin.id - 1 || fixture.admin.username !== `test_admin_${fixture.suffix}`
    || fixture.staff.username !== `test_staff_${fixture.suffix}`) throw Error('Fixture cleanup identity rejected')
}

export function savepointPool(client) {
  let next = 0
  const stack = []
  const wrapped = { async query(sql, params) {
    if (sql === 'BEGIN') { const name = `synthetic_${++next}`; stack.push(name); return client.query(`SAVEPOINT ${name}`) }
    if (sql === 'COMMIT') return client.query(`RELEASE SAVEPOINT ${stack.pop()}`)
    if (sql === 'ROLLBACK') { const name = stack.pop(); await client.query(`ROLLBACK TO SAVEPOINT ${name}`); return client.query(`RELEASE SAVEPOINT ${name}`) }
    return client.query(sql, params)
  }, release() {} }
  return { query: (sql, params) => client.query(sql, params), connect: async () => wrapped }
}
