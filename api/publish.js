// api/publish.js
const { prepareShopifyAuth } = require('./_shopifyAuth')
const { getPlan, countLPs } = require('./_plan')

const OVERLAY_STYLE = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box'
const EMBED_STYLE = 'background:#fff;width:100%;max-width:100%;margin:0 auto'

function applyWrapper(html, mode) {
  const style = mode === 'embed' ? EMBED_STYLE : OVERLAY_STYLE
  const wrapperMatch = html.match(/<div[^>]*id="unitone-lp"[^>]*>/)
  if (wrapperMatch) {
    const newWrapper = wrapperMatch[0]
      .replace(/\sstyle="[^"]*"/, '')
      .replace(/>$/, ` style="${style}">`)
    return html.replace(wrapperMatch[0], newWrapper)
  }
  return `<div id="unitone-lp" style="${style}">${html}</div><!--/unitone-lp-->`
}

function ensureCloseMarker(html) {
  if (html.includes('<!--/unitone-lp-->')) return html
  const lastClose = html.lastIndexOf('</div>')
  if (lastClose === -1) return html + '<!--/unitone-lp-->'
  return html.slice(0, lastClose + 6) + '<!--/unitone-lp-->' + html.slice(lastClose + 6)
}

function buildOverlay(html) { return ensureCloseMarker(applyWrapper(html, 'overlay')) }
function buildEmbed(html) { return ensureCloseMarker(applyWrapper(html, 'embed')) }

function buildHideScript() {
  return '<style>\n' +
    'html,body{overflow:hidden!important;margin:0!important;padding:0!important}\n' +
    '</style>'
}

// Universal COD form mode — works with BOTH Releasit and EasySell out of the box.
// Selectors below use CLASS (not ID), so multiple buttons per page all get processed
// instead of just the first one. The hidden `_rsi-cod-form-is-gempage` marker tells
// Releasit's storefront script that this page is a GemPages-style integration.
//
// Defensive fallback: after 3s, if a hook still contains our placeholder span
// (meaning neither Releasit nor EasySell processed it — either not installed,
// integration not enabled in app settings, or script not loaded on the template),
// we inject a visible "COMANDĂ ACUM" button so the customer at least sees SOMETHING
// instead of an invisible 0px element. The fallback button shows an alert telling
// the merchant what to fix.
function buildCodFormUniversal() {
  return [
    '<div class="_rsi-cod-form-is-gempage" style="display:none"></div>',
    '<style>',
    '.unitone-placeholder-text{display:none!important}',
    '.unitone-cod-hook,._rsi-cod-form-gempages-button-hook,.es-form-hook,.unitone-rel-hook,.unitone-releasit-btn{border:none!important;background:transparent!important;padding:0!important;min-height:0!important}',
    '.unitone-cod-fallback{display:block;width:100%;background:#dc2626;color:#fff;padding:18px 24px;border-radius:8px;text-align:center;font-size:17px;font-weight:900;text-decoration:none;cursor:pointer;border:none;font-family:inherit;letter-spacing:0.5px;box-sizing:border-box}',
    '.unitone-cod-fallback:hover{background:#b91c1c}',
    '</style>',
    '<script>(function(){',
      // Show a real button INSTANTLY (no 3s wait). If Releasit/EasySell
      // process the hook, they will replace the inner button with their
      // own. If they don't, the user still has a clickable button.
      'function paint(){',
        'var hooks=document.querySelectorAll(".unitone-cod-hook,._rsi-cod-form-gempages-button-hook,.es-form-hook");',
        'hooks.forEach(function(h){',
          'if(h.dataset.unitonePainted)return;',
          'var hasPlaceholder=h.querySelector(".unitone-placeholder-text");',
          'var isEmpty=h.children.length===0&&h.textContent.trim()==="";',
          'if(hasPlaceholder||isEmpty){',
            'h.innerHTML="";',
            'h.dataset.unitonePainted="1";',
            'var b=document.createElement("button");',
            'b.className="unitone-cod-fallback";',
            'b.type="button";',
            'b.innerHTML="\\ud83d\\udecd COMAND\\u0102 ACUM";',
            'b.onclick=function(){',
              // Diagnostic alert — tells the merchant EXACTLY what's missing
              'var rsiLoaded=!!window.RsiCodForm||!!window.RsiCheckout||!!window._rsi;',
              'var esLoaded=!!window.EasySellCodForm||!!window.easysell||document.querySelector("[data-easysell],script[src*=\\"easysell\\"]");',
              'var hookCount=document.querySelectorAll("._rsi-cod-form-gempages-button-hook,.es-form-hook,.unitone-cod-hook").length;',
              'var markerEl=document.querySelector("._rsi-cod-form-is-gempage");',
              'var pjsonEl=document.querySelector(\'[id^=\\"product-json\\"]\');',
              'var msg="Diagnostic Releasit / EasySell:\\n\\n"',
                '+"\\u2022 Hooks detectate \\u00een DOM: "+hookCount+"\\n"',
                '+"\\u2022 Marker _rsi-cod-form-is-gempage: "+(markerEl?"DA":"NU")+"\\n"',
                '+"\\u2022 product-json node: "+(pjsonEl?"DA ("+pjsonEl.id+")":"NU")+"\\n"',
                '+"\\u2022 Releasit script loaded: "+(rsiLoaded?"DA":"NU")+"\\n"',
                '+"\\u2022 EasySell script loaded: "+(esLoaded?"DA":"NU")+"\\n\\n";',
              'if(!rsiLoaded&&!esLoaded){',
                'msg+="\\u26A0 Niciun app COD nu \\u00ee\\u021bi \\u00eencarc\\u0103 scriptul.\\n";',
                'msg+="Mergi la Online Store \\u2192 Themes \\u2192 Customize \\u2192 App embeds, activeaz\\u0103 Releasit / EasySell, Save.";',
              '}else if(!markerEl){',
                'msg+="\\u26A0 Marker-ul lipse\\u0219te \\u2014 contacteaz\\u0103 dezvoltatorul.";',
              '}else if(!pjsonEl){',
                'msg+="\\u26A0 product-json lipse\\u0219te \\u2014 template-ul temei nu e actualizat. Reload\\u0103 app-ul UnitOne.";',
              '}else{',
                'msg+="\\u26A0 Toate semnalele sunt prezente. Mergi \\u00een app-ul COD \\u2192 Settings \\u2192 verific\\u0103 dac\\u0103 form-ul este designat \\u0219i salvat.";',
              '}',
              'alert(msg);',
            '};',
            'h.appendChild(b);',
          '}',
        '});',
      '}',
      // Paint twice: once IMMEDIATELY (so buttons appear on load), then again
      // after 1.5s in case Releasit took longer than expected (paint() is
      // idempotent via the dataset.unitonePainted flag).
      'if(document.readyState!=="loading"){paint();}else{document.addEventListener("DOMContentLoaded",paint);}',
      'setTimeout(paint,1500);',
    '})();</script>'
  ].join('')
}

// Detects whether the page has any COD button hook (either app, either marker).
function hasCodHook(html) {
  return html.includes('_rsi-cod-form-gempages-button-hook')
      || html.includes('es-form-hook')
      || html.includes('unitone-cod-hook')
      || html.includes('unitone-rel-hook')
}

// Adds id="unitone-cod-anchor" to the FIRST hook element on the page. Used by
// the auto-generated CTA scroll buttons (`<a href="#unitone-cod-anchor">`) so
// "Comandă acum" anchor links jump to the actual COD button location.
function addAnchorToFirstHook(html) {
  return html.replace(
    /<div\s+(class="[^"]*(?:unitone-cod-hook|_rsi-cod-form-gempages-button-hook|es-form-hook|unitone-rel-hook)[^"]*")/i,
    '<div id="unitone-cod-anchor" $1'
  )
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const body = req.body || {}
    const { title, html, action, productId, hideHeaderFooter, codFormApp, variantId } = body
    const auth = await prepareShopifyAuth(req, res)

    // Editor source metafield: pure GrapesJS html + css for lossless re-edit.
    // Shopify updates existing metafields when namespace+key match.
    const editorSourceMetafield = (body.editorHtml || body.editorCss) ? {
      metafields: [{
        namespace: 'unitone',
        key: 'editor_source',
        type: 'json',
        value: JSON.stringify({ html: body.editorHtml || '', css: body.editorCss || '' })
      }]
    } : {}

    if (action === 'get_products') {
      const data = await auth.call('/products.json?limit=50&fields=id,title,handle,images,variants')
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    if (action === 'update') {
      const { pageId } = body
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })
      let finalHtml = html
      if (codFormApp || hasCodHook(finalHtml)) {
        finalHtml = addAnchorToFirstHook(finalHtml)
        finalHtml = buildCodFormUniversal() + finalHtml
      }

      let templateSuffix
      if (hideHeaderFooter === false) {
        finalHtml = buildEmbed(finalHtml)
        templateSuffix = 'pagecodfull'
      } else {
        finalHtml = buildOverlay(finalHtml)
        finalHtml = buildHideScript() + finalHtml
        templateSuffix = 'pagecod'
      }

      const result = await auth.call('/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml, template_suffix: templateSuffix, ...editorSourceMetafield }
      })
      if (result.product) {
        return res.status(200).json({ success: true, pageUrl: 'https://' + auth.shop + '/products/' + result.product.handle, template_suffix: templateSuffix })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })
    if (!productId) return res.status(400).json({ error: 'Selecteaza un produs!' })

    const plan = await getPlan(auth.call)
    const counts = await countLPs(auth.call)
    if (counts.total >= plan.limit) {
      return res.status(402).json({ error: 'limit_reached', plan: plan.plan, limit: plan.limit })
    }
    const newStatus = counts.active >= plan.publishLimit ? 'draft' : 'active'

    let finalHtml = html

    if (codFormApp || hasCodHook(finalHtml)) {
      finalHtml = addAnchorToFirstHook(finalHtml)
      finalHtml = buildCodFormUniversal() + finalHtml
      console.log('COD universal hooks activated, variantId:', variantId)
    } else if (variantId) {
      finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
    }

    let templateSuffix
    if (hideHeaderFooter === false) {
      finalHtml = buildEmbed(finalHtml)
      templateSuffix = 'pagecodfull'
    } else {
      finalHtml = buildOverlay(finalHtml)
      finalHtml = buildHideScript() + finalHtml
      templateSuffix = 'pagecod'
    }

    console.log('HTML size:', Math.round(finalHtml.length / 1024), 'KB, status:', newStatus, 'plan:', plan.plan, 'template:', templateSuffix)

    const result = await auth.call('/products/' + productId + '.json', 'PUT', {
      product: {
        id: productId,
        body_html: finalHtml,
        template_suffix: templateSuffix,
        tags: 'unitone-cod-page',
        status: newStatus,
        ...(title && { title }),
        ...editorSourceMetafield
      }
    })

    if (!result.product) throw new Error(JSON.stringify(result.errors || 'Product update failed'))
    console.log('LP published:', result.product.id, result.product.handle, 'status:', result.product.status, 'template:', result.product.template_suffix)

    res.status(200).json({
      success: true,
      pageUrl: 'https://' + auth.shop + '/products/' + result.product.handle,
      pageId: result.product.id,
      variantId: result.product.variants?.[0]?.id,
      demoted: newStatus === 'draft',
      status: newStatus,
      template_suffix: templateSuffix,
      plan: plan.plan,
      publishLimit: plan.publishLimit
    })

  } catch(err) {
    console.error('Publish error:', err.message)
    if (err.message === 'REAUTH_REQUIRED') {
      const shop = err.shop || ''
      return res.status(401).json({ success: false, error: 'reauth_required', shop, authUrl: '/api/auth?shop=' + shop })
    }
    const code = /Missing shop|No token/i.test(err.message) ? 401 : 500
    res.status(code).json({ success: false, error: err.message })
  }
}
