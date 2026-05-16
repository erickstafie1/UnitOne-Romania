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
    '<script>(function(){setTimeout(function(){',
      'var hooks=document.querySelectorAll(".unitone-cod-hook,._rsi-cod-form-gempages-button-hook,.es-form-hook");',
      'hooks.forEach(function(h){',
        'var hasPlaceholder=h.querySelector(".unitone-placeholder-text");',
        'var isEmpty=h.children.length===0&&h.textContent.trim()==="";',
        'if(hasPlaceholder||isEmpty){',
          'h.innerHTML="";',
          'var b=document.createElement("button");',
          'b.className="unitone-cod-fallback";',
          'b.type="button";',
          'b.innerHTML="\\ud83d\\udecd COMAND\\u0102 ACUM";',
          'b.onclick=function(){alert("Pentru a primi comenzi, instaleaz\\u0103 Releasit sau EasySell COD Form din Shopify App Store \\u0219i activeaz\\u0103 integrarea cu pagini personalizate.")};',
          'h.appendChild(b);',
        '}',
      '});',
    '},3000);})();</script>'
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
