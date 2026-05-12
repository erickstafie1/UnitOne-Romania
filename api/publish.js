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

// Overlay la z-index 9999 - Releasit popup e la 99999+ si apare deasupra
function buildOverlay(html) {
  return '<div id="unitone-lp" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box">' +
    html +
    '</div><!--/unitone-lp-->'
}

function buildHideScript() {
  return '<style>\n' +
    'html,body{overflow:hidden!important;margin:0!important;padding:0!important}\n' +
    '</style>'
}

// Releasit: clone vizual + delegare click pe placeholder
function buildReleasitGemPages(variantId) {
  return '<script>\n' +
    '(function(){\n' +
    '  function findReal(){\n' +
    '    var h=document.querySelector("._rsi-buy-now-button-app-block-hook");\n' +
    '    if(h){var b=h.querySelector("button");if(b)return b;}\n' +
    '    return document.querySelector("button.rsi_animation_none");\n' +
    '  }\n' +
    '\n' +
    '  // Adauga click handler direct pe fiecare placeholder (nu delegare globala)\n' +
    '  function setupPh(ph){\n' +
    '    ph.style.cursor="pointer";\n' +
    '    ph.addEventListener("click",function(e){\n' +
    '      e.preventDefault();e.stopPropagation();\n' +
    '      var btn=findReal();\n' +
    '      if(btn) btn.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}));\n' +
    '    });\n' +
    '  }\n' +
    '\n' +
    '  var done=false;\n' +
    '  function run(){\n' +
    '    if(done) return;\n' +
    '    var hook=document.querySelector("._rsi-buy-now-button-app-block-hook");\n' +
    '    if(!hook||!hook.querySelector("button")) return;\n' +
    '    var phs=document.querySelectorAll(".unitone-releasit-btn");\n' +
    '    if(!phs.length) return;\n' +
    '    done=true;\n' +
    '    phs.forEach(function(ph){\n' +
    '      ph.style.cssText="border:none!important;padding:0!important;min-height:0!important;display:block!important";\n' +
    '      var s=ph.querySelector(".unitone-placeholder-text");if(s)s.style.display="none";\n' +
    '      var clone=hook.cloneNode(true);\n' +
    '      clone.style.setProperty("width","100%","important");\n' +
    '      clone.style.setProperty("display","block","important");\n' +
    '      clone.style.setProperty("pointer-events","none","important");\n' +
    '      ph.appendChild(clone);\n' +
    '      setupPh(ph);\n' +
    '    });\n' +
    '  }\n' +
    '  document.addEventListener("DOMContentLoaded",run);\n' +
    '  var iv=setInterval(function(){run();if(done)clearInterval(iv);},300);\n' +
    '  setTimeout(function(){clearInterval(iv);},20000);\n' +
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
      if (codFormApp === 'releasit') finalHtml = buildReleasitGemPages(variantId) + finalHtml
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
      finalHtml = buildReleasitGemPages(variantId) + finalHtml
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
