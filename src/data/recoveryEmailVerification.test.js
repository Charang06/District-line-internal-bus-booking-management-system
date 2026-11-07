import test from 'node:test'
import assert from 'node:assert/strict'
import { takeRecoveryEmailVerificationEntry } from './recoveryEmailVerification.js'

test('verification token is removed from URL and retained only by the caller', () => {
  const calls = [], token = 'a'.repeat(43)
  const result = takeRecoveryEmailVerificationEntry({ hash: `#verify-recovery-email?token=${token}`, pathname: '/', search: '?view=profile' }, { state: null, replaceState: (...args) => calls.push(args) })
  assert.equal(result.token, token); assert.deepEqual(calls, [[null, '', '/?view=profile']])
})
test('existing login, password and username recovery routes are untouched', () => {
  for (const hash of ['', '#reset-password?token=x', '#recover-username?token=x', '#verify-recovery-email-other']) {
    assert.equal(takeRecoveryEmailVerificationEntry({ hash }, { replaceState: () => assert.fail('Existing route changed') }), null)
  }
})
test('malformed, missing and duplicate tokens are stripped but never accepted', () => {
  for (const hash of ['#verify-recovery-email', '#verify-recovery-email?token=bad', `#verify-recovery-email?token=${'a'.repeat(43)}&token=${'b'.repeat(43)}`]) {
    let stripped = false
    assert.equal(takeRecoveryEmailVerificationEntry({ hash, pathname: '/', search: '' }, { replaceState: () => { stripped = true } }).token, '')
    assert.equal(stripped, true)
  }
})
