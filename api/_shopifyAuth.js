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
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token'
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
            console.log('Token Exchange OK for', shop, '- expires_in:', j.expires_in, 'scope:', j.scope)
            resolve(j.access_token)
          } else {
            console.error('Token Exchange rejected for', shop, '- status:', res.statusCode, 'body:', text.substring(0, 300))
            reject(new Error('Token exchange failed (' + res.statusCode + '): ' + text.substring(0, 200)))
          }
        } catch (e) {
          console.error('Token Exchange parse error for', shop, '- raw:', text.substring(0, 300))
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
  if (!authHeader.startsWith('Bearer ')) {
    console.log('No session token in Authorization header (Bearer missing)')
    return null
  }
  const sessionToken = authHeader.slice(7)
  const verified = verifySessionToken(sessionToken)
  if (!verified) {
    console.log('Session token JWT failed verification (signature/exp/aud)')
    return null
  }
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
  if (result.status === 401) return true
  const errStr = JSON.stringify(result.data?.errors || '')
  return errStr.includes('Invalid API key') || errStr.includes('access token') || errStr.includes('Unrecognized')
}

// Returns { shop, getToken(), call(path, method, body) } where call() auto-refreshes on stale token.
// Throws if no auth source available (no session token, no cookie, no body token).
async function prepareShopifyAuth(req, res) {
  const session = getSessionInfo(req)
  let shop = session?.shop
  let token = null

  // Legacy fallback: shop from body (LoginScreen path or pre-session-token clients)
  if (!shop && req.body?.shop) shop = req.body.shop
  if (!shop) throw new Error('Missing shop')

  // Get cached token from cookie first (fastest path)
  token = getStoredToken(req.headers.cookie || '', shop)

  // Legacy fallback: token from body
  if (!token && req.body?.token) token = req.body.token

  // No cached/body token, but we have session: do Token Exchange now
  if (!token && session?.sessionToken) {
    token = await tokenExchange(shop, session.sessionToken)
    setTokenCookie(res, shop, token)
    console.log('Token Exchange (initial) for', shop)
  }

  if (!token) {
    // No valid token from any source — user must re-authenticate via OAuth
    const err = new Error('REAUTH_REQUIRED')
    err.shop = shop
    throw err
  }

  // Serialize concurrent refreshes within this request
  let refreshPromise = null
  async function refreshToken() {
    if (!session?.sessionToken) throw new Error('Cannot refresh: no session token')
    if (!refreshPromise) {
      refreshPromise = tokenExchange(shop, session.sessionToken).then(t => {
        token = t
        setTokenCookie(res, shop, t)
        console.log('Token Exchange (refresh) for', shop)
        refreshPromise = null
        return t
      }).catch(e => { refreshPromise = null; throw e })
    }
    return refreshPromise
  }

  async function call(path, method = 'GET', body = null) {
    let result = await rawShopifyCall(shop, token, path, method, body)
    if (isInvalidTokenError(result)) {
      if (session?.sessionToken) {
        try {
          await refreshToken()
          result = await rawShopifyCall(shop, token, path, method, body)
        } catch (e) {
          console.log('Token Exchange failed:', e.message)
          clearTokenCookie(res, shop)
          const err = new Error('REAUTH_REQUIRED')
          err.shop = shop
          throw err
        }
      } else {
        // No session token to do Token Exchange — old cookie token is dead
        console.log('No session token, old access token rejected. Forcing reauth for', shop)
        clearTokenCookie(res, shop)
        const err = new Error('REAUTH_REQUIRED')
        err.shop = shop
        throw err
      }
    }
    return result.data
  }

  return { shop, getToken: () => token, call, hasSession: !!session?.sessionToken }
}

function reauthErrorResponse(err, shop) {
  const s = err.shop || shop || ''
  return { status: 401, body: { error: 'reauth_required', shop: s, authUrl: '/api/auth?shop=' + s } }
}

module.exports = {
  prepareShopifyAuth,
  tokenExchange,
  setTokenCookie,
  clearTokenCookie,
  getSessionInfo,
  rawShopifyCall,
  isInvalidTokenError,
  reauthErrorResponse
}
