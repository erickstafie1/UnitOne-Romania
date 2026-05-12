const https = require('https')

function shopifyGet(shop, token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2024-01' + path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
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
    req.end()
  })
}

async function getPlan(shop, token) {
  try {
    const data = await shopifyGet(shop, token, '/recurring_application_charges.json')
    const charges = data.recurring_application_charges || []
    const active = charges.find(c => c.status === 'active')
    if (!active) return { plan: 'free', limit: 3, publishLimit: 1 }
    const price = parseFloat(active.price)
    if (price === 50)  return { plan: 'basic', limit: 9999, publishLimit: 9999 }
    if (price === 150) return { plan: 'pro',   limit: 9999, publishLimit: 9999 }
    return { plan: 'free', limit: 3, publishLimit: 1 }
  } catch {
    return { plan: 'free', limit: 3, publishLimit: 1 }
  }
}

async function countLPs(shop, token) {
  const isLP = p => p.template_suffix === 'pagecod' || (p.tags || '').includes('unitone-cod-page')
  try {
    const [activeRes, draftRes] = await Promise.all([
      shopifyGet(shop, token, '/products.json?limit=250&status=active&fields=id,template_suffix,tags'),
      shopifyGet(shop, token, '/products.json?limit=250&status=draft&fields=id,template_suffix,tags')
    ])
    const totalActive = (activeRes.products || []).filter(isLP).length
    const totalDraft = (draftRes.products || []).filter(isLP).length
    return { total: totalActive + totalDraft, active: totalActive }
  } catch {
    return { total: 0, active: 0 }
  }
}

module.exports = { getPlan, countLPs }
