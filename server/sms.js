/**
 * SmsLenz SMS gateway adapter. Credentials stay on the server.
 * Configure SMS_PROVIDER, SMS_USER_ID, SMS_API_KEY and SMS_SENDER_ID in .env.
 */
export function smsConfig() {
  const provider = (process.env.SMS_PROVIDER || 'pending').toLowerCase()
  const userId = process.env.SMS_USER_ID || ''
  const apiKey = process.env.SMS_API_KEY || ''
  const senderId = process.env.SMS_SENDER_ID || ''
  const hotline = process.env.SMS_HOTLINE || '0779040300'
  const configured = provider === 'smslenz' && Boolean(userId) && Boolean(apiKey) && Boolean(senderId)
  return { provider, userId, apiKey, senderId, hotline, configured }
}

export function buildConfirmationMessage(booking, bookings = [booking], hotline = smsConfig().hotline) {
  const amount = bookings.reduce((total, item) => total + Number(item.fare || 0), 0)
  const seats = bookings.map((item) => item.seat_number).join(', ')
  const routeOrigin = booking.boarding_point || booking.origin
  const routeDestination = booking.destination
  const date = new Date(`${booking.travel_date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  return [
    'DISTRICT LINE',
    '',
    'Your seat booking is confirmed!',
    '',
    `Route: ${routeOrigin} to ${routeDestination}`,
    `Date: ${date}`,
    `Departure: ${booking.departure_time}`,
    `Bus No: ${booking.registration_no}`,
    `Seat No: ${seats}`,
    `Amount: Rs. ${new Intl.NumberFormat('en-LK').format(amount)}`,
    `Conductor: ${booking.conductor_phone}`,
    `Hotline: ${hotline}`,
    '',
    'Please arrive before departure. Thank you for choosing District Line!',
  ].join('\n')
}

export function buildCancellationMessage(booking, bookings = [booking], hotline = smsConfig().hotline) {
  const seats = bookings.map((item) => item.seat_number).join(', ')
  const date = new Date(`${booking.travel_date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  return [
    'DISTRICT LINE',
    '',
    'Your seat booking has been cancelled.',
    `Route: ${booking.boarding_point || '—'} to ${booking.destination || '—'}`,
    `Date: ${date}`,
    `Seat No: ${seats}`,
    `Bus No: ${booking.registration_no || '—'}`,
    `Hotline: ${hotline}`,
    '',
    'For assistance, please contact us.',
  ].join('\n')
}

export async function sendSms({ to, message, idempotencyKey }) {
  const config = smsConfig()
  if (!config.configured) {
    return {
      ok: false,
      status: 'failed',
      providerStatus: 'not_configured',
      error: 'SmsLenz is not configured. Set SMS_PROVIDER=smslenz, SMS_USER_ID, SMS_API_KEY and SMS_SENDER_ID in .env.',
    }
  }

  const headers = { 'Content-Type': 'application/json' }
  const body = {
    user_id: config.userId,
    api_key: config.apiKey,
    sender_id: config.senderId,
    contact: to,
    message,
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const response = await fetch('https://smslenz.lk/api/send-sms', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const raw = await response.text()
    let parsed = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { raw }
    }

    if (!response.ok || parsed.success !== true) {
      return {
        ok: false,
        status: 'failed',
        providerStatus: String(response.status),
        error: typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
        raw: parsed,
      }
    }

    const providerState = String(parsed.data?.status || parsed.status || 'success').toLowerCase()
    const delivered = providerState.includes('deliver')
    return {
      ok: true,
      status: delivered ? 'delivered' : 'sent',
      providerStatus: providerState,
      raw: parsed,
    }
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      providerStatus: error.name === 'AbortError' ? 'timeout_unknown' : 'network_error',
      error: error.name === 'AbortError'
        ? 'SmsLenz did not respond before the 15 second timeout. The provider may still have accepted the SMS; check its account before retrying.'
        : error.message,
    }
  }
}
