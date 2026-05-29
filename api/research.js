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
  // Reject Google/CDN error pages — they have title "Error 404 (Not Found)!!1" etc.
  if (/^(error\s+\d+|not\s+found|access\s+denied|forbidden|404|page\s+not\s+found|robot\s+check)/i.test(title)) {
    title = ''
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
// Construieste un Avatar/ICP COMPLET conform framework-ului MARK BUILDS BRANDS:
// - Demographics + Identitati tipice
// - 3 pain points × 3 sub-issues fiecare
// - Goals (short + long term)
// - Emotional drivers
// - Direct quotes in 5 categorii (cum vorbesc EI in forumuri/reviews)
// - Fears + emotional journey (Awareness → Frustration → Desperation → Relief)
// - Core beliefs life/love/family
// - Existing solutions + ce le place + ce nu le place
// - Conspiratorial story / "fall from eden" angle (Mark's curiosity hook)
function callClaudeResearch(productInfo) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 24000,
    thinking: { type: 'enabled', budget_tokens: 12000 },
    system: `Esti un research strategist expert care construieste AVATARE / ICP-uri pentru produse COD vandute in Romania, dupa metodologia MARK BUILDS BRANDS.

Misiune: pornind de la un produs (descriere + specs), GANDESTE PROFUND (foloseste extended thinking) ca un consumer researcher care a citit zeci de review-uri Amazon, mii de comentarii forum si zeci de reclame de la competitori. Apoi creeaza un AVATAR PSIHOLOGIC complet — nu generic.

Avatarul include:
1. UN NUME DE PERSOANA (prenume romanesc real) + varsta concreta + rol/identitate (ex: "Maria, 38, mama unica din Cluj-Napoca")
2. BIO scurt (2-3 fraze: cine e + ce situatie + ce o macina ZILNIC) — scrii ca si cum ai descrie-o intr-o intalnire de research
3. DEMOGRAFICE complete (varsta exacta, sex, locatie, venit lunar in LEI, ocupatie, status familial, identitati culturale)
4. 3 PAIN POINTS principale, fiecare cu 3 sub-issues concrete in cuvintele LOR
5. GOALS: 3 short-term + 3 long-term (in viata, nu doar legate de produs)
6. EMOTIONAL DRIVERS: 3 mari sentimente care il mana (frica, rusine, dor, mandrie, etc.)
7. DIRECT QUOTES (cum vorbesc EI cand se plang sau cer ajutor) — 3 quote-uri pain + 3 mindset + 3 motivation. Foloseste limbaj autentic forum romanesc (gen "ma satur", "nu mai pot", "tot timpul", "iar am incercat sa...", "asa e mereu")
8. KEY FEARS: 3 frici emotionale profunde
9. PSYCHOGRAPHIC INSIGHTS: 3 (atitudini, prejudecati tribal, ideologii)
10. EMOTIONAL JOURNEY in 4 etape (Awareness → Frustration → Desperation → Relief)
11. CORE BELIEFS despre viata/familie/munca in 1-3 propozitii
12. OUTSIDE BLAMES — ce factor extern blameaza pentru viata lor (sistemul, big pharma, vremurile, etc.)
13. EXISTING SOLUTIONS — ce au incercat deja + ce le-a placut + ce NU le-a placut
14. CURIOSITY HOOK / FALL FROM EDEN angle — daca exista un hook conspiratorial sau "lost solution" pentru acest produs (Mark's framework)

Apoi recomanda parametrii LP:
- niche (fashion/electronics/beauty/auto/health/home/sports/baby/pet/generic)
- tone (direct/agresiv/casual/profesional/emotional)
- urgencyLevel (medie/inalta/fara)
- lengthMode (scurt/mediu/lung)
- includeObjections (true/false)
- hawkinsLevel (guilt|fear|grief|apathy|neutrality|courage — alege UNA din primele 4 pentru COD)
- sophisticationLevel (1-5)

Plus UNIQUE ANGLE — diferentiatorul cheie.

CRITIC: nu inventa generic. Daca produsul e pentru parinti, avatarul e un parinte SPECIFIC cu varsta+oras. Daca e supliment, persoana are conditie medicala specifica. Daca e gadget tech, persoana are job+venit congruente. Limbaj autentic romanesc — NU "ma simt epuizat" generic, ci "vin acasa si nu mai am chef de nimic, doar caut Netflix-ul".

Returneaza DOAR JSON valid (fara markdown, fara backtick-uri, fara explicatii).`,
    messages: [{
      role: 'user',
      content: 'Produs:\n' +
        'Nume: ' + (productInfo.title || 'necunoscut') + '\n' +
        'Pret: ~' + (productInfo.priceUSD ? Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10 + ' LEI' : 'necunoscut') + '\n' +
        (productInfo.description ? 'Descriere:\n"""\n' + productInfo.description + '\n"""\n' : '') +
        (productInfo.specs?.length ? 'Specificatii:\n- ' + productInfo.specs.join('\n- ') + '\n' : '') + '\n' +
        'Construieste AVATARUL complet si returneaza JSON cu aceasta schema EXACTA:\n' +
        '{\n' +
        '  "name": "Prenume RO + varsta + rol (ex: Maria, 38, mama din Cluj)",\n' +
        '  "bio": "2-3 fraze descriere: cine e + situatie + ce o macina zilnic",\n' +
        '  "productSummary": "1-2 fraze: ce e produsul si pentru cine",\n' +
        '  "demographics": {"age": "X-Y", "gender": "...", "income": "X-Y LEI/luna", "location": "...", "occupation": "...", "familyStatus": "...", "identities": ["..."]},\n' +
        '  "painPoints": [\n' +
        '    {"title": "Pain Point 1 - 3-5 cuvinte", "subIssues": ["sub-issue 1 in cuvintele lor", "sub-issue 2", "sub-issue 3"]},\n' +
        '    {"title": "Pain Point 2", "subIssues": ["...","...","..."]},\n' +
        '    {"title": "Pain Point 3", "subIssues": ["...","...","..."]}\n' +
        '  ],\n' +
        '  "shortTermGoals": ["...", "...", "..."],\n' +
        '  "longTermAspirations": ["...", "...", "..."],\n' +
        '  "emotionalDrivers": ["...", "...", "..."],\n' +
        '  "painQuotes": ["quote 1 in limbaj autentic forum RO", "quote 2", "quote 3"],\n' +
        '  "mindsetQuotes": ["...", "...", "..."],\n' +
        '  "motivationQuotes": ["...", "...", "..."],\n' +
        '  "keyFears": ["frica 1", "frica 2", "frica 3"],\n' +
        '  "psychographicInsights": ["...", "...", "..."],\n' +
        '  "emotionalJourney": {"awareness": "...", "frustration": "...", "desperation": "...", "relief": "..."},\n' +
        '  "coreBeliefs": "1-3 propozitii: ce crede despre viata/familie/munca",\n' +
        '  "outsideBlames": ["sistemul economic", "...", "..."],\n' +
        '  "existingSolutions": {"tried": ["..."], "liked": ["..."], "disliked": ["..."]},\n' +
        '  "curiosityHook": "Conspiracy/lost solution angle daca exista. Altfel string gol.",\n' +
        '  "pains": ["compact: top 3-5 dureri pentru prompt-ul de generare LP"],\n' +
        '  "desires": ["compact: top 3-5 dorinte"],\n' +
        '  "beliefBarriers": ["compact: top 3-4 credinte limitative"],\n' +
        '  "hawkinsLevel": "guilt|fear|grief|apathy|neutrality|courage",\n' +
        '  "sophisticationLevel": 1-5,\n' +
        '  "niche": "fashion|electronics|beauty|auto|health|home|sports|baby|pet|generic",\n' +
        '  "recommendedTone": "direct|agresiv|casual|profesional|emotional",\n' +
        '  "recommendedUrgency": "medie|inalta|fara",\n' +
        '  "recommendedLength": "scurt|mediu|lung",\n' +
        '  "includeObjections": true,\n' +
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

    // Detect scraping failures — Google 404 pages, error pages, blocked etc.
    if (/^(error|not\s+found|404|page\s+not|forbidden|access|robot|captcha)/i.test(productInfo.title || '') ||
        !productInfo.title || productInfo.title.length < 5) {
      return res.status(422).json({
        error: 'Nu am putut citi produsul de la URL-ul dat. Site-ul ne-a blocat sau pagina nu exista. Incearca alt URL sau foloseste upload poza.'
      })
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
