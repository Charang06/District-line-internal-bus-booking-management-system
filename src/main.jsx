import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RecoveryEmailVerification from './components/RecoveryEmailVerification.jsx'
import { takeRecoveryEmailVerificationEntry } from './data/recoveryEmailVerification.js'

const verificationEntry = takeRecoveryEmailVerificationEntry(window.location, window.history)
if (verificationEntry) {
  const policy = document.createElement('meta')
  policy.name = 'referrer'; policy.content = 'no-referrer'; document.head.appendChild(policy)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {verificationEntry ? <RecoveryEmailVerification initialToken={verificationEntry.token} enabled={import.meta.env.VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION === 'true'} /> : <App />}
  </StrictMode>,
)
