import { useState } from 'react'
import { api } from '../api'

export default function AdminMfaEnrollment() {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState(null)
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [replaceCodes, setReplaceCodes] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (replaceCodes) {
        const result = await api.replaceMfaRecoveryCodes({ password, code })
        setPassword(''); setCode(''); setReplaceCodes(false); setRecoveryCodes(result.recoveryCodes)
      } else if (!setup) {
        const result = await api.enrollAdminMfa({ password })
        setPassword(''); setSetup(result)
      } else {
        const result = await api.confirmAdminMfa({ code })
        setSetup(null); setCode(''); setRecoveryCodes(result.recoveryCodes)
      }
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section className="profile-card">
    <div className="profile-section-heading"><h3>Administrator authenticator</h3></div>
    {recoveryCodes ? <div>
      <p>Your authenticator is enrolled. All existing sessions have been revoked. Save these single-use recovery codes offline before signing in again. They are shown once.</p>
      <ul>{recoveryCodes.map(value => <li key={value}><code style={{ overflowWrap: 'anywhere' }}>{value}</code></li>)}</ul>
      <button type="button" className="profile-button secondary" onClick={() => setRecoveryCodes(null)}>I saved my recovery codes</button>
    </div> : <form className="profile-form" onSubmit={submit}>
      {(!setup || replaceCodes) && <>
        <label htmlFor="mfa-enroll-password">Confirm current password</label>
        <input id="mfa-enroll-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} />
      </>}
      {setup && <>
        <p>In your authenticator, add a time-based account named District Line and enter this setup key. Keep the key private.</p>
        <p><code style={{ overflowWrap: 'anywhere' }}>{setup.secret}</code></p>
      </>}
      {(setup || replaceCodes) && <>
        <label htmlFor="mfa-enroll-code">Six-digit authenticator code</label>
        <input id="mfa-enroll-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} />
      </>}
      <button type="submit" className="profile-button primary" disabled={busy}>{busy ? 'Please wait…' : replaceCodes ? 'Replace recovery codes' : setup ? 'Verify enrollment' : 'Set up authenticator'}</button>
      {!setup && <button type="button" className="profile-button secondary" disabled={busy} onClick={() => { setReplaceCodes(value => !value); setCode(''); setPassword(''); setError('') }}>{replaceCodes ? 'Back to enrollment' : 'Replace saved recovery codes'}</button>}
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>
}
