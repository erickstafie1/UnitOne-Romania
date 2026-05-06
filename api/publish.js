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
        catch(e) { reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Shopify timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { shop, token, title, html } = req.body || {}
    
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })
    if (!html) return res.status(400).json({ error: 'Missing html' })

    console.log('Publishing page for:', shop, 'Title:', title)
    console.log('HTML size:', Math.round(html.length / 1024), 'KB')

    const result = await shopifyRequest(shop, token, '/pages.json', 'POST', {
      page: {
        title: title || 'Pagina COD',
        body_html: html,
        published: true
      }
    })

    if (result.page) {
      console.log('Page created:', result.page.id, result.page.handle)
      return res.status(200).json({
        success: true,
        pageUrl: `https://${shop}/pages/${result.page.handle}`,
        pageId: result.page.id
      })
    }

    throw new Error(JSON.stringify(result.errors || 'Unknown error'))
  } catch(err) {
    console.error('Publish error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
