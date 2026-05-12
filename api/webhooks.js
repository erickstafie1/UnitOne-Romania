const crypto = require('crypto')

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const handler = async function(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method === 'OPTIONS') return res.status(200).end()

  const hmac = req.headers['x-shopify-hmac-sha256']
  if (!hmac) return res.status(401).json({ error: 'Missing HMAC' })

  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) return res.status(500).json({ error: 'Missing secret config' })

  const rawBody = await getRawBody(req)
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')

  try {
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))) {
      return res.status(401).json({ error: 'Invalid HMAC' })
    }
  } catch { return res.status(401).json({ error: 'Invalid HMAC' }) }

  return res.status(200).json({ ok: true })
}

handler.config = { api: { bodyParser: false } }
module.exports = handler
