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
    const { shop, token, title, html, action, productId, hideHeaderFooter, codFormApp, variantId, productHandle } = req.body || {}
    
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

    // Injecteaza trigger pentru COD form - iframe overlay
    if (codFormApp === 'releasit' || codFormApp === 'easysell') {
      const vid = variantId || '0'
      const productHandle = variantId ? 'products/unknown' : ''
      
      const triggerScript = `<script>
(function(){
  var VARIANT_ID = '${vid}';
  window._PRODUCT_HANDLE = '${productHandle || ''}';

  function openCODForm(varId) {
    console.log('[UnitOne] Opening COD form for variant:', varId);
    
    // Creeaza overlay fullscreen cu iframe la pagina produsului
    var overlay = document.createElement('div');
    overlay.id = 'unitone-cod-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;flex-direction:column;animation:fadeIn 0.2s ease';
    
    // Header overlay cu buton inchidere
    var header = document.createElement('div');
    header.style.cssText = 'background:#111;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
    header.innerHTML = '<span style="color:#fff;font-size:14px;font-weight:600">Finalizează comanda</span><button onclick="document.getElementById(\'unitone-cod-overlay\').remove()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit">✕ Închide</button>';
    
    // Iframe cu pagina produsului - Releasit e activ acolo
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'flex:1;width:100%;border:none;background:#fff';
    iframe.src = '/products/' + (window._PRODUCT_HANDLE || '') + '?variant=' + varId + '&rsi_cod_open=1';
    
    overlay.appendChild(header);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    
    // Adauga CSS animatie
    var style = document.createElement('style');
    style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(style);
    
    console.log('[UnitOne] Overlay created, loading product page with Releasit');
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.releasit-button, .es-cod-button, [data-cod-trigger]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var varId = btn.getAttribute('data-variant-id') || VARIANT_ID;
    openCODForm(varId);
  });

  console.log('[UnitOne] COD overlay ready. Variant:', VARIANT_ID);
})();
</script>`
      finalHtml = triggerScript + finalHtml
      console.log('COD overlay script injected for:', codFormApp, 'variant:', vid)
    }

    // Inlocuieste VARIANT_ID cu variantId real daca avem
    if (variantId) {
      finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
      console.log('Variant ID set:', variantId)
    }

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
