const https = require('https')

function shopifyRequest(shop, token, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: `/admin/api/2024-01${path}`,
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
        catch(e) { reject(new Error(Buffer.concat(chunks).toString().substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { action, shop, token, pageId, published, title } = req.body || {}
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'list') {
      const data = await shopifyRequest(shop, token, '/pages.json?limit=50&fields=id,title,handle,published,created_at,updated_at', 'GET', null)
      return res.status(200).json({ success: true, pages: data.pages || [] })
    }

    if (action === 'delete') {
      await shopifyRequest(shop, token, `/pages/${pageId}.json`, 'DELETE', null)
      return res.status(200).json({ success: true })
    }

    if (action === 'toggle') {
      const data = await shopifyRequest(shop, token, `/pages/${pageId}.json`, 'PUT', {
        page: { id: pageId, published }
      })
      return res.status(200).json({ success: true, page: data.page })
    }

    if (action === 'get') {
      const data = await shopifyRequest(shop, token, `/pages/${pageId}.json`, 'GET', null)
      return res.status(200).json({ success: true, page: data.page })
    }

    res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('Pages error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
