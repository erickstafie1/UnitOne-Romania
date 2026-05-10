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

// Overlay care acopera complet tema - nu mai depindem de hide selectori
function buildOverlay(html) {
  return '<div id="unitone-lp" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box">' +
    html +
    '</div><!--/unitone-lp-->'
}

// CSS minimal: ascunde scrollul temei din spate si elemente fixed cu z-index mare
function buildHideScript() {
  return '<style>\n' +
    'html,body{overflow:hidden!important;margin:0!important;padding:0!important}\n' +
    'body>*:not(#unitone-lp){display:none!important}\n' +
    '</style>'
}

// Releasit: folosim MutationObserver care asteapta butonul real
// si il muta in toate placeholder-ele .unitone-releasit-btn
function buildReleasitMover(variantId) {
  const vid = variantId || ''
  return '<div class="_rsi-cod-form-is-gempage" style="display:none"></div>\n' +
    '<script>\n' +
    '(function(){\n' +
    '  var VARIANT_ID = "' + vid + '";\n' +
    '  var moved = false;\n' +
    '  var attempts = 0;\n' +
    '\n' +
    '  function findRsiBtn(){\n' +
    '    return document.querySelector("._rsi-buy-now-button-app-block-hook") ||\n' +
    '           document.querySelector("[class*=_rsi-buy-now-button]") ||\n' +
    '           document.querySelector(".rsi-cod-form-button-wrapper") ||\n' +
    '           document.querySelector(".rsi-cod-form-gempages-button-overwrite") ||\n' +
    '           document.querySelector("[data-rsi-button]");\n' +
    '  }\n' +
    '\n' +
    '  function cleanPlaceholders(){\n' +
    '    document.querySelectorAll(".unitone-releasit-btn").forEach(function(ph){\n' +
    '      ph.style.cssText = "display:block;min-height:0;border:none;padding:0;margin:8px 0;";\n' +
    '      var s = ph.querySelector("span");\n' +
    '      if(s) s.style.display = "none";\n' +
    '    });\n' +
    '  }\n' +
    '\n' +
    '  function moveBtn(){\n' +
    '    if(moved) return;\n' +
    '    var btn = findRsiBtn();\n' +
    '    var overlay = document.getElementById("unitone-lp");\n' +
    '    var placeholders = document.querySelectorAll(".unitone-releasit-btn");\n' +
    '    if(!btn || placeholders.length === 0) return;\n' +
    '    if(overlay && overlay.contains(btn)){moved=true;return;}\n' +
    '    moved = true;\n' +
    '    placeholders.forEach(function(ph, i){\n' +
    '      ph.style.cssText = "display:block;min-height:0;border:none;padding:0;";\n' +
    '      if(i === 0){\n' +
    '        ph.appendChild(btn);\n' +
    '        btn.style.cssText = "width:100%!important;display:block!important;";\n' +
    '      } else {\n' +
    '        var clone = btn.cloneNode(true);\n' +
    '        clone.style.cssText = "width:100%!important;display:block!important;";\n' +
    '        ph.appendChild(clone);\n' +
    '      }\n' +
    '    });\n' +
    '    console.log("[UnitOne] Releasit moved to",placeholders.length,"placeholders");\n' +
    '  }\n' +
    '\n' +
    '  // Curata placeholder-ele vizuale (border dashed, text span) cat mai repede\n' +
    '  cleanPlaceholders();\n' +
    '  document.addEventListener("DOMContentLoaded", cleanPlaceholders);\n' +
    '\n' +
    '  // Observer pe tot documentul\n' +
    '  var obs = new MutationObserver(function(){\n' +
    '    if(!moved && findRsiBtn()) moveBtn();\n' +
    '  });\n' +
    '  obs.observe(document.documentElement,{childList:true,subtree:true});\n' +
    '\n' +
    '  // Retry la interval\n' +
    '  var iv = setInterval(function(){\n' +
    '    attempts++;\n' +
    '    moveBtn();\n' +
    '    if(moved || attempts > 30) clearInterval(iv);\n' +
    '  }, 300);\n' +
    '\n' +
    '  document.addEventListener("DOMContentLoaded", moveBtn);\n' +
    '})();\n' +
    '<\/script>'
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
      if (codFormApp === 'releasit') finalHtml = buildReleasitMover(variantId) + finalHtml
      finalHtml = buildOverlay(finalHtml)
      finalHtml = buildHideScript() + finalHtml
      const result = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml, template_suffix: 'pagecod' }
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
      finalHtml = buildReleasitMover(variantId) + finalHtml
      console.log('Releasit mover added, variantId:', variantId)
    } else if (variantId) {
      finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
    }

    finalHtml = buildOverlay(finalHtml)
    finalHtml = buildHideScript() + finalHtml

    console.log('HTML size:', Math.round(finalHtml.length / 1024), 'KB')

    const result = await shopifyRequest(shop, token, '/products/' + productId + '.json', 'PUT', {
      product: {
        id: productId,
        body_html: finalHtml,
        template_suffix: 'pagecod',
        tags: 'unitone-cod-page',
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
