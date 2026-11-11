// Read-only transport/target diagnostics. No migrations, exports or application startup.
import pg from 'pg'
import { pathToFileURL } from 'node:url'
import { loadEnv } from '../../server/env.js'
import { databaseConnection } from '../../server/database-tls.js'
import { projectFingerprint } from '../../server/test-support/isolated-postgres.js'

export async function inspectConnection(value, { inspectDisposable = false, sourceUrl } = {}) {
  if (inspectDisposable && (!projectFingerprint(value) || projectFingerprint(value) === projectFingerprint(sourceUrl)))
    throw Error('Distinct restore target required')
  const client = new pg.Client({ ...databaseConnection(value), connectionTimeoutMillis: 10000,
    query_timeout: 15000, application_name: 'district-readonly-security-diagnostic',
    options: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000' })
  try {
    await client.connect()
    await client.query('BEGIN READ ONLY')
    await client.query("SET LOCAL statement_timeout='15s'")
    const backend = (await client.query('SELECT ssl, version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0]
    const socket = client.connection.stream
    const result = { applicationTlsVerified: socket.encrypted === true && socket.authorized === true,
      applicationTlsProtocol: socket.getProtocol(), backendTlsEncrypted: backend?.ssl === true,
      backendTlsProtocol: backend?.version || null,
      upstreamCertificateVerification: 'not-observable-from-SQL',
      serverMajor: Number((await client.query('SHOW server_version_num')).rows[0].server_version_num) / 10000 | 0 }
    if (inspectDisposable) {
      const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_meta'`)).rows
      let occupied = false
      for (const { tablename } of tables) {
        const quoted = '"' + tablename.replaceAll('"','""') + '"'
        if ((await client.query(`SELECT EXISTS(SELECT 1 FROM public.${quoted}) AS occupied`)).rows[0].occupied) { occupied=true; break }
      }
      const hasMeta = (await client.query("SELECT to_regclass('public.schema_meta') IS NOT NULL AS present")).rows[0].present
      const versions = hasMeta ? (await client.query('SELECT version FROM public.schema_meta')).rows.map(x=>Number(x.version)) : []
      result.disposable = { differentFromSource: true, applicationTables: tables.length, hasApplicationRows: occupied,
        baselineReady: [1,2,3,4,5,6].every(v=>versions.includes(v)),
        eligibleForSyntheticTests: tables.length>0 && !occupied && [1,2,3,4,5,6].every(v=>versions.includes(v)) }
    }
    await client.query('ROLLBACK')
    return result
  } finally { await client.end().catch(()=>{}) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--read-only')) throw Error('Explicit read-only invocation required')
  loadEnv(process.cwd())
  const restore = process.argv.includes('--restore-target')
  inspectConnection(restore ? process.env.USERNAME_RECOVERY_RESTORE_DATABASE_URL : process.env.DATABASE_URL,
    { inspectDisposable: restore, sourceUrl: process.env.DATABASE_URL })
    .then(result => console.log(JSON.stringify({ target: restore?'existing-restore':'source', ...result })))
    .catch(error => {
      console.error(JSON.stringify({ result:'FAILED', code:/^[A-Z0-9_]{2,50}$/.test(error.code||'')?error.code:'REDACTED' }))
      process.exitCode=1
    })
}
