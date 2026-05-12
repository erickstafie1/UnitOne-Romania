const crypto = require('crypto')

async function verifyHmac(req) {
  const hmac = req.headers['x-shopify-hmac-sha256']
  if (!hmac) return false
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) return false

  let body
  try {
    if (req._rawBody) {
      body = req._rawBody
    } else if (req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    } else {
      body = await new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }
  } catch { return false }

  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  try { return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac)) }
  catch { return false }
}

module.exports = async function handler(req, res) {
  if (!(await verifyHmac(req))) return res.status(401).json({ error: 'Unauthorized' })
  res.status(200).json({ ok: true })
}
