const crypto = require('crypto')

function verifySessionToken(token) {
  const parts = (token || '').split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  const clientId = process.env.SHOPIFY_CLIENT_ID
  if (!secret || !clientId) return null

  const expected = crypto.createHmac('sha256', secret)
    .update(header + '.' + payload)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  } catch { return null }

  let claims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch { return null }

  if (claims.exp < Math.floor(Date.now() / 1000)) return null
  if (claims.aud !== clientId) return null

  return { shop: claims.dest.replace('https://', '') }
}

function getStoredToken(cookies, shop) {
  if (!cookies || !shop) return null
  const key = 'unitone_sess_' + shop.replace(/[^a-zA-Z0-9]/g, '_')
  const m = cookies.match(new RegExp('(?:^|;\\s*)' + key + '=([^;]+)'))
  return m ? decodeURIComponent(m[1]) : null
}

module.exports = { verifySessionToken, getStoredToken }
