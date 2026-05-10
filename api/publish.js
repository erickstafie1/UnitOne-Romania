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

// Releasit: form ascuns pentru context produs + mover in placeholder-ele noastre
function buildReleasitGemPages(variantId) {
  const vid = variantId || ''
  return '<div class="_rsi-cod-form-is-gempage" style="display:none"></div>\n' +
    (vid ? '<form id="_unitone_rsi_form" action="/cart/add" method="post" style="position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;" novalidate><input type="hidden" name="id" value="' + vid + '"><button type="submit">add</button></form>\n' : '') +
    '<script>\n' +
    '(function(){\n' +
    '  var done = false;\n' +
    '  var VARIANT_ID = "' + vid + '";\n' +
    '\n' +
    '  function findBtn(){\n' +
    '    // Cauta butonul real Releasit (dupa ce s-a initializat)\n' +
    '    return document.querySelector("button.rsi_animation_none") ||\n' +
    '           document.querySelector("[class*=rsi_animation]") ||\n' +
    '           document.querySelector(".rsi-cod-form-gempages-button-overwrite");\n' +
    '  }\n' +
    '\n' +
    '  function cleanPh(){\n' +
    '    document.querySelectorAll(".unitone-releasit-btn").forEach(function(ph){\n' +
    '      ph.style.border="none"; ph.style.padding="0";\n' +
    '      var s=ph.querySelector(".unitone-placeholder-text"); if(s) s.style.display="none";\n' +
    '    });\n' +
    '  }\n' +
    '\n' +
    '  function moveBtn(){\n' +
    '    if(done) return;\n' +
    '    var btn = findBtn();\n' +
    '    var phs = document.querySelectorAll(".unitone-releasit-btn");\n' +
    '    if(!btn || !phs.length) return;\n' +
    '    var overlay = document.getElementById("unitone-lp");\n' +
    '    if(overlay && overlay.contains(btn)){ done=true; cleanPh(); return; }\n' +
    '    done=true; cleanPh();\n' +
    '    phs.forEach(function(ph,i){\n' +
    '      if(i===0){\n' +
    '        btn.style.cssText="width:100%!important;display:block!important;";\n' +
    '        ph.appendChild(btn);\n' +
    '      } else {\n' +
    '        // Proxy button - declanseaza originalul la click\n' +
    '        var proxy = document.createElement("button");\n' +
    '        proxy.className = btn.className;\n' +
    '        proxy.innerHTML = btn.innerHTML;\n' +
    '        proxy.style.cssText = "width:100%!important;display:block!important;cursor:pointer;";\n' +
    '        proxy.addEventListener("click", function(e){ e.preventDefault(); btn.click(); });\n' +
    '        ph.appendChild(proxy);\n' +
    '      }\n' +
    '    });\n' +
    '  }\n' +
    '\n' +
    '  // Debug vizual dupa 5s\n' +
    '  setTimeout(function(){\n' +
    '    var all=document.querySelectorAll(\'[class*="rsi"],[id*="rsi"]\');\n' +
    '    var info=[]; all.forEach(function(el){info.push(el.tagName+"."+el.className.toString().split(" ")[0]+" skel:"+!!el.querySelector(".rsi-btn-skel"));});\n' +
    '    var wRsi=Object.keys(window).filter(function(k){return k.toLowerCase().includes("rsi");});\n' +
    '    var dbg=document.createElement("div");\n' +
    '    dbg.style.cssText="position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#0f0;font-size:10px;padding:6px;z-index:9999999999;font-family:monospace;word-break:break-all;";\n' +
    '    dbg.textContent="RSI DOM: "+info.join(", ")+" | window: "+wRsi.join(",");\n' +
    '    document.getElementById("unitone-lp").appendChild(dbg);\n' +
    '  }, 5000);\n' +
    '\n' +
    '  document.addEventListener("DOMContentLoaded", moveBtn);\n' +
    '  var iv=setInterval(function(){ moveBtn(); if(done) clearInterval(iv); },300);\n' +
    '  setTimeout(function(){ clearInterval(iv); },15000);\n' +
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
