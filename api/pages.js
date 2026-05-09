// api/pages.js
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
    const { action, shop, token, pageId, published } = req.body || {}
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'list') {
      // Nu folosim &fields= ca sa primim template_suffix in raspuns
      const data = await shopifyRequest(shop, token,
        '/products.json?limit=250&status=any',
        'GET', null)
      const pages = (data.products || [])
        .filter(p => p.template_suffix === 'pagecod')
        .map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          published: p.status === 'active',
          created_at: p.created_at,
          updated_at: p.updated_at,
          isProduct: true
        }))
      return res.status(200).json({ success: true, pages })
    }

    if (action === 'delete') {
      await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'DELETE', null)
      return res.status(200).json({ success: true })
    }

    if (action === 'toggle') {
      const data = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, status: published ? 'active' : 'draft' }
      })
      return res.status(200).json({ success: true, page: data.product })
    }

    if (action === 'get') {
      const data = await shopifyRequest(shop, token, '/products/' + pageId + '.json', 'GET', null)
      const p = data.product
      return res.status(200).json({
        success: true,
        page: {
          id: p.id, title: p.title, handle: p.handle,
          body_html: p.body_html, published: p.status === 'active',
          isProduct: true
        }
      })
    }

    res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('Pages error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
