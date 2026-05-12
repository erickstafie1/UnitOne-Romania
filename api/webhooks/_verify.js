const crypto = require('crypto')

async function getRawBody(req) {
  if (req._rawBody) return req._rawBody
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => { req._rawBody = Buffer.concat(chunks).toString('utf8'); resolve(req._rawBody) })
    req.on('error', reject)
  })
}

module.exports = async function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256']
  if (!hmac) return false
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) return false

  let body
  try {
    body = await getRawBody(req)
    if (!body && req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
  } catch {
    body = req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : ''
  }

  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))
  } catch { return false }
}
