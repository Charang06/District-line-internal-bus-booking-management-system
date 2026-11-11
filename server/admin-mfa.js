// Staged backend. No enrollment or enforcement unless explicitly configured.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'

const hash = value => createHash('sha256').update(value).digest('hex')
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(bytes) {
  let bits = 0, value = 0, result = ''
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31] }
  }
  if (bits) result += alphabet[(value << (5-bits)) & 31]
  return result
}
export function totp(secret, counter, digits = 6) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(buffer).digest()
  const offset = digest[digest.length-1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0')
}
export function verifyTotp(secret, code, now, lastCounter = -1) {
  if (!/^\d{6}$/.test(String(code))) return null
  const current = Math.floor(now / 30000)
  for (const counter of [current, current-1, current+1]) {
    if (counter > Number(lastCounter) && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(String(code)))) return counter
  }
  return null
}
function encryptionKey(env) {
  const key = Buffer.from(env.ADMIN_MFA_ENCRYPTION_KEY || '', 'base64')
  if (key.length !== 32) throw Error('MFA encryption key unavailable')
  return key
}
export function seal(secret, userId, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from('district-mfa:v1:' + userId))
  const data = Buffer.concat([cipher.update(secret), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}
export function unseal(value, userId, key) {
  const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12))
  cipher.setAAD(Buffer.from('district-mfa:v1:' + userId)); cipher.setAuthTag(bytes.subarray(12,28))
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()])
}
export function mfaMode(env = process.env) {
  const mode = env.ADMIN_MFA_MODE || 'off'
  if (!['off', 'enroll', 'enforce'].includes(mode)) throw Error('Invalid MFA mode')
  if (mode === 'enforce' && env.ENABLE_LOGIN_RATE_LIMIT !== 'true') throw Error('Persistent login protection required before MFA enforcement')
  if (mode !== 'off') encryptionKey(env)
  return mode
}

// Serialize each administrator's state and login/recovery operations using its user row.
export function postgresMfaStore(pool, { idleMinutes = 30, maxHours = 8 } = {}) {
  return {
    async transaction(userId, action) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL lock_timeout = '5s'")
        await client.query("SET LOCAL statement_timeout = '10s'")
        const user = (await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]
        if (!user || user.role !== 'admin' || (user.status || 'active') !== 'active') {
          await client.query('ROLLBACK')
          return { error: 'Invalid or expired verification', status: 401 }
        }
        const state = (await client.query('SELECT state FROM admin_mfa WHERE user_id = $1', [userId])).rows[0]?.state || {}
        const result = await action(state, user,
          async () => client.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]),
          async () => {
            const token = randomBytes(32).toString('base64url')
            await client.query(`INSERT INTO auth_sessions(user_id,token_hash,created_at,last_seen_at,idle_expires_at,expires_at,mfa_verified_at)
              VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + $3 * INTERVAL '1 minute',
                CURRENT_TIMESTAMP + $4 * INTERVAL '1 hour',CURRENT_TIMESTAMP)`, [userId,hash(token),idleMinutes,maxHours])
            return token
          })
        await client.query(`INSERT INTO admin_mfa(user_id,state) VALUES($1,$2::jsonb)
          ON CONFLICT(user_id) DO UPDATE SET state = EXCLUDED.state`, [userId, JSON.stringify(state)])
        await client.query('COMMIT')
        return result
      } catch (error) { await client.query('ROLLBACK'); throw error }
      finally { client.release() }
    },
  }
}

export function createMfaService({ store, env = process.env, clock = Date.now }) {
  const key = () => encryptionKey(env)
  const allowed = state => !state.failureUntil || state.failureUntil <= clock() || state.failures < 5
  function failure(state) {
    if (!state.failureUntil || state.failureUntil <= clock()) { state.failures = 0; state.failureUntil = clock() + 900000 }
    state.failures = (state.failures || 0) + 1
    return { error: 'Invalid or expired verification', status: 401 }
  }
  const blocked = () => ({ error: 'Too many verification attempts. Try again later.', status: 429 })
  return {
    async enroll(userId, password) {
      return store.transaction(userId, async (state, user) => {
        if (!allowed(state)) return blocked()
        if (typeof password !== 'string' || password.length > 1024) return failure(state)
        if (!await bcrypt.compare(String(password || ''), user.password_hash)) return failure(state)
        if (state.secret) return { error: 'MFA is already enrolled', status: 409 }
        const secret = randomBytes(20)
        state.pending = seal(secret, userId, key()); state.pendingUntil = clock() + 600000
        state.pendingPassword = hash(user.password_hash)
        const encoded = base32(secret)
        return { secret: encoded, uri: `otpauth://totp/District%20Line:${encodeURIComponent(user.username)}?secret=${encoded}&issuer=District%20Line&algorithm=SHA1&digits=6&period=30` }
      })
    },
    async confirm(userId, code) {
      return store.transaction(userId, async (state, user, revoke) => {
        if (!allowed(state)) return blocked()
        if (!state.pending || state.pendingUntil <= clock() || state.pendingPassword !== hash(user.password_hash)) return failure(state)
        const counter = verifyTotp(unseal(state.pending, userId, key()), code, clock())
        if (counter === null) return failure(state)
        const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'))
        state.secret = state.pending; state.lastCounter = counter; state.recoveryHashes = recoveryCodes.map(hash)
        delete state.pending; delete state.pendingUntil; delete state.pendingPassword; delete state.challenge
        state.failures = 0
        await revoke()
        return { enrolled: true, recoveryCodes }
      })
    },
    async replaceRecoveryCodes(userId, password, code) {
      return store.transaction(userId, async (state, user, revoke) => {
        if (!allowed(state)) return blocked()
        if (!state.secret || typeof password !== 'string' || password.length > 1024
          || !await bcrypt.compare(password, user.password_hash)) return failure(state)
        const counter = verifyTotp(unseal(state.secret,userId,key()),code,clock(),state.lastCounter)
        if (counter === null) return failure(state)
        const recoveryCodes = Array.from({length:10},()=>randomBytes(16).toString('hex'))
        state.recoveryHashes = recoveryCodes.map(hash); state.lastCounter = counter; state.failures = 0
        delete state.challenge
        await revoke()
        return { recoveryCodes }
      })
    },
    async challenge(userId, passwordHash) {
      return store.transaction(userId, async (state, user) => {
        if (hash(user.password_hash) !== hash(passwordHash)) return { error: 'Sign in again', status: 401 }
        if (!state.secret) return { error: 'Administrator MFA enrollment is required. Contact the owner.', status: 503 }
        if (!allowed(state)) return blocked()
        const token = randomBytes(32).toString('base64url')
        state.challenge = { hash: hash(token), until: clock() + 300000, passwordHash: hash(user.password_hash) }
        return { mfaRequired: true, challenge: `${userId}.${token}` }
      })
    },
    async verify(challenge, code) {
      if (typeof code !== 'string' || code.length > 32) return { error: 'Invalid or expired verification', status: 401 }
      const match = /^(\d{1,10})\.([A-Za-z0-9_-]{43})$/.exec(String(challenge))
      if (!match) return { error: 'Invalid or expired verification', status: 401 }
      return store.transaction(Number(match[1]), async (state, user, revoke, issueVerifiedSession) => {
        const pending = state.challenge
        // Random requests cannot lock out an administrator by guessing their user id.
        if (!pending || pending.hash !== hash(match[2]) || pending.until <= clock() || pending.passwordHash !== hash(user.password_hash))
          return { error: 'Invalid or expired verification', status: 401 }
        if (!allowed(state)) return blocked()
        const recoveryIndex = (state.recoveryHashes || []).indexOf(hash(String(code)))
        const counter = verifyTotp(unseal(state.secret, user.id, key()), code, clock(), state.lastCounter)
        if (recoveryIndex < 0 && counter === null) return failure(state)
        if (recoveryIndex >= 0) { state.recoveryHashes.splice(recoveryIndex,1); await revoke() }
        else state.lastCounter = counter
        delete state.challenge; state.failures = 0
        return { user, sessionId: await issueVerifiedSession() }
      })
    },
  }
}

export function createMfaRouter({ service, authMiddleware, requireAdmin, setSessionCookie, publicUser, env = process.env }) {
  const router = Router()
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (mfaMode(env) === 'off') return res.status(404).json({ message: 'Not found' })
    next()
  })
  const respond = (res, result) => result.error ? res.status(result.status).json({ message: result.error }) : res.json(result)
  router.post('/enroll', authMiddleware, requireAdmin, async (req, res, next) => {
    try { return respond(res, await service.enroll(req.user.id, req.body?.password)) } catch { return next(Error('MFA enrollment unavailable')) }
  })
  router.post('/confirm', authMiddleware, requireAdmin, async (req, res, next) => {
    try { return respond(res, await service.confirm(req.user.id, req.body?.code)) } catch { return next(Error('MFA enrollment unavailable')) }
  })
  router.post('/recovery-codes', authMiddleware, requireAdmin, async (req, res, next) => {
    try { return respond(res, await service.replaceRecoveryCodes(req.user.id, req.body?.password, req.body?.code)) } catch { return next(Error('MFA recovery unavailable')) }
  })
  router.post('/verify', async (req, res, next) => {
    try {
      if (mfaMode(env) !== 'enforce') return res.status(404).json({ message: 'Not found' })
      const result = await service.verify(req.body?.challenge, req.body?.code)
      if (result.error) {
        if (result.status === 429) res.setHeader('Retry-After', '900')
        return respond(res, result)
      }
      setSessionCookie(result.sessionId, res)
      return res.json({ user: publicUser(result.user) })
    } catch { return next(Error('MFA verification unavailable')) }
  })
  return router
}
