import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadVerifiedRoot } = require('../scripts/lib/supabase-verified-tls.cjs')

// Parse into discrete fields: pg connection-string SSL options otherwise replace ssl.
export function databaseConnection(value, env = process.env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('Unsafe TLS override')
  let url
  try { url = new URL(value) } catch { throw Error('Invalid database configuration') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('Invalid database protocol')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const production = env.NODE_ENV === 'production' || Boolean(env.VERCEL)
  if (env.DATABASE_SSL === 'disable' && (!local || production)) throw Error('TLS required')
  for (const [key, option] of url.searchParams) {
    if (key !== 'sslmode' || !['require', 'verify-full'].includes(option)) throw Error('Unsupported database URL option')
  }
  const supabase = /^(db\.[a-z0-9]+\.supabase\.co|[a-z0-9.-]+\.pooler\.supabase\.com)$/.test(url.hostname)
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: local && !production && env.DATABASE_SSL === 'disable' ? false : {
      rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: url.hostname,
      ...(supabase ? { ca: loadVerifiedRoot().pem } : {}),
    },
  }
}
