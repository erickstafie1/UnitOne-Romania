// api/research.js
// Research agent — analizeaza produsul (din AliExpress/Amazon/Alibaba/Shopify/foto/
// competitor URL) si construieste un ICP (Ideal Customer Profile) complet pe care
// generate.js il foloseste mai tarziu pentru a genera LP-ul.
// Returneaza atat productInfo (title/description/specs/images) cat si icp
// (persona/pains/desires/beliefBarriers/hawkins/sophistication/niche/tone/urgency/length).

const https = require('https')
const http = require('http')
const { prepareShopifyAuth } = require('./_shopifyAuth')

// ─── Scraping helpers (re-used / adapted din generate.js) ───
function fetchWithScraper(url) {
  const apiKey = process.env.SCRAPER_API_KEY
  if (!apiKey) return fetchDirect(url)
  return fetchDirect('http://api.scraperapi.com?api_key=' + apiKey + '&url=' + encodeURIComponent(url) + '&render=false')
}

function fetchDirect(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0' },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : 'https://' + new URL(url).host + res.headers.location
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

// AliExpress meta extractor (specific patterns)
function extractAliMeta(html) {
  let title = '', priceUSD = 0, description = '', specs = []
  const tm = html.match(/"subject"\s*:\s*"([^"]{10,300})"/) || html.match(/<title[^>]*>([^<|]+)/i)
  if (tm?.[1]) title = tm[1].replace(/\s*[-|]\s*AliExpress.*$/i, '').replace(/&amp;/g, '&').trim()
  const pm = html.match(/"discountPrice"\s*:\s*\{"value"\s*:\s*"([0-9.]+)"/) || html.match(/US \$\s*([0-9.]+)/)
  if (pm?.[1]) priceUSD = parseFloat(pm[1])
  const dm = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.){50,2000})"/) || html.match(/<meta\s+name="description"\s+content="([^"]{50,500})"/i)
  if (dm?.[1]) description = dm[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)
  try {
    const sm = html.match(/"productProps"\s*:\s*\[([^\]]+)\]/)
    if (sm) {
      const props = sm[1].match(/"name"\s*:\s*"([^"]{2,40})"[^}]*"value"\s*:\s*"([^"]{2,80})"/g) || []
      specs = props.slice(0, 8).map(p => {
        const n = p.match(/"name"\s*:\s*"([^"]+)"/)?.[1]
        const v = p.match(/"value"\s*:\s*"([^"]+)"/)?.[1]
        return n && v ? (n + ': ' + v) : null
      }).filter(Boolean)
    }
  } catch (e) {}
  return { title, priceUSD, description, specs }
}

// Generic meta extractor pentru Amazon / Alibaba / orice site
function extractGenericMeta(html) {
  let title = '', priceUSD = 0, description = '', specs = []
  // Open Graph + title
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]{5,300})"/i)
  if (ogTitle?.[1]) title = ogTitle[1].trim()
  else {
    const tt = html.match(/<title[^>]*>([^<|]+)/i)
    if (tt?.[1]) title = tt[1].replace(/\s*[-|]\s*(Amazon|Alibaba|.*\.com).*$/i, '').trim()
  }
  // Description
  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]{30,2000})"/i) ||
                 html.match(/<meta\s+name="description"\s+content="([^"]{30,2000})"/i)
  if (ogDesc?.[1]) description = ogDesc[1].trim().slice(0, 1500)
  // Try product description blocks (Amazon)
  const amazonFeatures = html.match(/<div\s+id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/i)
  if (amazonFeatures) {
    const bullets = amazonFeatures[1].match(/<span[^>]*class="[^"]*a-list-item[^"]*"[^>]*>([^<]{10,200})<\/span>/g) || []
    bullets.slice(0, 8).forEach(b => {
      const txt = b.replace(/<[^>]+>/g, '').trim()
      if (txt.length > 10) specs.push(txt)
    })
  }
  // Price
  const priceMatch = html.match(/(?:US\s*)?\$\s*([0-9]+\.?[0-9]*)/g)
  if (priceMatch?.[0]) {
    const m = priceMatch[0].match(/([0-9]+\.?[0-9]*)/)
    if (m) priceUSD = parseFloat(m[1])
  }
  return { title, priceUSD, description, specs }
}

function extractImages(html) {
  const images = new Set()
  // AliExpress imagePathList
  try {
    const m = html.match(/"imagePathList"\s*:\s*(\[.*?\])/s)
    if (m) JSON.parse(m[1]).forEach(u => { if (u && u.startsWith('http')) images.add(u) })
  } catch (e) {}
  // alicdn URLs
  ;(html.match(/https:\/\/ae\d*\.alicdn\.com\/kf\/[A-Za-z0-9_\-]+\.jpg/gi) || []).forEach(url => {
    const clean = url.replace(/\\/g, '').split(/["'<>\s]/)[0]
    if (clean.length > 40 && !clean.includes('icon')) images.add(clean)
  })
  // Generic og:image
  const og = html.match(/<meta\s+property="og:image"\s+content="([^"]{20,500})"/gi)
  if (og) og.forEach(m => {
    const u = m.match(/content="([^"]+)"/)?.[1]
    if (u && u.startsWith('http')) images.add(u)
  })
  return [...images].slice(0, 6)
}

// ─── Claude Vision for photo source ───
function callClaudeVisionForResearch(imageDataUri) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const m = imageDataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new Error('Invalid image data URI')
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: 'Analizeaza imaginea si returneaza DOAR JSON: {"title": "nume produs in romana max 80 char", "description": "descriere produs 2-4 fraze in romana", "specs": ["spec1","spec2","..." 3-6 specs vizibile]}.' }
      ]
    }]
  })
  return apiCall(body, 60000).then(extractFirstJSON)
}

// ─── Research agent (Sonnet 4.5 + extended thinking) ───
function callClaudeResearch(productInfo) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 20000,
    thinking: { type: 'enabled', budget_tokens: 10000 },
    system: `Esti un research agent expert pentru landing page-uri COD din Romania.

Ai un produs (descriere + specs) si trebuie sa construiesti un ICP (Ideal Customer Profile) complet si autentic, plus sa decizi parametrii optimi pentru LP-ul de vanzare.

Pentru ICP foloseste cadrul:
- PERSONA: descriere narativa scurta (1-2 fraze: cine e + situatia lui)
- DEMOGRAFICE: varsta, sex, venit, locatie, status familial
- PAINS: 3-5 dureri concrete pe care le simte ZILNIC (in cuvintele lor)
- DESIRES: 3-5 dorinte profunde (nu superficial)
- BELIEF BARRIERS: 2-4 credinte limitative care l-ar opri sa cumpere ("produsele astea nu functioneaza", "e prea scump", etc.)
- HAWKINS LEVEL: nivelul de constiinta in care e (guilt, fear, grief, apathy, neutrality, courage, willingness, acceptance — alege UNA din primele 4 pentru aproape orice produs COD)
- SOPHISTICATION LEVEL (1-5): cat de saturata e piata pentru acest produs

Apoi recomanda parametrii LP:
- niche (fashion/electronics/beauty/auto/health/home/sports/baby/pet/generic)
- tone (direct/agresiv/casual/profesional/emotional)
- urgencyLevel (medie/inalta/fara)
- lengthMode (scurt/mediu/lung)
- includeObjections (true/false)

Apoi un UNIQUE ANGLE — diferentiatorul cheie de copywriting (de ce ASTA si nu altul).

GANDESTE PROFUND inainte de a raspunde. Foloseste extended thinking.

Returneaza DOAR JSON valid (fara markdown).`,
    messages: [{
      role: 'user',
      content: 'Produs:\n' +
        'Nume: ' + (productInfo.title || 'necunoscut') + '\n' +
        'Pret: ~' + (productInfo.priceUSD ? Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10 + ' LEI' : 'necunoscut') + '\n' +
        (productInfo.description ? 'Descriere:\n"""\n' + productInfo.description + '\n"""\n' : '') +
        (productInfo.specs?.length ? 'Specificatii:\n- ' + productInfo.specs.join('\n- ') + '\n' : '') + '\n' +
        'Construieste ICP-ul si returneaza JSON:\n' +
        '{\n' +
        '  "productSummary": "1-2 fraze cu ce e produsul si pentru cine",\n' +
        '  "persona": "1-2 fraze cu cine e cumparatorul tipic + situatia lui",\n' +
        '  "demographics": {"age": "...", "gender": "...", "income": "...", "location": "...", "familyStatus": "..."},\n' +
        '  "pains": ["durere 1 in cuvintele lor", "durere 2", "..."],\n' +
        '  "desires": ["dorinta 1", "dorinta 2", "..."],\n' +
        '  "beliefBarriers": ["credinta 1", "credinta 2", "..."],\n' +
        '  "hawkinsLevel": "guilt|fear|grief|apathy|neutrality|courage",\n' +
        '  "sophisticationLevel": 1-5,\n' +
        '  "niche": "...",\n' +
        '  "recommendedTone": "...",\n' +
        '  "recommendedUrgency": "...",\n' +
        '  "recommendedLength": "...",\n' +
        '  "includeObjections": true/false,\n' +
        '  "uniqueAngle": "1-2 fraze: de ce ASTA si nu produsele similare"\n' +
        '}'
    }]
  })
  return apiCall(body, 240000).then(data => {
    const blocks = data.content || []
    const text = blocks.filter(c => c.type === 'text').map(c => c.text || '').join('')
    return extractFirstJSON({ text })
  })
}

function apiCall(body, timeoutMs) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.error) return reject(new Error('Claude: ' + data.error.message))
          resolve(data)
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude timeout')) })
    req.write(body)
    req.end()
  })
}

function extractFirstJSON(data) {
  const text = data.text || (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON in response')
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(text.substring(start, i + 1)) }
  }
  throw new Error('Unbalanced JSON')
}

// ─── Main handler ───
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { source, url, productImage, shopifyProductId } = req.body || {}
    if (!source) return res.status(400).json({ error: 'Lipseste source' })

    // STEP 1: get productInfo + images per source
    let productInfo = { title: '', priceUSD: 0, description: '', specs: [] }
    let images = []

    if (source === 'photo') {
      if (!productImage) return res.status(400).json({ error: 'Lipseste imaginea' })
      try {
        const vision = await callClaudeVisionForResearch(productImage)
        productInfo = {
          title: String(vision.title || '').slice(0, 100),
          priceUSD: 0,
          description: String(vision.description || '').slice(0, 1500),
          specs: Array.isArray(vision.specs) ? vision.specs.slice(0, 8).map(String) : []
        }
        images = [productImage]
      } catch (e) {
        console.log('Vision failed:', e.message)
        return res.status(500).json({ error: 'Nu am putut analiza poza: ' + e.message })
      }
    } else if (source === 'shopify') {
      if (!shopifyProductId) return res.status(400).json({ error: 'Lipseste shopifyProductId' })
      const auth = await prepareShopifyAuth(req, res)
      const data = await auth.call('/products/' + shopifyProductId + '.json')
      const p = data.product
      if (!p) return res.status(404).json({ error: 'Produs Shopify negasit' })
      productInfo.title = (p.title || '').slice(0, 100)
      productInfo.description = (p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)
      const vp = p.variants?.[0]?.price
      if (vp) productInfo.priceUSD = parseFloat(vp) / 5  // approx EUR/USD pt downstream calc
      images = (p.images || []).map(i => i.src).filter(Boolean).slice(0, 6)
    } else {
      // URL-based sources: aliexpress, amazon, alibaba, competitor
      if (!url) return res.status(400).json({ error: 'Lipseste URL' })
      const html = await fetchWithScraper(url).catch(() => '')
      if (html.length < 500) {
        return res.status(500).json({ error: 'Nu am putut citi pagina sursa. Verifica URL-ul.' })
      }
      const meta = source === 'aliexpress' ? extractAliMeta(html) : extractGenericMeta(html)
      productInfo.title = meta.title || ''
      productInfo.priceUSD = meta.priceUSD || 0
      productInfo.description = meta.description || ''
      productInfo.specs = meta.specs || []
      images = extractImages(html)
    }

    if (!productInfo.title || productInfo.title.length < 5) {
      return res.status(500).json({ error: 'Nu am putut extrage informatii suficiente despre produs' })
    }

    console.log('[research] productInfo:', { title: productInfo.title.slice(0, 60), priceUSD: productInfo.priceUSD, descLen: productInfo.description.length, specs: productInfo.specs.length, images: images.length })

    // STEP 2: build ICP via research agent (Sonnet + extended thinking)
    const icp = await callClaudeResearch(productInfo)
    console.log('[research] ICP built:', { hawkins: icp.hawkinsLevel, soph: icp.sophisticationLevel, niche: icp.niche, tone: icp.recommendedTone })

    return res.status(200).json({
      success: true,
      productInfo,
      images,
      icp
    })
  } catch (err) {
    console.error('Research error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
