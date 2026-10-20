import app from '../server/server.js'

export default function handler(req, res) {
  // The /api/* rewrite targets api/index.js and passes the original endpoint
  // as the `path` query parameter. Restore it for the Express route matcher.
  const routePath = req.query?.path
  if (typeof routePath === 'string') {
    const parsedUrl = new URL(req.url || '/', 'http://localhost')
    parsedUrl.searchParams.delete('path')
    req.url = `/api/${routePath}${parsedUrl.search}`
    return app(req, res)
  }

  // Also support direct invocation with either the full /api/... path or a
  // path relative to the function.
  if (!req.url?.startsWith('/api')) {
    req.url = `/api${req.url?.startsWith('/') ? req.url : `/${req.url || ''}`}`
  }
  return app(req, res)
}
