import { useState } from 'react'
import { api } from '../api'

export default function UsernameRecoveryForm({ initialToken = '', onBack }) {
  const [email, setEmail] = useState('')
  const [recoveryToken, setRecoveryToken] = useState(initialToken)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setMessage('')
    setError('')
    try {
      if (recoveryToken) {
        const result = await api.confirmAdminUsernameRecovery({ token: recoveryToken })
        setUsername(result.username)
        setRecoveryToken('')
      } else {
        const result = await api.requestAdminUsernameRecovery({ email })
        setMessage(result.message)
      }
    } catch (err) {
      setError(err.message || 'Could not complete username recovery.')
    } finally { setLoading(false) }
  }

  return <form className="auth-form" onSubmit={submit}>
    {username ? <div className="banner success" role="status">
      Your administrator username: <strong>{username}</strong>. Return to sign in and use your existing password.
    </div> : <>
      {recoveryToken ? <p className="login-recovery-note">Select “Show my username” to use this one-time link. This does not sign you in or change your password.</p> : <>
        <label htmlFor="username-recovery-email">Registered administrator recovery email</label>
        <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">@</span><input id="username-recovery-email" required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <p className="login-recovery-note">Administrator accounts only. Staff should contact their administrator.</p>
      </>}
      {message && <div className="banner success" role="status">{message}</div>}
      {error && <div className="banner error" role="alert">{error}</div>}
      <button type="submit" className="primary-button wide login-submit" disabled={loading}>{loading ? 'Please wait…' : recoveryToken ? 'Show my username' : 'Send recovery link'}</button>
      {recoveryToken && <button type="button" className="recovery-link" disabled={loading} onClick={() => { setRecoveryToken(''); setError(''); setMessage('') }}>Request a new link</button>}
    </>}
    <button type="button" className="recovery-back" disabled={loading} onClick={onBack}>Back to sign in</button>
  </form>
}
