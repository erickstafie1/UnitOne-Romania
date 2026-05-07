// v3 - clean rewrite with Releasit support
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

function buildReleasitScript(variantId) {
  const vid = variantId || '0'
  return `<script>(function(){var V='${vid}';function init(){document.querySelectorAll('.releasit-button,[data-cod-trigger]').forEach(function(b){b.classList.add('_rsi-cod-form-pagefly-button-overwrite-v2');if(V&&V!=='0')b.setAttribute('data-variant-id',V);});}init();document.addEventListener('DOMContentLoaded',init);setTimeout(init,500);setTimeout(init,1500);console.log('[UnitOne] Releasit ready, variant:',V);})();</script>`
}

async function installLandingTemplate(shop, token) {
  try {
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const active = (themes.themes || []).find(t => t.role === 'main')
    if (!active) return
    const id = active.id

    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'layout/pagecod.liquid',
        value: `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{ page.title }}</title>{{ content_for_header }}<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif}</style></head><body>{{ content_for_layout }}</body></html>`
      }
    })

    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-main.liquid',
        value: `{{ page.content }}`
      }
    })

    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'templates/page.pagecod.json',
        value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] })
      }
    })
  } catch(e) {
    console.log('Template install error (non-fatal):', e.message)
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  console.log('=== PUBLISH HANDLER ===')
  console.log('query:', JSON.stringify(req.query))

  try {
    const body = req.body || {}
    const query = req.query || {}

    const shop = body.shop
    const token = body.token
    const title = body.title
    const html = body.html
    const action = body.action
    const productId = body.productId
    const hideHeaderFooter = body.hideHeaderFooter !== false
    
    // codFormApp si variantId - din body sau query params
    const codFormApp = body.codFormApp || query.codFormApp || null
    const variantId = body.variantId || query.variantId || null
    const productHandle = body.productHandle || query.productHandle || null

    console.log('action:', action, 'codFormApp:', codFormApp, 'variantId:', variantId, 'shop:', shop)

    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    // GET PRODUCTS
    if (action === 'get_products') {
      const data = await shopifyRequest(shop, token, '/products.json?limit=50&fields=id,title,handle,images,variants', 'GET', null)
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    // UPDATE pagina existenta
    if (action === 'update') {
      const pageId = body.pageId
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })

      let finalHtml = html
      if (codFormApp === 'releasit') finalHtml = buildReleasitScript(variantId) + finalHtml
      if (hideHeaderFooter) finalHtml = buildHideScript() + finalHtml

      const result = await shopifyRequest(shop, token, `/pages/${pageId}.json`, 'PUT', {
        page: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml }
      })
      if (result.page) {
        return res.status(200).json({
          success: true,
          pageUrl: `https://${shop}/pages/${result.page.handle}`
        })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    // PUBLISH pagina noua
    if (!html) return res.status(400).json({ error: 'Missing html' })

    let finalHtml = html

    // Injecteaza Releasit trigger
    if (codFormApp === 'releasit') {
      finalHtml = buildReleasitScript(variantId) + finalHtml
      console.log('Releasit script injected, variantId:', variantId)
    } else if (codFormApp === 'easysell') {
      finalHtml = `<script>(function(){function i(){document.querySelectorAll('.es-cod-button').forEach(function(b){if('${variantId}')b.setAttribute('data-variant-id','${variantId}');});}i();document.addEventListener('DOMContentLoaded',i);setTimeout(i,500);})();</script>` + finalHtml
      console.log('EasySell script injected')
    }

    // Injecteaza hide header/footer
    if (hideHeaderFooter) {
      finalHtml = buildHideScript() + finalHtml
    }

    // Inlocuieste VARIANT_ID cu variantId real
    if (variantId) {
      finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
      console.log('Replaced VARIANT_ID with:', variantId)
    }

    // Instaleaza template fara header/footer
    await installLandingTemplate(shop, token)

    // Creeaza pagina
    const result = await shopifyRequest(shop, token, '/pages.json', 'POST', {
      page: {
        title: title || 'Pagina COD',
        body_html: finalHtml,
        published: true,
        template_suffix: 'pagecod'
      }
    })

    if (!result.page) throw new Error(JSON.stringify(result.errors || 'Page creation failed'))

    console.log('Page created:', result.page.id, result.page.handle)

    // Asociaza cu produsul via metafield
    if (productId) {
      try {
        await shopifyRequest(shop, token, `/products/${productId}/metafields.json`, 'POST', {
          metafield: {
            namespace: 'pagecod',
            key: 'landing_page_url',
            value: `https://${shop}/pages/${result.page.handle}`,
            type: 'url'
          }
        })
        console.log('Metafield set for product:', productId)
      } catch(e) {
        console.log('Metafield error (non-fatal):', e.message)
      }
    }

    res.status(200).json({
      success: true,
      pageUrl: `https://${shop}/pages/${result.page.handle}`,
      pageId: result.page.id
    })

  } catch(err) {
    console.error('Publish error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
