import { smsConfig } from './sms.js'

const SMSLENZ_ACCOUNT_STATUS_URL = 'https://smslenz.lk/api/account-status'
const CACHE_TTL_MS = 60_000
const REQUEST_TIMEOUT_MS = 8_000

let cachedBalance = null
let pendingRequest = null

export class SmsLenzBalanceError extends Error {
  constructor(message, status = 502, kind = 'provider_error') {
    super(message)
    this.name = 'SmsLenzBalanceError'
    this.status = status
    this.kind = kind
  }
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function mapAccountStatus(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const balance = numberValue(data.sms_credit_balance)
  if (balance === null) return null
  const allocations = Array.isArray(data.sender_id_balances)
    ? data.sender_id_balances.map((item) => ({
      sender_id: typeof item?.sender_id === 'string' ? item.sender_id : '',
      allocated_balance: numberValue(item?.allocated_balance),
      active: Boolean(item?.active),
    })).filter((item) => item.sender_id && item.allocated_balance !== null)
    : []
  return {
    status: typeof data.status === 'string' ? data.status : 'unknown',
    sms_credit_balance: balance,
    allocated_credit_total: numberValue(data.allocated_credit_total),
    sender_id_balances: allocations,
  }
}

export async function getSmsLenzBalance({
  provider,
  userId,
  apiKey,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const sms = smsConfig()
  provider ??= sms.provider
  userId ??= sms.userId
  apiKey ??= sms.apiKey
  const requestedAt = now()
  if ((provider || '').toLowerCase() !== 'smslenz') throw new SmsLenzBalanceError('SMSLenz balance is unavailable for the configured SMS provider.', 503, 'provider_not_smslenz')
  if (cachedBalance && cachedBalance.expiresAt > requestedAt) return cachedBalance.value
  if (pendingRequest) return pendingRequest
  if (!userId || !apiKey) throw new SmsLenzBalanceError('SMS balance is not configured.', 503, 'not_configured')
  if (typeof fetchImpl !== 'function') throw new SmsLenzBalanceError('SMS balance provider is unavailable.', 503, 'fetch_unavailable')

  pendingRequest = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let response
      try {
        response = await fetchImpl(SMSLENZ_ACCOUNT_STATUS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ user_id: userId, api_key: apiKey }),
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          throw new SmsLenzBalanceError('SMS balance request timed out. Please retry shortly.', 504, 'timeout')
        }
        throw new SmsLenzBalanceError('Unable to reach the SMS balance provider. Please retry shortly.', 502, 'network_error')
      }

      let payload
      try {
        payload = await response.json()
      } catch {
        throw new SmsLenzBalanceError('The SMS balance provider returned an unreadable response.', 502, 'invalid_json')
      }
      if (!response.ok || payload?.success !== true) {
        throw new SmsLenzBalanceError('Unable to retrieve the SMS balance. Please retry shortly.', 502, 'provider_rejected')
      }
      const balance = mapAccountStatus(payload.data)
      if (!balance) throw new SmsLenzBalanceError('The SMS balance provider returned incomplete data.', 502, 'invalid_data')

      const value = { ...balance, updated_at: new Date(now()).toISOString() }
      cachedBalance = { value, expiresAt: now() + CACHE_TTL_MS }
      return value
    } finally {
      clearTimeout(timeout)
    }
  })()

  try {
    return await pendingRequest
  } finally {
    pendingRequest = null
  }
}

export function clearSmsLenzBalanceCache() {
  cachedBalance = null
  pendingRequest = null
}
