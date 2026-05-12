const verify = require('./_verify')

module.exports = async function handler(req, res) {
  if (!(await verify(req))) return res.status(401).json({ error: 'Unauthorized' })
  res.status(200).json({ ok: true })
}
