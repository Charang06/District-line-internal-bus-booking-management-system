import { useEffect, useRef, useState } from 'react'
import { api, assetUrl } from '../api'
import './AdminProfile.css'

function ProfileIcon({ name, ...props }) {
  const paths = {
    close: <path d="m6 6 12 12M6 18 18 6" />,
    camera: <><path d="M4 7h4l2-3h4l2 3h4v13H4z" /><circle cx="12" cy="13" r="4" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M10 5h2c6 0 10 7 10 7a18 18 0 0 1-3 4M6 6a20 20 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4" /></>,
    edit: <><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

function useProfileDialog(dialogRef, titleRef, lockScroll = true) {
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    if (!dialog.open) dialog.showModal()
    if (lockScroll) document.body.style.overflow = 'hidden'
    titleRef.current?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    const resize = () => {
      const height = viewport?.height || window.innerHeight
      dialog.style.setProperty('--profile-viewport-height', `${height}px`)
      dialog.style.setProperty('--profile-viewport-offset', `${viewport?.offsetTop || 0}px`)
      dialog.classList.toggle('profile-compact-viewport', height < 560)
    }
    resize()
    const trapFocus = event => {
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"]), a[href]')]
        .filter(element => element.getClientRects().length && !element.closest('[hidden]'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    dialog.addEventListener('keydown', trapFocus)
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
      dialog.removeEventListener('keydown', trapFocus)
      if (dialog.open) dialog.close()
      if (lockScroll) document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [dialogRef, titleRef, lockScroll])
}

function PasswordField({ id, label, value, onChange, autoComplete, disabled, minLength }) {
  const [visible, setVisible] = useState(false)
  return <label className="profile-field" htmlFor={id}>
    <span>{label}</span>
    <span className="profile-password-input">
      <input id={id} required type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} disabled={disabled} minLength={minLength} />
      <button type="button" className="profile-eye" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(previous => !previous)} disabled={disabled}><ProfileIcon name={visible ? 'hidden' : 'eye'} /></button>
    </span>
  </label>
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Choose a profile photo.')); return }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { reject(new Error('Use a JPEG, PNG, WebP, or GIF image.')); return }
    if (file.size > 2 * 1024 * 1024) { reject(new Error('Profile photo must be 2 MB or smaller.')); return }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}

function ChangeUsernameDialog({ username, busy, feedback, onSubmit, onClose, clearFeedback }) {
  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const [newUsername, setNewUsername] = useState('')
  const [password, setPassword] = useState('')
  useProfileDialog(dialogRef, titleRef, false)
  return <dialog ref={dialogRef} className="cintex-admin-profile profile-username-dialog no-print" aria-labelledby="profile-username-title" aria-describedby="profile-username-description" aria-busy={Boolean(busy)} onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() } }} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() }}>
    <header className="profile-modal-header">
      <div><h2 id="profile-username-title" ref={titleRef} tabIndex={-1}>Change Username</h2><p id="profile-username-description">Confirm your password to update your sign-in name.</p></div>
      <button type="button" className="profile-close" onClick={onClose} disabled={Boolean(busy)} aria-label="Close Change Username"><ProfileIcon name="close" /></button>
    </header>
    <form className="profile-username-form" onSubmit={event => { event.preventDefault(); onSubmit(newUsername, password) }}>
      <div className="profile-scroll-area">
        {feedback?.isError && <div className="profile-feedback error" role="alert" id="profile-username-error">{feedback.text}</div>}
        <label className="profile-field" htmlFor="profile-current-username"><span>Current Username</span><input id="profile-current-username" value={username || ''} readOnly autoComplete="username" /></label>
        <label className="profile-field" htmlFor="profile-new-username"><span>New Username</span><input id="profile-new-username" required value={newUsername} onChange={event => { setNewUsername(event.target.value); clearFeedback() }} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={Boolean(busy)} aria-describedby="profile-username-rules" /><small id="profile-username-rules">4–30 letters, numbers, underscores or periods. Usernames are case-sensitive.</small></label>
        <PasswordField id="profile-username-password" label="Current Password" value={password} onChange={event => { setPassword(event.target.value); clearFeedback() }} autoComplete="current-password" disabled={Boolean(busy)} />
        <p className="profile-help">Your account, bookings and permissions stay linked to the same user ID.</p>
      </div>
      <footer className="profile-modal-footer profile-dialog-actions">
        <button type="button" className="profile-button secondary" disabled={Boolean(busy)} onClick={onClose}>Cancel</button>
        <button type="submit" className="profile-button primary" disabled={Boolean(busy)}>{busy ? 'Updating…' : 'Update Username'}</button>
      </footer>
    </form>
  </dialog>
}

export default function AdminProfile({ token, user, onUserUpdate, onClose, showMessage }) {
  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const fileRef = useRef(null)
  const contentRef = useRef(null)
  const busyRef = useRef(false)
  const [tab, setTab] = useState('account')
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [savedName, setSavedName] = useState(user?.fullName || '')
  const [recoveryEmail, setRecoveryEmail] = useState(user?.recoveryEmail || '')
  const [savedEmail, setSavedEmail] = useState(user?.recoveryEmail || '')
  const verificationEnabled = import.meta.env.VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION === 'true'
  const [verification, setVerification] = useState(null)
  const [verificationError, setVerificationError] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const verificationVersion = useRef(0)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [usernameOpen, setUsernameOpen] = useState(false)
  const [failedPhoto, setFailedPhoto] = useState('')
  useProfileDialog(dialogRef, titleRef)

  const normalizeEmail = value => value.trim().toLowerCase()
  const nameDirty = fullName.trim() !== savedName
  const emailDirty = normalizeEmail(recoveryEmail) !== normalizeEmail(savedEmail)
  const emailVerified = !emailDirty && verification?.email === savedEmail && verification?.verified === true
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  const dirty = nameDirty || emailDirty || Boolean(currentPassword || newPassword || confirmPassword)
  const roleLabel = user?.role === 'admin' ? 'Administrator' : user?.role || 'Account'
  const initials = (user?.fullName || 'Admin').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  const tabs = [{ id: 'account', label: 'Account Details', icon: 'account' }, { id: 'security', label: 'Security', icon: 'shield' }, { id: 'recovery', label: 'Recovery', icon: 'mail' }]

  useEffect(() => {
    if (!verificationEnabled || tab !== 'recovery') return
    let active = true
    const refresh = async () => {
      const version = ++verificationVersion.current
      try {
        const result = await api.recoveryEmailVerificationStatus()
        if (!active || version !== verificationVersion.current) return
        setVerification(result); setVerificationError('')
        setCooldownUntil(Date.now() + (result.retryAfter || 0) * 1000); setNow(Date.now())
      } catch (error) {
        if (active && version === verificationVersion.current) { setVerification(null); setVerificationError(error.message || 'Verification status unavailable.') }
      }
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [verificationEnabled, tab, savedEmail])
  useEffect(() => {
    if (!cooldownUntil) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [cooldownUntil])

  const notify = (text, isError = false) => {
    setFeedback({ text, isError })
    showMessage?.(text, isError)
  }
  const runAction = async (action, operation) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(action)
    setFeedback(null)
    try { await operation() } catch (error) { notify(error.message || 'Could not save your changes. Please try again.', true) }
    finally { busyRef.current = false; setBusy('') }
  }
  const close = () => {
    if (busyRef.current) return
    if (dirty && !window.confirm('Discard your unsaved profile changes?')) return
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    dialogRef.current?.close()
    onClose()
  }
  const saveProfile = event => {
    event.preventDefault()
    runAction('profile', async () => {
      const data = await api.updateProfile(token, { fullName: fullName.trim() })
      onUserUpdate(data.user)
      setFullName(data.user.fullName); setSavedName(data.user.fullName)
      notify('Profile name saved.')
    })
  }
  const savePhoto = file => runAction('photo', async () => {
    const image = await readImageFile(file)
    const data = await api.uploadProfilePhoto(token, image)
    onUserUpdate(data.user)
    notify('Profile photo updated.')
  })
  const saveEmail = event => {
    event.preventDefault()
    runAction('recovery', async () => {
      const email = normalizeEmail(recoveryEmail)
      const data = await api.updateRecoveryEmail(token, email)
      verificationVersion.current++
      setVerification(null); setVerificationError(''); setCooldownUntil(0)
      onUserUpdate({ ...user, recoveryEmail: email })
      setRecoveryEmail(email); setSavedEmail(email)
      notify(data.message || 'Recovery email saved.')
    })
  }
  const requestVerification = () => runAction('verification', async () => {
    if (emailDirty || !savedEmail || cooldown) return
    try {
      const result = await api.requestRecoveryEmailVerification()
      notify(result.message)
      setCooldownUntil(Date.now() + (result.retryAfter || 0) * 1000); setNow(Date.now())
      // Sending an email never marks it verified. Fetch authoritative status.
      const version = ++verificationVersion.current
      const state = await api.recoveryEmailVerificationStatus()
      if (version === verificationVersion.current) { setVerification(state); setVerificationError('') }
    } catch (error) {
      if (error.data?.retryAfter) { setCooldownUntil(Date.now() + error.data.retryAfter * 1000); setNow(Date.now()) }
      throw error
    }
  })
  const savePassword = event => {
    event.preventDefault()
    if (newPassword !== confirmPassword) { notify('New password and confirmation do not match.', true); return }
    runAction('password', async () => {
      await api.changePassword(token, { currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      notify('Password updated.')
    })
  }
  const saveUsername = (draft, password) => {
    const newUsername = draft.trim()
    if (!/^[A-Za-z0-9._]{4,30}$/.test(newUsername)) { notify('Use 4–30 letters, numbers, underscores or periods.', true); return }
    if (newUsername === user?.username) { notify('Choose a username different from your current username.', true); return }
    if (!password) { notify('Enter your current password.', true); return }
    runAction('username', async () => {
      const data = await api.changeUsername(token, { newUsername, currentPassword: password })
      onUserUpdate(data.user)
      setUsernameOpen(false)
      notify(data.message || 'Username updated. Use your new username the next time you sign in.')
    })
  }
  const changeTab = next => {
    if (busyRef.current) return
    setTab(next)
    if (contentRef.current) contentRef.current.scrollTop = 0
  }
  const tabKeys = event => {
    const index = tabs.findIndex(item => item.id === tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null || busyRef.current) return
    event.preventDefault()
    changeTab(tabs[next].id)
    dialogRef.current.querySelector(`#profile-tab-${tabs[next].id}`)?.focus()
  }

  return <>
    <dialog ref={dialogRef} className="cintex-admin-profile no-print" aria-labelledby="admin-profile-title" aria-describedby="admin-profile-subtitle" aria-busy={Boolean(busy)} onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }} onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); close() }}>
      <header className="profile-modal-header">
        <div><span className="profile-eyebrow">DISTRICT LINE · ACCOUNT SETTINGS</span><h2 id="admin-profile-title" ref={titleRef} tabIndex={-1}>Admin Profile</h2><p id="admin-profile-subtitle">View and manage your account details</p></div>
        <button type="button" className="profile-close" aria-label="Close Admin Profile" onClick={close} disabled={Boolean(busy)}><ProfileIcon name="close" /></button>
      </header>
      <div className="profile-identity">
        <button type="button" className="profile-photo-button" aria-label="Change profile photo" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
          {user?.profilePhoto && failedPhoto !== user.profilePhoto ? <img src={assetUrl(user.profilePhoto)} alt={`${user.fullName || 'Admin'} profile photo`} onError={() => setFailedPhoto(user.profilePhoto)} /> : <span className="profile-initials">{initials}</span>}
          <span className="profile-camera"><ProfileIcon name="camera" /></span>
        </button>
        <div className="profile-identity-text"><strong>{user?.fullName || 'Administrator'}</strong><span className="profile-identity-username">@{user?.username}</span><span className="profile-role"><ProfileIcon name="shield" />{roleLabel}</span></div>
        <button type="button" className="profile-button secondary profile-photo-action" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}><ProfileIcon name="camera" />{busy === 'photo' ? 'Uploading…' : 'Change Photo'}</button>
        <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Upload profile photo" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) savePhoto(file) }} />
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Profile settings" onKeyDown={tabKeys}>
        {tabs.map(item => <button key={item.id} type="button" role="tab" id={`profile-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`profile-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} disabled={Boolean(busy)} onClick={() => changeTab(item.id)}><ProfileIcon name={item.icon} />{item.label}</button>)}
      </div>
      <div className="profile-scroll-area" ref={contentRef}>
        {feedback && !usernameOpen && <div className={`profile-feedback ${feedback.isError ? 'error' : 'success'}`} role={feedback.isError ? 'alert' : 'status'}>{feedback.text}</div>}
        <section role="tabpanel" id="profile-panel-account" aria-labelledby="profile-tab-account" hidden={tab !== 'account'} tabIndex={0}>
          <div className="profile-section-heading"><h3>Account details</h3><p>Keep your personal details up to date.</p></div>
          <form className="profile-form" onSubmit={saveProfile}>
            <label className="profile-field" htmlFor="profile-display-name"><span>Display Name</span><input id="profile-display-name" required minLength={2} maxLength={80} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} disabled={Boolean(busy)} /></label>
            <div className="profile-username-row"><label className="profile-field" htmlFor="profile-account-username"><span>Current Username</span><input id="profile-account-username" value={user?.username || ''} readOnly autoComplete="username" /></label><button type="button" className="profile-button secondary" onClick={() => { setFeedback(null); setUsernameOpen(true) }} disabled={Boolean(busy)}><ProfileIcon name="edit" />Change Username</button></div>
            <p className="profile-help">Your username is used to sign in. Changing it requires your current password.</p>
            <div className="profile-form-actions"><button type="submit" className="profile-button primary" disabled={Boolean(busy) || !nameDirty}>{busy === 'profile' ? 'Saving…' : 'Save Profile'}</button></div>
          </form>
        </section>
        <section role="tabpanel" id="profile-panel-security" aria-labelledby="profile-tab-security" hidden={tab !== 'security'} tabIndex={0}>
          <div className="profile-section-heading"><h3>Password & security</h3><p>Choose a strong password you do not use elsewhere.</p></div>
          <form className="profile-form" onSubmit={savePassword}>
            <PasswordField id="profile-current-password" label="Current Password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" disabled={Boolean(busy)} />
            <div className="profile-password-grid"><PasswordField id="profile-new-password" label="New Password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} disabled={Boolean(busy)} /><PasswordField id="profile-confirm-password" label="Confirm New Password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} disabled={Boolean(busy)} /></div>
            <p className="profile-help">Use at least 12 characters. Updating your password signs out other sessions and refreshes this session.</p>
            <div className="profile-form-actions"><button type="submit" className="profile-button primary" disabled={Boolean(busy)}>{busy === 'password' ? 'Updating…' : 'Update Password'}</button></div>
          </form>
        </section>
        <section role="tabpanel" id="profile-panel-recovery" aria-labelledby="profile-tab-recovery" hidden={tab !== 'recovery'} tabIndex={0}>
          <div className="profile-section-heading"><h3>Account recovery</h3><p>Manage the email used for administrator account recovery.</p></div>
          <form className="profile-form" onSubmit={saveEmail}>
            <label className="profile-field" htmlFor="profile-recovery-email"><span>Recovery Email</span><input id="profile-recovery-email" type="email" autoComplete="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} disabled={Boolean(busy)} /></label>
            <div className={`profile-verification${emailVerified ? ' verified' : ''}`} aria-live="polite"><ProfileIcon name={emailVerified ? 'check' : 'mail'} /><div><strong>{emailVerified ? 'Email verified' : savedEmail ? 'Email ownership not verified' : 'No recovery email registered'}</strong><p>{!savedEmail ? 'Add an email address you can access to use account recovery.' : !verificationEnabled ? 'Email verification is not enabled.' : verificationError || (emailDirty ? 'Save your changed email before requesting verification.' : 'Verification applies to your registered recovery email. Changing it requires a new verification.')}</p></div></div>
            {verificationEnabled && savedEmail && !emailVerified && <div className="profile-verification-actions"><button type="button" className="profile-button primary" disabled={Boolean(busy) || emailDirty || cooldown > 0 || !verification || verification.email !== savedEmail || Boolean(verificationError)} onClick={requestVerification}>{busy === 'verification' ? 'Sending…' : cooldown ? `Resend in ${cooldown}s` : cooldownUntil ? 'Resend Verification Email' : 'Send Verification Email'}</button></div>}
            <p className="profile-help">Changing this email invalidates outstanding recovery links. Staff password resets remain administrator-managed.</p>
            <div className="profile-form-actions"><button type="submit" className="profile-button primary" disabled={Boolean(busy) || !emailDirty}>{busy === 'recovery' ? 'Saving…' : 'Change Recovery Email'}</button></div>
          </form>
        </section>
      </div>
      <footer className="profile-modal-footer"><span className={dirty ? 'profile-unsaved' : 'profile-footer-note'}>{busy ? 'Saving your changes…' : dirty ? 'You have unsaved changes' : 'District Line account settings'}</span><button type="button" className="profile-button secondary" disabled={Boolean(busy)} onClick={close}>Close</button></footer>
    </dialog>
    {usernameOpen && <ChangeUsernameDialog username={user?.username} busy={busy} feedback={feedback} onSubmit={saveUsername} onClose={() => { if (!busyRef.current) { setUsernameOpen(false); setFeedback(null) } }} clearFeedback={() => setFeedback(null)} />}
  </>
}
