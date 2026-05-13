const crypto = require('crypto')
const https = require('https')

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
    if (!active) return
    const id = active.id
    const layoutLines = [
      '<!DOCTYPE html>','<html lang="ro">','<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>{{ product.title }}</title>',
      '{{ content_for_header }}',
      '{%- if product -%}<script type="application/json" id="unitone-product-json">{{ product | json }}</script>{%- endif -%}',
      '<style>',
      'header,footer,nav,.header,.footer,.site-header,.site-footer,',
      '#shopify-section-header,#shopify-section-footer,',
      '.announcement-bar,.sticky-header,',
      '.product__title,.product__media-wrapper,',
      '.product-form__quantity,.price--listing,.price__container,',
      '.price-item,.price__regular,.price__sale,',
      '.product__info-container h1,.product__info-container h2,',
      '.product-single__title,.product_title,',
      '._rsi-buy-now-button,',
      '[class*="product-form__button"]:not(.rsi-cod-form-gempages-button-overwrite),',
      '.shopify-payment-button,',
      '.you-may-also-like,.complementary-products,',
      '.product__view-details,.product__pickup-availabilities',
      '{display:none!important}',
      'body{padding-top:0!important}',
      'main,#MainContent,.main-content{padding:0!important;margin:0!important;max-width:100%!important}',
      '.page-width{max-width:100%!important;padding:0!important}',
      '</style>','</head>','<body>',
      '{{ content_for_layout }}',
      '{%- if product -%}',
      '<form action="/cart/add" id="product-form-product-template" class="product-form" method="post" enctype="multipart/form-data" style="display:none" novalidate>',
      '<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">',
      '<button type="submit" name="add">Add</button>',
      '</form>','{%- endif -%}',
      '<script>','(function(){',
      'var H=["header","footer","nav",".header",".footer",".site-header",".site-footer",',
      '"#shopify-section-header","#shopify-section-footer",".announcement-bar",".sticky-header",',
      '".product__title",".product__media-wrapper",".product-form__quantity",',
      '".price--listing",".price__container",".price-item",".price__regular",".price__sale",',
      '"._rsi-buy-now-button",".shopify-payment-button",',
      '".you-may-also-like",".complementary-products",',
      '".product__pickup-availabilities",".product__view-details"];',
      'function hide(){',
      'H.forEach(function(s){try{document.querySelectorAll(s).forEach(function(el){',
      'el.style.setProperty("display","none","important");});}catch(e){}});',
      'document.querySelectorAll(".product__info-container h1,.product-single__title,.product_title").forEach(function(el){',
      'el.style.setProperty("display","none","important");});',
      'document.body.style.paddingTop="0";',
      'var m=document.querySelector("main,#MainContent,.main-content");',
      'if(m){m.style.paddingTop="0";m.style.marginTop="0";}',
      '}','hide();',
      'document.addEventListener("DOMContentLoaded",hide);',
      'setTimeout(hide,100);setTimeout(hide,300);setTimeout(hide,800);setTimeout(hide,2000);',
      '})();','<\/script>','</body>','</html>'
    ]
    shopifyRequest(shop, token, '/themes/' + id + '/assets.json?asset%5Bkey%5D=templates%2Fproduct.pagecod.json', 'DELETE', null).catch(() => {})

    // Layout pentru modul "H/F vizibil" - foloseste sectiunile header/footer din tema
    const fullLayout = [
      '<!DOCTYPE html>',
      '<html lang="{{ shop.locale }}">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>{{ product.title }}</title>',
      '{{ content_for_header }}',
      '</head>',
      '<body style="margin:0;padding:0">',
      "{% section 'header' %}",
      '<main>{{ content_for_layout }}</main>',
      "{% section 'footer' %}",
      '</body>',
      '</html>'
    ].join('\n')

    await Promise.all([
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'layout/pagecod.liquid', value: layoutLines.join('\n') } }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'layout/pagecodfull.liquid', value: fullLayout } }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/product.pagecod.liquid', value: "{% layout 'pagecod' %}{{ product.description }}" } }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/product.pagecodfull.liquid', value: "{% layout 'pagecodfull' %}{{ product.description }}" } }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'sections/pagecod-main.liquid', value: '<div data-unitone="true">{{ page.content }}</div>' } }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/page.pagecod.json', value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] }) } })
    ])
    console.log('Templates installed on', shop)
  } catch(e) { console.log('Template install error:', e.message) }
}

function rotateToken(shop, token) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2024-10/access_tokens/rotate.json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'Content-Length': 0 },
      timeout: 10000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString()).access_token || null) }
        catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.end()
  })
}

function exchangeToken(shop, code) {
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
        catch(e) { reject(new Error('Parse error')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  const { shop, code, hmac } = req.query

  // OAuth callback - Shopify redirects here with ?code=
  if (code && shop) {
    if (!hmac) return res.status(400).send('Missing HMAC')
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
    const params = Object.keys(req.query).filter(k => k !== 'hmac').sort().map(k => k + '=' + req.query[k]).join('&')
    const digest = crypto.createHmac('sha256', clientSecret).update(params).digest('hex')
    if (digest !== hmac) return res.status(400).send('Invalid HMAC')
    try {
      const tokenData = await exchangeToken(shop, code)
      const { access_token } = tokenData
      if (!access_token) {
        console.error('OAuth token exchange failed for', shop, '- response:', JSON.stringify(tokenData).substring(0, 300))
        return res.status(500).send('OAuth failed: no access token. Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel env.')
      }
      console.log('OAuth complete for', shop, '- token prefix:', access_token.substring(0, 12))
      installTemplates(shop, access_token).catch(() => {})
      const sessKey = 'unitone_sess_' + shop.replace(/[^a-zA-Z0-9]/g, '_')
      res.setHeader('Set-Cookie', `${sessKey}=${encodeURIComponent(access_token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=7776000`)
      // Redirect back into Shopify Admin (embedded), not to the raw app URL.
      // This ensures App Bridge is active and session tokens work normally.
      const clientId = process.env.SHOPIFY_CLIENT_ID
      if (clientId) return res.redirect(`https://${shop}/admin/apps/${clientId}`)
      const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
      const host = Buffer.from('admin.shopify.com/store/' + shop.replace('.myshopify.com', '')).toString('base64')
      return res.redirect(appUrl + '?shop=' + shop + '&host=' + host)
    } catch(e) { return res.status(500).send('OAuth error: ' + e.message) }
  }

  // OAuth initiation - redirect to Shopify
  if (!shop) return res.status(400).send('Missing shop')
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
  const redirectUri = `${appUrl}/api/auth`
  const scopes = 'write_products,read_products,read_themes,write_themes'
  const state = crypto.randomBytes(16).toString('hex')
  res.setHeader('Set-Cookie', `shopify_state=${state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`)
  res.redirect(`https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`)
}
