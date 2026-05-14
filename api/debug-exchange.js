// api/debug-exchange.js
// Trigger Token Exchange against Shopify and report exactly what comes back.
// Call from inside the embedded app via:
//   await apiFetch('/api/debug-exchange', { method: 'POST' })
//      .then(r => r.json()).then(console.log)
// (Browser DevTools console works.) Returns Shopify's raw response.
const https = require('https')
const { verifySessionToken } = require('./_verify')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const auth = req.headers['authorization'] || ''
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ step: 'no-bearer', hint: 'Call this from inside the embedded app via apiFetch so App Bridge attaches the session JWT.' })
  }
  const sessionToken = auth.slice(7)
  const verified = verifySessionToken(sessionToken)
  if (!verified) {
    return res.status(401).json({
      step: 'jwt-verify-failed',
      hint: 'Session JWT signature/audience/expiry check failed. Likely SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in Vercel does NOT match the app the JWT was issued for.',
      sessionTokenPreview: sessionToken.slice(0, 40) + '...'
    })
  }
  const shop = verified.shop

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ step: 'env-missing', clientId: !!clientId, clientSecret: !!clientSecret })
  }

  const body = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token'
  })

  const result = await new Promise((resolve) => {
    const r = https.request({
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    }, (resp) => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let parsed = null
        try { parsed = JSON.parse(text) } catch {}
        resolve({ status: resp.statusCode, body: text.substring(0, 1000), parsed })
      })
    })
    r.on('error', e => resolve({ networkError: e.message }))
    r.on('timeout', () => { r.destroy(); resolve({ timeout: true }) })
    r.write(body)
    r.end()
  })

  res.status(200).json({
    step: 'token-exchange-complete',
    shop,
    clientIdUsed: clientId,
    requestedScope: 'offline_access_token',
    shopifyResponseStatus: result.status,
    shopifyResponseBody: result.body,
    shopifyResponseParsed: result.parsed,
    interpretation: result.parsed?.access_token
      ? '✅ Token Exchange WORKS. The access_token returned is what we cache in the cookie.'
      : '❌ Token Exchange FAILED. Read shopifyResponseBody for the exact reason from Shopify.'
  })
}
