import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const username = String(process.argv[2] || '').trim()
if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
  console.error('Usage: node scripts/owner-admin-recovery.mjs <admin-username>')
  process.exit(1)
}

let password = process.env.RECOVERY_NEW_PASSWORD || ''
if (password.length < 12) {
  console.error('Set RECOVERY_NEW_PASSWORD to a private password with at least 12 characters, then retry.')
  process.exit(1)
}

const passwordHash = await bcrypt.hash(password, 12)
process.env.RECOVERY_NEW_PASSWORD = ''
const auditId = `owner-assisted-${randomUUID()}`
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`

const sql = `BEGIN;
DO $$
DECLARE target_id INTEGER;
BEGIN
  SELECT id INTO target_id FROM users WHERE username = ${sqlLiteral(username)} AND role = 'admin' AND status = 'active' FOR UPDATE;
  IF target_id IS NULL THEN RAISE EXCEPTION 'Active admin account not found'; END IF;
  UPDATE users SET password_hash = ${sqlLiteral(passwordHash)} WHERE id = target_id AND role = 'admin';
  DELETE FROM auth_sessions WHERE user_id = target_id;
  UPDATE password_recovery_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = target_id AND used_at IS NULL;
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (target_id, 'admin.password.recovery.owner_assisted', 'user', target_id::text, 'Owner-assisted admin password recovery.');
END $$;
COMMIT;`
const outputPath = process.env.RECOVERY_SQL_OUTPUT || ''
if (!outputPath) {
  console.error('Set RECOVERY_SQL_OUTPUT to a restricted temporary SQL file path.')
  process.exit(1)
}
const fs = await import('node:fs/promises')
await fs.writeFile(outputPath, sql, { mode: 0o600, flag: 'wx' })
console.log('Recovery SQL created. Review and execute it only in a private, owner-controlled PostgreSQL session, then securely delete the SQL file.')
