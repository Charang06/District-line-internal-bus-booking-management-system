import { useRef, useState } from 'react'
import { api } from '../api'
import './RecoveryEmailVerification.css'

export default function RecoveryEmailVerification({ initialToken, enabled }) {
  const token = useRef(initialToken)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const confirm = async event => {
    event.preventDefault()
    if (!enabled || !token.current || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      await api.confirmRecoveryEmailVerification(token.current)
      token.current = ''; setVerified(true)
      if (typeof BroadcastChannel === 'function') {
        const channel = new BroadcastChannel('recovery-email-verification')
        channel.postMessage('confirmed')
        channel.close()
      }
    } catch (failure) { setError(failure.message || 'Could not verify the recovery email. Please try again.') }
    finally { submitting.current = false; setBusy(false) }
  }
  return <main className="recovery-email-page">
    <section className="recovery-email-card" aria-labelledby="recovery-email-title">
      <p className="recovery-email-brand">DISTRICT LINE</p>
      <h1 id="recovery-email-title">Recovery email verification</h1>
      {verified ? <p className="recovery-email-success" role="status"><span aria-hidden="true">✓ </span>Email verified</p>
        : !enabled ? <p role="status">Recovery email verification is not enabled yet.</p>
          : !initialToken ? <p role="alert">This verification link is invalid. Request a new link from Admin Profile → Recovery.</p>
            : <form onSubmit={confirm}>
              <p>Confirm ownership of your registered administrator recovery email. This link expires after 20 minutes and can be used once.</p>
              {error && <p className="recovery-email-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Confirm recovery email'}</button>
            </form>}
      <p>Return to Admin Profile → Recovery to check your current verification status.</p>
      <button type="button" className="recovery-email-back" disabled={busy} onClick={() => window.location.replace(`${window.location.pathname}${window.location.search}`)}>Return to District Line</button>
    </section>
  </main>
}
