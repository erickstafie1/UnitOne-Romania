// v5 - debug version
const https = require('https')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = process.env.GEMINI_API_KEY
  
  // Debug complet
  console.log('=== DEBUG START ===')
  console.log('Method:', req.method)
  console.log('Body:', JSON.stringify(req.body))
  console.log('ApiKey exists:', !!apiKey)
  console.log('ApiKey prefix:', apiKey ? apiKey.substring(0, 10) : 'MISSING')

  if (!apiKey) {
    console.log('ERROR: No API key')
    return res.status(500).json({ error: 'GEMINI_API_KEY not set', images: [] })
  }

  const productName = req.body?.productName || 'product'
  console.log('ProductName:', productName)

  // Test cu un singur request simplu
  console.log('Making Gemini request...')
  
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `A photo of ${productName} on white background` }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
  })

  const result = await new Promise((resolve) => {
    const req2 = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 45000
    }, (response) => {
      const chunks = []
      response.on('data', c => chunks.push(c))
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        console.log('Gemini HTTP status:', response.statusCode)
        console.log('Gemini response (first 500 chars):', raw.substring(0, 500))
        try {
          const data = JSON.parse(raw)
          const parts = data.candidates?.[0]?.content?.parts || []
          for (const p of parts) {
            if (p.inlineData?.mimeType?.startsWith('image/')) {
              console.log('IMAGE FOUND! Size:', Math.round(p.inlineData.data.length / 1024), 'KB')
              resolve(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`)
              return
            }
          }
          console.log('No image in response. Parts count:', parts.length)
          resolve(null)
        } catch(e) {
          console.log('Parse error:', e.message)
          resolve(null)
        }
      })
    })
    req2.on('error', (e) => { console.log('Network error:', e.message); resolve(null) })
    req2.on('timeout', () => { req2.destroy(); console.log('TIMEOUT after 45s'); resolve(null) })
    req2.write(body)
    req2.end()
  })

  console.log('=== DEBUG END === Result:', result ? 'IMAGE OK' : 'NO IMAGE')
  
  res.status(200).json({
    success: true,
    images: [result, null, null, null],
    count: result ? 1 : 0,
    debug: true
  })
}
