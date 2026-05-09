// api/publish.js - fixed: no duplicates, clean merge
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
.product-form__quantity,.price--listing,
._rsi-buy-now-button,
[class*="product-form__button"]:not(.rsi-cod-form-gempages-button-overwrite),
[class*="recommendations"],.you-may-also-like,[class*="related-products"],
.complementary-products,.shopify-payment-button
{display:none!important}
body{padding-top:0!important}
main,#MainContent,.main-content{padding:0!important;margin:0!important;max-width:100%!important}
.page-width{max-width:100%!important;padding:0!important}
</style>
<script>(function(){
function h(){
  ['header','footer','nav','.header','.footer','.site-header','.site-footer',
  '#shopify-section-header','#shopify-section-footer','.announcement-bar',
  '.sticky-header','.product__title','.price--listing',
  '.product__media-wrapper','.product-form__quantity',
  '.shopify-payment-button','.you-may-also-like','.complementary-products'
  ].forEach(function(s){
    document.querySelectorAll(s).forEach(function(el){
      el.style.setProperty('display','none','important');
    });
  });
  document.body.style.paddingTop='0';
  var m=document.querySelector('main,#MainContent,.main-content');
  if(m){m.style.paddingTop='0';m.style.marginTop='0';}
}
h();document.addEventListener('DOMContentLoaded',h);
setTimeout(h,300);setTimeout(h,800);setTimeout(h,2000);
})();<\/script>`
}

function buildReleasitMover() {
  return `<div class="_rsi-cod-form-is-gempage" style="display:none"></div>
<script>
(function(){
  var moved = false;
  function moveBtn(){
    if(moved) return;
    var rsiContainer = document.querySelector('._rsi-buy-now-button-app-block-hook');
    var placeholders = document.querySelectorAll('.unitone-releasit-btn');
    if(rsiContainer && placeholders.length > 0){
      moved = true;
      placeholders.forEach(function(ph, i){
        if(i === 0){
          ph.innerHTML = '';
          ph.appendChild(rsiContainer);
          rsiContainer.style.cssText = 'width:100%;display:block';
        } else {
          var clone = rsiContainer.cloneNode(true);
          clone.style.cssText = 'width:100%;display:block';
          ph.innerHTML = '';
          ph.appendChild(clone);
        }
      });
      console.log('[UnitOne] Releasit moved to', placeholders.length, 'placeholders');
    }
  }
  var observer = new MutationObserver(function(){
    if(document.querySelector('._rsi-buy-now-button-app-block-hook')) moveBtn();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(moveBtn,500);setTimeout(moveBtn,1000);
  setTimeout(moveBtn,2000);setTimeout(moveBtn,4000);
})();
<\/script>`
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

    // GET PRODUCTS
    if (action === 'get_products') {
      const data = await shopifyRequest(shop, token, '/products.json?limit=50&fields=id,title,handle,images,variants', 'GET', null)
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    // UPDATE existing LP
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

    // PUBLISH new LP
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
    console.log('LP published on product:', result.product.id, result.product.handle)

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
