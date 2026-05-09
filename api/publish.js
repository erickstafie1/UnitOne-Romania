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
header,footer,nav,.header,.footer,.site-header,.site-footer,
#shopify-section-header,#shopify-section-footer,
.announcement-bar,.sticky-header,
.product__title,.product__media-wrapper,
.product-form__quantity,.price--listing,.price__container,
.price-item,.price__regular,.price__sale,
[class*='price--'],[class*='Price'],
.product__info-container h1,.product__info-container h2,
.product-single__title,.product_title,
[class*='product-title'],[class*='ProductTitle'],
._rsi-buy-now-button,
[class*='product-form__button']:not(.rsi-cod-form-gempages-button-overwrite),
.shopify-payment-button,
[class*='recommendations'],.you-may-also-like,
[class*='related-products'],.complementary-products,
.product__view-details,.product__pickup-availabilities
{display:none!important}
body{padding-top:0!important}
main,#MainContent,.main-content{padding:0!important;margin:0!important;max-width:100%!important}
.page-width{max-width:100%!important;padding:0!important}
</style>
<script>(function(){
  var H=['header','footer','nav','.header','.footer','.site-header','.site-footer',
    '#shopify-section-header','#shopify-section-footer','.announcement-bar','.sticky-header',
    '.product__title','.product__media-wrapper','.product-form__quantity',
    '.price--listing','.price__container','.price-item','.price__regular','.price__sale',
    '._rsi-buy-now-button','.shopify-payment-button',
    '.you-may-also-like','.complementary-products',
    '.product__pickup-availabilities','.product__view-details'];
  function hide(){
    H.forEach(function(s){try{document.querySelectorAll(s).forEach(function(el){el.style.setProperty('display','none','important');});}catch(e){}}); 
    document.querySelectorAll('.product__info-container h1,.product__info-container h2,.product-single__title,.product_title').forEach(function(el){el.style.setProperty('display','none','important');});
    document.querySelectorAll('[class*='price']').forEach(function(el){if(!el.closest('[data-unitone]'))el.style.setProperty('display','none','important');});
    document.body.style.paddingTop='0';
    var m=document.querySelector('main,#MainContent,.main-content');
    if(m){m.style.paddingTop='0';m.style.marginTop='0';}
  }
  hide();document.addEventListener('DOMContentLoaded',hide);
  setTimeout(hide,100);setTimeout(hide,500);setTimeout(hide,1500);
})();<\/script>`
}

// Releasit GemPages integration
// Releasit detecteaza ._rsi-cod-form-is-gempage si activeaza modul GemPages
// In modul GemPages, Releasit insusi injecteaza butonul COD in
// elementele cu clasa rsi-cod-form-gempages-button-overwrite
// Noi trebuie doar sa punem div-ul trigger si placeholder-ele cu clasa corecta
function buildReleasitScript() {
  return `<div class='_rsi-cod-form-is-gempage' style='display:none'></div>`
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

    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'get_products') {
      const data = await shopifyRequest(shop, token, '/products.json?limit=50&fields=id,title,handle,images,variants', 'GET', null)
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    if (action === 'update') {
      const { pageId } = body
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })
      let finalHtml = html
      if (codFormApp === 'releasit') finalHtml = buildReleasitScript() + finalHtml
      if (hideHeaderFooter !== false) finalHtml = buildHideScript() + finalHtml
      if (variantId) finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
      const result = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml }
      })
      if (result.product) {
        return res.status(200).json({ success: true, pageUrl: 'https://' + shop + '/products/' + result.product.handle })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })
    if (!productId) return res.status(400).json({ error: 'Selecteaza un produs!' })

    let finalHtml = html

    if (codFormApp === 'releasit') {
      finalHtml = buildReleasitScript() + finalHtml
      if (variantId) finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
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
