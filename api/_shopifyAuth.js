// api/_shopifyAuth.js
// Centralized Shopify auth + Token Exchange. Handlers use prepareShopifyAuth(req, res)
// and call auth.call(path, method, body) for any Shopify Admin API request.
// On invalid/expired access token, automatically performs Token Exchange and retries.
const https = require('https')
const { verifySessionToken, getStoredToken } = require('./_verify')

function rawShopifyCall(shop, accessToken, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2025-01' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      },
      timeout: 30000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }) }
        catch { resolve({ status: res.statusCode, data: { errors: text.substring(0, 200) } }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

function tokenExchange(shop, sessionToken) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return Promise.reject(new Error('Token exchange config missing: SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set in env'))
  }
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      // Online access token: ALWAYS expiring (~24h), per-user, accepted by Shopify
      // even if the app isn't yet configured as "modern" in Partners (which would
      // require `shopify app deploy` to push use_legacy_install_flow=false).
      // For our flows (all user-initiated, no background tasks), online tokens
      // are sufficient and avoid the non-expiring offline-token rejection.
      requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token'
    })
    const req = https.request({
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        try {
          const j = JSON.parse(text)
          if (j.access_token) {
            console.log('Token Exchange OK for', shop, '- expires_in:', j.expires_in)
            resolve(j.access_token)
          } else {
            console.error('Token Exchange rejected for', shop, '- status:', res.statusCode, 'body:', text.substring(0, 300))
            reject(new Error('Token exchange failed (' + res.statusCode + '): ' + text.substring(0, 200)))
          }
        } catch (e) {
          reject(new Error('Token exchange parse error: ' + text.substring(0, 200)))
        }
      })
    })
    req.on('error', e => { console.error('Token Exchange network error:', e.message); reject(e) })
    req.on('timeout', () => { req.destroy(); reject(new Error('Token exchange timeout')) })
    req.write(body)
    req.end()
  })
}

function getSessionInfo(req) {
  const authHeader = req.headers['authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return null
  const sessionToken = authHeader.slice(7)
  const verified = verifySessionToken(sessionToken)
  if (!verified) return null
  return { shop: verified.shop, sessionToken }
}

function cookieKey(shop) {
  return 'unitone_sess_' + shop.replace(/[^a-zA-Z0-9]/g, '_')
}

function setTokenCookie(res, shop, token) {
  res.setHeader('Set-Cookie', cookieKey(shop) + '=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=7776000')
}

function clearTokenCookie(res, shop) {
  res.setHeader('Set-Cookie', cookieKey(shop) + '=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0')
}

function isInvalidTokenError(result) {
  if (result.status === 401 || result.status === 403) return true
  // Check both `errors` (plural) and `error` (singular). Lowercase for safety.
  const blob = JSON.stringify({
    e1: result.data?.errors || null,
    e2: result.data?.error || null
  }).toLowerCase()
  return blob.includes('access token')
      || blob.includes('invalid api key')
      || blob.includes('unrecognized')
      || blob.includes('non-expiring')
      || blob.includes('expiring offline')
}

// Returns { shop, call(path, method, body) } where call() auto-refreshes on stale token.
// Throws REAUTH_REQUIRED if no session token (frontend handles via OAuth redirect).
async function prepareShopifyAuth(req, res) {
  const session = getSessionInfo(req)
  if (!session) {
    const err = new Error('REAUTH_REQUIRED')
    throw err
  }
  const { shop, sessionToken } = session

  // Try cached cookie token first (avoids round-trip to Shopify)
  let token = getStoredToken(req.headers.cookie || '', shop)

  // No cookie? Mint a fresh one via Token Exchange
  if (!token) {
    token = await tokenExchange(shop, sessionToken)
    setTokenCookie(res, shop, token)
  }

  // Serialize concurrent refreshes within this request
  let refreshPromise = null
  async function refreshToken() {
    if (!refreshPromise) {
      refreshPromise = tokenExchange(shop, sessionToken).then(t => {
        token = t
        setTokenCookie(res, shop, t)
        refreshPromise = null
        return t
      }).catch(e => { refreshPromise = null; throw e })
    }
    return refreshPromise
  }

  async function call(path, method = 'GET', body = null) {
    let result = await rawShopifyCall(shop, token, path, method, body)
    if (isInvalidTokenError(result)) {
      console.log('[shopifyAuth] Token rejected by Shopify (status', result.status + '). Refreshing via Token Exchange. Errors:', JSON.stringify(result.data?.errors || result.data?.error || '').substring(0, 200))
      try {
        await refreshToken()
      } catch (e) {
        console.error('[shopifyAuth] Token Exchange failed during refresh:', e.message)
        clearTokenCookie(res, shop)
        const err = new Error('REAUTH_REQUIRED')
        err.shop = shop
        throw err
      }
      result = await rawShopifyCall(shop, token, path, method, body)
      if (isInvalidTokenError(result)) {
        // Even the freshly-exchanged token is rejected — something deeper is wrong.
        console.error('[shopifyAuth] Refreshed token still rejected by Shopify. Forcing reauth. Errors:', JSON.stringify(result.data?.errors || result.data?.error || '').substring(0, 200))
        clearTokenCookie(res, shop)
        const err = new Error('REAUTH_REQUIRED')
        err.shop = shop
        throw err
      }
    }
    return result.data
  }

  return { shop, call }
}

module.exports = { prepareShopifyAuth }
