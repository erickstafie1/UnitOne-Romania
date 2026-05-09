// api/publish.js
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

function buildHideScript() {
  return `<style>
header, footer, nav,
.header, .footer, .site-header, .site-footer,
#shopify-section-header, #shopify-section-footer,
.announcement-bar, .sticky-header,
.product__title, .product__media-wrapper,
.product-form__quantity, .price--listing,
.price__container, .price-item, .price,
[class*="price"], [class*="Price"],
._rsi-buy-now-button,
[class*="product-form__button"]:not(.rsi-cod-form-gempages-button-overwrite),
[class*="recommendations"], .you-may-also-like,
[class*="related-products"], .complementary-products,
.shopify-payment-button,
.product__info-container h1,
.product__info-container h2,
[class*="product-title"],
[class*="ProductTitle"],
.product-single__title,
.product_title,
h1.title, h1.product-name
{ display: none !important; }
body { padding-top: 0 !important; }
main, #MainContent, .main-content {
  padding: 0 !important;
  margin: 0 !important;
  max-width: 100% !important;
}
.page-width { max-width: 100% !important; padding: 0 !important; }
</style>
<script>
(function() {
  var HIDE = [
    'header','footer','nav',
    '.header','.footer','.site-header','.site-footer',
    '#shopify-section-header','#shopify-section-footer',
    '.announcement-bar','.sticky-header',
    '.product__title','.product__media-wrapper',
    '.product-form__quantity','.price--listing',
    '.price__container','.price-item',
    '._rsi-buy-now-button',
    '[class*="price"]','[class*="Price"]',
    '[class*="product-title"]','[class*="ProductTitle"]',
    '.product-single__title','.product_title',
    '.shopify-payment-button',
    '.you-may-also-like','.complementary-products'
  ];
  function hideAll() {
    HIDE.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.setProperty('display', 'none', 'important');
        });
      } catch(e) {}
    });
    // Ascunde si h1 care contine titlul produsului (dar nu h1-urile din LP)
    document.querySelectorAll('h1').forEach(function(h) {
      var inLP = h.closest('[class*="pagecod"], .unitone-lp, #unitone-content');
      if (!inLP) h.style.setProperty('display', 'none', 'important');
    });
    document.body.style.paddingTop = '0';
    var m = document.querySelector('main, #MainContent, .main-content');
    if (m) { m.style.paddingTop = '0'; m.style.marginTop = '0'; }
  }
  hideAll();
  document.addEventListener('DOMContentLoaded', hideAll);
  setTimeout(hideAll, 100);
  setTimeout(hideAll, 500);
  setTimeout(hideAll, 1000);
  setTimeout(hideAll, 2000);
})();
</script>`
}

function buildReleasitMover() {
  return `<div class="_rsi-cod-form-is-gempage" style="display:none"></div>
<script>
(function() {
  var moved = false;

  function moveBtn() {
    if (moved) return;
    // Cauta butonul Releasit - incearca mai multi selectori
    var rsiBtn = 
      document.querySelector('._rsi-buy-now-button-app-block-hook') ||
      document.querySelector('[class*="_rsi-buy-now-button"]') ||
      document.querySelector('.rsi-cod-form-button') ||
      document.querySelector('[data-testid="rsi-button"]');

    var placeholders = document.querySelectorAll('.unitone-releasit-btn');

    console.log('[UnitOne] moveBtn called. rsiBtn:', !!rsiBtn, 'placeholders:', placeholders.length);

    if (rsiBtn && placeholders.length > 0) {
      moved = true;
      // Cloneaza pentru placeholder-ele extra, muta originalul in primul
      placeholders.forEach(function(ph, i) {
        ph.style.border = 'none';
        ph.style.padding = '0';
        ph.innerHTML = '';
        if (i === 0) {
          ph.appendChild(rsiBtn);
          rsiBtn.style.cssText = 'width:100% !important;display:block !important;';
        } else {
          var clone = rsiBtn.cloneNode(true);
          clone.style.cssText = 'width:100% !important;display:block !important;';
          ph.appendChild(clone);
        }
      });
      console.log('[UnitOne] Releasit moved to', placeholders.length, 'placeholders');
    }
  }

  // Observer pe tot documentul
  var observer = new MutationObserver(function() {
    var rsiBtn = 
      document.querySelector('._rsi-buy-now-button-app-block-hook') ||
      document.querySelector('[class*="_rsi-buy-now-button"]') ||
      document.querySelector('.rsi-cod-form-button');
    if (rsiBtn && !moved) {
      moveBtn();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Retry-uri cu interval
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    moveBtn();
    if (moved || attempts > 20) clearInterval(interval);
  }, 500);

})();
</script>`
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const body = req.body || {}
    const { shop, token, title, html, action, productId, hideHeaderFooter, codFormApp, variantId } = body

    console.log('PUBLISH action:', action, 'codFormApp:', codFormApp, 'productId:', productId)
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'get_products') {
      const data = await shopifyRequest(shop, token, '/products.json?limit=50&fields=id,title,handle,images,variants', 'GET', null)
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    if (action === 'update') {
      const { pageId } = body
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })
      let finalHtml = html
      if (codFormApp === 'releasit') finalHtml = buildReleasitMover() + finalHtml
      if (hideHeaderFooter !== false) finalHtml = buildHideScript() + finalHtml
      if (variantId) finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
      const result = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml }
      })
      if (result.product) {
        return res.status(200).json({
          success: true,
          pageUrl: 'https://' + shop + '/products/' + result.product.handle
        })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })
    if (!productId) return res.status(400).json({ error: 'Selecteaza un produs!' })

    let finalHtml = html

    if (codFormApp === 'releasit') {
      finalHtml = buildReleasitMover() + finalHtml
      if (variantId) finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
      console.log('Releasit mover added, variantId:', variantId)
    } else if (variantId) {
      finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
    }

    if (hideHeaderFooter !== false) {
      finalHtml = buildHideScript() + finalHtml
    }

    console.log('HTML size:', Math.round(finalHtml.length / 1024), 'KB')

    const result = await shopifyRequest(shop, token, '/products/' + productId + '.json', 'PUT', {
      product: {
        id: productId,
        body_html: finalHtml,
        template_suffix: 'pagecod',
        ...(title && { title })
      }
    })

    if (!result.product) throw new Error(JSON.stringify(result.errors || 'Product update failed'))
    console.log('LP published:', result.product.id, result.product.handle)

    res.status(200).json({
      success: true,
      pageUrl: 'https://' + shop + '/products/' + result.product.handle,
      pageId: result.product.id,
      variantId: result.product.variants?.[0]?.id
    })

  } catch(err) {
    console.error('Publish error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
