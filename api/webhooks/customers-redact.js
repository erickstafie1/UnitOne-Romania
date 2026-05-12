const verify = require('./_verify')

module.exports = function handler(req, res) {
  if (!verify(req)) return res.status(401).json({ error: 'Unauthorized' })
  res.status(200).json({ ok: true })
}
