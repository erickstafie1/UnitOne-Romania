// api/auth.js
// OAuth-only entry point. Reaches here from /api/auth?shop=... (initiation)
// or from Shopify's redirect with ?code=&hmac= (callback).
const crypto = require('crypto')
const https = require('https')
const { installTemplates } = require('./_templates')

// Lightweight per-request Shopify call helper for the OAuth callback path
// (we don't have an auth.call here yet — Token Exchange happens later).
function shopifyRequest(shop, token, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2025-01' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      },
      timeout: 30000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { reject(new Error(Buffer.concat(chunks).toString().substring(0, 200))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

function exchangeCode(shop, code) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    const req = https.request({
      hostname: shop, path: '/admin/oauth/access_token', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { reject(new Error('Parse error')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  const { shop, code, hmac } = req.query

  // OAuth callback: Shopify redirects here with ?code=
  if (code && shop) {
    if (!hmac) return res.status(400).send('Missing HMAC')
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
    const params = Object.keys(req.query).filter(k => k !== 'hmac').sort().map(k => k + '=' + req.query[k]).join('&')
    const digest = crypto.createHmac('sha256', clientSecret).update(params).digest('hex')
    if (digest !== hmac) return res.status(400).send('Invalid HMAC')
    try {
      const tokenData = await exchangeCode(shop, code)
      const { access_token } = tokenData
      if (!access_token) {
        console.error('OAuth code exchange failed for', shop, '- response:', JSON.stringify(tokenData).substring(0, 300))
        return res.status(500).send('OAuth failed: no access token. Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel env.')
      }
      console.log('OAuth complete for', shop, '- token prefix:', access_token.substring(0, 12))
      // Install theme templates with the OAuth token (background, best-effort)
      installTemplates((path, method = 'GET', body = null) => shopifyRequest(shop, access_token, path, method, body)).catch(() => {})
      const sessKey = 'unitone_sess_' + shop.replace(/[^a-zA-Z0-9]/g, '_')
      res.setHeader('Set-Cookie', `${sessKey}=${encodeURIComponent(access_token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=7776000`)
      // Land back inside Shopify Admin (embedded), not on the bare app URL.
      const clientId = process.env.SHOPIFY_CLIENT_ID
      if (clientId) return res.redirect(`https://${shop}/admin/apps/${clientId}`)
      const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
      const host = Buffer.from('admin.shopify.com/store/' + shop.replace('.myshopify.com', '')).toString('base64')
      return res.redirect(appUrl + '?shop=' + shop + '&host=' + host)
    } catch (e) {
      return res.status(500).send('OAuth error: ' + e.message)
    }
  }

  // OAuth initiation: redirect user to Shopify's authorize page
  if (!shop) return res.status(400).send('Missing shop')
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
  const redirectUri = `${appUrl}/api/auth`
  const scopes = 'write_products,read_products,read_themes,write_themes'
  const state = crypto.randomBytes(16).toString('hex')
  res.setHeader('Set-Cookie', `shopify_state=${state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`)
  res.redirect(`https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`)
}
