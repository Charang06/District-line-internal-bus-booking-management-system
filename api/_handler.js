import app from '../server/server.js'

export default function handler(req, res) {
  // Vercel can pass either the full /api/... path or the path relative to the
  // catch-all function. The Express routes consistently use /api/... paths.
  if (!req.url?.startsWith('/api')) {
    req.url = `/api${req.url?.startsWith('/') ? req.url : `/${req.url || ''}`}`
  }
  return app(req, res)
}
