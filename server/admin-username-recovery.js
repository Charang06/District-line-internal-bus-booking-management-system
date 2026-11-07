import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'

const genericMessage = 'If this email belongs to an active administrator, a username recovery link will be sent. Staff should contact their administrator.'
const invalidMessage = 'This username recovery link is invalid or expired. Request a new link.'
const unavailableMessage = 'Username recovery is currently unavailable. Contact the system owner.'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export function usernameRecoveryConfig(env = process.env) {
  let origin = ''
  try {
    const url = new URL(env.APP_URL)
    const production = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'
    if ((url.protocol === 'https:' || (!production && url.protocol === 'http:'))
      && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin
  } catch { /* fail closed when the canonical origin is missing */ }
  return {
    enabled: env.ENABLE_ADMIN_USERNAME_RECOVERY === 'true',
    ready: Boolean(origin && env.RESEND_API_KEY && env.RECOVERY_EMAIL_FROM),
    origin,
    apiKey: env.RESEND_API_KEY,
    from: env.RECOVERY_EMAIL_FROM,
  }
}

export function createUsernameRecoveryEmailSender(config, fetchEmail = fetch) {
  return async ({ email, token, tokenHash }) => {
    const link = `${config.origin}/#recover-username?token=${encodeURIComponent(token)}`
    const response = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `admin-username-recovery/${tokenHash}`,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: 'Recover your District Line administrator username',
        text: `Use this link to view your District Line administrator username. It expires in 20 minutes and can be used once. Opening the link does not sign you in or change your password.\n\n${link}\n\nIf you did not request this, ignore this email.`,
        // The URL uses a validated origin and a base64url token, never user-provided HTML.
        html: `<p>Use this link to view your District Line administrator username. It expires in 20 minutes and can be used once.</p><p><a href="${link}">Recover my username</a></p><p>This does not sign you in or change your password. If you did not request this, ignore this email.</p>`,
      }),
    })
    return response.ok
  }
}

// Separate storage keeps password recovery, user records, and sessions untouched.
export function createPostgresUsernameRecoveryStore(pool) {
  return {
    async allow(scope, value, maximum, seconds = 900) {
      const result = await pool.query(`
        INSERT INTO admin_username_recovery_limits (scope, key_hash, window_started_at, attempts)
        VALUES ($1, $2, CURRENT_TIMESTAMP, 1)
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          window_started_at = CASE WHEN admin_username_recovery_limits.window_started_at <= CURRENT_TIMESTAMP - $3 * INTERVAL '1 second' THEN CURRENT_TIMESTAMP ELSE admin_username_recovery_limits.window_started_at END,
          attempts = CASE WHEN admin_username_recovery_limits.window_started_at <= CURRENT_TIMESTAMP - $3 * INTERVAL '1 second' THEN 1 ELSE LEAST(admin_username_recovery_limits.attempts + 1, $4 + 1) END
        RETURNING attempts`, [scope, hash(`${scope}:${value}`), seconds, maximum])
      return result.rows[0].attempts <= maximum
    },
    async findAdmin(email) {
      const result = await pool.query("SELECT id, status FROM users WHERE role = 'admin' AND LOWER(BTRIM(recovery_email)) = $1 LIMIT 2", [email])
      return result.rows.length === 1 && result.rows[0].status === 'active' ? result.rows[0] : null
    },
    async issue(userId, email, tokenHash) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL lock_timeout = '2s'")
        await client.query("SET LOCAL statement_timeout = '5s'")
        // Lock only: never update the administrator account itself.
        const user = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'admin' AND status = 'active' AND LOWER(BTRIM(recovery_email)) = $2 FOR UPDATE", [userId, email])
        if (!user.rows.length) { await client.query('ROLLBACK'); return false }
        const matches = await client.query("SELECT id FROM users WHERE role = 'admin' AND LOWER(BTRIM(recovery_email)) = $1 LIMIT 2", [email])
        if (matches.rows.length !== 1) { await client.query('ROLLBACK'); return false }
        await client.query('UPDATE admin_username_recovery_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL', [userId])
        await client.query("INSERT INTO admin_username_recovery_tokens (user_id, email, token_hash, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '20 minutes')", [userId, email, tokenHash])
        await client.query('COMMIT')
        return true
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally { client.release() }
    },
    async invalidate(tokenHash) {
      await pool.query('UPDATE admin_username_recovery_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1 AND used_at IS NULL', [tokenHash])
    },
    async consume(tokenHash) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL lock_timeout = '2s'")
        await client.query("SET LOCAL statement_timeout = '5s'")
        // Match the lock order of email/profile changes (user, then recovery token).
        const user = await client.query(`SELECT u.id, u.username FROM users u
          JOIN admin_username_recovery_tokens t ON t.user_id = u.id
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > clock_timestamp()
            AND u.role = 'admin' AND u.status = 'active' AND LOWER(BTRIM(u.recovery_email)) = t.email
            AND NOT EXISTS (SELECT 1 FROM users other WHERE other.role = 'admin' AND other.id <> u.id AND LOWER(BTRIM(other.recovery_email)) = t.email)
          FOR UPDATE OF u`, [tokenHash])
        if (!user.rows.length) { await client.query('ROLLBACK'); return null }
        const consumed = await client.query(`UPDATE admin_username_recovery_tokens SET used_at = CURRENT_TIMESTAMP
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > clock_timestamp() RETURNING id`, [tokenHash])
        if (!consumed.rows.length) { await client.query('ROLLBACK'); return null }
        await client.query('COMMIT')
        return user.rows[0].username
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally { client.release() }
    },
  }
}

export function createUsernameRecoveryService({ store, config, sendEmail, tokenFactory = () => randomBytes(32).toString('base64url') }) {
  const unavailable = () => ({ status: 503, body: { message: unavailableMessage } })
  const generic = () => ({ status: 200, body: { message: genericMessage } })
  return {
    async request(emailInput, ip) {
      if (!config.enabled || !config.ready) return unavailable()
      const email = normalizeEmail(emailInput)
      // Limits apply equally to known and unknown addresses; responses never confirm a match.
      if (!await store.allow('request-ip', ip, 20)) return generic()
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic()
      if (!await store.allow('request-email', email, 1)) return generic()
      const admin = await store.findAdmin(email)
      if (!admin) return generic()
      const token = tokenFactory()
      const tokenHash = hash(token)
      if (!await store.issue(admin.id, email, tokenHash)) return generic()
      let delivered = false
      try { delivered = await sendEmail({ email, token, tokenHash }) } catch { /* do not log email/token/provider payloads */ }
      if (!delivered) await store.invalidate(tokenHash)
      return generic()
    },
    async confirm(token, ip) {
      if (!config.enabled || !config.ready) return unavailable()
      if (!await store.allow('confirm-ip', ip, 20)) return { status: 429, body: { message: 'Too many attempts. Please try again later.' } }
      const invalid = () => ({ status: 400, body: { message: invalidMessage } })
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid()
      const username = await store.consume(hash(token))
      return username ? { status: 200, body: { username } } : invalid()
    },
  }
}

export function createUsernameRecoveryRouter({ pool, env = process.env, service }) {
  const config = usernameRecoveryConfig(env)
  const recovery = service || createUsernameRecoveryService({
    store: createPostgresUsernameRecoveryStore(pool), config, sendEmail: createUsernameRecoveryEmailSender(config),
  })
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })
  for (const operation of ['request', 'confirm']) {
    router.post(`/${operation}`, async (req, res) => {
      try {
        const value = operation === 'request' ? req.body?.email : req.body?.token
        const result = await recovery[operation](value, String(req.ip || req.socket?.remoteAddress || 'unknown'))
        res.status(result.status).json(result.body)
      } catch {
        // Intentionally omit raw DB/provider errors, which can contain account data.
        res.status(503).json({ message: unavailableMessage })
      }
    })
  }
  return router
}
