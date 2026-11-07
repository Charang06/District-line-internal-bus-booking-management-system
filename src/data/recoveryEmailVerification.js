// Tokens stay in transient memory. Other existing hash routes are untouched.
export function takeRecoveryEmailVerificationEntry(location, history) {
  if (!/^#verify-recovery-email(?:\?|$)/.test(location.hash)) return null
  const fragment = location.hash
  history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  const params = new URLSearchParams(fragment.split('?')[1] || '')
  const token = params.get('token') || ''
  return { token: fragment.length <= 4000 && params.getAll('token').length === 1 && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '' }
}
