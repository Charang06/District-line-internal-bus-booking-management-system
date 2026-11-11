import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import { offlineConfiguration, runOfflineBackup } from './offline.mjs'

const ref = 'offlineunittest'
const fingerprint = createHash('sha256').update(ref).digest('hex').slice(0, 12)
const safeAudit = {
  role: 'district_backup', serverMajor: 17, backendTls: true, elevatedRole: false,
  roleMembership: false, schemaCreate: false, tableCount: 22, unreadableTables: 0,
  ownedTables: 0, writableTables: 0, unsafeSequences: 0, unsafeRls: 0, callableSecurityDefiners: 0,
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'district-offline-unit-'))
  const workspace = path.join(root, 'workspace')
  const destination = path.join(root, 'offline-media')
  fs.mkdirSync(workspace)
  fs.mkdirSync(destination)
  const env = {
    OFFLINE_BACKUP_APPROVAL: 'I_APPROVE_ONE_OFFLINE_PRODUCTION_BACKUP',
    OFFLINE_BACKUP_DATABASE_URL: `postgresql://district_backup.${ref}:synthetic-password@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=verify-full`,
    OFFLINE_BACKUP_PROJECT_FINGERPRINT: fingerprint,
    OFFLINE_BACKUP_AGE_RECIPIENT: `age1${'a'.repeat(58)}`,
    OFFLINE_BACKUP_DESTINATION: destination,
    OFFLINE_BACKUP_DESTINATION_CONFIRM: destination,
  }
  return { root, workspace, destination, env }
}

function mockToolLauncher({ destination, ageCode = 0, dumpCode = 0, restoreCode = 0 } = {}) {
  return (name, args, toolEnv, stdio) => {
    assert.ok(!['aws', 'curl', 'wget'].includes(name), 'offline run must never invoke cloud/network tools')
    const p = { exitCode: null, kill() { this.exitCode = -1 } }
    let finish
    const finished = new Promise(resolve => { finish = resolve })
    if (name === 'pg_dump') {
      assert.ok(args.includes('--schema=public'))
      assert.ok(args.includes('--enable-row-security'))
      assert.ok(args.includes('--no-password'))
      assert.equal(args.some(value => value.includes('synthetic-password')), false)
      p.stdout = Readable.from([Buffer.from('SYNTHETIC-PLAINTEXT-ARCHIVE')])
      p.stdout.on('end', () => { p.exitCode = dumpCode; finish(dumpCode) })
    } else {
      const received = []
      p.stdin = new Writable({
        write(chunk, encoding, done) { received.push(Buffer.from(chunk)); done() },
        final(done) {
          const code = name === 'age' ? ageCode : restoreCode
          if (name === 'age') {
            const temp = fs.readdirSync(destination).find(entry => entry.startsWith('.district-line-offline-'))
            assert.ok(temp, 'executor created its private temporary directory')
            fs.writeFileSync(path.join(destination, temp, 'payload.dump.age'),
              `age-encryption.org/v1\n${Buffer.concat(received).toString('base64')}`)
          }
          p.exitCode = code
          finish(code)
          done()
        },
      })
    }
    return { p, finished }
  }
}

function mockedCommand() {
  const calls = []
  const runCommand = async (name, args, env) => {
    calls.push(name)
    if (name === 'pg_dump') return 'pg_dump (PostgreSQL) 17.6'
    if (name === 'pg_restore') return 'pg_restore (PostgreSQL) 17.6'
    if (name === 'age') return '1.3.2'
    if (name === 'psql') {
      assert.ok(args.includes('--command'))
      assert.equal(env.PGUSER, `district_backup.${ref}`)
      assert.equal(env.PGSSLMODE, 'verify-full')
      assert.match(env.PGOPTIONS, /default_transaction_read_only=on/)
      assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined)
      assert.equal(env.DATABASE_URL, undefined)
      return JSON.stringify(safeAudit)
    }
    throw new Error(`Unexpected synthetic tool: ${name}`)
  }
  return { calls, runCommand }
}

test('configuration requires explicit approval, production fingerprint, backup role, confirmed destination, and no app URL', () => {
  const data = setup()
  try {
    assert.equal(offlineConfiguration(data.env, { expectedProductionFingerprint: fingerprint, workspaceRoot: data.workspace }).fingerprint, fingerprint)
    const invalid = [
      { OFFLINE_BACKUP_APPROVAL: '' },
      { OFFLINE_BACKUP_PROJECT_FINGERPRINT: '000000000000' },
      { OFFLINE_BACKUP_DATABASE_URL: data.env.OFFLINE_BACKUP_DATABASE_URL.replace('district_backup.', 'postgres.') },
      { OFFLINE_BACKUP_DATABASE_URL: data.env.OFFLINE_BACKUP_DATABASE_URL.replace('?sslmode=verify-full', '') },
      { OFFLINE_BACKUP_DATABASE_URL: `${data.env.OFFLINE_BACKUP_DATABASE_URL}&sslmode=require` },
      { OFFLINE_BACKUP_DESTINATION_CONFIRM: path.join(data.root, 'elsewhere') },
      { OFFLINE_BACKUP_AGE_RECIPIENT: 'private-key-material' },
      { DATABASE_URL: 'ignored-runtime-credential' },
    ]
    for (const overrides of invalid) assert.throws(() => offlineConfiguration({ ...data.env, ...overrides }, {
      expectedProductionFingerprint: fingerprint, workspaceRoot: data.workspace,
    }))
  } finally { fs.rmSync(data.root, { recursive: true, force: true }) }
})

test('destination must be a real absolute directory outside the workspace', () => {
  const data = setup()
  try {
    assert.throws(() => offlineConfiguration({ ...data.env,
      OFFLINE_BACKUP_DESTINATION: data.workspace,
      OFFLINE_BACKUP_DESTINATION_CONFIRM: data.workspace,
    }, { expectedProductionFingerprint: fingerprint, workspaceRoot: data.workspace }), /DESTINATION_MUST_BE_OUTSIDE_WORKSPACE/)
    const link = path.join(data.root, 'destination-link')
    fs.symlinkSync(data.destination, link, 'junction')
    assert.throws(() => offlineConfiguration({ ...data.env,
      OFFLINE_BACKUP_DESTINATION: link,
      OFFLINE_BACKUP_DESTINATION_CONFIRM: link,
    }, { expectedProductionFingerprint: fingerprint, workspaceRoot: data.workspace }))
  } finally { fs.rmSync(data.root, { recursive: true, force: true }) }
})

test('offline export uses only mocked tools, writes ciphertext plus sanitized manifest, and never claims restore verification', async () => {
  const data = setup()
  const { calls, runCommand } = mockedCommand()
  try {
    const result = await runOfflineBackup({
      env: data.env,
      expectedProductionFingerprint: fingerprint,
      workspaceRoot: data.workspace,
      launch: mockToolLauncher({ destination: data.destination }),
      runCommand,
      getConnection: () => ({ host: 'synthetic.invalid', port: 5432 }),
      now: new Date('2026-11-11T00:00:00.000Z'),
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    })
    assert.deepEqual(calls, ['pg_dump', 'pg_restore', 'age', 'psql'])
    const files = fs.readdirSync(data.destination).sort()
    assert.deepEqual(files, [result.archiveFile, result.manifestFile].sort())
    const archive = fs.readFileSync(path.join(data.destination, result.archiveFile))
    assert.match(archive.toString(), /^age-encryption\.org\/v1/)
    assert.equal(archive.includes(Buffer.from('SYNTHETIC-PLAINTEXT-ARCHIVE')), false)
    const manifest = JSON.parse(fs.readFileSync(path.join(data.destination, result.manifestFile), 'utf8'))
    assert.equal(manifest.plaintextArchiveWritten, false)
    assert.equal(manifest.fullRestoreVerified, false)
    assert.equal(manifest.archiveSha256, createHash('sha256').update(archive).digest('hex'))
    assert.equal(Object.hasOwn(manifest, 'databaseUrl'), false)
  } finally { fs.rmSync(data.root, { recursive: true, force: true }) }
})

test('existing final names are never overwritten and dump failure leaves no published backup', async () => {
  const data = setup()
  const fixed = { now: new Date('2026-11-11T00:00:00.000Z'), id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002' }
  const dependencies = {
    env: data.env,
    expectedProductionFingerprint: fingerprint,
    workspaceRoot: data.workspace,
    launch: mockToolLauncher({ destination: data.destination }),
    runCommand: mockedCommand().runCommand,
    getConnection: () => ({ host: 'synthetic.invalid', port: 5432 }),
    ...fixed,
  }
  try {
    const result = await runOfflineBackup(dependencies)
    const archivePath = path.join(data.destination, result.archiveFile)
    const before = fs.readFileSync(archivePath)
    await assert.rejects(runOfflineBackup(dependencies), /BACKUP_DESTINATION_ALREADY_EXISTS/)
    assert.deepEqual(fs.readFileSync(archivePath), before)

    const failed = setup()
    try {
      await assert.rejects(runOfflineBackup({ ...dependencies,
        env: failed.env,
        workspaceRoot: failed.workspace,
        launch: mockToolLauncher({ destination: failed.destination, dumpCode: 1 }),
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003',
      }))
      assert.deepEqual(fs.readdirSync(failed.destination), [])
    } finally { fs.rmSync(failed.root, { recursive: true, force: true }) }
  } finally { fs.rmSync(data.root, { recursive: true, force: true }) }
})
