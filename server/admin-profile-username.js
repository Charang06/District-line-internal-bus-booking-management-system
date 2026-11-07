import bcrypt from 'bcryptjs'

export function validateAdminUsername(value) {
  if (typeof value !== 'string') return 'Enter a new username.'
  if (!/^[A-Za-z0-9._]{4,30}$/.test(value.trim())) return 'Use 4–30 letters, numbers, underscores or periods.'
  return null
}

// The caller supplies the existing cookie-auth and requireAdmin middleware.
// This handler also checks the locked database account rather than trusting body roles/IDs.
export function createAdminUsernameHandler({ pool, publicUser, verifyPassword = bcrypt.compare }) {
  return async (req, res) => {
    if (!req.user?.id || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' })
    const error = validateAdminUsername(req.body?.newUsername)
    if (error) return res.status(400).json({ message: error })
    const newUsername = req.body.newUsername.trim()
    if (typeof req.body?.currentPassword !== 'string' || !req.body.currentPassword) {
      return res.status(400).json({ message: 'Enter your current password to change your username.' })
    }
    let client
    let transaction = false
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      transaction = true
      await client.query("SET LOCAL lock_timeout = '3s'")
      await client.query("SET LOCAL statement_timeout = '10s'")
      const result = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
      const account = result.rows[0]
      if (!account || account.role !== 'admin' || (account.status || 'active') !== 'active') {
        await client.query('ROLLBACK'); transaction = false
        return res.status(403).json({ message: 'An active administrator account is required.' })
      }
      if (!await verifyPassword(req.body.currentPassword, account.password_hash)) {
        await client.query('ROLLBACK'); transaction = false
        // A failed reauthentication does not expire an otherwise valid login session.
        return res.status(400).json({ message: 'Current password is incorrect.' })
      }
      if (newUsername === account.username) {
        await client.query('ROLLBACK'); transaction = false
        return res.status(400).json({ message: 'Choose a username different from your current username.' })
      }
      // users_username_key enforces the same exact, case-sensitive uniqueness as login,
      // including concurrent requests and staff accounts. There is no find-then-update race.
      const updated = await client.query("UPDATE users SET username = $1 WHERE id = $2 AND role = 'admin' AND status = 'active' RETURNING *", [newUsername, account.id])
      if (!updated.rows[0]) throw new Error('Account unavailable during username update')
      await client.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES ($1, 'profile.username', 'user', $2, 'Administrator updated own username.')`, [account.id, String(account.id)])
      // Session cookies are bound to user_id; existing profile updates keep those sessions.
      // The auth middleware reads the current username from users on every request.
      const safeAccount = publicUser(updated.rows[0])
      await client.query('COMMIT')
      transaction = false
      return res.json({ user: safeAccount, message: 'Username updated. Use your new username the next time you sign in.' })
    } catch (failure) {
      if (transaction) await client?.query('ROLLBACK').catch(() => {})
      if (failure.code === '23505') return res.status(409).json({ message: 'That username is unavailable. Choose another one.' })
      if (failure.code === '55P03' || failure.code === '57014') return res.status(503).json({ message: 'Your account is busy. Please try again shortly.' })
      // Never send or log password/hash/SQL parameters or raw database errors.
      return res.status(503).json({ message: 'Could not update your username. Please try again.' })
    } finally { client?.release() }
  }
}
