const https = require('https')

async function generateGeminiImage(prompt, apiKey) {
  // Incercam mai multe modele Gemini
  const models = [
    'gemini-2.0-flash-exp-image-generation',
    'imagen-3.0-generate-002',
    'gemini-2.0-flash-preview-image-generation'
  ]

  for (const model of models) {
    console.log(`Trying model: ${model}`)
    const result = await tryModel(prompt, apiKey, model)
    if (result) {
      console.log(`Success with model: ${model}`)
      return result
    }
  }
  return null
}

function tryModel(prompt, apiKey, model) {
  const isImagen = model.startsWith('imagen')
  
  const body = isImagen
    ? JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' }
      })
    : JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          responseMimeType: 'image/jpeg'
        }
      })

  const path = isImagen
    ? `/v1/projects/project/locations/us-central1/publishers/google/models/${model}:predict?key=${apiKey}`
    : `/v1beta/models/${model}:generateContent?key=${apiKey}`

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
          console.log(`Model ${model} status: ${res.statusCode}`)
          console.log(`Response preview: ${raw.substring(0, 300)}`)
          
          const data = JSON.parse(raw)
          
          if (res.statusCode !== 200) {
            console.log('Error:', data.error?.message || 'unknown')
            resolve(null)
            return
          }

          // Cauta imaginea in response
          const parts = data.candidates?.[0]?.content?.parts || []
          for (const p of parts) {
            if (p.inlineData?.mimeType?.startsWith('image/')) {
              console.log(`Got image! Size: ${Math.round(p.inlineData.data.length / 1024)}KB`)
              resolve(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`)
              return
            }
          }
          
          console.log('No image in parts. Parts:', JSON.stringify(parts).substring(0, 200))
          resolve(null)
        } catch(e) {
          console.log('Parse error:', e.message)
          resolve(null)
        }
      })
    })
    req.on('error', (e) => { console.log('Request error:', e.message); resolve(null) })
    req.on('timeout', () => { req.destroy(); console.log('Timeout for', model); resolve(null) })
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

    console.log('=== GENERATE IMAGES START ===', productName)
    console.log('API Key prefix:', apiKey.substring(0, 8))

    const prompts = [
      `Professional studio product photo of ${productName}, white background, sharp focus, commercial quality, 4K`,
      `Person using ${productName} at home, lifestyle photo, natural lighting, happy expression`,
      `Close-up detail shot of ${productName}, macro photography, showing quality and texture`,
      `Happy customer holding ${productName}, smiling, home setting, social proof photo`
    ]

    const images = []
    for (let i = 0; i < prompts.length; i++) {
      console.log(`\n--- Image ${i + 1}/4 ---`)
      const img = await generateGeminiImage(prompts[i], apiKey)
      console.log(`Image ${i + 1} result:`, img ? 'OK' : 'FAILED')
      images.push(img)
    }

    const successful = images.filter(Boolean).length
    console.log(`\n=== IMAGES DONE: ${successful}/4 ===`)

    res.status(200).json({ success: true, images, count: successful })
  } catch(err) {
    console.error('Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
