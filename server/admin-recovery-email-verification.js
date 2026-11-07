import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'

const digest = value => createHash('sha256').update(value).digest('hex')
export const normalizeRecoveryEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : ''
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const unavailable = () => ({ status: 503, body: { message: 'Recovery email verification is currently unavailable.' } })
const invalid = () => ({ status: 400, body: { message: 'This verification link is invalid or expired. Request a new link.' } })
const forbidden = () => ({ status: 403, body: { message: 'An active administrator account is required.' } })
const conflict = () => ({ status: 409, body: { message: 'This recovery email cannot be verified. Contact the system owner to review conflicting administrator recovery emails.' } })

export function recoveryEmailVerificationConfig(env = process.env) {
  let origin = ''
  try {
    const url = new URL(env.APP_URL)
    const production = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'
    if (['https:', ...(!production ? ['http:'] : [])].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash) origin = url.origin
  } catch { /* An untrusted request Host never supplies the email-link origin. */ }
  return { enabled: env.ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION === 'true',
    ready: Boolean(origin && env.RESEND_API_KEY && env.RECOVERY_EMAIL_FROM),
    origin, apiKey: env.RESEND_API_KEY, from: env.RECOVERY_EMAIL_FROM }
}

export function createVerificationEmailSender(config, fetchEmail = fetch) {
  return async ({ email, token, tokenHash }) => {
    const link = `${config.origin}/#verify-recovery-email?token=${encodeURIComponent(token)}`
    const response = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `admin-recovery-email-verification/${tokenHash}` },
      body: JSON.stringify({ from: config.from, to: [email], subject: 'Verify your District Line recovery email',
        text: `Confirm ownership of your District Line administrator recovery email using this link:\n\n${link}\n\nThe link expires in 20 minutes and works once. Opening the page does not verify the email; select Confirm recovery email. If you did not request this, ignore this email.` }),
    })
    return response.ok
  }
}

async function transaction(pool, work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '3s'")
    await client.query("SET LOCAL statement_timeout = '10s'")
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}

// This replaces only the existing own-email handler, and works before migration 006.
// After 006, its database trigger atomically clears verification and retires tokens.
export function createRecoveryEmailUpdateHandler({ pool }) {
  return async (req, res) => {
    if (!req.user?.id || req.user.role !== 'admin') return res.status(403).json(forbidden().body)
    if (typeof req.body?.email !== 'string') return res.status(400).json({ message: 'Enter a valid recovery email address.' })
    const email = normalizeRecoveryEmail(req.body.email)
    if (email && !validEmail(email)) return res.status(400).json({ message: 'Enter a valid recovery email address.' })
    try {
      const result = await transaction(pool, async client => {
        const { rows } = await client.query('SELECT id, role, status, recovery_email FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
        const user = rows[0]
        if (!user || user.role !== 'admin' || user.status !== 'active') return forbidden()
        if (email) {
          const duplicates = await client.query("SELECT id FROM users WHERE role = 'admin' AND id <> $1 AND LOWER(BTRIM(recovery_email)) = $2 LIMIT 1", [user.id, email])
          if (duplicates.rows.length) return { status: 409, body: { message: 'That recovery email is unavailable. Use a different address or contact the system owner.' } }
        }
        await client.query("UPDATE users SET recovery_email = $1 WHERE id = $2 AND role = 'admin'", [email || null, user.id])
        await client.query('UPDATE password_recovery_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL', [user.id])
        return { status: 200, body: { message: 'Recovery email saved.' } }
      })
      return res.status(result.status).json(result.body)
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'users_admin_recovery_email_unique')
        return res.status(409).json({ message: 'That recovery email is unavailable. Use a different address or contact the system owner.' })
      if (error.code === '23514' && error.constraint === 'users_admin_recovery_email_canonical')
        return res.status(400).json({ message: 'Enter a valid recovery email address.' })
      // Do not forward raw SQL errors/parameters to the global logger.
      return res.status(503).json({ message: 'Could not save the recovery email. Please try again.' })
    }
  }
}

export function createPostgresEmailVerificationStore(pool) {
  const account = async (client, id, lock = false) => {
    const result = await client.query(`SELECT id, role, status, recovery_email, recovery_email_verified_at
      FROM users WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])
    const user = result.rows[0]
    if (!user || user.role !== 'admin' || user.status !== 'active') return { error: 'forbidden' }
    const email = user.recovery_email || ''
    if (!validEmail(email) || email !== normalizeRecoveryEmail(email)) return { error: 'missing' }
    const duplicates = await client.query("SELECT id FROM users WHERE role = 'admin' AND id <> $1 AND LOWER(BTRIM(recovery_email)) = $2 LIMIT 1", [id, email])
    if (duplicates.rows.length) return { error: 'conflict' }
    return { id: user.id, email, verified: Boolean(user.recovery_email_verified_at) }
  }
  return {
    async schemaReady() {
      const { rows } = await pool.query(`SELECT EXISTS (SELECT 1 FROM schema_meta WHERE version = 6)
        AND to_regclass('public.admin_recovery_email_verification_tokens') IS NOT NULL
        AND to_regclass('public.admin_recovery_email_verification_limits') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name = 'users' AND column_name = 'recovery_email_verified_at') AS ready`)
      return rows[0]?.ready === true
    },
    async allow(scope, value, maximum, seconds = 900) {
      const { rows } = await pool.query(`INSERT INTO admin_recovery_email_verification_limits (scope,key_hash,window_started_at,attempts)
        VALUES ($1,$2,clock_timestamp(),1) ON CONFLICT (scope,key_hash) DO UPDATE SET
        window_started_at = CASE WHEN admin_recovery_email_verification_limits.window_started_at <= clock_timestamp()-$3*INTERVAL '1 second' THEN clock_timestamp() ELSE admin_recovery_email_verification_limits.window_started_at END,
        attempts = CASE WHEN admin_recovery_email_verification_limits.window_started_at <= clock_timestamp()-$3*INTERVAL '1 second' THEN 1 ELSE LEAST(admin_recovery_email_verification_limits.attempts+1,$4+1) END
        RETURNING attempts,GREATEST(1,CEIL(EXTRACT(EPOCH FROM window_started_at+$3*INTERVAL '1 second'-clock_timestamp())))::int AS retry_after`,
      [scope, digest(`${scope}:${value}`), seconds, maximum])
      return { allowed: rows[0].attempts <= maximum, retryAfter: rows[0].retry_after }
    },
    async status(id) {
      const state = await account(pool, id)
      if (state.error) return state
      const { rows } = await pool.query(`SELECT GREATEST(0,CEIL(EXTRACT(EPOCH FROM window_started_at+INTERVAL '60 seconds'-clock_timestamp())))::int AS retry_after
        FROM admin_recovery_email_verification_limits WHERE scope='request-user-cooldown' AND key_hash=$1`, [digest(`request-user-cooldown:${id}`)])
      return { ...state, retryAfter: rows[0]?.retry_after || 0 }
    },
    async issue(id, tokenHash) {
      return transaction(pool, async client => {
        const state = await account(client, id, true)
        if (state.error || state.verified) return state
        await client.query('UPDATE admin_recovery_email_verification_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND used_at IS NULL', [id])
        await client.query("INSERT INTO admin_recovery_email_verification_tokens (user_id,email,token_hash,expires_at) VALUES ($1,$2,$3,clock_timestamp()+INTERVAL '20 minutes')", [id, state.email, tokenHash])
        return state
      })
    },
    async invalidate(tokenHash) {
      await pool.query('UPDATE admin_recovery_email_verification_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND used_at IS NULL', [tokenHash])
    },
    async consume(tokenHash) {
      return transaction(pool, async client => {
        // User first, token second, matching the email-change trigger's lock order.
        const { rows } = await client.query(`SELECT u.id,t.email FROM users u JOIN admin_recovery_email_verification_tokens t ON t.user_id=u.id
          WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>clock_timestamp()
            AND u.role='admin' AND u.status='active' AND u.recovery_email=t.email
          FOR UPDATE OF u`, [tokenHash])
        if (!rows[0]) return false
        const state = await account(client, rows[0].id, true)
        if (state.error || state.email !== rows[0].email) return false
        const consumed = await client.query(`UPDATE admin_recovery_email_verification_tokens SET used_at=CURRENT_TIMESTAMP
          WHERE token_hash=$1 AND user_id=$2 AND email=$3 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id`, [tokenHash, state.id, state.email])
        if (!consumed.rows.length) return false
        const verified = await client.query('UPDATE users SET recovery_email_verified_at=CURRENT_TIMESTAMP WHERE id=$1 AND recovery_email=$2 RETURNING id', [state.id, state.email])
        if (!verified.rowCount) throw new Error('Verification account changed')
        return true
      })
    },
  }
}

export function createEmailVerificationService({ store, config, sendEmail, tokenFactory = () => randomBytes(32).toString('base64url') }) {
  const ready = async () => config.enabled && config.ready && await store.schemaReady()
  const accountError = state => state.error === 'forbidden' ? forbidden() : state.error === 'conflict' ? conflict()
    : { status: 400, body: { message: 'Save a valid recovery email before requesting verification.' } }
  const limit = async (...args) => {
    const result = await store.allow(...args)
    return result.allowed ? null : { status: 429, body: { message: 'Please wait before trying again.', retryAfter: result.retryAfter } }
  }
  return {
    async status(actor) {
      if (!actor?.id || actor.role !== 'admin') return forbidden()
      if (!await ready()) return unavailable()
      const state = await store.status(actor.id)
      if (state.error === 'missing') return { status: 200, body: { email: '', verified: false, retryAfter: 0 } }
      return state.error ? accountError(state) : { status: 200, body: { email: state.email, verified: state.verified, retryAfter: state.retryAfter } }
    },
    async request(actor, ip) {
      if (!actor?.id || actor.role !== 'admin') return forbidden()
      if (!await ready()) return unavailable()
      const ipLimit = await limit('request-ip', ip, 20)
      if (ipLimit) return ipLimit
      const state = await store.status(actor.id)
      if (state.error) return accountError(state)
      if (state.verified) return { status: 200, body: { message: 'Email verified', verified: true } }
      for (const args of [['request-user-cooldown', String(actor.id), 1, 60], ['request-user-hour', String(actor.id), 5, 3600]]) {
        const blocked = await limit(...args)
        if (blocked) return blocked
      }
      const token = tokenFactory(), tokenHash = digest(token)
      const issued = await store.issue(actor.id, tokenHash)
      if (issued.error) return accountError(issued)
      if (issued.verified) return { status: 200, body: { message: 'Email verified', verified: true } }
      let delivered = false
      try { delivered = await sendEmail({ email: issued.email, token, tokenHash }) } catch { /* Never log provider payloads/tokens. */ }
      if (!delivered) { await store.invalidate(tokenHash); return unavailable() }
      return { status: 200, body: { message: 'Verification email requested. Check your inbox. The link expires in 20 minutes.', retryAfter: 60 } }
    },
    async confirm(token, ip) {
      if (!await ready()) return unavailable()
      const blocked = await limit('confirm-ip', ip, 20)
      if (blocked) return blocked
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid()
      return await store.consume(digest(token)) ? { status: 200, body: { message: 'Email verified' } } : invalid()
    },
  }
}

export function createEmailVerificationRouter({ pool, authMiddleware, requireAdmin, env = process.env, service }) {
  const config = recoveryEmailVerificationConfig(env)
  const verification = service || createEmailVerificationService({ store: createPostgresEmailVerificationStore(pool), config, sendEmail: createVerificationEmailSender(config) })
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer')
    if (!config.enabled) return res.status(503).json(unavailable().body)
    next()
  })
  const handle = operation => async (req, res) => {
    try {
      const ip = String(req.ip || req.socket?.remoteAddress || 'unknown')
      const result = operation === 'confirm' ? await verification.confirm(req.body?.token, ip) : await verification[operation](req.user, ip)
      if (result.status === 429) res.setHeader('Retry-After', String(result.body.retryAfter))
      res.status(result.status).json(result.body)
    } catch { res.status(503).json(unavailable().body) }
  }
  router.get('/status', authMiddleware, requireAdmin, handle('status'))
  router.post('/request', authMiddleware, requireAdmin, handle('request'))
  router.post('/confirm', handle('confirm'))
  return router
}
