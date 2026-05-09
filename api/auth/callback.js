const https = require('https')
const crypto = require('crypto')

function shopifyRequest(shop, token, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2024-01' + path,
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

const LAYOUT_PAGECOD = "<!DOCTYPE html>\n<html lang='ro'>\n<head>\n  <meta charset='utf-8'>\n  <meta name='viewport' content='width=device-width,initial-scale=1'>\n  <title>{{ product.title }}</title>\n  {{ content_for_header }}\n  <style>\n    *{box-sizing:border-box;margin:0;padding:0}\n    body{font-family:system-ui,sans-serif}\n    header,footer,nav,.header,.footer,.site-header,.site-footer,\n    #shopify-section-header,#shopify-section-footer,\n    .announcement-bar,.sticky-header,\n    .product__title,.product__media-wrapper,\n    .product-form__quantity,.price--listing,.price__container,\n    .price-item,.price__regular,.price__sale,\n    [class*='price--'],[class*='Price'],\n    .product__info-container h1,.product__info-container h2,\n    .product-single__title,.product_title,\n    [class*='product-title'],[class*='ProductTitle'],\n    ._rsi-buy-now-button,\n    [class*='product-form__button']:not(.rsi-cod-form-gempages-button-overwrite),\n    .shopify-payment-button,\n    [class*='recommendations'],.you-may-also-like,\n    [class*='related-products'],.complementary-products,\n    .product__view-details,.product__pickup-availabilities\n    {display:none!important}\n    main,#MainContent,.main-content{padding:0!important;margin:0!important;max-width:100%!important}\n    .page-width{max-width:100%!important;padding:0!important}\n  </style>\n</head>\n<body>\n  {{ content_for_layout }}\n  <script>\n  (function(){\n    var H=['header','footer','nav','.header','.footer','.site-header','.site-footer',\n      '#shopify-section-header','#shopify-section-footer','.announcement-bar','.sticky-header',\n      '.product__title','.product__media-wrapper','.product-form__quantity',\n      '.price--listing','.price__container','.price-item','.price__regular','.price__sale',\n      '._rsi-buy-now-button','.shopify-payment-button',\n      '.you-may-also-like','.complementary-products',\n      '.product__pickup-availabilities','.product__view-details'];\n    function hide(){\n      H.forEach(function(s){try{document.querySelectorAll(s).forEach(function(el){el.style.setProperty('display','none','important');});}catch(e){}});\n      document.querySelectorAll('.product__info-container h1,.product__info-container h2,.product-single__title,.product_title').forEach(function(el){el.style.setProperty('display','none','important');});\n      document.querySelectorAll('[class*='price']').forEach(function(el){if(!el.closest('[data-unitone]'))el.style.setProperty('display','none','important');});\n      document.body.style.paddingTop='0';\n      var m=document.querySelector('main,#MainContent,.main-content');\n      if(m){m.style.paddingTop='0';m.style.marginTop='0';}\n    }\n    hide();document.addEventListener('DOMContentLoaded',hide);\n    setTimeout(hide,100);setTimeout(hide,300);setTimeout(hide,800);setTimeout(hide,2000);\n  })();\n  </script>\n</body>\n</html>"

async function installTemplates(shop, token) {
  try {
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const active = (themes.themes || []).find(t => t.role === 'main')
    if (!active) { console.log('No active theme'); return }
    const id = active.id
    console.log('Installing templates on theme:', id, active.name)

    await shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
      asset: { key: 'layout/pagecod.liquid', value: LAYOUT_PAGECOD }
    })
    console.log('Layout installed')

    await shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
      asset: { key: 'sections/pagecod-product.liquid', value: '<div class='pagecod-lp' data-unitone='true'>{{ product.description }}</div>' }
    })

    await shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
      asset: {
        key: 'templates/product.pagecod.json',
        value: JSON.stringify({ sections: { main: { type: 'pagecod-product', settings: {} } }, order: ['main'] })
      }
    })

    await shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
      asset: { key: 'sections/pagecod-main.liquid', value: '<div data-unitone='true'>{{ page.content }}</div>' }
    })

    await shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
      asset: {
        key: 'templates/page.pagecod.json',
        value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] })
      }
    })

    console.log('All templates installed on', shop)
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
  if (!shop || !code) return res.status(400).send('Missing parameters')

  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  const params = Object.keys(req.query).filter(k => k !== 'hmac').sort().map(k => k + '=' + req.query[k]).join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(params).digest('hex')
  if (digest !== hmac) return res.status(400).send('Invalid HMAC')

  try {
    const { access_token } = await exchangeToken(shop, code)
    installTemplates(shop, access_token).catch(e => console.log('Template install failed:', e.message))
    const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
    const host = Buffer.from('admin.shopify.com/store/' + shop.replace('.myshopify.com', '')).toString('base64')
    res.redirect(appUrl + '?shop=' + shop + '&host=' + host + '&token=' + access_token)
  } catch(e) {
    res.status(500).send('OAuth error: ' + e.message)
  }
}
