// api/_templates.js
// Shared theme-template installer used by api/auth.js (post-OAuth) and
// api/pages.js (manual reinstall action). The `call` parameter is any
// function (path, method, body) -> Promise<data> so callers can pass
// either auth.call (Token Exchange path) or a raw helper (OAuth path).

const HIDE_SELECTORS = [
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
  '.product__view-details,.product__pickup-availabilities'
]

function buildOverlayLayout() {
  return [
    '<!DOCTYPE html>','<html lang="ro">','<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>{{ product.title }}</title>',
    '{{ content_for_header }}',
    // CRITICAL: Releasit / EasySell early-exit if Shopify.template isn't "product".
    // On custom template_suffix pages (product.pagecod), Shopify Core leaves it
    // undefined so their scripts bail. Force-set it before any external script runs.
    '<script>window.Shopify=window.Shopify||{};window.Shopify.template="product";window.Shopify.theme=window.Shopify.theme||{};window.Shopify.theme.template="product";</script>',
    '{%- if product -%}<script type="application/json" id="unitone-product-json">{{ product | json }}</script>{%- endif -%}',
    // Releasit + EasySell expect THIS specific product-json node to identify the
    // product attached to the page. Without it they can't bind the variantId to
    // the COD button hooks. Format matches Releasit's official GemPages snippet.
    '{%- if product -%}<script type="text/plain" class="product-json" id="product-json{{ product.id }}">{{ product | json }}</script>{%- endif -%}',
    '<style>',
    ...HIDE_SELECTORS,
    '{display:none!important}',
    'body{padding-top:0!important}',
    'main,#MainContent,.main-content{padding:0!important;margin:0!important;max-width:100%!important}',
    '.page-width{max-width:100%!important;padding:0!important}',
    // body classes mimic Shopify's default product page so theme app extensions
    // (Releasit / EasySell) that gate on template:product still recognize the page
    '</style>','</head>','<body class="template-product gradient" data-template="product">',
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
    'function hide(){',
    'H.forEach(function(s){try{document.querySelectorAll(s).forEach(function(el){',
    'el.style.setProperty("display","none","important");});}catch(e){}});',
    'document.querySelectorAll(".product__info-container h1,.product-single__title,.product_title").forEach(function(el){',
    'el.style.setProperty("display","none","important");});',
    'document.body.style.paddingTop="0";',
    'var m=document.querySelector("main,#MainContent,.main-content");',
    'if(m){m.style.paddingTop="0";m.style.marginTop="0";}',
    '}','hide();',
    'document.addEventListener("DOMContentLoaded",hide);',
    'setTimeout(hide,100);setTimeout(hide,300);setTimeout(hide,800);setTimeout(hide,2000);',
    '})();','<\/script>','</body>','</html>'
  ].join('\n')
}

const FULL_LAYOUT = [
  '<!DOCTYPE html>',
  '<html lang="{{ shop.locale }}">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>{{ product.title }}</title>',
  '{{ content_for_header }}',
  '<script>window.Shopify=window.Shopify||{};window.Shopify.template="product";window.Shopify.theme=window.Shopify.theme||{};window.Shopify.theme.template="product";</script>',
  // Same Releasit / EasySell product-json signal as in pagecod.liquid
  '{%- if product -%}<script type="text/plain" class="product-json" id="product-json{{ product.id }}">{{ product | json }}</script>{%- endif -%}',
  '</head>',
  '<body style="margin:0;padding:0">',
  "{% section 'header' %}",
  '<main>{{ content_for_layout }}</main>',
  "{% section 'footer' %}",
  '</body>',
  '</html>'
].join('\n')

// call(path, method, body) -> Promise<data>
// Returns { ok: bool, themeId, themeName, installed: [keys], failures: [{key, error}] }
// so callers can surface install failures to the merchant instead of silently
// swallowing them. Previously errors were caught + console.log'd, which meant
// merchants would never know their templates weren't installed.
async function installTemplates(call) {
  let themes
  try {
    themes = await call('/themes.json')
  } catch (e) {
    return { ok: false, error: 'themes_list_failed: ' + e.message }
  }
  const active = (themes.themes || []).find(t => t.role === 'main')
  if (!active) return { ok: false, error: 'no_main_theme' }
  const id = active.id

  // Stale legacy product.pagecod.json gets cleared (best-effort)
  call('/themes/' + id + '/assets.json?asset%5Bkey%5D=templates%2Fproduct.pagecod.json', 'DELETE').catch(() => {})

  const overlayLayout = buildOverlayLayout()
  const assets = [
    { key: 'layout/pagecod.liquid', value: overlayLayout },
    { key: 'layout/pagecodfull.liquid', value: FULL_LAYOUT },
    { key: 'templates/product.pagecod.liquid', value: "{% layout 'pagecod' %}{{ product.description }}" },
    { key: 'templates/product.pagecodfull.liquid', value: "{% layout 'pagecodfull' %}{{ product.description }}" },
    { key: 'sections/pagecod-main.liquid', value: '<div data-unitone="true">{{ page.content }}</div>' },
    { key: 'templates/page.pagecod.json', value: JSON.stringify({ sections: { main: { type: 'pagecod-main', settings: {} } }, order: ['main'] }) }
  ]

  const installed = []
  const failures = []
  await Promise.all(assets.map(a =>
    call('/themes/' + id + '/assets.json', 'PUT', { asset: a })
      .then(() => installed.push(a.key))
      .catch(e => failures.push({ key: a.key, error: e.message }))
  ))

  return {
    ok: failures.length === 0,
    themeId: id,
    themeName: active.name,
    installed,
    failures
  }
}

module.exports = { installTemplates }
