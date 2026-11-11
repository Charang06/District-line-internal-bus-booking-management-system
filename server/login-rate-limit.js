import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export function loginKeys(username, ip, secret) {
  if (!secret || secret.length < 32) throw Error('LOGIN_RATE_LIMIT_KEY must contain at least 32 characters')
  const hash = value => createHmac('sha256', secret).update(value).digest('hex')
  // Fold IPv6 addresses to /64 to prevent trivial interface-address rotation.
  let address = String(ip || 'unknown').replace(/^::ffff:/, '')
  if (isIP(address) === 6) {
    const expanded = new URL(`http://[${address}]`).hostname.slice(1, -1)
    const parts = expanded.split('::')
    const left = parts[0] ? parts[0].split(':') : []
    const right = parts[1] ? parts[1].split(':') : []
    const full = parts.length === 2 ? [...left, ...Array(8-left.length-right.length).fill('0'), ...right] : left
    address = full.slice(0,4).map(x => x.padStart(4,'0')).join(':')
  }
  return [
    ['account', hash('account:' + String(username).normalize('NFKC').toLowerCase()), 15],
    ['ip', hash('ip:' + address), 300],
    ['pair', hash('pair:' + address + ':' + String(username).normalize('NFKC').toLowerCase()), 8],
  ]
}

export function createLoginRateLimit({ pool, env = process.env }) {
  return async (req, res, next) => {
    if (env.ENABLE_LOGIN_RATE_LIMIT !== 'true') return next()
    if (typeof req.body?.username !== 'string' || typeof req.body?.password !== 'string'
      || req.body.username.length > 200 || req.body.password.length > 1024)
      return res.status(400).json({ message: 'Invalid sign-in request' })
    try {
      const keys = loginKeys(req.body.username, req.ip || req.socket?.remoteAddress, env.LOGIN_RATE_LIMIT_KEY)
      // One atomic statement, database clock, bounded counters, no in-memory state.
      const result = await pool.query(`
        INSERT INTO login_rate_limits AS limits (scope, key_hash, window_started_at, attempts)
        SELECT scope, key_hash, CURRENT_TIMESTAMP, 1
        FROM unnest($1::text[], $2::text[]) AS input(scope, key_hash) ORDER BY scope, key_hash
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          attempts = CASE WHEN limits.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            THEN 1 ELSE LEAST(limits.attempts + 1, 1000000) END,
          window_started_at = CASE WHEN limits.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            THEN CURRENT_TIMESTAMP ELSE limits.window_started_at END
        RETURNING scope, attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM
          window_started_at + INTERVAL '15 minutes' - CURRENT_TIMESTAMP))) AS retry_after`,
      [keys.map(x => x[0]), keys.map(x => x[1])])
      const blocked = result.rows.filter(row => Number(row.attempts) > keys.find(x => x[0] === row.scope)[2])
      if (blocked.length) {
        res.setHeader('Retry-After', String(Math.max(...blocked.map(x => Number(x.retry_after)))))
        res.setHeader('Cache-Control', 'no-store')
        return res.status(429).json({ message: 'Too many sign-in attempts. Please try again later.' })
      }
      return next()
    } catch {
      // Never continue without persistent protection when enabled.
      return res.status(503).json({ message: 'Sign-in is temporarily unavailable. Please try again later.' })
    }
  }
}
