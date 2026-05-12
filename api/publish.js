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

// CSS minimal: overlay acopera vizual tot, doar prevenim scrollul din spate
function buildHideScript() {
  return '<style>\n' +
    'html,body{overflow:hidden!important;margin:0!important;padding:0!important}\n' +
    '</style>'
}

// Releasit: muta hook-ul in overlay + watch pentru modalul Releasit injectat in body
function buildReleasitGemPages(variantId) {
  const vid = variantId || ''
  return '<script>\n' +
    '(function(){\n' +
    '  var done = false;\n' +
    '\n' +
    '  function getOverlay(){ return document.getElementById("unitone-lp"); }\n' +
    '\n' +
    '  function findTarget(){\n' +
    '    var hook = document.querySelector("._rsi-buy-now-button-app-block-hook");\n' +
    '    if(hook && hook.querySelector("button")) return hook;\n' +
    '    var gem = document.querySelector(".rsi-cod-form-gempages-button-overwrite");\n' +
    '    if(gem) return gem;\n' +
    '    return document.querySelector("button.rsi_animation_none");\n' +
    '  }\n' +
    '\n' +
    '  function moveBtn(){\n' +
    '    if(done) return;\n' +
    '    var target = findTarget();\n' +
    '    var phs = document.querySelectorAll(".unitone-releasit-btn");\n' +
    '    if(!target || !phs.length) return;\n' +
    '    var overlay = getOverlay();\n' +
    '    if(overlay && overlay.contains(target)){ done=true; return; }\n' +
    '    done = true;\n' +
    '    var realBtn = (target.querySelector && target.querySelector("button")) || target;\n' +
    '    phs.forEach(function(ph, i){\n' +
    '      ph.style.border="none"; ph.style.padding="0"; ph.style.minHeight="";\n' +
    '      var s=ph.querySelector(".unitone-placeholder-text"); if(s) s.style.display="none";\n' +
    '      if(i===0){\n' +
    '        target.style.setProperty("width","100%","important");\n' +
    '        target.style.setProperty("display","block","important");\n' +
    '        ph.appendChild(target);\n' +
    '        enableClicks(target);\n' +
    '      } else {\n' +
    '        var proxy = document.createElement("button");\n' +
    '        proxy.className = realBtn.className;\n' +
    '        proxy.innerHTML = realBtn.innerHTML;\n' +
    '        proxy.style.cssText="width:100%!important;display:block!important;cursor:pointer;";\n' +
    '        proxy.addEventListener("click", function(e){ e.preventDefault(); realBtn.click(); });\n' +
    '        ph.appendChild(proxy);\n' +
    '      }\n' +
    '    });\n' +
    '    watchRsiModals(realBtn);\n' +
    '  }\n' +
    '\n' +
    '  // Dupa click pe buton Releasit, muta orice modal/form injectat in body in overlay\n' +
    '  function watchRsiModals(realBtn){\n' +
    '    realBtn.addEventListener("click", function(){\n' +
    '      var observer = new MutationObserver(function(muts){\n' +
    '        muts.forEach(function(m){\n' +
    '          m.addedNodes.forEach(function(node){\n' +
    '            if(node.nodeType!==1) return;\n' +
    '            var overlay=getOverlay();\n' +
    '            if(!overlay||overlay.contains(node)) return;\n' +
    '            overlay.appendChild(node);\n' +
    '          });\n' +
    '        });\n' +
    '      });\n' +
    '      observer.observe(document.body,{childList:true,subtree:false});\n' +
    '      setTimeout(function(){ observer.disconnect(); },5000);\n' +
    '    });\n' +
    '  }\n' +
    '\n' +
    '  function enableClicks(el){\n' +
    '    el.style.setProperty("pointer-events","auto","important");\n' +
    '    el.querySelectorAll("*").forEach(function(c){ c.style.setProperty("pointer-events","auto","important"); });\n' +
    '  }\n' +
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
