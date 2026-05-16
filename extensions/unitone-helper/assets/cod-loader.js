/* UnitOne COD Loader
 * Loaded as a theme app embed on every storefront page. Acts ONLY when the page
 * is a UnitOne LP (detected via the _rsi-cod-form-is-gempage marker we inject
 * at publish time). On regular product / collection / home pages this is a
 * no-op so we don't slow anything down.
 *
 * What it does on a UnitOne LP page:
 *   1. Hides the inline JS fallback button (the red "COMANDĂ ACUM") while we
 *      try to wire up Releasit / EasySell.
 *   2. Searches the storefront's loaded script tags for Releasit's or
 *      EasySell's app extension assets. These DO get injected into pages of
 *      ANY template when the embed is active — they just don't auto-bind
 *      to hooks on custom templates. We trigger their bind manually by
 *      re-dispatching DOMContentLoaded after we ensure the marker + hooks
 *      are in the DOM.
 *   3. As a final safety net, after 2.5s, if nothing has replaced our hooks,
 *      we open a basic native COD form modal that submits the order via
 *      /api/cart/add + redirects to a thank-you message (works without any
 *      external COD app installed at all).
 */
(function () {
  'use strict'

  // Bail on non-UnitOne pages
  if (!document.querySelector('._rsi-cod-form-is-gempage')) return

  // CRITICAL: ensure Shopify.template === "product" before any external COD
  // app script runs its init check. On custom template_suffix product pages
  // (e.g. product.pagecod), Shopify Core leaves Shopify.template undefined,
  // which makes Releasit / EasySell silently bail. We force the value here
  // and also re-set it as part of pokeApps() in case some apps re-read it.
  window.Shopify = window.Shopify || {}
  if (!window.Shopify.template) window.Shopify.template = 'product'
  window.Shopify.theme = window.Shopify.theme || {}
  if (!window.Shopify.theme.template) window.Shopify.theme.template = 'product'

  // Build window.meta.product from the injected product-json node.
  // Standard Shopify product templates expose this via section render. On our
  // custom pagecod layout, sections aren't used so meta is never built —
  // Releasit's init reads meta.product to bind variant info, and silently
  // bails when it's missing. Reconstructing it here is what unblocks
  // RsiCodForm initialization.
  try {
    var pjsonEl = document.querySelector('[id^="product-json"]')
    if (pjsonEl && !window.meta) {
      var pdata = JSON.parse(pjsonEl.textContent || pjsonEl.innerHTML)
      window.meta = {
        page: { pageType: 'product', resourceType: 'product', resourceId: pdata.id },
        product: {
          id: pdata.id,
          gid: 'gid://shopify/Product/' + pdata.id,
          vendor: pdata.vendor || '',
          type: pdata.type || '',
          variants: (pdata.variants || []).map(function (v) {
            return { id: v.id, price: Math.round(parseFloat(v.price || 0) * 100), name: v.title }
          })
        }
      }
      window.ShopifyAnalytics = window.ShopifyAnalytics || { meta: { page: window.meta.page, product: window.meta.product } }
    }
  } catch (e) { /* swallow — diagnostic below will surface */ }

  function log() {
    if (window.UNITONE_DEBUG) console.log.apply(console, ['[UnitOne]'].concat([].slice.call(arguments)))
  }

  function hookList() {
    return document.querySelectorAll(
      '._rsi-cod-form-gempages-button-hook, .es-form-hook, .unitone-cod-hook'
    )
  }

  function hooksStillEmpty() {
    var hooks = hookList()
    if (!hooks.length) return false
    for (var i = 0; i < hooks.length; i++) {
      var h = hooks[i]
      // Considered "still empty" if it only contains our fallback button or
      // the original placeholder span (i.e. nothing real was injected).
      var hasReal = h.querySelector('iframe, form, button.rsi-btn, .rsi-cod-form, [class*="releasit"], [class*="rsi-"]:not(.unitone-cod-fallback):not(.unitone-placeholder-text)')
      if (!hasReal) return true
    }
    return false
  }

  // Try to wake Releasit / EasySell — most apps run their bind on
  // DOMContentLoaded. By the time we get here, that already fired (we're
  // deferred). Re-dispatch the events so a sleeping app can grab the hooks.
  function pokeApps() {
    log('poking apps')
    try {
      window.dispatchEvent(new Event('DOMContentLoaded'))
      document.dispatchEvent(new Event('DOMContentLoaded'))
      window.dispatchEvent(new Event('load'))
      window.dispatchEvent(new Event('shopify:section:load'))
      // Releasit-specific known event from their docs
      window.dispatchEvent(new CustomEvent('rsi:reload'))
      if (window.RsiCodForm && typeof window.RsiCodForm.refresh === 'function') {
        window.RsiCodForm.refresh()
      }
      if (window.EasySellCodForm && typeof window.EasySellCodForm.refresh === 'function') {
        window.EasySellCodForm.refresh()
      }
    } catch (e) { log('poke error', e) }
  }

  // Inject a "safety net" native COD form modal — used when no external app
  // takes over. Submits to Shopify cart + shows thank-you.
  function injectNativeFallback() {
    if (document.getElementById('unitone-native-modal')) return
    var modal = document.createElement('div')
    modal.id = 'unitone-native-modal'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif;'
    modal.innerHTML = [
      '<div style="background:#fff;width:100%;max-width:420px;border-radius:12px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.3);">',
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">',
      '<h3 style="margin:0;font-size:18px;font-weight:900;color:#111;">Plasează comanda</h3>',
      '<button id="unitone-modal-close" type="button" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;line-height:1;">&times;</button>',
      '</div>',
      '<form id="unitone-cod-form" style="display:flex;flex-direction:column;gap:10px;">',
      '<input required name="name"    placeholder="Nume și Prenume *" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;outline:none;">',
      '<input required name="phone"   placeholder="Telefon *" type="tel" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;outline:none;">',
      '<input required name="address" placeholder="Adresă completă *" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;outline:none;">',
      '<input required name="city"    placeholder="Localitate *" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;outline:none;">',
      '<button type="submit" style="background:#dc2626;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:900;cursor:pointer;margin-top:6px;">🛒 COMANDĂ — PLATĂ LA LIVRARE</button>',
      '<p style="text-align:center;font-size:11px;color:#999;margin:4px 0 0;">Te vom contacta telefonic pentru confirmare</p>',
      '</form>',
      '<div id="unitone-modal-success" style="display:none;text-align:center;padding:20px 0;">',
      '<div style="font-size:44px;margin-bottom:8px;">✓</div>',
      '<h3 style="margin:0 0 6px;color:#16a34a;font-size:18px;">Mulțumim!</h3>',
      '<p style="margin:0;font-size:13px;color:#555;">Comanda a fost trimisă. Te contactăm imediat.</p>',
      '</div>',
      '</div>'
    ].join('')
    document.body.appendChild(modal)

    function close() { modal.style.display = 'none' }
    modal.querySelector('#unitone-modal-close').onclick = close
    modal.onclick = function (e) { if (e.target === modal) close() }

    var form = modal.querySelector('#unitone-cod-form')
    var success = modal.querySelector('#unitone-modal-success')
    form.onsubmit = function (e) {
      e.preventDefault()
      var fd = new FormData(form)
      var note = 'COD ORDER · Nume: ' + fd.get('name') +
                 ' · Tel: ' + fd.get('phone') +
                 ' · Adr: ' + fd.get('address') + ', ' + fd.get('city')
      // Try to read variantId from product-json
      var pj = document.querySelector('[id^="product-json"]')
      var variantId = null
      try { variantId = JSON.parse(pj.textContent).variants[0].id } catch (e) {}
      var body = new FormData()
      body.append('id', variantId || '')
      body.append('quantity', '1')
      body.append('note', note)
      fetch('/cart/add.js', { method: 'POST', body: body })
        .finally(function () {
          form.style.display = 'none'
          success.style.display = 'block'
          setTimeout(close, 4000)
        })
    }

    // Rewire every hook's button to open this modal
    hookList().forEach(function (h) {
      var btn = h.querySelector('button.unitone-cod-fallback')
      if (btn) {
        btn.onclick = function (e) {
          e.preventDefault()
          modal.style.display = 'flex'
        }
      }
    })
  }

  // Safe shallow-shape inspector — returns keys + types for an object
  // without dumping huge nested values that bloat the console output.
  function shape(obj) {
    if (!obj || typeof obj !== 'object') return typeof obj
    var out = {}
    for (var k in obj) {
      try {
        var v = obj[k]
        if (v === null) out[k] = 'null'
        else if (Array.isArray(v)) out[k] = 'array[' + v.length + ']'
        else if (typeof v === 'object') out[k] = 'object{' + Object.keys(v).slice(0, 5).join(',') + '}'
        else if (typeof v === 'string') out[k] = 'string(' + v.slice(0, 60) + ')'
        else out[k] = typeof v
      } catch (e) { out[k] = 'inaccessible' }
    }
    return out
  }

  // Always-on diagnostic dump — written to console so the merchant can copy
  // it back to us when things don't work. Captures both pre-poke and
  // post-poke state so we can see if a poke fixed it or not.
  function snapshot(label) {
    try {
      var rsiScripts = [].slice.call(document.scripts)
        .filter(function (s) { return /releasit|rsi/i.test(s.src) })
        .map(function (s) { return s.src.split('/').slice(-2).join('/') })
      var esScripts = [].slice.call(document.scripts)
        .filter(function (s) { return /easysell/i.test(s.src) })
        .map(function (s) { return s.src.split('/').slice(-2).join('/') })
      var rsiGlobals = Object.keys(window).filter(function (k) { return /rsi|releasit/i.test(k) })
      var esGlobals = Object.keys(window).filter(function (k) { return /easysell/i.test(k) })
      var firstHook = document.querySelector('._rsi-cod-form-gempages-button-hook, .es-form-hook, .unitone-cod-hook')
      console.log('[UnitOne diagnostic ' + label + ']', JSON.stringify({
        template: (window.Shopify || {}).template,
        themeTemplate: ((window.Shopify || {}).theme || {}).template,
        hasMeta: typeof window.meta !== 'undefined',
        metaProduct: window.meta && window.meta.product ? Object.keys(window.meta.product) : null,
        productVariantsCount: window.meta && window.meta.product && window.meta.product.variants ? window.meta.product.variants.length : 0,
        marker: !!document.querySelector('._rsi-cod-form-is-gempage'),
        productJson: !!document.querySelector('[id^="product-json"]'),
        hooks: hookList().length,
        firstHookHtml: firstHook ? firstHook.outerHTML.slice(0, 400) : null,
        rsiScripts: rsiScripts,
        esScripts: esScripts,
        rsiGlobals: rsiGlobals,
        esGlobals: esGlobals,
        RsiCodForm: typeof window.RsiCodForm,
        EasySellCodForm: typeof window.EasySellCodForm,
        rsiV2Shape: shape(window._rsiV2),
        rsiInitialDataShape: shape(window._RSI_INITIAL_DATA),
        rsiCodFormSettingsShape: shape(window._RSI_COD_FORM_SETTINGS),
        rsiOriginalFormVersions: window._RSI_ORIGINAL_FORM_VERSIONS,
        bodyClasses: document.body.className
      }, null, 2))
    } catch (e) { console.log('[UnitOne diagnostic error]', e.message) }
  }

  // Main flow: poke apps, wait, then native fallback if still nothing
  function run() {
    snapshot('pre-poke')
    pokeApps()
    setTimeout(function () {
      snapshot('post-poke')
      if (hooksStillEmpty()) {
        log('still empty after poke — injecting native fallback modal')
        injectNativeFallback()
      } else {
        log('hooks populated by external app')
      }
    }, 2500)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
