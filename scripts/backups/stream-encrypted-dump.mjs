import fs from 'node:fs'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

function child(command, args, env, stdio = ['ignore', 'pipe', 'pipe']) {
  const p = spawn(command, args, { env, stdio, windowsHide: true })
  p.stderr?.resume()
  const finished = new Promise(resolve => {
    p.once('error', () => resolve(-1))
    p.once('close', code => resolve(code))
  })
  return { p, finished }
}

export async function encryptedDump(config, destination, launch = child, options = {}) {
  const dump = launch('pg_dump', [
    '--format=custom', '--compress=6', ...(options.allSchemas ? [] : ['--schema=public']),
    '--enable-row-security', '--no-password', '--lock-wait-timeout=5s',
  ], config.pgEnv)
  const output = fs.openSync(destination, 'wx', 0o600)
  let age
  try { age = launch('age', ['--encrypt', '--recipient', config.recipient], config.base, ['pipe', output, 'pipe']) }
  finally { fs.closeSync(output) }
  const toc = launch('pg_restore', options.validateFullArchive ? ['--file=-'] : ['--list'], config.base, ['pipe', 'ignore', 'pipe'])
  let tocClosed = false
  toc.p.stdin.on('error', () => { tocClosed = true })
  age.p.stdin.on('error', () => {})
  try {
    for await (const bytes of dump.p.stdout) {
      if (age.p.stdin.destroyed) throw Error('ENCRYPTION_PIPE_CLOSED')
      if (!age.p.stdin.write(bytes)) await once(age.p.stdin, 'drain')
      if (!tocClosed && !toc.p.stdin.destroyed) {
        if (!toc.p.stdin.write(bytes) && options.validateFullArchive) await once(toc.p.stdin, 'drain')
      }
    }
    age.p.stdin.end()
    if (!toc.p.stdin.destroyed) toc.p.stdin.end()
    const codes = await Promise.all([dump.finished, age.finished, toc.finished])
    if (codes.some(code => code !== 0)) throw Object.assign(Error('DUMP_ENCRYPTION_OR_TOC_VALIDATION_FAILED'), {
      code: codes[0] !== 0 ? 'PG_DUMP_FAILED' : codes[1] !== 0 ? 'AGE_ENCRYPTION_FAILED' : 'ARCHIVE_VALIDATION_FAILED',
    })
  } finally {
    for (const tool of [dump, age, toc]) if (tool.p.exitCode === null) tool.p.kill()
  }
}

export { child as spawnBackupTool }
