// v5 - gemini parallel cu claude
const https = require('https')
const http = require('http')

function fetchWithScraper(url) {
  const apiKey = process.env.SCRAPER_API_KEY
  if (!apiKey) return fetchDirect(url)
  return fetchDirect(`http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=false`)
}

function fetchDirect(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0' },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : 'https://www.aliexpress.com' + res.headers.location
        return fetchDirect(loc).then(resolve)
      }
      const chunks = []
      const enc = res.headers['content-encoding']
      const done = () => resolve(Buffer.concat(chunks).toString('utf8'))
      if (enc === 'gzip') {
        const g = require('zlib').createGunzip()
        res.pipe(g); g.on('data', c => chunks.push(c)); g.on('end', done); g.on('error', () => resolve(''))
      } else {
        res.on('data', c => chunks.push(c)); res.on('end', done)
      }
    })
    req.on('error', () => resolve(''))
    req.on('timeout', () => { req.destroy(); resolve('') })
  })
}

function extractImages(html) {
  const images = new Set()
  try {
    const m = html.match(/"imagePathList"\s*:\s*(\[.*?\])/s)
    if (m) JSON.parse(m[1]).forEach(u => { if (u && u.startsWith('http')) images.add(u) })
  } catch(e) {}
  ;[/https:\/\/ae\d*\.alicdn\.com\/kf\/[A-Za-z0-9_\-]+\.jpg/gi].forEach(p => {
    ;(html.match(p) || []).forEach(url => {
      const clean = url.replace(/\\/g, '').split(/["'<>\s]/)[0]
      if (clean.length > 40 && !clean.includes('icon')) images.add(clean)
    })
  })
  return [...images].slice(0, 6)
}

function extractMeta(html) {
  let title = '', priceUSD = 0
  const tm = html.match(/"subject"\s*:\s*"([^"]{10,200})"/) || html.match(/<title[^>]*>([^<|]+)/i)
  if (tm?.[1]) title = tm[1].replace(/\s*[-|]\s*AliExpress.*$/i, '').replace(/&amp;/g, '&').trim()
  const pm = html.match(/"discountPrice"\s*:\s*\{"value"\s*:\s*"([0-9.]+)"/) || html.match(/US \$\s*([0-9.]+)/)
  if (pm?.[1]) priceUSD = parseFloat(pm[1])
  return { title, priceUSD }
}

function callClaude(productInfo, styleDesc) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const rp = productInfo.priceUSD > 0 ? Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10 : 149
  const styleInstruction = styleDesc ? `Clientul vrea: "${styleDesc}".` : 'Stil rosu/negru optimizat COD.'
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    system: `Expert marketing COD Romania. ${styleInstruction} Returneaza DOAR JSON valid, fara backtick-uri.`,
    messages: [{ role: 'user', content: `JSON pentru pagina COD produs: "${productInfo.title || 'produs'}" pret ~${productInfo.priceUSD} USD:
{"productName":"","headline":"","subheadline":"","price":${rp},"oldPrice":${Math.round(rp*1.6)},"bumpPrice":${Math.round(rp*0.2)},"stock":7,"timerMinutes":14,"reviewCount":1247,"style":{"primaryColor":"#dc2626","secondaryColor":"#111111","fontFamily":"Inter,system-ui,sans-serif","borderRadius":"12px"},"benefits":["b1","b2","b3","b4","b5","b6"],"howItWorks":[{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""}],"bumpProduct":"","testimonials":[{"text":"","name":"","city":"","stars":5},{"text":"","name":"","city":"","stars":5},{"text":"","name":"","city":"","stars":5},{"text":"","name":"","city":"","stars":5}],"faq":[{"q":"","a":""},{"q":"Cum se face plata?","a":"La livrare direct curierului."},{"q":"Cat dureaza livrarea?","a":"2-4 zile in toata Romania."},{"q":"Pot returna?","a":"Da, 30 zile retur gratuit."}]}` }]
  })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
      timeout: 25000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.error) throw new Error(data.error.message)
          const text = (data.content || []).map(c => c.text || '').join('')
          const start = text.indexOf('{')
          const end = text.lastIndexOf('}')
          if (start === -1 || end === -1) throw new Error('No JSON')
          resolve(JSON.parse(text.substring(start, end + 1)))
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude timeout')) })
    req.write(body)
    req.end()
  })
}

function geminiImage(prompt, apiKey) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
  })
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 45000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString()
          console.log('Gemini HTTP:', res.statusCode, raw.substring(0, 150))
          const data = JSON.parse(raw)
          const parts = data.candidates?.[0]?.content?.parts || []
          for (const p of parts) {
            if (p.inlineData?.mimeType?.startsWith('image/')) {
              console.log('Gemini image OK:', Math.round(p.inlineData.data.length/1024), 'KB')
              resolve(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`)
              return
            }
          }
          console.log('Gemini no image, parts:', parts.length)
          resolve(null)
        } catch(e) { console.log('Gemini err:', e.message); resolve(null) }
      })
    })
    req.on('error', (e) => { console.log('Gemini net err:', e.message); resolve(null) })
    req.on('timeout', () => { req.destroy(); console.log('Gemini timeout!'); resolve(null) })
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
    const { aliUrl, styleDesc } = req.body
    if (!aliUrl) return res.status(400).json({ error: 'aliUrl lipseste' })

    const geminiKey = process.env.GEMINI_API_KEY
    console.log('=== GENERATE v5 ===')
    console.log('Gemini key:', geminiKey ? 'OK ' + geminiKey.substring(0,8) : 'MISSING')

    // Promisiuni Gemini cu prompt generic pana stim produsul
    const genericPrompts = [
      'Professional studio product photography. White background, commercial quality, 4K, no text.',
      'Happy person using a product at home. Natural warm lighting, lifestyle photo, photorealistic.',
      'Close-up macro product detail shot. White background, sharp focus, premium quality.',
      'Happy customer holding a product, smiling. Home setting, warm light, social proof photo.'
    ]

    // Pornim Gemini IMEDIAT in paralel cu Claude + AliExpress
    const geminiPromises = geminiKey
      ? genericPrompts.map((p, i) => geminiImage(p, geminiKey).then(img => { console.log('Gemini', i+1, img ? 'OK' : 'FAIL'); return img }))
      : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)]

    // Claude + AliExpress in paralel cu Gemini
    const [html, copy] = await Promise.all([
      fetchWithScraper(aliUrl).catch(() => ''),
      callClaude({ title: '', priceUSD: 0 }, styleDesc || '')
    ])

    let aliImages = []
    if (html.length > 1000) {
      aliImages = extractImages(html)
      const meta = extractMeta(html)
      if (meta.title?.length > 5) copy.productName = meta.title.substring(0, 60)
      if (meta.priceUSD > 0) {
        const rp = Math.round(meta.priceUSD * 5 * 2.5 / 10) * 10
        copy.price = rp; copy.oldPrice = Math.round(rp*1.6); copy.bumpPrice = Math.round(rp*0.2)
      }
    }
    console.log('Ali images:', aliImages.length, 'Product:', copy.productName)

    // Asteapta Gemini sa termine
    const geminiImages = await Promise.all(geminiPromises)
    const goodGemini = geminiImages.filter(Boolean)
    console.log('Gemini OK:', goodGemini.length, '/4')

    copy.images = aliImages.length > 0
      ? [aliImages[0], ...goodGemini, ...aliImages.slice(1)].slice(0, 6)
      : goodGemini
    copy.aliImages = aliImages

    console.log('=== DONE === Images:', copy.images.length)
    res.status(200).json({ success: true, data: copy })
  } catch(err) {
    console.error('Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
