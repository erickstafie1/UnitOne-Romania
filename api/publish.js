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
        catch(e) { reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Shopify timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

// Instaleaza template de pagina fara header/footer
async function installLandingTemplate(shop, token) {
  try {
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const activeTheme = (themes.themes || []).find(t => t.role === 'main')
    if (!activeTheme) { console.log('No active theme found'); return }
    const themeId = activeTheme.id
    console.log('Active theme:', themeId, activeTheme.name)

    // Creeaza layout-ul fara header/footer
    const layoutLiquid = `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ page.title }}</title>
  {{ content_for_header }}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  {{ content_for_layout }}
</body>
</html>`

    // Creeaza template simplu
    const templateJson = JSON.stringify({
      sections: {
        "main": { "type": "pagecod-main", "settings": {} }
      },
      order: ["main"]
    })

    // Creeaza sectiunea principala
    const sectionLiquid = `<div class="pagecod-lp">{{ page.content }}</div>`

    // Instaleaza toate fisierele
    await shopifyRequest(shop, token, `/themes/${themeId}/assets.json`, 'PUT', {
      asset: { key: 'layout/pagecod.liquid', value: layoutLiquid }
    })
    console.log('Layout created')

    await shopifyRequest(shop, token, `/themes/${themeId}/assets.json`, 'PUT', {
      asset: { key: 'sections/pagecod-main.liquid', value: sectionLiquid }
    })
    console.log('Section created')

    await shopifyRequest(shop, token, `/themes/${themeId}/assets.json`, 'PUT', {
      asset: { key: 'templates/page.pagecod.json', value: templateJson }
    })
    console.log('Template created')

    console.log('Landing template installed successfully!')
  } catch(e) {
    console.log('Install template error:', e.message)
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { shop, token, title, html, action, productId, hideHeaderFooter } = req.body || {}
    
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    // Get products action
    if (action === 'get_products') {
      const data = await shopifyRequest(shop, token, '/products.json?limit=50&fields=id,title,images,variants', 'GET', null)
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    // Update pagina existenta
    if (action === 'update') {
      const { pageId } = req.body
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })

      let finalHtml = html
      if (hideHeaderFooter !== false) {
        const hideScript = `<script>(function(){function hide(){var s=['header','footer','nav','.header','.footer','.site-header','.site-footer','#shopify-section-header','#shopify-section-footer','#shopify-section-announcement-bar','.announcement-bar','.sticky-header','.page-header','.page__title','.page-title','h1.title','h1.page-title','.section-header','[class*="page-header"]'];s.forEach(function(sel){document.querySelectorAll(sel).forEach(function(el){el.style.display='none';});});document.body.style.paddingTop='0';var m=document.querySelector('main,#MainContent,.main-content');if(m){m.style.paddingTop='0';m.style.marginTop='0';}}hide();document.addEventListener('DOMContentLoaded',hide);setTimeout(hide,500);setTimeout(hide,1500);})();</script>`
        finalHtml = hideScript + html
      }

      const result = await shopifyRequest(shop, token, `/pages/${pageId}.json`, 'PUT', {
        page: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml }
      })
      if (result.page) {
        return res.status(200).json({
          success: true,
          pageUrl: `https://${shop}/pages/${result.page.handle}`,
          pageId: result.page.id
        })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })

    console.log('Publishing page for:', shop, 'Title:', title)
    console.log('HTML size:', Math.round(html.length / 1024), 'KB')

    // Daca hideHeaderFooter, injecteaza script care ascunde header/footer dupa load
    let finalHtml = html
    if (hideHeaderFooter !== false) {
      const hideScript = `<script>
(function(){
  function hide(){
    var selectors = [
      'header','footer','nav','.header','.footer',
      '.site-header','.site-footer','#shopify-section-header',
      '#shopify-section-footer','#shopify-section-announcement-bar',
      '.announcement-bar','.header-wrapper','.footer-wrapper',
      '[id*="HeaderWrapper"]','[id*="FooterWrapper"]',
      '.sticky-header','#StickyHeader',
      '.page-header','.page__title','.page-title',
      'h1.title','h1.page-title','.section-header',
      '[class*="page-header"]','[class*="page__header"]'
    ];
    selectors.forEach(function(s){
      document.querySelectorAll(s).forEach(function(el){
        el.style.display='none';
      });
    });
    document.body.style.paddingTop='0';
    var main=document.querySelector('main,#MainContent,.main-content');
    if(main){main.style.paddingTop='0';main.style.marginTop='0';}
  }
  hide();
  document.addEventListener('DOMContentLoaded',hide);
  setTimeout(hide,500);
  setTimeout(hide,1500);
})();
</script>`
      finalHtml = hideScript + html
    }

    const result = await shopifyRequest(shop, token, '/pages.json', 'POST', {
      page: {
        title: title || 'Pagina COD',
        body_html: finalHtml,
        published: true
      }
    })

    if (result.page) {
      console.log('Page created:', result.page.id, result.page.handle)

      // Daca hideHeaderFooter e true, instaleaza template fara header/footer
      if (hideHeaderFooter !== false) {
        await installLandingTemplate(shop, token)
        try {
          await shopifyRequest(shop, token, `/pages/${result.page.id}.json`, 'PUT', {
            page: { id: result.page.id, template_suffix: 'pagecod' }
          })
          console.log('Template pagecod setat pe pagina')
        } catch(e) {
          console.log('Template error (non-fatal):', e.message)
        }
      }

      // Asociaza cu produsul daca avem productId
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

      return res.status(200).json({
        success: true,
        pageUrl: `https://${shop}/pages/${result.page.handle}`,
        pageId: result.page.id
      })
    }

    throw new Error(JSON.stringify(result.errors || 'Unknown error'))
  } catch(err) {
    console.error('Publish error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
