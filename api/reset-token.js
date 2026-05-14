// api/reset-token.js
// Forces a fresh Token Exchange and replaces the cookie token, regardless of
// what's currently cached. Use once when an old non-expiring token is stuck
// in the browser cookie and the auto-detector hasn't caught it.
//
// Call from the embedded app DevTools (with iframe context selected):
//   await fetch('/api/reset-token', {
//     method: 'POST',
//     headers: { 'Authorization': 'Bearer ' + (await window.shopify.idToken()) }
//   }).then(r => r.json()).then(console.log)
const https = require('https')
const { verifySessionToken } = require('./_verify')

function tokenExchange(shop, sessionToken) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token'
    })
    const r = https.request({
      hostname: shop, path: '/admin/oauth/access_token', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    }, (resp) => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString())
          if (j.access_token) resolve(j.access_token)
          else reject(new Error('No access_token: ' + JSON.stringify(j).substring(0, 200)))
        } catch (e) { reject(new Error('Parse error: ' + e.message)) }
      })
    })
    r.on('error', reject)
    r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')) })
    r.write(body)
    r.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const auth = req.headers['authorization'] || ''
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No Bearer token' })
  }
  const sessionToken = auth.slice(7)
  const verified = verifySessionToken(sessionToken)
  if (!verified) {
    return res.status(401).json({ error: 'JWT verify failed' })
  }
  const shop = verified.shop

  try {
    const newToken = await tokenExchange(shop, sessionToken)
    const cookieKey = 'unitone_sess_' + shop.replace(/[^a-zA-Z0-9]/g, '_')
    res.setHeader('Set-Cookie', `${cookieKey}=${encodeURIComponent(newToken)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=7776000`)
    return res.status(200).json({
      success: true,
      shop,
      tokenPreview: newToken.substring(0, 14) + '...',
      message: 'Cookie replaced with fresh expiring token. Try the failing action again.'
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message })
  }
}
