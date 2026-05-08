const https = require('https')
const crypto = require('crypto')

function shopifyRequest(shop, token, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: `/admin/api/2024-01${path}`,
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
        catch(e) { reject(new Error(Buffer.concat(chunks).toString().substring(0, 200))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

async function installTemplates(shop, token) {
  try {
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const active = (themes.themes || []).find(t => t.role === 'main')
    if (!active) { console.log('No active theme'); return }
    const id = active.id
    console.log('Installing templates on theme:', id, active.name)

    // Layout cu content_for_header - CRITIC pentru Releasit
    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'layout/pagecod.liquid',
        value: `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{ product.title }}</title>
  {{ content_for_header }}
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif}</style>
</head>
<body>
  {{ content_for_layout }}
  <script>setTimeout(function(){document.dispatchEvent(new Event('DOMContentLoaded'));window.dispatchEvent(new Event('load'));},800);</script>
</body>
</html>`
      }
    })
    console.log('Layout installed')

    // Sectiune produs
    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-product.liquid',
        value: `<div class="pagecod-lp">{{ product.description }}</div>`
      }
    })
    console.log('Section installed')

    // Template produs
    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'templates/product.pagecod.json',
        value: JSON.stringify({
          sections: { main: { type: 'pagecod-product', settings: {} } },
          order: ['main']
        })
      }
    })
    console.log('Product template installed')

    // Template pagina (pentru backward compat)
    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-main.liquid',
        value: `{{ page.content }}`
      }
    })

    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'templates/page.pagecod.json',
        value: JSON.stringify({
          sections: { main: { type: 'pagecod-main', settings: {} } },
          order: ['main']
        })
      }
    })
    console.log('Page template installed')
    console.log('All templates installed successfully!')

  } catch(e) {
    console.log('Template install error:', e.message)
  }
}

function exchangeToken(shop, code) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    const req = https.request({
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  const { shop, code, hmac } = req.query
  if (!shop || !code) return res.status(400).send('Missing parameters')

  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  const params = Object.keys(req.query).filter(k => k !== 'hmac').sort().map(k => `${k}=${req.query[k]}`).join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(params).digest('hex')
  if (digest !== hmac) return res.status(400).send('Invalid HMAC')

  try {
    const { access_token } = await exchangeToken(shop, code)
    
    // Instaleaza templatele in background
    installTemplates(shop, access_token).catch(e => console.log('Template install failed:', e.message))

    const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
    const host = Buffer.from(`admin.shopify.com/store/${shop.replace('.myshopify.com', '')}`).toString('base64')
    res.redirect(`${appUrl}?shop=${shop}&host=${host}&token=${access_token}`)
  } catch(e) {
    res.status(500).send('OAuth error: ' + e.message)
  }
}
