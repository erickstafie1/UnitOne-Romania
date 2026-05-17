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
  const styleInstruction = styleDesc ? `Context client: "${styleDesc}".` : ''
  // Prompt scris pentru a produce copy în stilul produsutil.ro:
  // - frază "PROBLEMĂ → REZOLVARE" cu cuvinte CAPITALIZATE la început
  // - testimoniale cu detalii CONCRETE despre cum a folosit produsul (nu "excelent")
  // - FAQ standard COD RO (plată, livrare, courier, garanție, telefon, retur)
  // - feature sections sunt mini-articole image+bullets care explică un beneficiu cheie
  const system = `Esti copywriter expert pentru landing page-uri COD din Romania. Scrii ca pentru produsutil.ro, nu ca un AI.

REGULI CRITICE:
1. ZERO fraze generic-AI gen "transforma-ti viata", "descopera magia", "revolutioneaza", "ultimate experience".
2. Fiecare beneficiu in format PROBLEMA->REZOLVARE: incepi cu 1-2 cuvinte CAPITALIZATE care nominalizeaza problema, urmat de "—" si rezolvarea concreta.
   Exemplu: "NU SE RASTOARNA — 4 ventuze tin farfuria fixa de masa"
   Exemplu: "FARA MIZERIE — baveta colectoare prinde tot ce cade"
3. Testimoniale: nume real RO + oras real RO (Bucuresti/Cluj/Constanta/Iasi/Timisoara/Brasov/Oradea/Sibiu/Galati/Ploiesti) + text 2-3 fraze cu detaliu CONCRET despre utilizare (cum, cand, ce s-a schimbat). NU "produs excelent recomand".
4. FAQ exact 6 intrebari in ordinea: (1) Ce metoda de plata? (2) Cat dureaza livrarea? (3) Cine livreaza? (4) Garantie? (5) Pot comanda prin telefon? (6) Politica retur?
5. Tot textul in romana corecta cu diacritice (a, i, s, t, ts).
${styleInstruction}

Returneaza DOAR JSON valid, fara markdown, fara backtick-uri, fara explicatii.`

  const schema = `{
  "productName": "Nume scurt produs (max 60 char)",
  "headline": "Titlu mare cu PROMISIUNEA pentru client (max 70 char). Ex: 'Copilul Mananca Singur, Fara Mizerie La Masa'",
  "subheadline": "1 fraza scurta sub titlu cu UVP (max 100 char)",
  "price": ${rp},
  "oldPrice": ${Math.round(rp*1.6)},
  "bumpPrice": ${Math.round(rp*0.2)},
  "giftValue": 33,
  "stock": 7,
  "timerMinutes": 14,
  "reviewCount": 1247,
  "phoneNumber": "0700 000 000",
  "urgencyMessage": "STOC LIMITAT - SE EPUIZEAZA RAPID",
  "riskReversalText": "Iti oferim 30 de zile sa incerci produsul. Daca nu esti multumit, iti facem rambursul integral, fara intrebari.",
  "style": {"primaryColor": "#dc2626", "secondaryColor": "#111111"},
  "topBenefits": [
    "PROBLEMA1 — rezolvarea concreta scurta",
    "PROBLEMA2 — rezolvarea concreta scurta",
    "PROBLEMA3 — rezolvarea concreta scurta"
  ],
  "benefits": [
    "BENEFICIU 1 cu detaliu",
    "BENEFICIU 2 cu detaliu",
    "BENEFICIU 3 cu detaliu",
    "BENEFICIU 4 cu detaliu",
    "BENEFICIU 5 cu detaliu"
  ],
  "featureSections": [
    {
      "title": "TITLU SCURT CU CAPS (max 40 char) — descrie UN beneficiu",
      "bullets": ["punct 1 concret", "punct 2 concret", "punct 3 concret"]
    },
    {
      "title": "TITLU SCURT 2 CU CAPS — alt beneficiu",
      "bullets": ["punct 1", "punct 2", "punct 3"]
    }
  ],
  "howItWorks": [
    {"title": "Pas 1 (3-5 cuvinte)", "desc": "1 fraza cu actiunea concreta"},
    {"title": "Pas 2", "desc": "1 fraza"},
    {"title": "Pas 3", "desc": "1 fraza"}
  ],
  "testimonials": [
    {"text": "2-3 fraze cu detaliu concret. Cum am folosit, ce s-a schimbat, recomandare scurta.", "name": "Nume RO", "city": "Oras RO", "stars": 5},
    {"text": "...", "name": "...", "city": "...", "stars": 5},
    {"text": "...", "name": "...", "city": "...", "stars": 5},
    {"text": "...", "name": "...", "city": "...", "stars": 5}
  ],
  "faq": [
    {"q": "Ce metoda de plata acceptati?", "a": "Plata se face ramburs la curier, la livrare. Verifici produsul si apoi platesti."},
    {"q": "Cat dureaza livrarea?", "a": "Livrarea se face in 2-4 zile lucratoare in toata Romania."},
    {"q": "Cine livreaza?", "a": "Livrarea se face prin Fan Courier / Sameday in toata tara."},
    {"q": "Am garantie?", "a": "Da, produsul are garantie de 24 luni. In caz de defect, il inlocuim gratuit."},
    {"q": "Pot comanda prin telefon?", "a": "Da, suni la numarul afisat pe pagina si plasezi comanda direct."},
    {"q": "Pot returna produsul?", "a": "Ai 30 de zile pentru retur fara intrebari. Banii inapoi integral."}
  ]
}`

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: system,
    messages: [{ role: 'user', content: `Genereaza JSON-ul de mai jos pentru produsul: "${productInfo.title || 'produs'}" (pret AliExpress ~${productInfo.priceUSD} USD, pret RO final ~${rp} LEI).

Studiaza numele produsului si gandeste-te:
- Ce PROBLEMA rezolva? (nu "ofera comoditate" — fii specific: "copilul varsa mancarea pe haine", "podeaua e plina de matase de la curatat", "spatele te doare cand stai pe scaun", etc.)
- Cine cumpara? (mama tanara, batran, sportiv, etc.) — adapteaza copy-ul
- Care e momentul cheie cand il foloseste? (descrie in featureSections)

Returneaza EXACT acest JSON schema completat:
${schema}` }]
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

// Descarca o imagine de la URL si o returneaza ca base64
function fetchImageAsBase64(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImageAsBase64(res.headers.location).then(resolve)
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const base64 = buffer.toString('base64')
        const mimeType = res.headers['content-type'] || 'image/jpeg'
        resolve({ base64, mimeType: mimeType.split(';')[0] })
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// Genereaza imagine cu Gemini - cu sau fara imagine input
function geminiImage(prompt, apiKey, inputImageUrl) {
  return new Promise(async (resolve) => {
    try {
      // Daca avem URL imagine de produs, o descarcam si o trimitem ca input
      let parts = [{ text: prompt }]
      
      if (inputImageUrl) {
        console.log('Fetching product image for Gemini input:', inputImageUrl.substring(0, 60))
        const imgData = await fetchImageAsBase64(inputImageUrl)
        if (imgData) {
          // Pune imaginea INAINTE de text
          parts = [
            { inlineData: { mimeType: imgData.mimeType, data: imgData.base64 } },
            { text: prompt }
          ]
          console.log('Product image attached to Gemini request:', Math.round(imgData.base64.length/1024), 'KB')
        }
      }

      const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      })

      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 50000
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
    } catch(e) { console.log('geminiImage err:', e.message); resolve(null) }
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

    // Claude + AliExpress in paralel - mai intai aflam produsul
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

    // Combinam: AliExpress (pozele reale) + Gemini (lifestyle + UGC)
    const pName = copy.productName || 'produs'
    
    // Folosim prima poza AliExpress ca input pentru Gemini
    // Gemini vede produsul real si face lifestyle/UGC cu el
    const heroImageUrl = aliImages[0] || null
    console.log('Product image for Gemini:', heroImageUrl ? 'YES' : 'NO')

    const geminiPrompts = [
      // Poza 1: produsul in actiune/folosinta, cinematic
      `This is a product. Create a stunning cinematic hero image showing this exact product being actively used in real life. Dynamic angle, dramatic professional lighting, rich colors, photorealistic. Show the product in action doing what it's meant to do. Magazine cover quality, 8K resolution. No text overlays.`,
      // Poza 2: lifestyle - persoana folosind produsul
      `This is a product. Create a lifestyle photo showing a happy attractive Romanian person 30-40 years old naturally and actively using this exact product in a modern home. Warm golden hour lighting, genuine joy on their face, shallow depth of field, photorealistic, editorial magazine quality. Product clearly visible in use.`,
      // Poza 3: produsul simplu pe fundal alb
      `This is a product. Create a clean simple product photo of this exact product on a pure white background. Center the product, soft even studio lighting, no shadows, no people, no props, no text. Simple commercial product photography.`,
      // Poza 4: UGC social proof
      `This is a product. Create an authentic UGC-style photo of a real-looking happy Romanian customer holding this exact product with a big smile and thumbs up. Casual modern home background, warm natural light. Very authentic and candid feel like a real person filmed it. Product must be clearly identifiable.`
    ]

    const geminiPromises = geminiKey
      ? geminiPrompts.map((p, i) => 
          geminiImage(p, geminiKey, heroImageUrl)
            .then(img => { console.log('Gemini', i+1, img ? 'OK' : 'FAIL'); return img })
        )
      : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)]

    const geminiImages = await Promise.all(geminiPromises)
    const goodGemini = geminiImages.filter(Boolean)
    console.log('Gemini OK:', goodGemini.length, '/4')

    // Layout final - toate 4 imagini generate cu Gemini
    // Fallback la AliExpress daca Gemini esueaza
    const ali = aliImages
    copy.images = [
      goodGemini[0] || ali[0] || null,  // Hero - produs in actiune
      goodGemini[1] || ali[1] || null,  // Lifestyle - persoana folosind
      goodGemini[2] || ali[2] || null,  // Detaliu - close-up premium
      goodGemini[3] || ali[3] || null   // UGC - client fericit
    ].filter(Boolean)
    copy.aliImages = aliImages

    console.log('=== DONE === Images:', copy.images.length)
    res.status(200).json({ success: true, data: copy })
  } catch(err) {
    console.error('Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
