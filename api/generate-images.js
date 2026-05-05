const https = require('https')

// Genereaza o imagine cu Gemini - cu retry
async function generateGeminiImage(prompt, retries = 2) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await tryGemini(apiKey, prompt)
    if (result) return result
    if (attempt < retries) {
      console.log(`Retry ${attempt + 1} for prompt: ${prompt.substring(0, 50)}`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  return null
}

function tryGemini(apiKey, prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      responseMimeType: 'image/jpeg'
    }
  })

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 45000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          console.log('Gemini status:', res.statusCode)
          if (res.statusCode !== 200) {
            console.log('Gemini error response:', JSON.stringify(data).substring(0, 200))
            resolve(null)
            return
          }
          const parts = data.candidates?.[0]?.content?.parts || []
          for (const p of parts) {
            if (p.inlineData?.mimeType?.startsWith('image/')) {
              resolve(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`)
              return
            }
          }
          console.log('No image in response parts:', parts.length)
          resolve(null)
        } catch(e) {
          console.log('Gemini parse error:', e.message)
          resolve(null)
        }
      })
    })
    req.on('error', (e) => { console.log('Gemini request error:', e.message); resolve(null) })
    req.on('timeout', () => { req.destroy(); console.log('Gemini timeout'); resolve(null) })
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
    const { productName, benefits, styleDesc } = req.body
    if (!productName) return res.status(400).json({ error: 'productName lipseste' })

    console.log('=== GENERATE IMAGES START ===', productName)

    const prompts = [
      `Professional studio product photography of "${productName}", pure white background, soft shadow, commercial quality, sharp focus, no text, no people`,
      `Lifestyle photography: happy person using "${productName}" at home, natural warm lighting, authentic smile, cozy home setting, realistic photo`,
      `Extreme close-up macro shot of "${productName}" showing quality details and texture, white background, sharp focus, premium look`,
      `Satisfied customer holding "${productName}", smiling naturally, home environment, social proof photo, warm lighting`
    ]

    // Genereaza imaginile SECVENTIAL (nu paralel) ca sa nu depasim limita
    const images = []
    for (let i = 0; i < prompts.length; i++) {
      console.log(`Generating image ${i + 1}/4...`)
      const img = await generateGeminiImage(prompts[i])
      console.log(`Image ${i + 1}:`, img ? `OK (${Math.round(img.length / 1024)}KB)` : 'FAILED')
      images.push(img)
    }

    const successful = images.filter(Boolean).length
    console.log(`=== IMAGES DONE: ${successful}/4 ===`)

    res.status(200).json({
      success: true,
      images,
      count: successful
    })
  } catch(err) {
    console.error('Generate images error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
