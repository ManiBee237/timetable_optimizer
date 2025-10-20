export function tenant(_req, res, next) {
  // single-tenant demo
  _req.tenant = { id: 1, slug: 'demo' }
  next()
}
