// api/research.js
// Research agent — analizeaza produsul (din AliExpress/Amazon/Alibaba/Shopify/foto/
// competitor URL) si construieste un ICP (Ideal Customer Profile) complet pe care
// generate.js il foloseste mai tarziu pentru a genera LP-ul.
// Returneaza atat productInfo (title/description/specs/images) cat si icp
// (persona/pains/desires/beliefBarriers/hawkins/sophistication/niche/tone/urgency/length).

const https = require('https')
const http = require('http')
const { prepareShopifyAuth } = require('./_shopifyAuth')

// ─── Claude web_search ca scraper pentru URL sources ───
// Inlocuieste ScraperAPI cu tool-ul web_search build-in al Claude (sonnet 4.5).
// Claude face cautare web pentru URL/produs si returneaza JSON structurat cu
// title/description/specs/priceUSD/images. Fara dependinte externe.
function scrapeViaClaude(url, sourceHint) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const sourceLabel = {
    aliexpress: 'AliExpress',
    amazon: 'Amazon',
    alibaba: 'Alibaba',
    competitor: 'magazin online (RO)'
  }[sourceHint] || sourceHint || 'magazin online'
  // Strip query params + tracking — pastreaza doar path-ul de produs.
  // Helps web_search index pe URL canonic.
  let cleanUrl = url
  try {
    const u = new URL(url)
    cleanUrl = u.origin + u.pathname
  } catch (e) {}
  // Extract probable product ID din URL (AliExpress: /item/12345.html, Amazon: /dp/B0XXXX/)
  let productHint = ''
  const aliId = cleanUrl.match(/\/item\/(\d+)/)
  const amzId = cleanUrl.match(/\/dp\/([A-Z0-9]{8,12})/)
  const albId = cleanUrl.match(/\/product-detail\/[^/]+_(\d+)/)
  if (aliId) productHint = ' AliExpress item ID ' + aliId[1]
  else if (amzId) productHint = ' Amazon ASIN ' + amzId[1]
  else if (albId) productHint = ' Alibaba product ID ' + albId[1]
  // Haiku 4.5 — 50k rate limit / min (tier 1) vs Sonnet 30k. Scraping nu necesita
  // gandire profunda, Haiku descurca + e mai rapid si mai ieftin.
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    messages: [{
      role: 'user',
      content: 'Foloseste web_search ca sa gasesti acest produs:\n' +
        'URL: ' + cleanUrl + '\n' +
        'Sursa: ' + sourceLabel + productHint + '\n\n' +
        (sourceHint === 'aliexpress' ?
          'AliExpress paginile nu sunt indexate direct. Strategie:\n' +
          '1. Cauta pe Google "' + (productHint.trim() || cleanUrl) + '" + review-uri si comparatii\n' +
          '2. Cauta produsul dupa keywords din URL slug pe alte site-uri\n' +
          '3. Cauta categoria de produs + ID-ul pe AliExpress aggregators\n\n'
          : 'Strategii: search URL direct, search ID + nume site, search slug keywords, cauta pe review sites.\n\n') +
        'Returneaza DOAR JSON valid:\n' +
        '{\n' +
        '  "title": "Nume real produs sau string gol",\n' +
        '  "description": "Descriere reala 3-5 fraze sau string gol",\n' +
        '  "specs": ["spec1", ...] sau [],\n' +
        '  "priceUSD": numar sau 0,\n' +
        '  "images": ["url1", ...] sau []\n' +
        '}\n\n' +
        'CRITIC: daca NU gasesti nimic dupa search, returneaza string gol / array gol. NU inventa, NU folosi placeholder gen "Product information unavailable".'
    }]
  })
  // scrapeApiCall e similar cu apiCall dar trimite header-ul anthropic-beta
  // pentru web_search tool, si retry pe rate limit.
  function scrapeApiCall(attempt = 0) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 120000
      }, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', async () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString())
            if (data.error) {
              const msg = data.error.message || ''
              if (/rate\s*limit|429|overload|usage\s+tier/i.test(msg) && attempt < 2) {
                const delay = 12000 + attempt * 18000
                console.log('[scrape] rate-limited, retry in', delay, 'ms')
                await new Promise(r => setTimeout(r, delay))
                return scrapeApiCall(attempt + 1).then(resolve, reject)
              }
              return reject(new Error('Claude scraper: ' + msg))
            }
            const blocks = data.content || []
            const text = blocks.filter(c => c.type === 'text').map(c => c.text || '').join('')
            const parsed = extractFirstJSON({ text })
            resolve({
              title: String(parsed.title || '').slice(0, 100),
              description: String(parsed.description || '').slice(0, 1500),
              specs: Array.isArray(parsed.specs) ? parsed.specs.slice(0, 8).map(String) : [],
              priceUSD: Number(parsed.priceUSD) || 0,
              images: Array.isArray(parsed.images) ? parsed.images.filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, 6) : []
            })
          } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Claude scraper timeout 120s')) })
      req.write(body)
      req.end()
    })
  }
  return scrapeApiCall()
}

// ─── Scraping helpers (kept for fallback path) ───
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
  // Trimmed budget vs prior commit (24k+12k thinking) — tier 1 rate limit
  // pe Sonnet e 30k input tokens/min, deci research call mare + scrape =
  // peste limita rapid. Aici reducem la 12k output + 5k thinking ca sa
  // ramana loc pentru scrape + retry.
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 12000,
    thinking: { type: 'enabled', budget_tokens: 5000 },
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

function apiCall(body, timeoutMs, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', async () => {
        try {
          const raw = Buffer.concat(chunks).toString()
          const data = JSON.parse(raw)
          if (data.error) {
            const msg = data.error.message || ''
            // Retry on rate limit / overload (max 3 attempts with backoff)
            const isRateLimit = /rate\s*limit|429|overload|usage\s+tier/i.test(msg)
            if (isRateLimit && attempt < 2) {
              const delay = 12000 + attempt * 18000  // 12s, 30s
              console.log('[research] rate-limited, retry in', delay, 'ms (attempt', attempt + 1, ')')
              await new Promise(r => setTimeout(r, delay))
              return apiCall(body, timeoutMs, attempt + 1).then(resolve, reject)
            }
            return reject(new Error('Claude: ' + msg))
          }
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
      // Folosim Claude web_search (sonnet 4.5) — gratis fata de ScraperAPI,
      // nu necesita config. Daca esueaza, fallback la fetchWithScraper.
      if (!url) return res.status(400).json({ error: 'Lipseste URL' })
      console.log('[research] scraping via Claude web_search:', url.slice(0, 80))
      try {
        const claudeData = await scrapeViaClaude(url, source)
        productInfo.title = claudeData.title
        productInfo.description = claudeData.description
        productInfo.specs = claudeData.specs
        productInfo.priceUSD = claudeData.priceUSD
        images = claudeData.images
        console.log('[research] Claude extracted:', { title: productInfo.title.slice(0, 60), priceUSD: productInfo.priceUSD, descLen: productInfo.description.length, specs: productInfo.specs.length, images: images.length })
      } catch (e) {
        console.log('[research] Claude scraper failed:', e.message, '— fallback to fetchWithScraper')
        // Fallback: direct fetch + regex extract (works if SCRAPER_API_KEY exista)
        const html = await fetchWithScraper(url).catch(() => '')
        if (html.length > 500) {
          const aliMeta = extractAliMeta(html)
          const genericMeta = extractGenericMeta(html)
          const pick = (aliMeta.title?.length > 5 && aliMeta.description?.length > 30) ? aliMeta : genericMeta
          productInfo.title = pick.title || aliMeta.title || genericMeta.title || ''
          productInfo.priceUSD = pick.priceUSD || aliMeta.priceUSD || genericMeta.priceUSD || 0
          productInfo.description = pick.description || aliMeta.description || genericMeta.description || ''
          productInfo.specs = pick.specs?.length ? pick.specs : (aliMeta.specs?.length ? aliMeta.specs : genericMeta.specs)
          images = extractImages(html)
        }
      }
    }

    // Detect scraping failures — both technical (404/captcha) and LLM
    // placeholders ("Product information unavailable" / "Not found" / etc.)
    const titleBad = /^(error|not\s+found|404|page\s+not|forbidden|access\s+denied|robot|captcha|just\s+a\s+moment|product\s+information\s+unavailable|information\s+unavailable|unavailable|n\/a|unknown|cannot\s+(access|find|retrieve)|unable\s+to)/i.test(productInfo.title || '')
    if (titleBad) productInfo.title = ''
    // Description placeholders too
    if (productInfo.description && /^(product\s+information\s+unavailable|information\s+unavailable|unavailable|cannot|unable)/i.test(productInfo.description)) {
      productInfo.description = ''
    }
    const hasUsableInfo = (productInfo.title && productInfo.title.length >= 5) ||
                         (productInfo.description && productInfo.description.length >= 50) ||
                         (productInfo.specs && productInfo.specs.length >= 2)
    if (!hasUsableInfo) {
      return res.status(422).json({
        error: 'Nu am putut extrage info despre produs. AI a incercat web search dar pagina e blocata sau nu e indexata. Solutii: 1) Foloseste upload poza, 2) Foloseste Shopify product (daca-l ai in magazin), 3) Incearca alt URL (varianta canonica, fara tracking params).'
      })
    }
    // If title bad but description ok, derive title from description first sentence
    if (!productInfo.title && productInfo.description) {
      productInfo.title = productInfo.description.split(/[.\n]/)[0].slice(0, 80)
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
