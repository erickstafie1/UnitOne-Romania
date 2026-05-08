const https = require('https')

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

function buildHideScript() {
  return `<script>(function(){function h(){var s=['header','footer','nav','.header','.footer','.site-header','.site-footer','#shopify-section-header','#shopify-section-footer','.announcement-bar','.sticky-header','.page-header','.page__title','h1.title'];s.forEach(function(sel){document.querySelectorAll(sel).forEach(function(el){el.style.display='none';});});document.body.style.paddingTop='0';var m=document.querySelector('main,#MainContent,.main-content');if(m){m.style.paddingTop='0';m.style.marginTop='0';}}h();document.addEventListener('DOMContentLoaded',h);setTimeout(h,500);setTimeout(h,1500);})();</script>`
}

async function installProductTemplate(shop, token) {
  try {
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const active = (themes.themes || []).find(t => t.role === 'main')
    if (!active) return
    const id = active.id

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

    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-product.liquid',
        value: `{{ product.description }}`
      }
    })

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
  } catch(e) {
    console.log('Product template error:', e.message)
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const body = req.body || {}
    const shop = body.shop
    const token = body.token
    const title = body.title
    const html = body.html
    const action = body.action
    const hideHeaderFooter = body.hideHeaderFooter !== false
    const codFormApp = body.codFormApp || null
    const variantId = body.variantId || null
    const productHandle = body.productHandle || null

    console.log('PUBLISH action:', action, 'codFormApp:', codFormApp, 'variantId:', variantId)

    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'get_products') {
      const data = await shopifyRequest(shop, token, '/products.json?limit=50&fields=id,title,handle,images,variants', 'GET', null)
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    if (action === 'update') {
      const pageId = body.pageId
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })
      let finalHtml = html
      if (hideHeaderFooter) finalHtml = buildHideScript() + finalHtml
      if (variantId) finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
      const result = await shopifyRequest(shop, token, `/products/${pageId}.json`, 'PUT', {
        product: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml }
      })
      if (result.product) {
        return res.status(200).json({
          success: true,
          pageUrl: `https://${shop}/products/${result.product.handle}`
        })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })

    let finalHtml = html

    if (hideHeaderFooter) finalHtml = buildHideScript() + finalHtml
    if (variantId) finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)

    console.log('HTML size:', Math.round(finalHtml.length / 1024), 'KB')

    await installProductTemplate(shop, token)

    const result = await shopifyRequest(shop, token, '/products.json', 'POST', {
      product: {
        title: title || 'Pagina COD',
        body_html: finalHtml,
        published: true,
        status: 'active',
        template_suffix: 'pagecod',
        variants: [{ price: '1.00', inventory_management: null }]
      }
    })

    if (!result.product) throw new Error(JSON.stringify(result.errors || 'Product creation failed'))

    console.log('Product created:', result.product.id, result.product.handle)

    res.status(200).json({
      success: true,
      pageUrl: `https://${shop}/products/${result.product.handle}`,
      pageId: result.product.id,
      variantId: result.product.variants?.[0]?.id
    })

  } catch(err) {
    console.error('Publish error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
