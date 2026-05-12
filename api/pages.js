// api/pages.js
const https = require('https')
const { verifySessionToken, getStoredToken } = require('./_verify')
const { getPlan, countLPs } = require('./_plan')

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
        catch(e) { reject(new Error(Buffer.concat(chunks).toString().substring(0, 100))) }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    let { action, shop, token, pageId, published } = req.body || {}

    const authHeader = req.headers['authorization'] || ''
    if (authHeader.startsWith('Bearer ')) {
      const verified = verifySessionToken(authHeader.slice(7))
      if (verified) {
        shop = verified.shop
        token = getStoredToken(req.headers.cookie || '', shop) || token
      }
    }

    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'list') {
      const [active, draft] = await Promise.all([
        shopifyRequest(shop, token, '/products.json?limit=250&status=active&fields=id,title,handle,status,created_at,updated_at,template_suffix,tags', 'GET', null),
        shopifyRequest(shop, token, '/products.json?limit=250&status=draft&fields=id,title,handle,status,created_at,updated_at,template_suffix,tags', 'GET', null)
      ])
      const all = [...(active.products || []), ...(draft.products || [])]
      const pages = all
        .filter(p => p.template_suffix === 'pagecod' || (p.tags || '').includes('unitone-cod-page'))
        .map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          published: p.status === 'active',
          created_at: p.created_at,
          updated_at: p.updated_at,
          isProduct: true
        }))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      return res.status(200).json({ success: true, pages })
    }

    if (action === 'shop_info') {
      const data = await shopifyRequest(shop, token, '/shop.json', 'GET', null)
      const s = data.shop || {}
      return res.status(200).json({ success: true, shopOwner: s.shop_owner, name: s.name, email: s.email })
    }

    if (action === 'delete') {
      await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'DELETE', null)
      return res.status(200).json({ success: true })
    }

    if (action === 'unmark') {
      // Scoate marcajele LP dar pastreaza produsul (utilizat pentru curatare produse contaminate de fluxul vechi)
      const current = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'GET', null)
      const currentTags = (current.product?.tags || '').split(',').map(t => t.trim()).filter(t => t && t !== 'unitone-cod-page').join(', ')
      await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, template_suffix: null, tags: currentTags }
      })
      return res.status(200).json({ success: true })
    }

    if (action === 'toggle') {
      // Enforce publish limit la activare (Free: max 1 active)
      if (published) {
        const plan = await getPlan(shop, token)
        if (plan.publishLimit < 9999) {
          const counts = await countLPs(shop, token)
          if (counts.active >= plan.publishLimit) {
            return res.status(402).json({ error: 'publish_limit_reached', plan: plan.plan, publishLimit: plan.publishLimit })
          }
        }
      }
      const data = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, status: published ? 'active' : 'draft' }
      })
      return res.status(200).json({ success: true, page: data.product })
    }

    if (action === 'get') {
      const data = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'GET', null)
      const p = data.product
      return res.status(200).json({
        success: true,
        page: {
          id: p.id, title: p.title, handle: p.handle,
          body_html: p.body_html, published: p.status === 'active',
          isProduct: true
        }
      })
    }

    if (action === 'reinstall') {
      const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
      const active = (themes.themes || []).find(t => t.role === 'main')
      if (!active) return res.status(400).json({ error: 'No active theme' })
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
        'function hide(){H.forEach(function(s){try{document.querySelectorAll(s).forEach(function(el){el.style.setProperty("display","none","important");});}catch(e){}});',
        'document.querySelectorAll(".product__info-container h1,.product-single__title,.product_title").forEach(function(el){el.style.setProperty("display","none","important");});',
        'document.body.style.paddingTop="0";',
        'var m=document.querySelector("main,#MainContent,.main-content");if(m){m.style.paddingTop="0";m.style.marginTop="0";}}',
        'hide();document.addEventListener("DOMContentLoaded",hide);',
        'setTimeout(hide,100);setTimeout(hide,300);setTimeout(hide,800);setTimeout(hide,2000);',
        '})();','<\/script>','</body>','</html>'
      ]
      shopifyRequest(shop, token, '/themes/' + id + '/assets.json?asset%5Bkey%5D=templates%2Fproduct.pagecod.json', 'DELETE', null).catch(() => {})
      await Promise.all([
        shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'layout/pagecod.liquid', value: layoutLines.join('\n') } }),
        shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/product.pagecod.liquid', value: "{% layout 'pagecod' %}{{ product.description }}" } }),
        shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'sections/pagecod-main.liquid', value: '<div data-unitone="true">{{ page.content }}</div>' } }),
        shopifyRequest(shop, token, '/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/page.pagecod.json', value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] }) } })
      ])
      return res.status(200).json({ success: true })
    }

    res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('Pages error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
