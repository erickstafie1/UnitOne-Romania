// api/pages.js
const { prepareShopifyAuth } = require('./_shopifyAuth')
const { getPlan, countLPs } = require('./_plan')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { action, pageId, published } = req.body || {}
    const auth = await prepareShopifyAuth(req, res)

    if (action === 'list') {
      const [active, draft] = await Promise.all([
        auth.call('/products.json?limit=250&status=active&fields=id,title,handle,status,created_at,updated_at,template_suffix,tags'),
        auth.call('/products.json?limit=250&status=draft&fields=id,title,handle,status,created_at,updated_at,template_suffix,tags')
      ])
      const all = [...(active.products || []), ...(draft.products || [])]
      const pages = all
        .filter(p => p.template_suffix === 'pagecod' || p.template_suffix === 'pagecodfull' || (p.tags || '').includes('unitone-cod-page'))
        .map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          published: p.status === 'active',
          created_at: p.created_at,
          updated_at: p.updated_at,
          template_suffix: p.template_suffix,
          isProduct: true
        }))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      return res.status(200).json({ success: true, pages })
    }

    if (action === 'shop_info') {
      const data = await auth.call('/shop.json')
      const s = data.shop || {}
      return res.status(200).json({ success: true, shopOwner: s.shop_owner, name: s.name, email: s.email })
    }

    if (action === 'delete') {
      await auth.call('/products/' + pageId + '.json', 'DELETE')
      return res.status(200).json({ success: true })
    }

    if (action === 'unmark') {
      const current = await auth.call('/products/' + pageId + '.json')
      const currentTags = (current.product?.tags || '').split(',').map(t => t.trim()).filter(t => t && t !== 'unitone-cod-page').join(', ')
      await auth.call('/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, template_suffix: null, tags: currentTags }
      })
      return res.status(200).json({ success: true })
    }

    if (action === 'toggle') {
      if (published) {
        const plan = await getPlan(auth.call)
        if (plan.publishLimit < 9999) {
          const counts = await countLPs(auth.call)
          if (counts.active >= plan.publishLimit) {
            return res.status(402).json({ error: 'publish_limit_reached', plan: plan.plan, publishLimit: plan.publishLimit })
          }
        }
      }
      const data = await auth.call('/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, status: published ? 'active' : 'draft' }
      })
      return res.status(200).json({ success: true, page: data.product })
    }

    if (action === 'get') {
      const data = await auth.call('/products/' + pageId + '.json')
      const p = data.product
      return res.status(200).json({
        success: true,
        page: {
          id: p.id, title: p.title, handle: p.handle,
          body_html: p.body_html, published: p.status === 'active',
          template_suffix: p.template_suffix,
          isProduct: true
        }
      })
    }

    if (action === 'reinstall') {
      const themes = await auth.call('/themes.json')
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
      auth.call('/themes/' + id + '/assets.json?asset%5Bkey%5D=templates%2Fproduct.pagecod.json', 'DELETE').catch(() => {})

      const fullLayout = [
        '<!DOCTYPE html>',
        '<html lang="{{ shop.locale }}">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>{{ product.title }}</title>',
        '{{ content_for_header }}',
        '</head>',
        '<body style="margin:0;padding:0">',
        "{% section 'header' %}",
        '<main>{{ content_for_layout }}</main>',
        "{% section 'footer' %}",
        '</body>',
        '</html>'
      ].join('\n')

      await Promise.all([
        auth.call('/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'layout/pagecod.liquid', value: layoutLines.join('\n') } }),
        auth.call('/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'layout/pagecodfull.liquid', value: fullLayout } }),
        auth.call('/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/product.pagecod.liquid', value: "{% layout 'pagecod' %}{{ product.description }}" } }),
        auth.call('/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/product.pagecodfull.liquid', value: "{% layout 'pagecodfull' %}{{ product.description }}" } }),
        auth.call('/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'sections/pagecod-main.liquid', value: '<div data-unitone="true">{{ page.content }}</div>' } }),
        auth.call('/themes/' + id + '/assets.json', 'PUT', { asset: { key: 'templates/page.pagecod.json', value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] }) } })
      ])
      return res.status(200).json({ success: true })
    }

    res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('Pages error:', err.message)
    const code = /Missing shop|No token/i.test(err.message) ? 401 : 500
    res.status(code).json({ success: false, error: err.message })
  }
}
