// A missed run is detected externally. Send success only AFTER upload/read-back.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export function monitorConfiguration(env) {
  const urls = ['BACKUP_SUCCESS_PING_URL','BACKUP_FAILURE_PING_URL'].map(name => {
    const url = new URL(env[name])
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Unsafe monitor configuration')
    return url.href
  })
  if (urls[0] === urls[1]) throw Error('Failure must not signal backup success')
  return { success:urls[0], failure:urls[1] }
}
export async function heartbeat(raw, send = fetch) {
  if (!raw) throw Error('Independent backup monitor must be configured')
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Unsafe monitor URL')
  const response = await send(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), body: '' })
  if (!response.ok) throw Error('Backup monitor rejected success')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    const config=monitorConfiguration(process.env)
    if(process.argv.includes('--preflight'))return
    return heartbeat(process.argv.includes('--failure')?config.failure:config.success)
  }).catch(() => {
    console.error('Backup monitor notification failed. No endpoint details logged.')
    process.exitCode = 1
  })
}
