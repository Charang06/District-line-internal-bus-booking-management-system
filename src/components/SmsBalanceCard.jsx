import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

const creditFormatter = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 2 })
const formatCredits = (value) => creditFormatter.format(value)

function sameBalance(current, incoming) {
  return Boolean(current && incoming
    && current.updated_at === incoming.updated_at
    && current.status === incoming.status
    && current.sms_credit_balance === incoming.sms_credit_balance
    && current.allocated_credit_total === incoming.allocated_credit_total
    && current.sender_id_balances.length === incoming.sender_id_balances.length
    && current.sender_id_balances.every((sender, index) => {
      const next = incoming.sender_id_balances[index]
      return sender.sender_id === next.sender_id
        && sender.allocated_balance === next.allocated_balance
        && sender.active === next.active
    }))
}

export default function SmsBalanceCard({ token }) {
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const requestActive = useRef(false)
  const balanceRef = useRef(null)
  const lastAutomaticRequestAt = useRef(0)

  const refresh = useCallback(async (automatic = false) => {
    if (!token || requestActive.current) return
    const now = Date.now()
    if (automatic && now - lastAutomaticRequestAt.current < 3_000) return
    if (automatic) lastAutomaticRequestAt.current = now
    requestActive.current = true
    if (balanceRef.current) setRefreshing(true)
    else setLoading(true)
    try {
      const latest = await api.smsLenzBalance(token)
      balanceRef.current = latest
      setBalance((current) => sameBalance(current, latest) ? current : latest)
      setError('')
    } catch (requestError) {
      setError(balanceRef.current
        ? 'Unable to refresh — showing last updated balance.'
        : requestError.message || 'Unable to retrieve the SMS balance.')
    } finally {
      requestActive.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    const initialFetch = setTimeout(() => { void refresh(true) }, 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true)
    }, 60_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearTimeout(initialFetch)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh, token])

  return <section className="content-card sms-balance-card" aria-labelledby="sms-balance-title">
    <div className="sms-balance-heading">
      <div className="sms-balance-title-wrap">
        <span className="sms-balance-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2 1.3-4.1A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11.5h.01M12.5 11.5h.01M17 11.5h.01" /></svg></span>
        <div><h2 id="sms-balance-title">SMS Credit Balance</h2><p>Live account balance and sender ID allocations</p></div>
      </div>
      <button type="button" className="sms-balance-refresh" onClick={refresh} disabled={!token || loading || refreshing} aria-label="Refresh SMS balance" title="Refresh SMS balance">
        <svg className={refreshing ? 'spinning' : ''} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4.8 9A7.5 7.5 0 0 1 18 6l2 2M4 17v-5h5m10.2 3A7.5 7.5 0 0 1 6 18l-2-2" /></svg>
        <span>{loading ? 'Loading' : refreshing ? 'Refreshing' : 'Refresh'}</span>
      </button>
    </div>
    {loading && !balance ? <div className="sms-balance-skeleton" role="status" aria-label="Loading SMS balance"><span /><span /><small>Loading balance…</small></div> : balance ? <>
      <div className="sms-balance-main">
        <span>Available SMS credits</span>
        <strong>{formatCredits(balance.sms_credit_balance)} <small>credits</small></strong>
        <small>Account status: {balance.status}</small>
      </div>
      <div className="sms-balance-meta">
        {balance.allocated_credit_total !== null && <span>Allocated across sender IDs: {formatCredits(balance.allocated_credit_total)}</span>}
        {balance.sender_id_balances.length > 0 && <ul aria-label="Sender ID credit allocations">
          {balance.sender_id_balances.map((sender) => <li key={sender.sender_id}><span>{sender.sender_id}{sender.active ? '' : ' (inactive)'}</span><strong>{formatCredits(sender.allocated_balance)}</strong></li>)}
        </ul>}
        <small>Last updated {new Date(balance.updated_at).toLocaleString()}</small>
      </div>
    </> : <p className="sms-balance-message" role="status">Balance is not available. Use Refresh to retry.</p>}
    {error && <p className={balance ? 'sms-balance-warning' : 'sms-balance-error'} role={balance ? 'status' : 'alert'}>{error}</p>}
    {refreshing && balance && <span className="sms-balance-refreshing" role="status">Updating balance…</span>}
  </section>
}
