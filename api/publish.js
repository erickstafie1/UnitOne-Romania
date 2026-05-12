// api/publish.js
const https = require('https')
const { verifySessionToken, getStoredToken } = require('./_verify')
const { getPlan, countLPs } = require('./_plan')

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

const OVERLAY_STYLE = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box'
const EMBED_STYLE = 'background:#fff;width:100%;max-width:100%;margin:0 auto'

// Aplică style pe wrapper-ul existent #unitone-lp sau adaugă unul dacă lipsește
function applyWrapper(html, mode) {
  const style = mode === 'embed' ? EMBED_STYLE : OVERLAY_STYLE
  const wrapperMatch = html.match(/<div[^>]*id="unitone-lp"[^>]*>/)
  if (wrapperMatch) {
    // Scoate orice style existent + injectează noul style
    const newWrapper = wrapperMatch[0]
      .replace(/\sstyle="[^"]*"/, '')
      .replace(/>$/, ` style="${style}">`)
    return html.replace(wrapperMatch[0], newWrapper)
  }
  // Fallback: nu există wrapper - îl adaug
  return `<div id="unitone-lp" style="${style}">${html}</div><!--/unitone-lp-->`
}

// Adaugă comment de închidere ca să existe marker pentru extracție la edit
function ensureCloseMarker(html) {
  if (html.includes('<!--/unitone-lp-->')) return html
  // Adaugă markerul după ultimul </div> ca să găsim wrapper-ul mai târziu
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

// Releasit GemPages mode: triggerul face Releasit sa randeze butonul direct in .rsi-cod-form-gempages-button
function buildReleasitGemPages(variantId) {
  return '<div class="_rsi-cod-form-is-gempage" style="display:none"></div>'
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const body = req.body || {}
    let { shop, token, title, html, action, productId, hideHeaderFooter, codFormApp, variantId } = body

    const authHeader = req.headers['authorization'] || ''
    if (authHeader.startsWith('Bearer ')) {
      const verified = verifySessionToken(authHeader.slice(7))
      if (verified) {
        shop = verified.shop
        token = getStoredToken(req.headers.cookie || '', shop) || token
      }
    }

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

      let templateSuffix
      if (hideHeaderFooter === false) {
        finalHtml = buildEmbed(finalHtml)
        templateSuffix = 'pagecodfull'
      } else {
        finalHtml = buildOverlay(finalHtml)
        finalHtml = buildHideScript() + finalHtml
        templateSuffix = 'pagecod'
      }

      const result = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, title: title || 'Pagina COD', body_html: finalHtml, template_suffix: templateSuffix }
      })
      if (result.product) {
        return res.status(200).json({ success: true, pageUrl: 'https://' + shop + '/products/' + result.product.handle, template_suffix: templateSuffix })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })
    if (!productId) return res.status(400).json({ error: 'Selecteaza un produs!' })

    // Plan enforcement: total limit + auto-demote la draft daca publish limit atins
    const plan = await getPlan(shop, token)
    const counts = await countLPs(shop, token)
    if (counts.total >= plan.limit) {
      return res.status(402).json({ error: 'limit_reached', plan: plan.plan, limit: plan.limit })
    }
    const newStatus = counts.active >= plan.publishLimit ? 'draft' : 'active'

    let finalHtml = html

    if (codFormApp === 'releasit') {
      finalHtml = buildReleasitGemPages(variantId) + finalHtml
      console.log('Releasit mover added, variantId:', variantId)
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

    const result = await shopifyRequest(shop, token, '/products/' + productId + '.json', 'PUT', {
      product: {
        id: productId,
        body_html: finalHtml,
        template_suffix: templateSuffix,
        tags: 'unitone-cod-page',
        status: newStatus,
        ...(title && { title })
      }
    })

    if (!result.product) throw new Error(JSON.stringify(result.errors || 'Product update failed'))
    console.log('LP published:', result.product.id, result.product.handle, 'status:', result.product.status, 'template:', result.product.template_suffix)

    res.status(200).json({
      success: true,
      pageUrl: 'https://' + shop + '/products/' + result.product.handle,
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
    res.status(500).json({ success: false, error: err.message })
  }
}
