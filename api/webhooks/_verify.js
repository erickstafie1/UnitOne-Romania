const crypto = require('crypto')

module.exports = function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256']
  if (!hmac) return false
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) return false
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))
  } catch { return false }
}
