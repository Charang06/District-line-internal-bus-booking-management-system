// One-time offline-only backup. No dotenv loading, cloud SDK, or upload path.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { auditSql, assertBackupDatabaseAudit } from './database-audit.mjs'
import { encryptedDump, spawnBackupTool } from './stream-encrypted-dump.mjs'

const require = createRequire(import.meta.url)
const { certificatePath, verifiedPostgresConfig } = require('../lib/supabase-verified-tls.cjs')
const APPROVAL_MARKER = 'I_APPROVE_ONE_OFFLINE_PRODUCTION_BACKUP'
const PRODUCTION_FINGERPRINT = '868295d24a51'
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = value => createHash('sha256').update(value).digest('hex')

function fail(code) { throw Object.assign(new Error(code), { code }) }

function projectIdentity(url) {
  const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
  const pooler = url.hostname.endsWith('.pooler.supabase.com')
  const userRef = decodeURIComponent(url.username).match(/^district_backup\.([a-z0-9]+)$/)?.[1]
  if ((!direct && !pooler) || (direct && userRef && direct !== userRef)) fail('INVALID_SUPABASE_TARGET')
  const ref = direct || userRef
  if (!ref) fail('PROJECT_REFERENCE_MISSING')
  return { ref, fingerprint: sha(ref).slice(0, 12), pooler }
}

function normalizeApprovedDirectory(destination, workspaceRoot) {
  if (!destination || !path.isAbsolute(destination)) fail('DESTINATION_MUST_BE_ABSOLUTE')
  let stat
  let real
  try {
    stat = fs.lstatSync(destination)
    real = fs.realpathSync(destination)
  } catch { fail('DESTINATION_MUST_EXIST') }
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(destination) !== real) fail('DESTINATION_MUST_BE_REAL_DIRECTORY')
  const workspace = fs.realpathSync(workspaceRoot)
  const relative = path.relative(workspace, real)
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    fail('DESTINATION_MUST_BE_OUTSIDE_WORKSPACE')
  }
  return real
}

export function offlineConfiguration(env, {
  expectedProductionFingerprint = PRODUCTION_FINGERPRINT,
  workspaceRoot = REPOSITORY_ROOT,
} = {}) {
  if (env.OFFLINE_BACKUP_APPROVAL !== APPROVAL_MARKER) fail('EXPLICIT_OFFLINE_APPROVAL_REQUIRED')
  if (env.DATABASE_URL || env.BACKUP_DATABASE_URL) fail('GENERIC_DATABASE_URL_NOT_ACCEPTED')
  const raw = env.OFFLINE_BACKUP_DATABASE_URL || ''
  let url
  try { url = new URL(raw) } catch { fail('OFFLINE_DATABASE_URL_REQUIRED') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres' || url.hash) fail('INVALID_DATABASE_URL')
  for (const [key, value] of url.searchParams) {
    if (key !== 'sslmode' || value !== 'verify-full') fail('UNREVIEWED_DATABASE_OPTION')
  }
  if (url.searchParams.get('sslmode') !== 'verify-full') fail('VERIFY_FULL_REQUIRED')
  const { ref, fingerprint, pooler } = projectIdentity(url)
  if (fingerprint !== expectedProductionFingerprint
    || env.OFFLINE_BACKUP_PROJECT_FINGERPRINT !== expectedProductionFingerprint) fail('PRODUCTION_PROJECT_FINGERPRINT_MISMATCH')
  const username = decodeURIComponent(url.username)
  if (!url.password || (pooler ? username !== `district_backup.${ref}` : username !== 'district_backup')) {
    fail('DEDICATED_BACKUP_ROLE_REQUIRED')
  }
  if (env.OFFLINE_BACKUP_DESTINATION !== env.OFFLINE_BACKUP_DESTINATION_CONFIRM) fail('DESTINATION_CONFIRMATION_MISMATCH')
  const destination = normalizeApprovedDirectory(env.OFFLINE_BACKUP_DESTINATION, workspaceRoot)
  if (!/^age1[0-9a-z]{58}$/.test(env.OFFLINE_BACKUP_AGE_RECIPIENT || '')) fail('PUBLIC_AGE_RECIPIENT_REQUIRED')

  return {
    fingerprint,
    ref,
    destination,
    recipient: env.OFFLINE_BACKUP_AGE_RECIPIENT,
    databaseUrl: raw,
    expectedProductionFingerprint,
  }
}

const child = spawnBackupTool

async function command(commandName, args, env, launch = child) {
  const { p, finished } = launch(commandName, args, env)
  let output = ''
  for await (const bytes of p.stdout) {
    output += bytes.toString()
    if (output.length > 32_768) fail('TOOL_OUTPUT_LIMIT_EXCEEDED')
  }
  if (await finished !== 0) fail(`TOOL_FAILED_${commandName.toUpperCase()}`)
  return output.trim()
}

function safeToolEnvironment() {
  const env = {}
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'LANG', 'LC_ALL']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function postgresEnvironment(connection, url) {
  const urlUser = decodeURIComponent(url.username)
  const urlPassword = decodeURIComponent(url.password)
  return {
    ...safeToolEnvironment(),
    PGHOST: connection.host,
    PGPORT: String(connection.port),
    PGDATABASE: 'postgres',
    PGUSER: urlUser,
    PGPASSWORD: urlPassword,
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: certificatePath,
    PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: 'district-offline-encrypted-backup',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=900000 -c lock_timeout=5000',
  }
}

function assertVersion(name, version, pattern) {
  if (!pattern.test(version)) fail(`${name.toUpperCase()}_VERSION_UNSUPPORTED`)
}

function filenameBase(fingerprint, now, id) {
  const timestamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return `district-line-prod-${fingerprint}-${timestamp}-${id}`
}

function exists(file) {
  try { fs.lstatSync(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const input = fs.createReadStream(file)
    input.on('data', chunk => hash.update(chunk))
    input.once('error', reject)
    input.once('end', () => resolve(hash.digest('hex')))
  })
}

function publishCreateNew(tempFile, finalFile) {
  // A same-directory hard link atomically creates the final name and fails if it exists.
  // Unlike rename(), link() never replaces an existing backup.
  fs.linkSync(tempFile, finalFile)
  fs.unlinkSync(tempFile)
}

export async function runOfflineBackup({
  env = process.env,
  expectedProductionFingerprint = PRODUCTION_FINGERPRINT,
  workspaceRoot = REPOSITORY_ROOT,
  launch = child,
  runCommand = (name, args, toolEnv) => command(name, args, toolEnv, launch),
  getConnection = (url, processEnv) => verifiedPostgresConfig(url, processEnv),
  now = new Date(),
  id = randomUUID(),
} = {}) {
  const config = offlineConfiguration(env, { expectedProductionFingerprint, workspaceRoot })
  if (!/^[a-f0-9-]{16,64}$/i.test(id)) fail('INVALID_BACKUP_ID')
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || env.NODE_OPTIONS) fail('UNSAFE_NODE_TLS_CONFIGURATION')
  const base = safeToolEnvironment()
  const url = new URL(config.databaseUrl)
  const connection = getConnection(config.databaseUrl, env)
  const pgEnv = postgresEnvironment(connection, url)

  const pgDumpVersion = await runCommand('pg_dump', ['--version'], base)
  const pgRestoreVersion = await runCommand('pg_restore', ['--version'], base)
  const ageVersion = await runCommand('age', ['--version'], base)
  assertVersion('pg_dump', pgDumpVersion, /^pg_dump \(PostgreSQL\) 17\./)
  assertVersion('pg_restore', pgRestoreVersion, /^pg_restore \(PostgreSQL\) 17\./)
  assertVersion('age', ageVersion, /^(?:age )?1\./)

  const auditText = await runCommand('psql', [
    '--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', auditSql,
  ], pgEnv)
  let audit
  try { audit = JSON.parse(auditText) } catch { fail('BACKUP_AUDIT_INVALID_RESPONSE') }
  assertBackupDatabaseAudit(audit)

  const baseName = filenameBase(config.fingerprint, now, id)
  const finalArchive = path.join(config.destination, `${baseName}.dump.age`)
  const finalManifest = path.join(config.destination, `${baseName}.manifest.json`)
  if (exists(finalArchive) || exists(finalManifest)) fail('BACKUP_DESTINATION_ALREADY_EXISTS')
  const tempDirectory = fs.mkdtempSync(path.join(config.destination, '.district-line-offline-'))
  fs.chmodSync(tempDirectory, 0o700)
  const tempArchive = path.join(tempDirectory, 'payload.dump.age')
  const tempManifest = path.join(tempDirectory, 'manifest.json')
  let archivePublished = false
  try {
    await encryptedDump({ recipient: config.recipient, pgEnv, base }, tempArchive, launch, { validateFullArchive: true })
    const fd = fs.openSync(tempArchive, 'r')
    const header = Buffer.alloc(22)
    const read = fs.readSync(fd, header, 0, header.length, 0)
    fs.closeSync(fd)
    if (read !== header.length || !header.toString().startsWith('age-encryption.org/v1')) fail('ENCRYPTED_ARCHIVE_HEADER_INVALID')
    const bytes = fs.statSync(tempArchive).size
    if (!Number.isSafeInteger(bytes) || bytes <= 0) fail('EMPTY_ENCRYPTED_ARCHIVE')
    const archiveSha256 = await hashFile(tempArchive)

    const manifest = {
      version: 1,
      createdAt: now.toISOString(),
      projectFingerprint: config.fingerprint,
      scope: 'public application schema/data/sequences/ACLs',
      encryption: 'age X25519; private identity remains offline',
      pgDumpVersion,
      pgRestoreVersion,
      ageVersion,
      archiveSha256,
      bytes,
      encrypted: true,
      plaintextArchiveWritten: false,
      archivePayloadValidated: true,
      destination: 'owner-approved offline local storage',
      fullRestoreVerified: false,
      exclusions: ['Storage object bytes', 'managed schemas including auth/storage', 'role passwords', 'Vercel/provider secrets'],
    }

    publishCreateNew(tempArchive, finalArchive)
    archivePublished = true
    fs.writeFileSync(tempManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    publishCreateNew(tempManifest, finalManifest)
    return {
      backup: 'PASS',
      projectFingerprint: config.fingerprint,
      archiveFile: path.basename(finalArchive),
      manifestFile: path.basename(finalManifest),
      archiveSha256,
      bytes,
      archivePayloadValidated: true,
      fullRestoreVerified: false,
    }
  } catch (error) {
    if (error?.code === 'EEXIST') fail(archivePublished ? 'ARCHIVE_PUBLISHED_MANIFEST_NOT_PUBLISHED' : 'BACKUP_DESTINATION_ALREADY_EXISTS')
    throw error
  } finally {
    // Remove only partial files created by this invocation; published/existing backups are untouched.
    for (const file of [tempArchive, tempManifest]) {
      try { fs.unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') { /* preserve primary failure */ } }
    }
    try { fs.rmdirSync(tempDirectory) } catch { /* preserve primary failure and any published archive */ }
  }
}

async function main() {
  try {
    const result = await runOfflineBackup()
    console.log(JSON.stringify(result))
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'OFFLINE_BACKUP_FAILED'
    console.error(JSON.stringify({ backup: 'FAILED', code, existingBackupsModified: false }))
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
