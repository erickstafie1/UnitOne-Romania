// api/reinstall-templates.js
// POST { shop, token } - reinstaleaza templatele pe magazinul existent
const https = require('https')

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { shop, token } = req.body || {}
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const active = (themes.themes || []).find(t => t.role === 'main')
    if (!active) return res.status(400).json({ error: 'No active theme' })
    const id = active.id

    const layoutLines = [
      '<!DOCTYPE html>',
      '<html lang="ro">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>{{ product.title }}</title>',
      '{{ content_for_header }}',
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
      '</style>',
      '</head>',
      '<body>',
      '{{ content_for_layout }}',
      '<script>',
      '(function(){',
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
      '}',
      'hide();',
      'document.addEventListener("DOMContentLoaded",hide);',
      'setTimeout(hide,100);setTimeout(hide,300);setTimeout(hide,800);setTimeout(hide,2000);',
      '})();',
      '<\/script>',
      '</body>',
      '</html>'
    ]

    shopifyRequest(shop, token, '/themes/' + id + '/assets.json?asset%5Bkey%5D=templates%2Fproduct.pagecod.json', 'DELETE', null).catch(() => {})
    await Promise.all([
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
        asset: { key: 'layout/pagecod.liquid', value: layoutLines.join('\n') }
      }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
        asset: { key: 'templates/product.pagecod.liquid', value: "{% layout 'pagecod' %}{{ product.description }}" }
      }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
        asset: { key: 'sections/pagecod-main.liquid', value: '<div data-unitone="true">{{ page.content }}</div>' }
      }),
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', {
        asset: {
          key: 'templates/page.pagecod.json',
          value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] })
        }
      })
    ])

    console.log('Templates reinstalled on', shop, 'theme:', active.name)
    res.status(200).json({ success: true, theme: active.name, themeId: id })
  } catch(err) {
    console.error('Reinstall error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
