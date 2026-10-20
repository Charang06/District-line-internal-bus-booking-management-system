import app from '../../server/server.js'

// Give the revenue ledger a direct Vercel function route instead of relying
// on the catch-all API rewrite to preserve this POST path.
export default function handler(req, res) {
  const incomingUrl = new URL(req.url || '/', 'http://localhost')
  incomingUrl.searchParams.delete('path')
  req.url = `/api/admin/revenue-entries${incomingUrl.search}`
  return app(req, res)
}
