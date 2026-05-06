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
    // Gaseste tema activa
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const activeTheme = (themes.themes || []).find(t => t.role === 'main')
    if (!activeTheme) return
    
    const themeId = activeTheme.id
    
    // Verifica daca template-ul exista deja
    const assets = await shopifyRequest(shop, token, `/themes/${themeId}/assets.json?asset[key]=templates/page.landing.json`, 'GET', null)
    if (assets.asset) {
      console.log('Landing template already exists')
      return
    }

    // Creeaza template fara header/footer
    const templateContent = JSON.stringify({
      sections: {
        main: {
          type: "main-page",
          settings: {}
        }
      },
      order: ["main"]
    })

    // Creeaza si fisierul CSS pentru landing (full width, fara padding tema)
    await shopifyRequest(shop, token, `/themes/${themeId}/assets.json`, 'PUT', {
      asset: {
        key: 'templates/page.landing.json',
        value: JSON.stringify({
          sections: {
            "pagecod-content": {
              type: "pagecod-landing",
              settings: {}
            }
          },
          order: ["pagecod-content"]
        })
      }
    })

    // Creeaza sectiunea Liquid care afiseaza doar continutul paginii fara header/footer
    await shopifyRequest(shop, token, `/themes/${themeId}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-landing.liquid',
        value: `<style>
  /* UnitOne Romania - Landing Page - Fara header/footer */
  body { margin: 0 !important; padding: 0 !important; }
  header, footer, nav,
  .header, .footer, .site-header, .site-footer,
  #shopify-section-header, #shopify-section-footer,
  #shopify-section-announcement-bar,
  .announcement-bar, .announcement-bar-section,
  .header-section, .footer-section,
  [id*="header"], [id*="footer"],
  [class*="header"]:not([class*="subheader"]),
  [class*="footer"]:not([class*="subfooter"]),
  .cart-notification, .predictive-search,
  #cart-notification, .sticky-header { display: none !important; }
  main, .main-content, #MainContent { padding-top: 0 !important; margin-top: 0 !important; }
  .page-width { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
</style>
{{ page.content }}`
      }
    })

    console.log('Landing template installed successfully')
  } catch(e) {
    console.log('Install template error (non-fatal):', e.message)
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

    if (!html) return res.status(400).json({ error: 'Missing html' })

    console.log('Publishing page for:', shop, 'Title:', title)
    console.log('HTML size:', Math.round(html.length / 1024), 'KB')

    const result = await shopifyRequest(shop, token, '/pages.json', 'POST', {
      page: {
        title: title || 'Pagina COD',
        body_html: html,
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
            page: { id: result.page.id, template_suffix: 'landing' }
          })
          console.log('Template landing setat pe pagina')
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
