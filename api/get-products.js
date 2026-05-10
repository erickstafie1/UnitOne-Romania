const https = require('https')

function shopifyRequest(shop, token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: shop,
      path: `/admin/api/2024-01${path}`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      timeout: 30000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { shop, token } = req.body || {}
    if (!shop || !token) return res.status(400).json({ error: 'Missing params' })
    console.log('get-products shop:', shop, 'token prefix:', token?.substring(0,10))
    const data = await shopifyRequest(shop, token, '/products.json?limit=250&status=any&fields=id,title,handle,status,images,variants')
    console.log('get-products response keys:', Object.keys(data), 'count:', data.products?.length)
    if (data.errors) return res.status(401).json({ success: false, error: 'Acces refuzat: ' + JSON.stringify(data.errors) })
    res.status(200).json({ success: true, products: data.products || [], debug: { shop, count: data.products?.length, keys: Object.keys(data) } })
  } catch(e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
