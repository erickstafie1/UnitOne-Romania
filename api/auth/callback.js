const https = require('https')
const crypto = require('crypto')

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

async function installTemplates(shop, token) {
  try {
    const themes = await shopifyRequest(shop, token, '/themes.json', 'GET', null)
    const active = (themes.themes || []).find(t => t.role === 'main')
    if (!active) { console.log('No active theme'); return }
    const id = active.id
    console.log('Installing templates on theme:', id, active.name)

    // Layout pagecod - ascunde TOT ce e nativ din Shopify
    // Titlul produsului, pretul, butonul Add to Cart, header, footer
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
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif}

    /* Ascunde toate elementele native Shopify pe paginile pagecod */
    header,footer,nav,
    .header,.footer,.site-header,.site-footer,
    #shopify-section-header,#shopify-section-footer,
    .announcement-bar,.sticky-header,
    .product__title,.product__media-wrapper,
    .product-form__quantity,
    .price--listing,.price__container,.price-item,.price__regular,.price__sale,
    [class*="price--"],[class*="Price"],
    .product__info-container .h1,
    .product__info-container h1,
    .product__info-container h2,
    .product-single__title,.product_title,
    [class*="product-title"],[class*="ProductTitle"],
    ._rsi-buy-now-button,
    [class*="product-form__button"]:not(.rsi-cod-form-gempages-button-overwrite),
    .shopify-payment-button,
    [class*="recommendations"],.you-may-also-like,
    [class*="related-products"],.complementary-products,
    .product__view-details,.product-form__error-message-wrapper,
    .product__pickup-availabilities
    { display:none !important; }

    main,#MainContent,.main-content{
      padding:0 !important;
      margin:0 !important;
      max-width:100% !important;
    }
    .page-width{max-width:100% !important;padding:0 !important;}
  </style>
</head>
<body>
  {{ content_for_layout }}
  <script>
  (function(){
    var HIDE=[
      'header','footer','nav','.header','.footer',
      '.site-header','.site-footer',
      '#shopify-section-header','#shopify-section-footer',
      '.announcement-bar','.sticky-header',
      '.product__title','.product__media-wrapper',
      '.product-form__quantity',
      '.price--listing','.price__container','.price-item',
      '.price__regular','.price__sale',
      '._rsi-buy-now-button',
      '.shopify-payment-button',
      '.you-may-also-like','.complementary-products',
      '.product__pickup-availabilities',
      '.product__view-details'
    ];
    function hideAll(){
      HIDE.forEach(function(s){
        try{document.querySelectorAll(s).forEach(function(el){
          el.style.setProperty('display','none','important');
        });}catch(e){}
      });
      // Ascunde h1 nativ al produsului din tema (nu h1-urile din LP-ul nostru)
      document.querySelectorAll('.product__info-container h1, .product__info-container h2, .product-single__title, .product_title, [class*="product-title"]').forEach(function(el){
        el.style.setProperty('display','none','important');
      });
      // Ascunde elementele de pret
      document.querySelectorAll('[class*="price"]').forEach(function(el){
        if(!el.closest('.unitone-lp') && !el.closest('[data-unitone]')){
          el.style.setProperty('display','none','important');
        }
      });
      document.body.style.paddingTop='0';
      var m=document.querySelector('main,#MainContent,.main-content');
      if(m){m.style.paddingTop='0';m.style.marginTop='0';}
    }
    hideAll();
    document.addEventListener('DOMContentLoaded',hideAll);
    setTimeout(hideAll,100);
    setTimeout(hideAll,300);
    setTimeout(hideAll,800);
    setTimeout(hideAll,2000);
  })();
  <\/script>
</body>
</html>`
      }
    })
    console.log('Layout pagecod installed')

    // Sectiune produs - afiseaza doar description (LP-ul nostru)
    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-product.liquid',
        value: `<div class="pagecod-lp" data-unitone="true">{{ product.description }}</div>`
      }
    })
    console.log('Section installed')

    // Template produs pagecod
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

    // Template pagina (backward compat)
    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'sections/pagecod-main.liquid',
        value: `<div data-unitone="true">{{ page.content }}</div>`
      }
    })

    await shopifyRequest(shop, token, `/themes/${id}/assets.json`, 'PUT', {
      asset: {
        key: 'templates/page.pagecod.json',
        value: JSON.stringify({
          sections: { main: { type: 'pagecod-main', settings: {} } },
          order: ['main']
        })
      }
    })
    console.log('Page template installed')
    console.log('All templates installed successfully!')

  } catch(e) {
    console.log('Template install error:', e.message)
  }
}

function exchangeToken(shop, code) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    const req = https.request({
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  const { shop, code, hmac } = req.query
  if (!shop || !code) return res.status(400).send('Missing parameters')

  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  const params = Object.keys(req.query).filter(k => k !== 'hmac').sort().map(k => `${k}=${req.query[k]}`).join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(params).digest('hex')
  if (digest !== hmac) return res.status(400).send('Invalid HMAC')

  try {
    const { access_token } = await exchangeToken(shop, code)

    // Reinstaleaza templatele de fiecare data la auth (ca sa fie mereu up-to-date)
    installTemplates(shop, access_token).catch(e => console.log('Template install failed:', e.message))

    const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
    const host = Buffer.from(`admin.shopify.com/store/${shop.replace('.myshopify.com', '')}`).toString('base64')
    res.redirect(`${appUrl}?shop=${shop}&host=${host}&token=${access_token}`)
  } catch(e) {
    res.status(500).send('OAuth error: ' + e.message)
  }
}
