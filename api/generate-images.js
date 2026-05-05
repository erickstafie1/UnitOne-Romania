const https = require('https')

function generateGeminiImage(prompt, apiKey) {
  const model = 'gemini-2.5-flash-image'
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT']
    }
  })

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 50000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString()
          console.log(`Status: ${res.statusCode}, Response: ${raw.substring(0, 200)}`)
          const data = JSON.parse(raw)
          if (res.statusCode !== 200) {
            console.log('Error:', data.error?.message)
            resolve(null)
            return
          }
          const parts = data.candidates?.[0]?.content?.parts || []
          for (const p of parts) {
            if (p.inlineData?.mimeType?.startsWith('image/')) {
              console.log(`Got image! Size: ${Math.round(p.inlineData.data.length / 1024)}KB`)
              resolve(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`)
              return
            }
          }
          console.log('No image in parts:', JSON.stringify(parts).substring(0, 200))
          resolve(null)
        } catch(e) {
          console.log('Parse error:', e.message)
          resolve(null)
        }
      })
    })
    req.on('error', (e) => { console.log('Request error:', e.message); resolve(null) })
    req.on('timeout', () => { req.destroy(); console.log('Timeout'); resolve(null) })
    req.write(body)
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
    const { productName } = req.body
    if (!productName) return res.status(400).json({ error: 'productName lipseste' })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' })

    console.log('=== GENERATE IMAGES ===', productName)

    const prompts = [
      `Professional studio product photography of ${productName}. Pure white background, soft shadow below product, commercial quality lighting, sharp focus, photorealistic, 4K resolution. No people, no text.`,
      `Lifestyle photo: happy man using ${productName} at home. Natural warm lighting, authentic smile, modern home setting, candid moment, photorealistic.`,
      `Extreme close-up macro photography of ${productName} showing premium quality, texture and craftsmanship details. White background, razor sharp focus, professional studio lighting.`,
      `Satisfied customer holding ${productName} and smiling. Home environment, warm lighting, genuine happiness, social proof photo, photorealistic portrait.`
    ]

    const images = []
    for (let i = 0; i < prompts.length; i++) {
      console.log(`\nGenerating image ${i + 1}/4...`)
      const img = await generateGeminiImage(prompts[i], apiKey)
      console.log(`Image ${i + 1}:`, img ? 'OK' : 'FAILED')
      images.push(img)
      // Pauza intre requesturi sa nu depasim rate limit
      if (i < prompts.length - 1) await new Promise(r => setTimeout(r, 1000))
    }

    const count = images.filter(Boolean).length
    console.log(`=== DONE: ${count}/4 ===`)
    res.status(200).json({ success: true, images, count })
  } catch(err) {
    console.error('Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
