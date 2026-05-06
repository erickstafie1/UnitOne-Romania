const https = require('https')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { shop, token, image, filename } = req.body || {}
    if (!shop || !token || !image) return res.status(400).json({ error: 'Missing params' })

    const match = image.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return res.status(400).json({ error: 'Invalid image format' })
    const [, mimeType, base64Data] = match

    console.log('Uploading image to Shopify Files:', filename, Math.round(base64Data.length/1024), 'KB')

    const query = JSON.stringify({
      query: `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            ... on MediaImage {
              id
              image { url }
            }
          }
          userErrors { field message }
        }
      }`,
      variables: {
        files: [{
          filename: filename || `pagecod-${Date.now()}.jpg`,
          mimeType,
          originalSource: `data:${mimeType};base64,${base64Data}`
        }]
      }
    })

    const result = await new Promise((resolve, reject) => {
      const reqHttp = https.request({
        hostname: shop,
        path: '/admin/api/2024-01/graphql.json',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
          'Content-Length': Buffer.byteLength(query)
        },
        timeout: 30000
      }, (response) => {
        const chunks = []
        response.on('data', c => chunks.push(c))
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
          catch(e) { reject(e) }
        })
      })
      reqHttp.on('error', reject)
      reqHttp.on('timeout', () => { reqHttp.destroy(); reject(new Error('Timeout')) })
      reqHttp.write(query)
      reqHttp.end()
    })

    const url = result?.data?.fileCreate?.files?.[0]?.image?.url
    const errors = result?.data?.fileCreate?.userErrors
    
    console.log('Upload result:', url ? 'OK - ' + url.substring(0, 60) : 'FAILED', errors)

    if (url) {
      res.status(200).json({ success: true, url })
    } else {
      res.status(200).json({ success: false, error: JSON.stringify(errors) })
    }
  } catch(err) {
    console.error('Upload error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
