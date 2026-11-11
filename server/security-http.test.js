import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
test('actual HTTP routes require MFA before admin session and preserve staff/password behavior with mocked database', () => {
  const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./test-support/security-local-worker.mjs',import.meta.url))],{encoding:'utf8',timeout:20000,windowsHide:true})
  assert.equal(result.status,0,result.stderr + result.stdout)
  assert.match(result.stdout,/SECURITY_HTTP_MOCK_PASS/)
})
test('password recovery preserves privacy, expires tokens, revokes sessions and never bypasses MFA using mocked database/email',()=>{
  const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./test-support/password-recovery-local-worker.mjs',import.meta.url))],{encoding:'utf8',timeout:20000,windowsHide:true})
  assert.equal(result.status,0,result.stderr+result.stdout)
  assert.match(result.stdout,/PASSWORD_RECOVERY_HTTP_MOCK_PASS/)
})
test('actual startup initializer is read-only for ready and missing databases with mocked resources',()=>{
  const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./test-support/startup-local-worker.mjs',import.meta.url))],{encoding:'utf8',timeout:20000,windowsHide:true})
  assert.equal(result.status,0,result.stderr+result.stdout)
  assert.match(result.stdout,/STARTUP_READONLY_MOCK_PASS/)
})
