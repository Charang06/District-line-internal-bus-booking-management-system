import { createHash } from 'node:crypto'

export function databaseTargetDigest(value) {
  const url = new URL(value)
  return createHash('sha256').update(JSON.stringify([url.hostname,url.port||'5432',url.pathname,decodeURIComponent(url.username)])).digest('hex')
}
export function requestedDatabaseOperation(argv = []) {
  const options=argv.filter(arg=>arg.startsWith('--approved-database-operation='))
  if(!options.length)return null
  if(options.length!==1 || !['migrate','seed'].includes(options[0].split('=')[1]))throw Error('Invalid explicit database operation')
  return options[0].split('=')[1]
}
export function authorizeDatabaseOperation(operation, value, env, argv = []) {
  if(requestedDatabaseOperation(argv)!==operation)throw Error('Separate database operation command required')
  if(env.NODE_ENV==='production'||env.VERCEL_ENV==='production'||env.VERCEL)throw Error('Hosted/production maintenance is not supported by this local tool')
  const url=new URL(value)
  const reference=/^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1]
    || /\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username))?.[1]
  if(reference&&createHash('sha256').update(reference).digest('hex').slice(0,12)==='868295d24a51')throw Error('Protected production target rejected')
  if(env.USERNAME_RECOVERY_RESTORE_DATABASE_URL && databaseTargetDigest(value)===databaseTargetDigest(env.USERNAME_RECOVERY_RESTORE_DATABASE_URL))throw Error('Populated restore target rejected')
  if(env.DATABASE_MAINTENANCE_TARGET_SHA256!==databaseTargetDigest(value))throw Error('Approved target digest required')
  const expected=operation==='migrate'?'apply-001-004-to-approved-disposable-target':'seed-approved-disposable-target'
  const approval=operation==='migrate'?env.DATABASE_MIGRATION_APPROVAL:env.DATABASE_SEED_APPROVAL
  if(approval!==expected)throw Error('Separate operation approval marker required')
}

export async function verifyDatabaseBaseline(pool, env = {}) {
  const client=await pool.connect()
  const tables=['schema_meta','users','auth_sessions','trips','buses','bookings','cargo']
  const versions=[1,2,3,4]
  if(env.ENABLE_ADMIN_USERNAME_RECOVERY==='true'){tables.push('admin_username_recovery_tokens','admin_username_recovery_limits');versions.push(5)}
  if(env.ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION==='true'){tables.push('admin_recovery_email_verification_tokens','admin_recovery_email_verification_limits');versions.push(6)}
  if(env.ENABLE_LOGIN_RATE_LIMIT==='true')tables.push('login_rate_limits')
  if(['enroll','enforce'].includes(env.ADMIN_MFA_MODE))tables.push('admin_mfa')
  try {
    await client.query('BEGIN READ ONLY')
    await client.query("SET LOCAL statement_timeout='10s'")
    const found=await client.query('SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name',[tables.map(t=>'public.'+t)])
    if(found.rows.length!==tables.length||found.rows.some(row=>row.present!==true))throw Error('Database baseline missing; separately approved initialization required')
    const ledger=await client.query('SELECT version FROM public.schema_meta WHERE version=ANY($1::int[])',[versions])
    if(!versions.every(version=>ledger.rows.some(row=>Number(row.version)===version)))throw Error('Database baseline versions missing; separately approved migration required')
    if(env.ADMIN_MFA_MODE==='enforce') {
      const marker=await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_sessions' AND column_name='mfa_verified_at') AS present")
      if(marker.rows[0]?.present!==true)throw Error('MFA session migration missing')
    }
  } finally {
    await client.query('ROLLBACK').catch(()=>{})
    client.release()
  }
}
