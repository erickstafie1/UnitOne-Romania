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

  // Animation keyframes for Releasit "shaker" effect (their dashboard offers
  // shake/pulse options for buy-now buttons). Injected once.
  var animStyle = document.createElement('style')
  animStyle.textContent = '@keyframes unitone-shake{0%{transform:translateX(-2px)}100%{transform:translateX(2px)}}@keyframes unitone-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}'
  document.head.appendChild(animStyle)

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

  // Releasit's icon set: maps iconType strings to inline SVG. We use SVG so
  // the icon scales with the button font size and inherits the text color.
  var RSI_ICONS = {
    cart1: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-0.15em;margin-right:8px"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.6-1.4 2.4c-.2.3-.2.7 0 1l.4.6c.2.3.5.5.9.5H19v-2H7.4l1.1-2H17c.7 0 1.4-.4 1.7-1l3.6-6.6L20.6 4H5.2L4 1H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>',
    cart2: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-0.15em;margin-right:8px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
    bag1: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-0.15em;margin-right:8px"><path d="M19 7h-3V5.5a3.5 3.5 0 0 0-7 0V7H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h13c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-8.5-1.5a1.5 1.5 0 0 1 3 0V7h-3z"/></svg>',
    phone: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-0.15em;margin-right:8px"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.07 15.07 0 0 1-6.59-6.59l2.2-2.2a1 1 0 0 0 .24-1.02A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z"/></svg>',
    truck: '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-0.15em;margin-right:8px"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 1 0 6 0h6a3 3 0 1 0 6 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm12 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-1-7.5V9.5h2.5l1.96 2.5H17z"/></svg>'
  }

  // Reads the merchant's BUY NOW button config from Releasit's loaded settings
  // and applies it to every .unitone-cod-fallback button on the page so it looks
  // exactly like what they designed in the Releasit dashboard.
  // (Note: we use buyNowButton, NOT form.submitButton — the latter is the
  // submit button INSIDE the modal which Releasit itself renders.)
  function styleFallbackFromReleasit() {
    var s = window._RSI_COD_FORM_SETTINGS
    if (!s || !s.buyNowButton) return false
    var b = s.buyNowButton
    var style = b.style || {}

    var text = b.text || 'COMANDĂ ACUM'
    var subt = b.subt || ''
    var iconType = b.iconType || 'none'
    var shaker = b.shakerType || 'none'

    if (!window.__unitoneStyleDumped) {
      window.__unitoneStyleDumped = true
      console.log('[UnitOne] Releasit buyNow config applied:', b)
    }

    var btns = document.querySelectorAll('.unitone-cod-fallback')
    if (!btns.length) return false
    btns.forEach(function (btn) {
      // Build content: icon + text + optional subtitle
      var iconHtml = (iconType && iconType !== 'none' && RSI_ICONS[iconType]) ? RSI_ICONS[iconType] : ''
      var subtHtml = subt ? '<div style="font-size:0.75em;font-weight:400;opacity:0.85;margin-top:2px">' + subt + '</div>' : ''
      btn.innerHTML = iconHtml + '<span style="vertical-align:middle">' + text + '</span>' + subtHtml

      var apply = function (cssProp, val) { if (val != null && val !== '') btn.style.setProperty(cssProp, val, 'important') }

      apply('background-color', style.bgColor)
      apply('color', style.color)
      // Border: set width/style/color together so non-zero widths actually render
      if (typeof style.borderWidth === 'number') {
        apply('border-width', style.borderWidth + 'px')
        apply('border-style', style.borderWidth > 0 ? 'solid' : 'none')
        apply('border-color', style.borderColor)
      }
      if (typeof style.borderRadius === 'number') apply('border-radius', style.borderRadius + 'px')
      // fontSizeFactor: 1 = default 16px, 1.5 = 24px, etc.
      if (typeof style.fontSizeFactor === 'number') {
        apply('font-size', (16 * style.fontSizeFactor) + 'px')
      }
      // shadowOpacity: 0 = no shadow, 0.1 = subtle, 0.3+ = prominent
      if (typeof style.shadowOpacity === 'number' && style.shadowOpacity > 0) {
        apply('box-shadow', '0 4px 12px rgba(0,0,0,' + style.shadowOpacity + ')')
      } else if (style.shadowOpacity === 0) {
        apply('box-shadow', 'none')
      }

      // Shaker animation
      if (shaker && shaker !== 'none' && !btn.dataset.unitoneShaker) {
        btn.dataset.unitoneShaker = shaker
        var animMap = {
          shake: 'unitone-shake 0.5s ease-in-out infinite alternate',
          pulse: 'unitone-pulse 1.5s ease-in-out infinite',
          jiggle: 'unitone-shake 0.4s ease-in-out infinite alternate',
          bounce: 'unitone-pulse 1s ease-in-out infinite'
        }
        if (animMap[shaker]) btn.style.animation = animMap[shaker]
      }
    })
    return true
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

    // Rewire every hook's button. Priority: try Releasit V2 modal first
    // (their state machine already reached pageName:"fields" so the form is
    // ready), fall back to V1 RsiCodForm.show(), finally our native modal.
    hookList().forEach(function (h) {
      var btn = h.querySelector('button.unitone-cod-fallback')
      if (btn) {
        btn.onclick = function (e) {
          e.preventDefault()
          if (tryOpenRsiModal()) return
          modal.style.display = 'flex'
        }
      }
    })
  }

  // Returns true if a Releasit (or EasySell) modal was opened via their API.
  function tryOpenRsiModal() {
    try {
      var pjsonEl = document.querySelector('[id^="product-json"]')
      var pdata = pjsonEl ? JSON.parse(pjsonEl.textContent || pjsonEl.innerHTML) : null
      var productId = pdata ? pdata.id : null
      var variantId = pdata && pdata.variants && pdata.variants[0] ? pdata.variants[0].id : null
      // Releasit V2: state-driven UI. Setting isOpen + currentIds should open
      // the form modal (state already at pageName:"fields" with form data loaded).
      if (window._rsiV2 && typeof window._rsiV2.setState === 'function') {
        window._rsiV2.setState({
          isOpen: true,
          currentProductId: productId,
          currentVariantId: variantId
        })
        log('opened via _rsiV2.setState', { productId: productId, variantId: variantId })
        return true
      }
      // Releasit V1 fallback
      if (window.RsiCodForm && typeof window.RsiCodForm.show === 'function') {
        window.RsiCodForm.show()
        log('opened via RsiCodForm.show()')
        return true
      }
      // EasySell fallback
      if (window.EasySellCodForm && typeof window.EasySellCodForm.show === 'function') {
        window.EasySellCodForm.show()
        log('opened via EasySellCodForm.show()')
        return true
      }
    } catch (e) { log('tryOpenRsiModal error', e.message) }
    return false
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
        rsiV2State: (function () {
          try { return window._rsiV2 && typeof window._rsiV2.getState === 'function' ? shape(window._rsiV2.getState()) : null }
          catch (e) { return 'getState_threw: ' + e.message }
        })(),
        // VALUES for the state fields that decide whether Releasit V2 renders
        rsiV2StateValues: (function () {
          try {
            if (!window._rsiV2 || typeof window._rsiV2.getState !== 'function') return null
            var s = window._rsiV2.getState()
            return {
              pageName: s.pageName,
              page: s.page,
              availablePages: s.availablePages,
              currentProductId: s.currentProductId,
              currentVariantId: s.currentVariantId,
              productsLen: (s.products || []).length,
              isOpen: s.isOpen,
              isVisibilityValid: s.isVisibilityValid,
              isTotalAmountValid: s.isTotalAmountValid,
              loadingState: s.loadingState,
              loadingReason: s.loadingState && s.loadingState.loadingReason,
              testMode: s.testMode,
              hasFormConfig: !!s.form && Object.keys(s.form).length > 0
            }
          } catch (e) { return 'state_values_threw: ' + e.message }
        })(),
        rsiV2HtmlServiceShape: window._rsiV2 ? shape(window._rsiV2.htmlService) : null,
        rsiV2CartServiceShape: window._rsiV2 ? shape(window._rsiV2.cartService) : null,
        rsiInitialDataShape: shape(window._RSI_INITIAL_DATA),
        rsiCodFormSettingsShape: shape(window._RSI_COD_FORM_SETTINGS),
        rsiFormConfiguration: window._RSI_COD_FORM_SETTINGS && window._RSI_COD_FORM_SETTINGS.form ? shape(window._RSI_COD_FORM_SETTINGS.form) : null,
        rsiOriginalFormVersions: window._RSI_ORIGINAL_FORM_VERSIONS,
        bodyClasses: document.body.className
      }, null, 2))
    } catch (e) { console.log('[UnitOne diagnostic error]', e.message) }
  }

  // Wire every painted fallback button to try Releasit V2 setState FIRST.
  // We do this aggressively (every 500ms for 4s) because the painted button
  // can appear AFTER our cod-loader runs (publish.js script paints at t=0
  // and t=1500ms), and we need to ensure ALL of them get the right handler.
  function wireFallbackButtons() {
    hookList().forEach(function (h) {
      var btn = h.querySelector('button.unitone-cod-fallback')
      if (btn && !btn.dataset.unitoneWired) {
        btn.dataset.unitoneWired = '1'
        btn.onclick = function (e) {
          e.preventDefault()
          if (tryOpenRsiModal()) return
          // No Releasit/EasySell available — show native modal as last resort
          if (!document.getElementById('unitone-native-modal')) injectNativeFallback()
          var nm = document.getElementById('unitone-native-modal')
          if (nm) nm.style.display = 'flex'
        }
      }
    })
  }

  // Main flow: poke apps to wake Releasit V2, then re-wire fallback buttons
  // so click → setState. Native modal is built lazily on click.
  function run() {
    snapshot('pre-poke')
    pokeApps()
    // Re-wire + restyle repeatedly to catch buttons painted later by publish.js
    // script AND to apply Releasit styles as soon as their config is loaded.
    var wireCount = 0
    var wireInterval = setInterval(function () {
      wireFallbackButtons()
      styleFallbackFromReleasit()
      wireCount++
      if (wireCount > 8) clearInterval(wireInterval)  // 8 * 500ms = 4s of attempts
    }, 500)
    wireFallbackButtons()  // also wire immediately
    styleFallbackFromReleasit()
    setTimeout(function () {
      snapshot('post-poke')
      wireFallbackButtons()
      styleFallbackFromReleasit()
    }, 2500)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
