import test from 'node:test'
import assert from 'node:assert/strict'
import { heartbeat, monitorConfiguration } from './heartbeat.mjs'
test('missed-backup monitor requires HTTPS, suppresses redirects and fails if delivery fails', async () => {
  for (const url of [undefined,'http://example.test','https://user:secret@example.test']) await assert.rejects(heartbeat(url))
  await heartbeat('https://example.test/private-token', async (url,options) => {
    assert.equal(options.redirect,'error'); assert.equal(options.body,''); return { ok:true }
  })
  await assert.rejects(heartbeat('https://example.test',async()=>({ok:false})))
})
test('monitor preflight requires independent success/failure endpoints and rejects accidental success on failure',()=>{
  const env={BACKUP_SUCCESS_PING_URL:'https://monitor.example.test/private-id',BACKUP_FAILURE_PING_URL:'https://monitor.example.test/private-id/fail'}
  assert.equal(monitorConfiguration(env).failure,env.BACKUP_FAILURE_PING_URL)
  for(const overrides of [{BACKUP_FAILURE_PING_URL:undefined},{BACKUP_FAILURE_PING_URL:env.BACKUP_SUCCESS_PING_URL},{BACKUP_SUCCESS_PING_URL:'http://monitor.example.test'}])
    assert.throws(()=>monitorConfiguration({...env,...overrides}))
})
