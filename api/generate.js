// v5 - gemini parallel cu claude
const https = require('https')
const http = require('http')

// Curated COD-optimized palettes — each combination is tested in real RO COD
// campaigns. Random pick per generation so every merchant's LP feels unique.
// Each palette has: primary (CTA + accents), secondary (text/borders),
// bgAccent (gift banner/highlight bg), bgAccentBorder (highlight border).
const PALETTES = [
  // 1. Classic Red — universal high-urgency default (most COD pages)
  { primary: '#dc2626', secondary: '#111111', bgAccent: '#fffbeb', bgAccentBorder: '#facc15' },
  // 2. Bold Blue — trust, tech, finance, B2B-ish
  { primary: '#1e40af', secondary: '#0f172a', bgAccent: '#eff6ff', bgAccentBorder: '#3b82f6' },
  // 3. Forest Green — health, wellness, eco, food
  { primary: '#16a34a', secondary: '#14532d', bgAccent: '#f0fdf4', bgAccentBorder: '#22c55e' },
  // 4. Burnt Orange — warm, food, lifestyle, beauty (subdued)
  { primary: '#ea580c', secondary: '#431407', bgAccent: '#fff7ed', bgAccentBorder: '#fb923c' },
  // 5. Royal Purple — premium beauty, fashion, accessories
  { primary: '#7c3aed', secondary: '#1e1b4b', bgAccent: '#faf5ff', bgAccentBorder: '#a855f7' },
  // 6. Hot Pink — beauty, cosmetics, women's products
  { primary: '#db2777', secondary: '#500724', bgAccent: '#fdf2f8', bgAccentBorder: '#ec4899' },
  // 7. Deep Teal — wellness, eco, modern minimalist
  { primary: '#0d9488', secondary: '#042f2e', bgAccent: '#f0fdfa', bgAccentBorder: '#14b8a6' },
  // 8. Charcoal Gold — luxury, premium, high-end fashion/tech
  { primary: '#1f2937', secondary: '#111827', bgAccent: '#fefce8', bgAccentBorder: '#d4af37' }
]

// Hero layout variants — same content, different visual treatment.
// Saved with the LP at generation time so re-edits preserve the chosen look.
const HERO_VARIANTS = ['split', 'centered', 'overlay']
// 'split'    - image left / details right (2-col on desktop) — current default
// 'centered' - image full-width on top, all details centered below (more emotional)
// 'overlay'  - image as background with darkened overlay + text on top (bold/luxury)

// Detecteaza tematica produsului din descriere SAU nume scrape-uit si returneaza
// paleta+heroVariant potrivite. 'split' (image left, text right) e default
// pentru ca seamana cel mai mult cu stilul GemPages / produsutil.ro.
// Mapping: PALETTES[0]=Red, 1=Blue, 2=Green, 3=Orange, 4=Purple, 5=Pink, 6=Teal, 7=Gold
function pickVariantsByDescription(desc, productName) {
  // Combina descrierea user-ului + numele scrape-uit; ambele pot avea cuvinte cheie
  const txt = ((desc || '') + ' ' + (productName || '')).toLowerCase()
  // Categorii cu cuvinte cheie + indici paleta corespunzatoare + variante hero recomandate
  // Per-category palette picks. heroVariant default 'split' (image left + text
  // right, side-by-side on desktop) — user-ul a cerut explicit lateral-lateral.
  // Variantele 'centered' / 'overlay' raman optionale pentru viitor diverse,
  // dar nu se mai pica automat.
  const matchers = [
    { kw: ['femei', 'beauty', 'cosmetic', 'skincare', 'machiaj', 'parfum', 'serum', 'crema'], palettes: [5, 4] },
    { kw: ['barbati', 'sportiv', 'fitness', 'antrenament', 'forta', 'masculin'], palettes: [0, 3] },
    { kw: ['copii', 'bebe', 'parinti', 'mame', 'familie', 'jucarie', 'gradinita'], palettes: [3, 5] },
    { kw: ['tehnologie', 'tech', 'gadget', 'electronic', 'wireless', 'bluetooth', 'smart', 'usb'], palettes: [1, 7] },
    { kw: ['sanatate', 'natural', 'eco', 'organic', 'wellness', 'supliment', 'vitamine', 'detox'], palettes: [2, 6] },
    { kw: ['luxury', 'luxos', 'premium', 'elegant', 'piele', 'lemn', 'aur', 'argint'], palettes: [7, 4] },
    { kw: ['bucatarie', 'casa', 'mancare', 'gatit', 'curatenie', 'menaj', 'soareci', 'sobolan', 'capcana'], palettes: [3, 2] },
    { kw: ['fashion', 'haine', 'imbracaminte', 'geanta', 'pantofi', 'bijuterii', 'accesori'], palettes: [4, 5] }
  ]
  for (const m of matchers) {
    if (m.kw.some(k => txt.includes(k))) {
      return {
        palette: PALETTES[m.palettes[Math.floor(Math.random() * m.palettes.length)]],
        heroVariant: 'split'  // default lateral-lateral
      }
    }
  }
  // Fallback: random paleta + split hero (consistency on layout)
  return {
    palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
    heroVariant: 'split'
  }
}

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
  let title = '', priceUSD = 0, description = '', specs = []
  const tm = html.match(/"subject"\s*:\s*"([^"]{10,300})"/) || html.match(/<title[^>]*>([^<|]+)/i)
  if (tm?.[1]) title = tm[1].replace(/\s*[-|]\s*AliExpress.*$/i, '').replace(/&amp;/g, '&').trim()
  const pm = html.match(/"discountPrice"\s*:\s*\{"value"\s*:\s*"([0-9.]+)"/) || html.match(/US \$\s*([0-9.]+)/)
  if (pm?.[1]) priceUSD = parseFloat(pm[1])
  // Description meta — AliExpress JSON has descMod or productDescription
  const dm = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.){50,2000})"/) || html.match(/<meta\s+name="description"\s+content="([^"]{50,500})"/i)
  if (dm?.[1]) description = dm[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)
  // Specs / properties — common in AliExpress product pages
  try {
    const sm = html.match(/"productProps"\s*:\s*\[([^\]]+)\]/)
    if (sm) {
      const props = sm[1].match(/"name"\s*:\s*"([^"]{2,40})"[^}]*"value"\s*:\s*"([^"]{2,80})"/g) || []
      specs = props.slice(0, 8).map(p => {
        const n = p.match(/"name"\s*:\s*"([^"]+)"/)?.[1]
        const v = p.match(/"value"\s*:\s*"([^"]+)"/)?.[1]
        return n && v ? `${n}: ${v}` : null
      }).filter(Boolean)
    }
  } catch (e) {}
  return { title, priceUSD, description, specs }
}

// Claude Vision — primeste imagine (data URI base64) si returneaza
// {title, description, specs} extras din imagine. Inlocuieste scrape-ul
// AliExpress cand user-ul upload-eaza poza in loc de link.
function callClaudeVision(imageDataUri) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  // Parse data URI: data:image/jpeg;base64,/9j/4AAQ...
  const m = imageDataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new Error('Invalid image data URI')
  const mediaType = m[1]
  const base64 = m[2]

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `Esti expert produs + copywriter. Analizeaza imaginea ATENT si returneaza DOAR un JSON cu:
{
  "title": "Numele specific al produsului in romana (max 60 char, ex: 'Aspirator de mana wireless Pro 2000W'). Include dimensiune/varianta vizibila daca exista.",
  "description": "3-5 fraze in romana cu: (1) ce este produsul exact, (2) caracteristici tehnice vizibile (material, culoare, dimensiune), (3) functionalitate principala observata din imagine. Diacritice corecte.",
  "specs": ["6-8 specs concrete extrase doar din ce SE VEDE in imagine. Format: 'Atribut: valoare'. Ex: 'Material: piele', 'Capacitate: 500ml', 'Culoare: negru mat'"],
  "useCases": ["3-4 situatii concrete in care s-ar folosi produsul. Ex: 'Pentru curatarea masinii dupa lucrari grele', 'Pentru iesiri la sala'. Romana naturala, nu marketing-speak."],
  "painPointSolved": "1-2 fraze: ce problema specifica rezolva produsul pentru un cumparator tipic. Ex: 'Elimina nevoia de a tara aspiratorul mare in masina. Curatarea interioarelor devine rapida si fara fire incurcate.'",
  "audience": "1-2 fraze: cine cumpara probabil acest produs. Profile de varsta + situatie + motivatie. Ex: 'Soferi 25-45 ani care isi pretuiesc masina si vor sa o tina curata fara sa investeasca timp mult.'"
}

Niciun text in afara JSON. Fara markdown, fara backtick-uri. Daca vezi un produs, fii SPECIFIC, nu generic.` }
      ]
    }]
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
      timeout: 150000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.error) throw new Error('Vision: ' + data.error.message)
          const text = (data.content || []).map(c => c.text || '').join('')
          const jsonStr = extractBalancedJSON(text)
          if (!jsonStr) throw new Error('Vision: no JSON in response')
          const parsed = JSON.parse(jsonStr)
          resolve({
            title: String(parsed.title || '').slice(0, 100),
            priceUSD: 0,  // vision nu vede pret
            description: String(parsed.description || '').slice(0, 1500),
            specs: Array.isArray(parsed.specs) ? parsed.specs.slice(0, 8).map(s => String(s)) : [],
            useCases: Array.isArray(parsed.useCases) ? parsed.useCases.slice(0, 6).map(s => String(s)) : [],
            painPointSolved: String(parsed.painPointSolved || '').slice(0, 500),
            audience: String(parsed.audience || '').slice(0, 300)
          })
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Vision timeout')) })
    req.write(body)
    req.end()
  })
}

// Helper — transforms ICP into freetext salesAngle (folosit deja in
// personalizationBlock pentru briefBlock). Concentreaza persona + pain principal +
// dorinta principala intr-un blurb scurt.
function buildSalesAngleFromIcp(icp) {
  if (!icp || typeof icp !== 'object') return ''
  const parts = []
  if (icp.persona) parts.push(icp.persona)
  if (Array.isArray(icp.pains) && icp.pains.length) parts.push('Dureri principale: ' + icp.pains.slice(0, 3).join('; '))
  if (Array.isArray(icp.desires) && icp.desires.length) parts.push('Dorinte: ' + icp.desires.slice(0, 3).join('; '))
  if (icp.uniqueAngle) parts.push('Angle: ' + icp.uniqueAngle)
  return parts.join('. ')
}

function callClaude(productInfo, styleDesc, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const rp = productInfo.priceUSD > 0 ? Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10 : 149

  // Personalizare AI din formularul Generator — fiecare camp devine constraint
  // direct in prompt-ul Claude pentru output customizat.
  const tone = opts.tone || 'direct'
  const salesAngleText = (opts.salesAngle || '').trim() // FREE TEXT acum, nu enum
  const urgencyLevel = opts.urgencyLevel || 'medie'
  const lengthMode = opts.lengthMode || 'mediu'
  const includeObjections = opts.includeObjections !== false  // default true
  const customObjections = Array.isArray(opts.customObjections) ? opts.customObjections.filter(s => s && s.trim()) : []

  const toneMap = {
    direct: 'DIRECT — clar, fara ocoluri, propozitii scurte si la subiect',
    agresiv: 'AGRESIV — urgenta mare, propozitii imperative, scarcity puternic, "ACUM" / "ULTIMA SANSA" / "NU PIERDE"',
    casual: 'CASUAL — ca un sfat de la un prieten, "tu" peste tot, fara jargon',
    profesional: 'PROFESIONAL — autoritate, dovezi concrete, ton de expert, fara emoji extra',
    emotional: 'EMOTIONAL — storytelling, accent pe sentimente, "imagineaza-ti" / "stii sentimentul cand"'
  }
  const urgencyMap = {
    medie: 'MEDIE — urgencyMessage "STOC LIMITAT", scarcity ce mentioneaza ofera-limitata',
    inalta: 'INALTA — urgencyMessage cu countdown verbal "ULTIMELE X BUC", "OFERTA EXPIRA AZI", presiune temporal puternica',
    fara: 'FARA — urgencyMessage neutru ce mentioneaza disponibilitate, fara presiune temporala'
  }
  const lengthMap = {
    scurt: 'SCURT — 2-3 testimoniale, 3 beneficii in benefits, 4 FAQ (in loc de 6), featureSections 1 in loc de 2',
    mediu: 'MEDIU — 4 testimoniale, 5 beneficii, 6 FAQ, 2 featureSections (standard)',
    lung: 'LUNG — 6 testimoniale, 7-8 beneficii, 8 FAQ, 3 featureSections (adauga inca una)'
  }

  // Obiectii custom: daca user-ul le-a scris in formular, tu DOAR rebuttalizezi
  // la EXACT obiectiile lui. Daca nu, generezi 4 obiectii standard COD.
  const objectionsInstruction = includeObjections
    ? (customObjections.length > 0
        ? `INCLUDE — campul "objections" trebuie sa contina EXACT urmatoarele obiectii (cu rebuttals scurte si convingatoare in romana):\n${customObjections.map((o, i) => '  ' + (i + 1) + '. ' + o).join('\n')}\nFiecare obiectie e {objection: "<text user>", rebuttal: "<rebuttal tau>"}.`
        : 'INCLUDE — populeaza campul "objections" cu 4 obiectii standard COD si rebuttals')
    : 'OMITE — lasa "objections": [] (array gol)'

  // Sales angle e acum TEXT LIBER (profil cumparator + motivatie). Daca e gol,
  // AI-ul ghiceste din numele produsului.
  const angleBlock = salesAngleText
    ? `PROFIL CUMPARATOR + UNGHI VANZARE (FOLOSIT IN TOATA PAGINA):\n"""\n${salesAngleText}\n"""\nFolosesti acest profil pentru: nume + varste + orase in testimoniale, durerea reflectata in benefits + headline, tonul si registrul de cuvinte.`
    : 'UNGHI VANZARE: nedefinit — alege unul potrivit nisei produsului (practic/economie pentru utilitar, frica pentru limited offer, dorinta pentru beauty/fashion, etc).'

  // Popup: optional element pe pagina cu un obiectiv specific
  // - discount: ofera cod reducere, valid la check-out / pe numar telefonic
  // - phone: colecteaza telefon ca sa sune agent
  // - order: forteaza utilizatorul sa scroll-eze la butonul COD
  const popupEnabled = !!opts.popupEnabled
  const popupGoal = opts.popupGoal || null
  const popupGoalMap = {
    discount: 'OFERA REDUCERE — popup cu headline scurt despre o reducere exclusiva, ctaText "Aplica reducerea", discountCode generat aleator (4-8 caractere, capitalizate, usor de tinut minte ex: SAVE10, AZI20), discountPercent intre 10 si 20',
    order: 'FORTEAZA COMANDA — popup cu headline urgent despre stocul care se epuizeaza, subtext de urgenta, ctaText "Comanda acum", fara discountCode'
  }
  const popupInstruction = popupEnabled
    ? `INCLUDE — populeaza campul "popup" cu: ${popupGoalMap[popupGoal] || popupGoalMap.discount}`
    : 'OMITE — lasa "popup": null'

  // Niche — adapteaza sectiuni specifice tipului de produs.
  // Fiecare niche are 1-2 sectiuni de informatie specifica (tabel, lista, etc.)
  // pe care Claude trebuie sa le populeze in campul "nicheSections" din JSON.
  const niche = opts.niche || 'generic'
  const nicheMap = {
    fashion: 'FASHION — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"sizeTable", title:"Ghid mărimi", headers:["Mărime","Bust","Talie","Șold"], rows:[["S","82-86","64-68","88-92"], ["M","87-91","69-73","93-97"], ["L","92-96","74-78","98-102"], ["XL","97-101","79-83","103-107"]]} cu valori realiste in cm. (2) {type:"infoList", title:"Material & îngrijire", items:[{label:"Material",value:"..."},{label:"Spălare",value:"..."},{label:"Călcare",value:"..."}]}.',
    electronics: 'ELECTRONICS — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Specificații tehnice", items:[{label:"Conectivitate",value:"..."},{label:"Baterie",value:"..."},{label:"Greutate",value:"..."},{label:"Dimensiuni",value:"..."},{label:"Compatibilitate",value:"..."}]} cu valori concrete extrase din descriere. (2) {type:"infoList", title:"În pachet", items:[{label:"1×",value:"Produs principal"},{label:"1×",value:"Cablu"},{label:"1×",value:"Manual utilizare"}]}.',
    beauty: 'BEAUTY — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Ingrediente cheie", items:[{label:"...",value:"... (beneficiu pentru piele)"}, ...5-6 ingrediente]}. (2) {type:"infoList", title:"Cum se folosește", items:[{label:"Pas 1",value:"..."},{label:"Pas 2",value:"..."},{label:"Pas 3",value:"..."},{label:"Tip piele",value:"... (uscată/grasă/mixtă/toate)"}]}.',
    auto: 'AUTO — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Compatibilitate vehicul", items:[{label:"Mărci",value:"... (universal sau specific marca)"},{label:"Ani fabricație",value:"..."},{label:"Tip mașină",value:"... (sedan/SUV/hatchback)"},{label:"Cerinte instalare",value:"..."}]}. (2) {type:"infoList", title:"Instalare in 3 pași", items:[{label:"Pas 1",value:"..."},{label:"Pas 2",value:"..."},{label:"Pas 3",value:"..."}]}.',
    health: 'SANATATE — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Compoziție", items:[{label:"Ingredient activ",value:"... (cantitate)"},{label:"Forma",value:"... (capsule/lichid/pulbere)"},{label:"Mod administrare",value:"... (cu apă/pe stomacul gol/etc)"}]}. (2) {type:"infoList", title:"Dozaj & contraindicații", items:[{label:"Doza zilnică",value:"..."},{label:"Durată cură",value:"..."},{label:"Atenție",value:"NU pentru gravide/copii sub X ani/etc"}]}.',
    home: 'CASA — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Dimensiuni & materiale", items:[{label:"Dimensiuni",value:"L×l×h în cm"},{label:"Greutate",value:"..."},{label:"Material principal",value:"..."},{label:"Capacitate",value:"... (dacă aplicabil)"}]}. (2) {type:"infoList", title:"Întreținere", items:[{label:"Curățare",value:"..."},{label:"Spălare",value:"... (mașina vase DA/NU)"},{label:"Garanție",value:"..."}]}.',
    sports: 'SPORT — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Plan antrenament", items:[{label:"Durată sesiune",value:"... minute"},{label:"Frecvență recomandată",value:"... ori pe săptămână"},{label:"Nivel",value:"începător/intermediar/avansat"},{label:"Mușchi targetați",value:"..."}]}. (2) {type:"infoList", title:"Rezultate așteptate", items:[{label:"După 1 săptămână",value:"..."},{label:"După 30 zile",value:"..."},{label:"După 90 zile",value:"..."}]}.',
    baby: 'COPII — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Vârstă & utilizare", items:[{label:"Vârstă recomandată",value:"... luni/ani"},{label:"Greutate maximă",value:"... kg"},{label:"Materiale",value:"... (non-toxic, BPA-free, etc)"},{label:"Certificări",value:"CE/EN71/etc"}]}. (2) {type:"infoList", title:"Sfaturi pentru părinți", items:[{label:"Curățare",value:"..."},{label:"Siguranță",value:"NU lăsați copilul nesupravegheat / etc"},{label:"Depozitare",value:"..."}]}.',
    pet: 'ANIMALE — populeaza "nicheSections" cu 2 sectiuni: (1) {type:"infoList", title:"Pentru ce animale", items:[{label:"Tip animal",value:"câine/pisică/ambele"},{label:"Mărime/Greutate",value:"... kg"},{label:"Vârstă",value:"..."},{label:"Materiale",value:"... (non-toxic)"}]}. (2) {type:"infoList", title:"Mod de folosire", items:[{label:"Pas 1",value:"..."},{label:"Pas 2",value:"..."},{label:"Pas 3",value:"..."}]}.',
    generic: 'GENERIC — LASA "nicheSections": []. Fara sectiuni de nisa specifice.'
  }
  const nicheInstruction = nicheMap[niche] || nicheMap.generic

  // ICP block — research agent (Mark Builds Brands framework) construieste
  // Avatar complet (persona+bio+demographics+painPoints×subIssues+goals+
  // emotionalDrivers+directQuotes+fears+psychographics+emotionalJourney+
  // coreBeliefs+outsideBlames+existingSolutions+curiosityHook). Aceasta e
  // SURSA PRIMARA de truth pentru cine e cumparatorul si cum vorbeste.
  const icp = opts.icp || {}
  const hasIcp = icp && (icp.name || icp.bio || icp.persona || icp.pains || icp.painPoints)
  const icpBlock = hasIcp ? `

=== AVATAR / ICP (CONSTRUIT DE RESEARCH AGENT — RESPECTA EXACT) ===
NUME AVATAR: ${icp.name || ''}
BIO: ${icp.bio || icp.persona || ''}
DEMOGRAFICE: ${JSON.stringify(icp.demographics || {})}
${icp.identities?.length ? 'IDENTITATI TIPICE: ' + icp.identities.join(', ') : ''}

PAIN POINTS DETALIATE (Mark Avatar Sheet):
${(icp.painPoints || []).map((pp, i) => `  ${i+1}. ${pp.title}\n     - ${(pp.subIssues || []).join('\n     - ')}`).join('\n') || (icp.pains || []).map((p,i)=>`  ${i+1}. ${p}`).join('\n')}

GOALS:
  Short-term: ${(icp.shortTermGoals || []).join(' | ')}
  Long-term: ${(icp.longTermAspirations || []).join(' | ')}

EMOTIONAL DRIVERS: ${(icp.emotionalDrivers || []).join(' | ')}

DIRECT QUOTES (cum vorbesc EI — foloseste limbajul AUTHENTIC in testimoniale + headline):
  Pain: ${(icp.painQuotes || []).map(q => '"' + q + '"').join(' | ')}
  Mindset: ${(icp.mindsetQuotes || []).map(q => '"' + q + '"').join(' | ')}
  Motivation: ${(icp.motivationQuotes || []).map(q => '"' + q + '"').join(' | ')}

KEY FEARS: ${(icp.keyFears || []).join(' | ')}
PSYCHOGRAPHIC INSIGHTS: ${(icp.psychographicInsights || []).join(' | ')}

EMOTIONAL JOURNEY (mapeaza pe LP — awareness=hero, frustration=topBenefits, desperation=urgency+CTA, relief=riskReversal):
  Awareness: ${icp.emotionalJourney?.awareness || ''}
  Frustration: ${icp.emotionalJourney?.frustration || ''}
  Desperation: ${icp.emotionalJourney?.desperation || ''}
  Relief: ${icp.emotionalJourney?.relief || ''}

CORE BELIEFS: ${icp.coreBeliefs || ''}
OUTSIDE BLAMES (foloseste in headline daca produsul e legat de aceste blame-uri): ${(icp.outsideBlames || []).join(' | ')}

EXISTING SOLUTIONS (esential pentru differentiation + objections):
  Tried: ${(icp.existingSolutions?.tried || []).join(' | ')}
  Liked: ${(icp.existingSolutions?.liked || []).join(' | ')}
  Disliked (foloseste in objections + featureSections sa contrastezi): ${(icp.existingSolutions?.disliked || []).join(' | ')}

CURIOSITY HOOK / FALL FROM EDEN (daca exista, foloseste in headline sau featureSections[0]): ${icp.curiosityHook || '(none)'}

COMPACT SUMMARY pentru rapid reference:
  Pains: ${(icp.pains || []).join(' | ')}
  Desires: ${(icp.desires || []).join(' | ')}
  Belief barriers (TREBUIE DARAMATE in objections sau riskReversal): ${(icp.beliefBarriers || []).join(' | ')}

HAWKINS LEVEL: ${icp.hawkinsLevel || 'fear'} — INTRA in copy la acest nivel emotional (sub linia 200), NU sari direct la hope.
SOPHISTICATION LEVEL: ${icp.sophisticationLevel || 3} — APLICA Regula 1 (formula H1 conform Level)
UNIQUE ANGLE: ${icp.uniqueAngle || ''}` : ''

  const personalizationBlock = `

=== PERSONALIZARE LP (RESPECTA EXACT) ===
TON COPY: ${toneMap[tone]}
${angleBlock}
NIVEL URGENTA: ${urgencyMap[urgencyLevel]}
LUNGIME CONTINUT: ${lengthMap[lengthMode]}
OBIECTII: ${objectionsInstruction}
POPUP: ${popupInstruction}
NISA: ${nicheInstruction}${icpBlock}`

  // styleDesc e CONTEXT COMERCIAL OPTIONAL din partea user-ului (audienta tinta,
  // ton, unghi specific de vanzare, features pe care vrea sa le accentueze).
  // Identitatea produsului (ce E) vine din AliExpress (productInfo.title).
  // Descrierea complementeaza, nu inlocuieste.
  const briefBlock = styleDesc
    ? `\n\n=== AUDIENTA TINTA (din formular) ===\n"""\n${styleDesc}\n"""\nFoloseste pentru: audienta in testimoniale, ton in featureSections, durere in benefits.`
    : ''

  // Competitor context — daca user-ul a dat link competitor, am scrape-uit text
  // de pe pagina lui ca sa-l folosesti ca referinta de stil/unghi (NU copia,
  // doar inspira-te din ce functioneaza).
  const competitorBlock = opts.competitorContext
    ? `\n\n=== COMPETITOR ANALIZAT (referinta stil, NU copia) ===\n"""\n${opts.competitorContext}\n"""\nAnalizeaza tonul, unghiul, structura — apoi fa MAI BUN. Foloseste cuvinte si fraze similare ca registru lingvistic dar TOATE textele sa fie originale.`
    : ''
  // Prompt scris pentru a produce copy în stilul produsutil.ro:
  // - frază "PROBLEMĂ → REZOLVARE" cu cuvinte CAPITALIZATE la început
  // - testimoniale cu detalii CONCRETE despre cum a folosit produsul (nu "excelent")
  // - FAQ standard COD RO (plată, livrare, courier, garanție, telefon, retur)
  // - feature sections sunt mini-articole image+bullets care explică un beneficiu cheie
  // Tone × Niche matrix — instructiuni emotional hooks specifice cand tone+niche
  // se combina. AI primeste o linie din matrice pentru combo-ul concret, ca
  // sa nu produca copy generic care suna la fel indiferent de combo.
  const toneNicheMatrix = {
    'agresiv|beauty': 'Frica de imbatranire / pielea care iti tradeaza varsta. Headline cu "10 ani in 30 zile" sau "ridurile dispar". Urgenta de schimbare ACUM, nu maine.',
    'agresiv|electronics': 'FOMO pe tehnologie. "Toti foloseau deja asta in timp ce tu pierdeai timpul". Comparatie agresiva cu solutii vechi.',
    'agresiv|fashion': 'Insecuritate sociala + statut. "Nu mai iesi imbracat ca acum 5 ani". Critica directa la modă veche.',
    'agresiv|auto': 'Pericol + reparatii scumpe. "Inainte sa te coste 3000 LEI la service". Frica de defectiune costisitoare.',
    'agresiv|health': 'Sanatatea care se degradeaza. "Inainte sa fie prea tarziu". Statistici cu boli specifice.',
    'agresiv|home': 'Casa care arata neglijent + mizerie. "Vizita care iti iese pe gura". Rusine sociala.',
    'agresiv|sports': 'Corp slab + judecata sociala. "Vara la plaja in 60 zile sau nimic". Deadline strict.',
    'agresiv|baby': 'Vinovatia parintelui + siguranta copilului. "Lucruri pe care alti parinti le stiu deja". Comparatie cu "parintii buni".',
    'agresiv|pet': 'Sanatatea animalului in pericol + costuri vet. "Inainte sa cheltui 2000 LEI la veterinar".',
    'agresiv|generic': 'Urgenta directa cu pierdere clara. "X care e mort daca nu actionezi azi". Scarcity puternic.',

    'premium|beauty': 'Rafinament + auto-ingrijire ca ritual. "Pentru cele care stiu sa aleaga". Vocabular ales, nu cuvinte de zi cu zi.',
    'premium|electronics': 'Excelenta tehnica + design. "Inginereria detaliilor". Specs ca proof points, nu lista lunga.',
    'premium|fashion': 'Statut + lifestyle aspirational. "Cel care recunoaste calitatea". Mentioneaza materiale rare/finisaje.',
    'premium|auto': 'Statut social + grija pentru investitie. "Pentru cei care isi protejeaza investitia". Tehnologie de varf.',
    'premium|health': 'Self-care premium + longevitate. "Investitie in tine peste 10 ani". Ingrediente top-shelf.',
    'premium|home': 'Casa ca expresie a personalitatii + design rafinat. "Spatiul in care te identifici". Materiale durabile.',
    'premium|sports': 'Performanta ca art form + dedicatie. "Disciplina celor care nu accepta mediocritatea".',
    'premium|baby': 'Cel mai bun start pentru copil + standarde inalte. "Pentru parintii care vor ce e mai bun".',
    'premium|pet': 'Animalul ca membru de familie + ingrijire premium. "Pentru companionul care merita totul".',
    'premium|generic': 'Calitate fara compromis + experienta rafinata. "Pentru cei care fac diferenta intre bun si exceptional".',

    'casual|beauty': 'Vorbeste ca prietena care recomanda. "Stii sentimentul cand iei o crema si nu vezi nici o diferenta? Asta e altceva." Confesional.',
    'casual|electronics': 'Geek prieten care explica simplu. "Stii ce ma enerveaza la celelalte? Bateria moare in 2 ore." Frustari relatable.',
    'casual|fashion': 'Stylist prieten care recomanda. "Asta e genul de chestie pe care o porti si TOATA lumea intreaba de unde o ai." Conversatie cu prietene.',
    'casual|auto': 'Mecanic prieten care da sfat. "Stii cat de enervant e cand iti pica X? Astia eviti complet." Tehnic simplu.',
    'casual|health': 'Prieten care a incercat si i-a mers. "Eu am avut aceeasi problema cu Y, am incercat asta si in 2 saptamani..." Storytelling.',
    'casual|home': 'Prieten care decoreaza inteligent. "Am incercat sa-mi organizez bucataria de 5 ori. ASTA a fost ce a mers." Solutia care a functionat.',
    'casual|sports': 'Antrenor prieten care a slabit X kg. "Eu am inceput cu 5 minute pe zi, in 30 zile aratam altfel." Personal proof.',
    'casual|baby': 'Mama / tata cu experienta. "Cand am avut primul copil n-aveam nici o idee. Asta ne-a salvat noptile." Confesional parental.',
    'casual|pet': 'Iubitor de animale care impartaseste. "Cainele meu refuza orice pana sa-i dau asta. Acum vrea numai asta."',
    'casual|generic': 'Recomandare prieteneasca. "Stii cand cineva iti zice ceva si stii pe loc ca ai nevoie? Asa e si asta."',

    'profesional|beauty': 'Limbaj dermatologic + studii. "Studii clinice arata o reducere de 47% a ridurilor in 8 saptamani". Citeaza ingrediente active cu procente.',
    'profesional|electronics': 'Specs + benchmark-uri. "Testat la 10000 cicluri de incarcare". Comparatii numerice cu competitia.',
    'profesional|fashion': 'Provenienta materialelor + tehnica. "Piele full-grain italiana, cusatura saddle stitch manuala". Detalii artizanale.',
    'profesional|auto': 'Specs ingineresti + certificari. "Aprobat TUV / certificat ECE R-87". Cifre tehnice exacte.',
    'profesional|health': 'Studii + dosaj clinic. "Eficacitate demonstrata in trial randomizat n=320". Ingredient activ cu mg specifice.',
    'profesional|home': 'Material specs + standarde. "Inox AISI 304 alimentar / certificare contact alimentar". Durabilitate masurabila.',
    'profesional|sports': 'Stiinta antrenamentului + biomechanics. "Activare 3 grupe musculare simultan / 1.7x mai eficient decat clasicul X".',
    'profesional|baby': 'Certificari siguranta + studii pediatrice. "Recomandat de pediatri / certificare EN71". Procese de testare.',
    'profesional|pet': 'Nutritionist veterinar + studii. "Formulat de medici veterinari / aprobat AAFCO". Nutritional facts.',
    'profesional|generic': 'Date concrete + sursa autoritate. "Testat in laborator independent / rata satisfactie 96%". Cifre exacte cu sursa.',

    'emotional|beauty': 'Imagineaza-ti senzatia + amintirea momentului. "Imagineaza-ti dimineata cand te uiti in oglinda si zambesti". Senzorial.',
    'emotional|electronics': 'Conexiune + momente pierdute. "Cate apeluri ai ratat cu casti vechi? Cate momente ai pierdut?" Nostalgia.',
    'emotional|fashion': 'Identitatea + cum te face sa te simti. "Stii momentul cand intri in camera si te simti TU completa?" Self-confidence.',
    'emotional|auto': 'Siguranta familiei + responsabilitate. "Cand iti urci copiii in spate, stii ca ai facut tot ce ai putut." Grija parentala.',
    'emotional|health': 'Vitalitatea pierduta + speranta. "Iti amintesti cand aveai energie pana seara? Inca poti." Recapatare.',
    'emotional|home': 'Casa ca refugiu + amintiri create. "Locul in care familia ta isi traieste cele mai bune amintiri." Cuibar.',
    'emotional|sports': 'Mandrie + corp redescoperit. "Sentimentul cand iti pui hainele de acum 5 ani si TI INTRA." Victory.',
    'emotional|baby': 'Iubirea de parinte + momente unice. "Primul lui zambet dupa o noapte buna de somn. Asa s-a schimbat." Tendresse.',
    'emotional|pet': 'Companion drag + grija. "Coada care se misca cand intri pe usa. Pentru ea, asta e diferenta." Loialitate.',
    'emotional|generic': 'Conectare emotionala cu rezultatul. "Imagineaza-ti viata ta peste 30 zile. Asa arata diferenta."'
  }
  const matrixKey = (tone || 'direct') + '|' + (opts.niche || 'generic')
  const matrixHook = toneNicheMatrix[matrixKey] || ''
  const matrixBlock = matrixHook
    ? `\n\n=== TON × NISA HOOK (FOLOSESTE in headline + benefits + testimoniale) ===\n${matrixHook}`
    : ''

  const system = `Esti copywriter expert pentru landing page-uri COD din Romania. Scrii ca pentru produsutil.ro, nu ca un AI.

============================================================
FRAZE BANNED (NU folosi NICIODATA, oriunde in JSON):
- "transforma-ti viata" / "te invitam sa descoperi" / "descopera magia"
- "revolutioneaza" / "ridica-ti standardele" / "experienta transformatoare"
- "solutie inovatoare" / "calitate premium" (folosit generic) / "ultimate experience"
- "te ajuta sa..." (vag) / "iti ofera posibilitatea sa..." (vag)
- "produsul nostru" (vag — foloseste numele real al produsului)
- "pentru un stil de viata mai bun" / "pentru tine care meriti"
- "comfort si eleganta" / "calitate si stil" / "performanta superioara"
- "nu rata aceasta oportunitate" / "profita acum de oferta"
- "schimba-ti viata" / "pielea/parul tau merita" / "esti la un click distanta"
- "lider de piata" / "cel mai bun de pe piata" / "calitate ireprosabila"
- "experienta unica" / "moment magic" / "alegerea inteligenta"
============================================================

============================================================
ROMANIAN GRAMMAR & TONE — STRICT (DEAL-BREAKER)

DIACRITICE OBLIGATORII pe TOATE cuvintele. Fara diacritice = JSON respins.
  ă (a-breve): "să", "să nu", "îți", "tău", "să mergi", "să cumperi"
  â (a-circumflex): "în", "când", "așa", "sânt", "România", "începând"
  î (i-circumflex): "în", "început", "îți", "îmi", "împreună"
  ș (s-cedilă, NU s-virgulă greșit): "să", "ești", "așa", "Iași", "București"
  ț (t-cedilă, NU t-virgulă greșit): "ții", "țară", "țeapă", "începuturi", "României"
  Forme MAJUSCULE: Ă Â Î Ș Ț (in headline-uri CAPS).

PUNCTUAȚIE corectă:
  - Virgulă ÎNAINTE de "care / dar / însă / totuși" când introduce propoziție nouă.
  - Spațiu DUPĂ virgulă, NU înainte. Spațiu DUPĂ punct, NU înainte.
  - NU em-dash (—) excesiv. Maxim 1 per frază. Preferă punct + frază nouă.
  - Ghilimele românești corecte: „cuvânt" (jos-sus), NU "cuvânt" (sus-sus).
  - Trei puncte ca "..." (trei puncte separate), NU "…" (unic Unicode).
  - "etc." cu punct, urmat de virgulă: "X, Y, etc., ..."

GRAMATICĂ:
  - Acord subiect-verb obligatoriu: "ei merg" NU "ei merge", "tu ești" NU "tu este".
  - Articol hotărât lipit de cuvânt: "produsul" NU "produs ul".
  - Forme corecte: "să aibă" NU "să aiba"; "să fie" NU "să fii"; "i-am dat" NU "iam dat".
  - Conjunctiv: "să faci", NU "să faci/sa faci" (consistență diacritică).
  - Negativ: "nu mai" (spațiu) NU "numai" (care înseamnă "doar").
  - Cratimă unde trebuie: "te-am", "i-a dat", "să-l iei", "într-o", "n-o pot".

ADRESARE — persoana 2 singular ÎNTOTDEAUNA:
  Permis: "tu / tu ești / te / tău / al tău / ai / vei / poți / vrei"
  INTERZIS: "dumneavoastră", "vă", "dvs.", "voi" (plural), "noi vă"

LIMBAJ NATURAL — scrii CA ȘI CUM AI VORBI cu prietenul tău la o cafea:

  BUN — Conversational, autentic:
    "Știi sentimentul când iei o cremă și după două săptămâni te uiți în oglindă și... nimic?"
    "Sincer, am avut îndoieli. Am încercat 3 produse înainte și niciunul n-a mers."
    "Ascultă. Dacă ai ajuns aici, e pentru că te-ai săturat să..."
    "Am 38 de ani și până luna trecută credeam că asta e — că așa o să mă simt mereu."

  PROST — Robot AI / corporate / formal:
    "Vă invităm să descoperiți soluția revoluționară pentru..."
    "Produsul nostru oferă o experiență optimizată pentru..."
    "Beneficiați de o gamă completă de avantaje..."
    "Specialiștii noștri au dezvoltat..."

INDICATORI DE COPY AUTENTIC (pune-i în testimoniale + featureSections + hero):
  - Întrebări retorice scurte care lovesc durerea
  - Confesiuni: "Sincer", "Recunosc", "Trebuie să-ți spun"
  - Pauze + propoziții scurte alternate cu fraze mai lungi
  - Limbaj de zi cu zi: "mă satur", "nu mai pot", "tot timpul", "așa e mereu", "habar n-aveam"
  - Cifre + detaliu concret peste generalitate ("3 zile", "47 LEI" NU "rapid", "ieftin")

DACĂ O FRAZĂ SUNĂ CA SCRISĂ DE AI sau ca pe site corporate, REJEC-O ȘI RESCRIE.
============================================================

============================================================
HORMOZI M.A.G.I.C. — OFFER NAMING FORMULA (campul "offerName")
Din "$100M Offers" by Alex Hormozi. Numele ofertei VINDE rezultatul inainte
ca user-ul sa citeasca pagina. Acronim M.A.G.I.C. = 5 elemente, FOLOSESTI 3
(maxim 4) per nume — niciodata toate 5 (devine greoi).

  M – MAGNETIC REASON: de ce ofera EXISTA acum? (Editie Limitata / Lansare de Vara / Lichidare de Stoc / Black Friday)
  A – AVATAR: pentru CINE e? (Mamici / Soferi / Începători / Femei 35+ / Antreprenori Ocupati)
  G – GOAL: rezultatul CONCRET dorit? (Ten Curat / Fara Durere / Slabit Rapid / Confort Maxim / Fesieri Modelati)
  I – INTERVAL DE TIMP: cat de repede? (in 30 zile / Peste Noapte / Instant / in 14 Zile)
  C – CONTAINER WORD: cum livrezi? (Kit / Sistem / Pachet / Trusa / Rutina / Colectie / Arsenal / Set / Programul / Metoda / Formula)

REGULI STRICTE:

1. CLARITATEA > CREATIVITATEA. User trebuie sa stie ce cumpara si ce problema rezolva din prima secunda.
   PROST: "Elixirul Zeitei" (abstract, fara semnal de rezultat)
   BUN: "Serul Nocturn pentru Ten Luminos in 28 Zile" (clar + Goal + Timp + Container)

2. COMBINEAZA 3 (max 4) elemente din M.A.G.I.C. — NICIODATA toate 5 simultan.
   - Combo universal: Container + Timp + Goal
   - Combo Avatar: Avatar + Goal + Container (cand persona e foarte clara)
   - Combo Magnetic: Magnetic + Goal + Container (lansari / oferte limitate)

3. OBLIGATIVITATEA CONTAINER WORD-ului. Chiar si pentru UN SINGUR produs (nu bundle),
   reframe-uieste ca pachet/sistem/rutina/kit. Creste valoarea perceputa de 2-5x.
   PROST: "Crema Anti-Riduri"
   BUN: "Sistemul Anti-Riduri de 30 Zile"
   PROST: "Sampon si Balsam Antimatreata"
   BUN: "Kitul Complet pentru Scalp Curat"

4. DENUMESTE DUPA REZULTAT (Dream Outcome), nu dupa feature/ingredient/spec.
   PROST: "Set Benzi Elastice 50kg"
   BUN: "Kitul de 30 Zile pentru Fesieri Modelati"
   PROST: "Furtun Spalare 60m cu 7 Pulverizatoare"
   BUN: "Sistemul de Spalare Express 15 Minute pentru Masina ta"

5. ALITERATIE / RITM (optional — doar daca NU sacrifica claritatea).
   "Rutina Rapida de Refacere", "Sistemul Simplu de Slabit", "Pachetul Performantei Personalizate".

EXEMPLE DE TRANSFORMARE (few-shot pattern):
  Set gantere + coarda → "Kitul 'Mamici in Forma' pentru Arderi Rapide" (Avatar+Goal+Container)
  Crema anti-acneice → "Sistemul de 14 Zile pentru Ten Curat" (Timp+Goal+Container)
  3 tricouri de bumbac → "Pachetul de Baza 'Confort Maxim'" (Goal+Container)
  Aspirator wireless → "Kitul de Curatare Express 15 Minute" (Container+Timp+Goal)
  Supliment de slabire → "Sistemul de 30 Zile pentru Topit Grasimea Abdominala" (Timp+Goal+Container)
  Curs / Ebook retete → "Colectia de Vara: Retete Rapide pentru Antreprenori" (Magnetic+Avatar+Container)
  Furtun gradina extensibil → "Arsenalul de Gradinarit Fara Efort" (Container+Goal)
  Capcana soareci → "Sistemul Anti-Daunatori in 24 Ore" (Container+Goal+Timp)

CONTAINER WORDS PERMISE (RO): Kit, Sistem, Pachet, Colectie, Trusa, Set, Arsenal, Rutina, Programul, Metoda, Formula

OUTPUT: campul "offerName" in JSON (max 60 char). DIFERIT de "productName".
  - productName = numele tehnic / oficial al produsului ("Aspirator wireless wireless 800W")
  - offerName = repackaging M.A.G.I.C. ("Kitul de Curatare Express 15 Minute")
Headline-ul si CTA pot mentiona offerName ca element principal de vanzare.
============================================================

============================================================
NEUROSCIENCE LAYER — DEPTH BEATS SURFACE (Damasio + Hawkins + Kahneman)
95% din decizia de cumparare = subconstient. Copy-ul superficial e ignorat tacit.
Foloseste TOATE 5 straturi simultan, nu izolat:

  STRAT 1 — GANDUL CONSTIENT (System 2): logica, cifre, comparatii, dovezi.
  STRAT 2 — EMOTIA (amygdala, System 1, fires FIRST): durere, frica, hope, dor.
  STRAT 3 — CREDINTA (limiting beliefs): "produsele astea nu functioneaza pe mine".
  STRAT 4 — IDENTITATEA (Maxwell Maltz): oamenii actioneaza congruent cu auto-imaginea lor.
  STRAT 5 — NIVELUL DE CONSTIINTA (Hawkins Map): MAJORITATEA cumparatorilor te citesc
            sub linia 200 (vina/frica/dor/apatie). Pleci de acolo, NU sari direct la hope.

FLOW OBLIGATORIU: FEEL → THINK → ACT.
  - Headline + topBenefits + featureSections[0] = EMOTIE (amygdala first). Loveste durerea concreta.
  - benefits + featureSections[1] + objections + howItWorks = LOGICA (justifica decizia emotionala). Cifre, dovezi, mecanism, studii.
  - testimoniale + risk reversal + urgencyMessage + CTA = ACTIUNE. Identity labeling + emotional drop + frica de pierdere.

EMOTIONAL DELTA ARC (din low → high → fear of loss):
  1. Hero + topBenefits[0]: loveste durerea exact unde e (Hawkins sub 200): "Inca te trezesti epuizat la 3 dupa-amiaza, chiar daca dormi 8 ore?"
  2. featureSections + benefits: ridici la hope/courage: "Imagineaza-ti diminetile cand cobori scarile fara sa simti genunchii..."
  3. urgencyMessage + final CTA: cobori inapoi cu FRICA DE PIERDERE. "Daca lasi asta, peste 3 luni esti tot acolo. Stocul lunii octombrie se termina maine."

BELIEF SHIFTING (Strat 3):
  Identifica MIN. 1 belief limitativ in audienta si-l SHIFTEAZA in objections sau risk reversal.
  BUN: "Stiu ce gandesti — ai mai incercat 3 produse care n-au mers. ASTA e diferit fiindca [mecanism specific] in loc de [mecanism inferior al alternativelor]. + Daca dupa 30 zile esti unde ai fost, returnam integral + 20 LEI pentru deranj."
  PROST: Ignori beliefs si vinzi feature direct.

IDENTITY LABELING (Strat 4):
  Repeta "tu esti / tu meriti / tu iei" cu identitatea CONGRUENTA cu cumpararea — minim 3 ori in copy (1 in hero, 1 in benefits, 1 in CTA section).
  BUN: "Esti tipul de mama care PRIORITIZEAZA siguranta copilului. De aceea citesti pana aici."
  BUN: "Esti om care DECIDE rapid cand vede ceva care merge. Apasa butonul."
  PROST: Adresare generica "clientii nostri spun..."

HAWKINS LEVEL (Strat 5):
  Headline + primul subheadline = TONUL audientei in starea LOR (sub 200). NU jump direct la "vei fi fericit!".
  Daca audienta-tip = mama epuizata la 22:00 → headline cu durere recunoscuta, nu cu promisiune optimista.
  Daca audienta-tip = sofer enervat de pret combustibil → headline cu frustrare, nu cu "Salveaza bani!".
============================================================

REGULI DIRECT-RESPONSE (verificate pe fiecare camp text):
- VOCE ACTIVA OBLIGATORIE — zero diateza pasiva ("este facut" → "facem", "a fost descoperit" → "am descoperit")
- ADRESARE LA PERS. 2 SINGULAR — "tu", "tau", "ai", "vei", NU "dumneavoastra", NU "voi", NU plurale.
- FARA WEASEL WORDS — interzis "foarte", "destul de", "poate", "doar" (cand inseamna "numai"), "in general", "deobicei", "probabil", "cumva"
- PARAGRAFE max 300 CARACTERE (testimoniale, descrieri lungi: rupe in fraze scurte)
- LIZIBILITATE clasa 6 — propozitii scurte, cuvinte simple, fara jargon
- NU em-dashes (—) excesive: maxim 1 per fraza, prefera punct + propozitie noua
- 1 SINGUR CTA IMPERATIV per sectiune (verbe: "Comanda", "Profita", "Vreau", "Adauga"; NU "Click aici", "Continua")
============================================================

============================================================
STRUCTURA OBLIGATORIE LP COD ROMANIA — ordinea EXACTA in care AI trebuie sa genereze content. NU adaugi sectiuni in plus, NU omiti. Fiecare sectiune raspunde la o obiectie naturala (Question Ladder).

ORDINE SECTIUNI:

1. HEADLINE — atrage atentia in <3 secunde (Sophistication Level + 3 hook levers)
2. POZA PRODUS — image[0] dominant
3. STARS + REVIEW COUNT — "5★ X.XXX+ Clienti Multumiti"
4. PRODUCT NAME — nume specific sub headline
5. OFFER (price block) — old price taiat + price nou MARE + procent reducere + savings
6. 3-4 BENEFICII PRINCIPALE (quickBullets) — cu impact MAXIM, alese sa motiveze cei mai multi cumparatori
7. CTA buton mare verde/portocaliu — "🛒 COMANDA ACUM"
8. CARUSEL TESTIMONIALE — 3-4 testimoniale scroll horizontal stanga-dreapta. FIECARE testimonial:
   - OBJECTION HANDLING: trateaza una din credintele limitative ale ICP-ului
   - User-ul citeste si simte "asta sunt EU" — propria viata scrisa in cuvinte
   - 4-part: situatia veche (cu durere ICP-ului) → actiunea (cum a aflat) → rezultatul cu cifra → emotia finala
9. SECTIUNEA CARACTERISTICI SI AVANTAJE (featureSections):
   - Headline sectiune: "Ce primesti cu adevarat" sau similar
   - Per featureSection: title scurt CAPS (mini-hook, ex: "AJUNGI ACOLO UNDE PISTOLUL NU AJUNGE") + 2-3 fraze DESCRIERE SCURTA care vorbeste DIRECT cu omul ("Cand o folosesti, vei putea sa...")
   - Foloseste informatiile despre cum sa vorbesti cu user-ul (Avatar Sheet + ICP) ca sa-l faci sa DOREASCA produsul
10. PRODUCT COMPARISON — Noi vs Solutii Comune (us vs them)
    - usLabel = numele produsului, themLabel = "alte solutii" (spalatorie, aspiratoare ieftine, etc.)
    - 4 rows: feature + them (dezavantaj concret) + us (avantaj cu cifra)
11. MAI MULTE REVIEWS / TESTIMONIALE (vertical grid, sub fold pentru cei care vor mai mult social proof)
12. FAQ ACCORDION — raspunde EXACT la FRICILE care blocheaza cumpararea:
    Fiecare q/a treats o frica psihologica ICP-ului (beliefBarriers). Min 4 din cele 6 intrebari trebuie sa adreseze direct o frica/obiectie. Restul 2 = info logistica (plata/livrare).

REGULI PE SECTIUNI (mapate la structura 12-section):

S1-S7 HERO BLOC:
- headline = Sophistication Level + 3 hook levers + <70 char. Pattern dovedite: "INCEPE SA [verb] [beneficiu]", "[Cifra specifica] cu un simplu [produs]", "[Verb imperativ] [durere] in [timeframe]".
- subheadline = "So That, Without" + obiectie eliminata.
- reviewCount realist (500-9999 bazat pe nisa).
- price/oldPrice/procent reducere — economii vizibile.
- quickBullets = EXACT 4, max 8 cuvinte, beneficii MASURABILE (cifre/timp) — alese pentru IMPACT MAXIM la motivation cumparare.

S8 CARUSEL TESTIMONIALE (3-4 sliduri):
Fiecare testimonial face OBJECTION HANDLING — adreseaza una din credintele limitative din beliefBarriers (ICP). User-ul citeste si se vede pe sine. Structura 4-part:
  (a) "Aveam EXACT problema X de ani de zile" (situatia inainte cu durere autentica)
  (b) "Am incercat Y, n-a mers" (alta solutie esuata = obiectie subtilata)
  (c) "Cand am inceput cu [produs], in [Z zile] am observat [rezultat cu cifra]" (mecanism + dovada)
  (d) "Acum [transformare emotionala / identitate noua]" (emotie finala)
Max 300 char per testimonial. Nume + oras RO. Stars 5.

S9 FEATURE CARDS (featureSections):
- Fiecare card: title = MINI-HOOK CAPS (max 40 char) care promite un beneficiu specific
- bullets[] = 2-3 fraze descriere care vorbesc DIRECT cu user-ul folosind "tu" — il fac sa DOREASCA. NU descriere obiect tehnica.
- Ex BUN title: "AJUNGI ACOLO UNDE PISTOLUL NU AJUNGE"
- Ex BUN bullets: ["Cand bagi prelungirea sub bancheta din spate, scoti praful pe care nici aspiratorul nu-l prinde. 50 bar de presiune impinge tot ce s-a infundat luni de zile.", "Ai garantie ca masina ta arata si dedesubt ca noua, nu doar sus.", "Folosesti acelasi gadget si pentru gradina, terasa, motocicleta."]

S10 COMPARISON:
- usLabel = numele scurt al produsului
- themLabel = "alte solutii" CONCRETE (NU generic "concurenta"). Ex: "Spalatoria auto manuala", "Aspiratoare wireless ieftine", "Servicii la mecanic"
- rows[]: 4 obiectii principale ale ICP-ului → fiecare rand: feature comparat, them = dezavantajul lor in cuvintele user-ului, us = avantajul tau cu cifra concreta.

S11 EXTRA TESTIMONIALE = restul testimoniale[] >3 in lista vertical.

S12 FAQ — 6 intrebari MIX:
- Min 4 din 6 trebuie sa adreseze fricile psihologice din beliefBarriers (NU doar logistic).
- Ex: "Daca nu merge la mine?" (frica de risc), "Cum stiu ca nu se strica in 2 luni?" (frica de durabilitate), "Pot folosi si daca nu am experienta?" (frica de incompetenta).
- 2 din 6 = info logistica (plata ramburs, livrare 2-4 zile).
- Raspunsuri concrete, 1-2 fraze, sub 200 char.

PATTERN-URI COPY OBSERVATE PE LP-URILE WIN:
- "INCEPE SA [verb] [beneficiu]" (CarEco)
- "[Beneficiu] cu un simplu [produs]" (CarEco - "Economiseste mult cu un simplu dispozitiv")
- "Functioneaza pe ORICE [target] [conditie specifica]" (CarEco - "orice masina fabricata dupa 1996")
- "Easy to Install" / "Plata simpla" (Plasa) - English sub-headlines pentru impact
- "[X] CULORI DISPONIBILE" (StopFisuri)
- "Material REZISTENT" / "Plasa AUTOINCHIDERE" — CAPS keyword + atribut
- Stickere: "100% Multumire garantata" badge mare verde
- CleanPro: "ROBOTUL 3-IN-1 care schimba totul" — numeric power claim
- Plasa: "1+1 GRATIS" badge mare ROZ in colt + pret incrucisat
- Furtun 60m: "7 motive PUTERNICE" — combinare cifra + intensifier
- "Mai multe comentarii pe Facebook..." footer social proof — screenshot review-uri FB
- "30 de zile - GARANTIE DE RETURNARE A BANILOR" - explicit, fara complicat
- "Recenzii clienti" sectiune cu foto real, nu emoji avatari
============================================================

REGULI CRITICE PE STRUCTURA + COPYWRITING:

1. **HEADLINE — alege framework H1 conform LEVEL DE SOFISTICARE A PIETEI** (decizi tu pe baza nisei + descrierii produsului):
   - **Level 1 (piata noua, fara competitie)**: claim direct. Ex: "Cum sa cureti masina in 15 minute"
   - **Level 2 (competitie directa)**: claim marit. Ex: "Cum sa cureti masina in 15 minute MAI BINE decat la spalatorie"
   - **Level 3 (focus pe mecanism)**: cum functioneaza. Ex: "Cum sa cureti masina folosind jetul cu presiune reglabila 50 bar"
   - **Level 4 (mecanism marit)**: detaliu mecanism. Ex: "Noua tehnologie de jet variabil 30-50 bar curata interiorul masinii in 15 minute"
   - **Level 5 (identificare emotionala)**: conectare cu durerea audientei. Ex: "Pentru parintii care obosesc sa duca masina la spalatorie in fiecare saptamana"
   APLICA cel mai potrivit Level conform contextului produsului. Maxim 70 chars.

2. **HEADLINE — STACK 3 HOOK LEVERS din 7** (Curiosity, Pain, Promise, Specificity, Credibility, Timeframe, Simplicity):
   - Combina 3-4 maxim, NU toate 7. Frankenhook = mort.
   - Exemple bune (stack 3 levers):
     "Curata masina in 15 minute fara sa ridici degetul" (Promise + Specificity + Timeframe)
     "De ce 14.000 mame au scapat de mizeria de la masa in 7 zile?" (Curiosity + Specificity + Pain)
     "Aspirator 800W care prinde mai mult par decat Dyson - testat 30 zile" (Specificity + Credibility + Pain)
   - QA: < 15 cuvinte, 1 idee clara, audienta recunoscuta, fara mecanism dezvaluit

3. **SUBHEADLINE — formula "So That, Without"**: [PROMISIUNE concreta] + "Without" [OBIECTIE PRINCIPALA eliminata]. Max 100 chars.
   BUN: "Fixezi orice piesa rupta in 8 minute - fara scule, fara dezordine, fara experienta"
   BUN: "Functioneaza pe orice masina fabricata dupa 1996 - fara montaj la mecanic, fara abonament"
   PROST: "Solutia care iti transforma rutina" (vag + banned)

4. **quickBullets — EXACT 4, max 8 cuvinte, beneficii MASURABILE/VIZIBILE**:
   BUN: "Reduce consumul cu 15-25% pe ruta urbana"
   BUN: "Functioneaza pe orice masina fabricata dupa 1996"
   PROST: "Calitate superioara garantata" (banned)

5. **STRUCTURA SECTIUNILOR "The Question Ladder"** — fiecare sectiune raspunde la o obiectie naturala in MINTEA cumparatorului:
   - Hero (headline + subheadline + price + CTA) → "Sunt in locul potrivit?"
   - quickBullets → "Ce primesc concret?"
   - topBenefits (3 PAS) → "Ma intelege cineva?"
   - featureSections (image + bullets) → "Cum functioneaza?"
   - howItWorks (3 pasi) → "Cat de simplu e?"
   - benefits lista completa → "Ce mai primesc?"
   - testimoniale → "De ce sa te cred?"
   - objections (rebuttals) → "Care sunt riscurile?"
   - risk reversal → "Ce daca nu merge?"
   - faq → "Mai am 6 intrebari rapide"
   - urgency banner + final CTA → "Ce fac acum?"

6. **topBenefits (TOP 3) si benefits (5-7) — framework PAS strict**: [PROBLEMA in CAPS 1-3 cuvinte] + "—" + [REZOLVARE concreta cu cifre/mecanism].
   BUN: "FARA SCURGERI — sistem de garnitura tripla testat la 50 bar fara nici o picatura"
   BUN: "MONTAJ IN 8 MINUTE — strecuratoare standard, fara chei speciale, fara experienta"
   BUN: "PRINDE TOTUL — vacuum la 800W aspira par de caine, cereale, lichid in acelasi timp"
   PROST: "Foarte util" (nu PAS, banned word "foarte")

7. **featureSections — mini-articole IMG+TEXT cu UN beneficiu CHEIE explicat**:
   - title in CAPS, max 40 chars, focus pe BENEFICIU (NU pe feature).
   - bullets: 3 puncte concrete (cifre, mecanism, comparison).
   BUN title: "AJUNGI ACOLO UNDE FURTUNUL NU AJUNGE"
   BUN bullets: ["Prelungire 1.2m pivotanta 360°", "Reaches under bancheta + portbagaj", "Inox 304 - rezista la presiune 50 bar"]
   PROST title: "CALITATE PREMIUM" (banned + vag)

8. **howItWorks — exact 3 pasi, MOTIVATOR sa cumpere ACUM, nu manual tehnic**:
   - Fiecare pas: title scurt 3-5 cuvinte (verb imperativ) + desc 1 fraza concreta.
   - Format: [ACTIUNEA USOARA] → [REZULTATUL IMEDIAT] → [BENEFICIUL DURABIL]
   BUN: [{title:"Comanzi azi", desc:"Plata la livrare cu curierul, fara card, fara abonament"}, {title:"Primesti in 2-3 zile", desc:"Ambalaj sigilat, instructiuni in romana"}, {title:"Folosesti din prima zi", desc:"Setup in 8 minute, vezi rezultate de la prima utilizare"}]

9. **Testimoniale — structura "Wall of Love" 4-part** (stack vertical, NU carousel):
   [SITUATIE INITIALA: ce avea inainte, durerea concreta] + [ACTIUNE: cum a aflat / cand a comandat] + [REZULTAT cu CIFRA/TIMELINE concret] + [EMOTIE finala sintetica].
   Nume real RO + oras (Bucuresti, Cluj, Constanta, Iasi, Timisoara, Brasov, Oradea, Sibiu, Galati, Ploiesti, Craiova, Pitesti, Arad, Bacau, Buzau).
   BUN: "Plateam 80 LEI pe spalat la mana o data pe luna. Am vazut clipul si am comandat. In prima zi cand am incercat la masina, am terminat in 18 minute fata de 50 minute la mana. Acum nu mai duc masina niciunde."
   PROST: "Produs excelent recomand." (lipsa 4-part, weasel "excelent")
   FIECARE testimonial maxim 300 caractere total.

10. **FAQ exact 6 intrebari in ordinea fixa**:
    (1) Ce metoda de plata? (2) Cat dureaza livrarea? (3) Cine livreaza? (4) Garantie? (5) Pot comanda prin telefon? (6) Politica retur?
    Raspunsuri concrete, 1-2 fraze, sub 200 char.

11. **objections (4 items daca cerute) — STACK obiectie + rebuttal CONTEXTUAL**:
    BUN: {objection: "E prea scump pentru ce ofera", rebuttal: "Calculezi: 5 LEI / utilizare pentru durata 18 luni. O cafea costa 12 LEI dar dispare in 10 minute."}
    BUN: {objection: "Nu functioneaza la masinile vechi", rebuttal: "Compatibil OBD-II standard - orice masina fabricata dupa 1996. Verifica priza diagnostic dedesubtul volanului."}
    PROST: {objection: "E prea scump", rebuttal: "Avem cele mai bune preturi."} (defensive + banned)

12. **riskReversalText — garantie CONDITIONALA cu BANI INAPOI + bonus pentru deranj**:
    BUN: "Daca dupa 30 zile combustibilul tau nu a scazut cu cel putin 10%, rambursam integral + 20 LEI pentru bataia de cap. Returnezi fara intrebari, fara argumente."
    PROST: "30 de zile garantie de returnare." (generic, banned)

13. **urgencyMessage — concret + cifra credibila**:
    BUN: "ULTIMELE 47 BUC din stocul lunii octombrie"
    BUN: "OFERTA 1+1 GRATIS valabila pana la epuizare"
    PROST: "STOC LIMITAT" (generic, vag)

14. **CTA — 1 imperativ scurt + actionabil**:
    BUN: "Comanda acum" / "Profita acum" / "Vreau si eu"
    EVITA: "Click aici" / "Mai multe info" / "Continua"

15. **DIACRITICE OBLIGATORII** (a, i, s, t, ts) + ortografie corecta.

16. **LENGTH MODE — STRICT exact N items**:
    - scurt: 3 benefits, 3 testimoniale, 4 FAQ, 1 featureSection, 3 quickBullets
    - mediu: 5 benefits, 4 testimoniale, 6 FAQ, 2 featureSections, 4 quickBullets
    - lung: 7 benefits, 6 testimoniale, 8 FAQ, 3 featureSections, 4 quickBullets
    NU MAI PUTIN. NU MAI MULT.

Returneaza DOAR JSON valid (TOATE check-urile CHECKLIST FINAL respectate), fara markdown, fara backtick-uri, fara explicatii.`

  // Dynamic system block — schimba la fiecare call (ICP, brief, params).
  // Ramane in afara cache-ului. Trimite ~1-2k tokens per call.
  const dynamicSystem = `${personalizationBlock}${briefBlock}${competitorBlock}${matrixBlock}

============================================================
CHECKLIST FINAL (verifica fiecare punct INAINTE de a returna JSON):
[ ] STRUCTURA CANONICA respectata: hero (badge+rating+price+CTA+trust strip), quickBullets, testimonial early, topBenefits, featureSection 1, riskReversalText explicit conditional, featureSection 2, comparison/objections, full testimonials list, howItWorks 3 pasi, urgencyMessage cu cifra concreta, FAQ 6 standard
[ ] offerName aplica HORMOZI M.A.G.I.C. — Container word OBLIGATORIU + 2-3 din M-A-G-I, denumire dupa REZULTAT (NU feature/spec), claritate > creativitate, max 60 char
[ ] DIACRITICE perfect puse pe TOATE cuvintele (ă, â, î, ș, ț + majuscule). Niciun cuvant fara diacritice unde trebuie.
[ ] PUNCTUATIE corecta: virgula inainte de "care/dar/insa", spatiu DUPA virgula, ghilimele „..." romanesti, NU em-dash excesiv.
[ ] ADRESARE: "tu/tau/ai/vei/poti" peste tot. ZERO "dumneavoastra/dvs./va".
[ ] TON CONVERSATIONAL: intrebari retorice + confesiuni + limbaj de zi cu zi. ZERO corporate ("solutie", "experienta", "Va invitam").
[ ] FIECARE fraza din testimoniale + featureSections suna ca SPUSA de om real, nu scrisa de AI.
[ ] Min 3 din PATTERN-URILE WIN incluse: pattern interrupt headline ("INCEPE SA X"), CAPS keyword sub-headline ("FUNCTIONEAZA PE ORICE..."), numeric proof claim ("Folosit deja de X.XXX"), explicit garantia "30 zile - GARANTIE DE RETURNARE A BANILOR", urgency cu cifra ("ULTIMELE X BUC din lotul [luna]")
[ ] Headline = Sophistication Level identificat + 3 hook levers stack + <70 char
[ ] Subheadline = "So That, Without" + obiectie principala eliminata
[ ] FIECARE camp text in VOCE ACTIVA, pers 2 singular, ZERO weasel words
[ ] FIECARE paragraf testimonial sub 300 char + 4-part structure
[ ] FEEL→THINK→ACT flow aplicat (hero=emotie, benefits=logica, CTA=identitate+frica pierdere)
[ ] Hawkins level — am intrat in starea AUDIENTEI sub 200 (durere/frustrare), NU am sarit la "fii fericit"
[ ] Identity labeling min 3 ori ("tu esti / tu meriti / tu iei")
[ ] Min 1 belief limitativ adresat in objections sau riskReversalText
[ ] Emotional delta arc: durere (hero) → hope (body) → frica de pierdere (urgency+CTA)
[ ] LENGTH MODE EXACT: ${opts.lengthMode || 'mediu'} = ${({scurt:'3 benefits/3 testim/4 FAQ/1 feat/3 quickBullets', mediu:'5/4/6/2/4', lung:'7/6/8/3/4'})[opts.lengthMode || 'mediu']}
[ ] TON aplicat consistent: ${opts.tone || 'direct'}
[ ] NISA aplicata in nicheSections: ${opts.niche || 'generic'}
[ ] URGENCY level: ${opts.urgencyLevel || 'medie'} reflectat in urgencyMessage + intensity copy
[ ] CUSTOM OBJECTIONS (daca cerute) folosite EXACT in objections array, nu inventate
[ ] BRIEF user (salesAngle/styleDesc) — durere + audienta reflectate in TESTIMONIALE + topBenefits
============================================================`

  const schema = `{
  "productName": "Nume tehnic / oficial al produsului (max 60 char). NU 'Produsul nostru' — foloseste numele real.",
  "offerName": "REPACKAGING M.A.G.I.C. (Hormozi) — combina Container word OBLIGATORIU + 2-3 din M-A-G-I (max 60 char). DIFERIT de productName, denumit dupa REZULTAT. Ex: 'Sistemul de 14 Zile pentru Ten Curat', 'Kitul Mamici in Forma pentru Arderi Rapide', 'Pachetul de Baza Confort Maxim'. APLICA HORMOZI M.A.G.I.C. block.",
  "headline": "H1 — alege Level sofisticare 1-5, stack 3 hook levers, max 70 char. APLICA Regula 1+2 din REGULI CRITICE.",
  "subheadline": "Formula 'So That, Without': promisiune + obiectie eliminata. Max 100 char. APLICA Regula 3.",
  "price": ${rp},
  "oldPrice": ${Math.round(rp*1.6)},
  "bumpPrice": ${Math.round(rp*0.2)},
  "bumpName": "Numele accesoriului bump (max 40 char). Ex: 'Setul de Curatare Suplimentar', 'Cartus de Schimb'. Doar daca bumpPrice > 0.",
  "giftValue": 0,
  "stock": 7,
  "timerMinutes": 14,
  "reviewCount": 1247,
  "phoneNumber": "0700 000 000",
  "urgencyMessage": "Concret + cifra credibila. NU 'STOC LIMITAT' generic. Ex: 'ULTIMELE 47 BUC din stocul lunii octombrie'.",
  "riskReversalText": "Garantie CONDITIONALA cu detaliu specific + bonus pentru deranj. Ex: 'Daca dupa 30 zile X nu e Y, rambursam integral + 20 LEI pentru bataia de cap.' APLICA Regula 12.",
  "style": {"primaryColor": "#dc2626", "secondaryColor": "#111111"},
  "quickBullets": [
    "MAX 8 cuvinte. Beneficiu MASURABIL/VIZIBIL cu cifra cand posibil. APLICA Regula 4.",
    "MAX 8 cuvinte. Beneficiu specific produsului.",
    "MAX 8 cuvinte. NU vag — concret.",
    "MAX 8 cuvinte."
  ],
  "topBenefits": [
    "PROBLEMA1 — rezolvarea concreta scurta",
    "PROBLEMA2 — rezolvarea concreta scurta",
    "PROBLEMA3 — rezolvarea concreta scurta"
  ],
  "benefits": [
    "PAS format: PROBLEMA — REZOLVARE concreta cu cifra/mecanism. APLICA Regula 6.",
    "Exemplu: 'FARA SCURGERI — garnitura tripla testata la 50 bar fara picatura'",
    "5/7 items per lengthMode. Caracteristici secundare dar specifice.",
    "...",
    "..."
  ],
  "featureSections": [
    {
      "title": "TITLU CAPS max 40 char — focus pe BENEFICIU. APLICA Regula 7.",
      "bullets": ["punct 1: cifra/mecanism concret", "punct 2: comparison sau spec", "punct 3: rezultat tangibil"]
    },
    {
      "title": "Alt beneficiu cheie",
      "bullets": ["...", "...", "..."]
    }
  ],
  "howItWorks": [
    {"title": "Pas 1 — 3-5 cuvinte verb imperativ", "desc": "[ACTIUNEA USOARA] o fraza. APLICA Regula 8."},
    {"title": "Pas 2", "desc": "[REZULTATUL IMEDIAT] o fraza."},
    {"title": "Pas 3", "desc": "[BENEFICIUL DURABIL] o fraza."}
  ],
  "testimonials": [
    {"text": "4-part: [situatie initiala cu durere] + [actiune: cum a aflat/cand comandat] + [REZULTAT cu cifra/timeline] + [emotie finala]. Max 300 char. APLICA Regula 9.", "name": "Nume real RO", "city": "Oras real RO", "stars": 5},
    {"text": "Exemplu: 'Plateam 80 LEI pe spalat la mana o data pe luna. Am vazut clipul si am comandat. In prima zi cand am incercat, am terminat in 18 minute fata de 50 minute la mana. Acum nu mai duc masina niciunde.'", "name": "Marius D.", "city": "Cluj-Napoca", "stars": 5},
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
  ],
  "objections": [
    {"objection": "Formuleaza obiectia in cuvintele cumparatorului real, NU vag.", "rebuttal": "Rebuttal CONTEXTUAL cu cifra/spec/comparison concreta. APLICA Regula 11."},
    {"objection": "Exemplu: 'E prea scump pentru ce ofera'", "rebuttal": "Calculezi: 5 LEI / utilizare pe durata 18 luni. O cafea costa 12 LEI dar dispare in 10 minute."},
    {"objection": "Exemplu: 'Nu functioneaza la masinile mele vechi'", "rebuttal": "Compatibil OBD-II standard - orice masina dupa 1996. Verifica priza diagnostic dedesubtul volanului."},
    {"objection": "...", "rebuttal": "..."}
  ],
  "popup": ${popupEnabled ? `{
    "goal": "${popupGoal || 'discount'}",
    "headline": "Titlu scurt si captivant (max 50 char)",
    "subtext": "1-2 fraze cu beneficiul concret (max 140 char)",
    "ctaText": "Text buton scurt (max 25 char)",
    "discountCode": "${popupGoal === 'discount' ? 'COD_GENERAT' : ''}",
    "discountPercent": ${popupGoal === 'discount' ? 15 : 0}
  }` : 'null'},
  "nicheSections": [
    {"type": "sizeTable|infoList", "title": "...", "headers": ["..."], "rows": [["..."]], "items": [{"label": "...", "value": "..."}]}
  ],
  "comparison": {
    "usLabel": "Numele produsului tau (max 30 char)",
    "themLabel": "Alte solutii comune folosite (ex: 'Spalatoria auto', 'Aspiratoare wireless ieftine')",
    "rows": [
      {"feature": "Aspect comparat (ex: 'Pret pe utilizare')", "them": "Dezavantajul concret al concurentei in cuvintele lor (max 80 char)", "us": "Beneficiul TAU + cifra (max 80 char)"},
      {"feature": "Alt aspect (ex: 'Timp setup')", "them": "...", "us": "..."},
      {"feature": "...", "them": "...", "us": "..."},
      {"feature": "...", "them": "...", "us": "..."}
    ]
  }
}`

  // Detalii produs de pasat la Claude — fara ele inventeaza orb.
  // useCases / painPointSolved / audience vin din Vision (uploaded photo)
  // sau pot lipsi (URL scrape). Cand exista, Claude trebuie sa le foloseasca
  // direct in headlines, benefits si testimoniale.
  const productContext = [
    `Nume produs: "${productInfo.title || 'produs'}"`,
    `Pret RO: ~${rp} LEI`,
    productInfo.description ? `\nDescriere produs (sursa: AliExpress / Vision):\n"""\n${productInfo.description}\n"""` : '',
    productInfo.specs?.length ? `\nSpecificatii produs (concrete, extrase din sursa):\n- ${productInfo.specs.join('\n- ')}` : '',
    productInfo.audience ? `\nAUDIENTA PROBABILA (din Vision — foloseste in testimoniale + ton):\n"""\n${productInfo.audience}\n"""` : '',
    productInfo.painPointSolved ? `\nDURERE REZOLVATA (din Vision — foloseste in headline + topBenefits):\n"""\n${productInfo.painPointSolved}\n"""` : '',
    productInfo.useCases?.length ? `\nSITUATII DE FOLOSIRE (din Vision — foloseste in featureSections + benefits):\n- ${productInfo.useCases.join('\n- ')}` : ''
  ].filter(Boolean).join('\n')

  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16000,
    // Extended thinking — Sonnet 4.5 isi rezerva 12k tokens pentru
    // RATIONAMENT INVIZIBIL inainte de a returna JSON-ul final. Permite
    // sa analizeze in profunzime cele 16 reguli, sa identifice Sophistication
    // Level, hook levers de stack, Hawkins state al audientei + sa
    // self-verifice CHECKLIST FINAL inainte de output.
    thinking: { type: 'enabled', budget_tokens: 8000 },
    // Prompt caching — system prompt e ~12k tokens static (banned, MAGIC,
    // neuroscience, structura, reguli 1-16). Cache_control 'ephemeral' = 5min
    // TTL, 90% discount pe input cached. Second block (dynamicSystem) ramane
    // necachuit fiindca contine ICP + params per-call.
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicSystem }
    ],
    messages: [{ role: 'user', content: `Genereaza JSON-ul de mai jos pentru ACEST produs concret:

${productContext}

Reguli specifice produsului:
- productName si headline trebuie sa fie despre ACEST produs (nu generic).
- benefits si topBenefits sa fie despre features REALE ale produsului (din descriere/specs de mai sus, NU inventezi).
- featureSections.bullets sa cite specs concrete (dimensiuni, material, mod de folosire, etc.) din descrierea / specs date.
- testimoniale sa mentioneze cum au folosit ACEST produs (nu generic "produs bun").
- Daca descrierea spune ceva specific (gen "5 niveluri rezistenta", "bateriile dureaza 40 ore"), foloseste exact in featureSections.

IMPORTANT — FOLOSESTE EXTENDED THINKING (max 12000 tokens) pentru:
1. Analizeaza profil cumparator + Hawkins state in care intra mesajul tau
2. Decide Sophistication Level (1-5) al pietei pe baza nisei + produsului
3. Selecteaza 3-4 hook levers din cele 7 + construieste 3 variante de headline, alege cea mai buna
4. Mapeaza Feel→Think→Act per sectiune
5. Verifica CHECKLIST FINAL inainte de a returna JSON-ul

Returneaza EXACT acest JSON schema completat:
${schema}` }]
  })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 240000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const rawResponse = Buffer.concat(chunks).toString()
          console.log('Claude HTTP:', res.statusCode)
          const data = JSON.parse(rawResponse)
          if (data.error) {
            console.log('Claude API error:', JSON.stringify(data.error))
            throw new Error('Claude API: ' + data.error.message)
          }
          // Extended thinking — `content` array contine 'thinking' blocks
          // (rationamentul intern) + 'text' blocks (output-ul final). Filtram
          // doar text blocks pentru JSON. thinking blocks raman in log debug.
          const blocks = data.content || []
          const thinkingBlocks = blocks.filter(c => c.type === 'thinking')
          if (thinkingBlocks.length) {
            const thinkLen = thinkingBlocks.reduce((s, b) => s + (b.thinking || '').length, 0)
            console.log('Claude thinking length:', thinkLen, 'blocks:', thinkingBlocks.length)
          }
          const text = blocks.filter(c => c.type === 'text').map(c => c.text || '').join('')
          console.log('Claude text length:', text.length, 'stop_reason:', data.stop_reason)
          // Smart JSON extractor — handle braces in strings, escapes, etc.
          // indexOf/lastIndexOf method failed when Claude included {} in example text.
          const jsonStr = extractBalancedJSON(text)
          if (!jsonStr) {
            console.log('Claude raw text (no balanced JSON):', text.substring(0, 300))
            throw new Error('Claude returned no JSON')
          }
          try {
            resolve(JSON.parse(jsonStr))
          } catch (parseErr) {
            console.log('Claude JSON parse failed. First 500 chars:', jsonStr.substring(0, 500))
            console.log('Parse error:', parseErr.message)
            throw new Error('Claude JSON malformed: ' + parseErr.message)
          }
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude timeout after 240s')) })
    req.write(body)
    req.end()
  })
}

// Smart JSON extractor — finds first balanced JSON object in text.
// Handles nested braces, strings with braces inside, escaped chars.
function extractBalancedJSON(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.substring(start, i + 1)
    }
  }
  return null
}

// Retry + fallback wrapper — Claude e ocazional flaky (timeout, JSON truncat,
// rate limit, overload). Reincercam o data, apoi cadem pe skelet generic
// editabil. User-ul NU primeste 500 din motive Claude — primeste un LP basic
// pe care il poate edita in editor.
async function callClaudeWithRetry(productInfo, styleDesc, opts = {}) {
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const copy = await callClaude(productInfo, styleDesc, opts)
      if (!copy || typeof copy !== 'object') throw new Error('Claude returned non-object')
      return copy
    } catch (e) {
      lastErr = e
      console.log('Claude attempt ' + (attempt + 1) + ' failed:', e.message)
      if (/x-api-key|authentication|401/i.test(e.message)) break
      // Rate limit / overload → backoff mai lung. 12s, 30s, 60s.
      const isRateLimit = /rate\s*limit|429|overload|usage\s+tier/i.test(e.message)
      if (isRateLimit && attempt < 2) {
        const delay = [12000, 30000, 60000][attempt] || 12000
        console.log('Claude rate-limited, backoff', delay, 'ms')
        await new Promise(r => setTimeout(r, delay))
      } else if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }
  console.log('Claude failed all attempts, returning fallback skeleton. Last error:', lastErr?.message)
  return buildFallbackCopy(productInfo)
}

// Skelet minim valid daca Claude esueaza complet — user-ul primeste un LP
// generic editabil in loc de eroare 500.
function buildFallbackCopy(productInfo) {
  const rp = productInfo.priceUSD > 0 ? Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10 : 149
  const name = productInfo.title || 'Produsul Tău'
  return {
    productName: name.substring(0, 60),
    offerName: `Pachetul Complet ${name}`.substring(0, 60),
    headline: `${name} — Calitate Premium`,
    subheadline: 'Comandă acum cu livrare rapidă și plată la livrare',
    price: rp, oldPrice: Math.round(rp * 1.6), bumpPrice: Math.round(rp * 0.2),
    giftValue: 0, stock: 7, timerMinutes: 14, reviewCount: 1247,
    phoneNumber: '0700 000 000',
    urgencyMessage: 'STOC LIMITAT — SE EPUIZEAZĂ RAPID',
    riskReversalText: 'Îți oferim 30 de zile să încerci produsul. Dacă nu ești mulțumit, îți facem rambursul integral, fără întrebări.',
    style: { primaryColor: '#dc2626', secondaryColor: '#111111' },
    quickBullets: ['Calitate verificată', 'Livrare rapidă în România', 'Plată la livrare cu ramburs', 'Retur gratuit 30 zile'],
    topBenefits: ['CALITATE — Produs verificat și testat', 'LIVRARE RAPIDĂ — 2-4 zile în toată țara', 'GARANȚIE — 24 luni inclusă'],
    benefits: ['Produs de calitate premium', 'Verificat și testat', 'Livrare rapidă în 2-4 zile', 'Plată la livrare cu ramburs', 'Garanție 24 luni inclusă'],
    featureSections: [
      { title: 'CALITATE PREMIUM', bullets: ['Materiale durabile', 'Testat pentru utilizare zilnică', 'Garanție extinsă'] },
      { title: 'LIVRARE RAPIDĂ', bullets: ['2-4 zile prin Fan Courier', 'Plată la livrare cu ramburs', 'Retur 30 zile fără întrebări'] }
    ],
    howItWorks: [
      { title: 'Comandă acum', desc: 'Apasă butonul de comandă și completează datele' },
      { title: 'Primești produsul', desc: 'Livrare în 2-4 zile lucrătoare' },
      { title: 'Plătești la livrare', desc: 'Verifici produsul și plătești curierului' }
    ],
    testimonials: [
      { text: 'Produsul a sosit rapid, exact cum a fost descris. Recomand cu încredere.', name: 'Maria D.', city: 'București', stars: 5 },
      { text: 'Comandă plasată ușor, livrare în 3 zile. Calitate bună.', name: 'Andrei P.', city: 'Cluj-Napoca', stars: 5 },
      { text: 'Excelent serviciu, ramburs la livrare. Sunt foarte mulțumit.', name: 'Ioana T.', city: 'Iași', stars: 5 },
      { text: 'L-am comandat pentru cadou, persoana a fost încântată.', name: 'Mihai R.', city: 'Timișoara', stars: 5 }
    ],
    faq: [
      { q: 'Ce metodă de plată acceptați?', a: 'Plata se face ramburs la curier, la livrare. Verifici produsul și apoi plătești.' },
      { q: 'Cât durează livrarea?', a: 'Livrarea se face în 2-4 zile lucrătoare în toată România.' },
      { q: 'Cine livrează?', a: 'Livrarea se face prin Fan Courier / Sameday în toată țara.' },
      { q: 'Am garanție?', a: 'Da, produsul are garanție de 24 luni. În caz de defect, îl înlocuim gratuit.' },
      { q: 'Pot comanda prin telefon?', a: 'Da, suni la numărul afișat pe pagină și plasezi comanda direct.' },
      { q: 'Pot returna produsul?', a: 'Ai 30 de zile pentru retur fără întrebări. Banii înapoi integral.' }
    ]
  }
}

// Descarca o imagine de la URL si o returneaza ca base64
function fetchImageAsBase64(url) {
  // Data URI shortcut — uploadul user-ului vine ca "data:image/jpeg;base64,..."
  if (typeof url === 'string' && url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/)
    if (m) return Promise.resolve({ base64: m[2], mimeType: m[1] })
  }
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
    // V6 INPUT — accept productInfo + icp from /api/research, OR legacy fields
    // for back-compat. New flow: frontend calls /api/research first which scrapes
    // product + builds ICP, then passes both here.
    const { productInfo: incomingProductInfo, icp, images: researchImages, presetStyle } = req.body

    // Legacy fallback fields (kept for back-compat with old clients)
    const legacy = req.body

    let productInfo = incomingProductInfo || { title: '', priceUSD: 0, description: '', specs: [] }
    let aliImages = Array.isArray(researchImages) ? researchImages.slice(0, 6) : []

    // Legacy URL/photo path — only if productInfo missing
    if (!productInfo.title || productInfo.title.length < 5) {
      const primaryUrl = legacy.aliUrl || legacy.competitorUrl || ''
      if (legacy.productImage) {
        try { productInfo = await callClaudeVision(legacy.productImage); aliImages = [legacy.productImage] } catch (e) { console.log('Legacy vision fail:', e.message) }
      }
      if (primaryUrl && (!productInfo.title || productInfo.title.length < 5)) {
        const html = await fetchWithScraper(primaryUrl).catch(() => '')
        if (html.length > 1000) {
          const scraped = extractImages(html)
          if (scraped.length) aliImages = aliImages.concat(scraped)
          const meta = extractMeta(html)
          if (meta.title?.length > 5) productInfo.title = meta.title.substring(0, 100)
          if (meta.priceUSD > 0) productInfo.priceUSD = meta.priceUSD
          if (meta.description) productInfo.description = meta.description
          if (meta.specs?.length) productInfo.specs = meta.specs
        }
      }
    }

    if (!productInfo.title || productInfo.title.length < 5) {
      return res.status(400).json({ error: 'Lipsesc informatii despre produs. Reia research-ul.' })
    }

    const geminiKey = process.env.GEMINI_API_KEY
    console.log('=== GENERATE v6 (ICP-based) ===')
    console.log('Gemini key:', geminiKey ? 'OK ' + geminiKey.substring(0,8) : 'MISSING')
    console.log('Product:', productInfo.title.slice(0, 50), '| ICP hawkins:', icp?.hawkinsLevel, '| soph:', icp?.sophisticationLevel, '| niche:', icp?.niche)

    // STEP 2: Claude cu produsul + ICP-ul EDITAT de user (mai puternic decat
    // parametrii izolati pe care ii avea inainte — ICP-ul include persona,
    // dureri, dorinte, beliefBarriers, Hawkins level, sophisticationLevel +
    // recomandari pentru tone/urgency/length/niche/includeObjections).
    const copy = await callClaudeWithRetry(productInfo, '', {
      // ICP-driven params
      icp: icp || {},
      tone: icp?.recommendedTone || 'direct',
      salesAngle: icp ? buildSalesAngleFromIcp(icp) : '',
      urgencyLevel: icp?.recommendedUrgency || 'medie',
      lengthMode: icp?.recommendedLength || 'mediu',
      niche: icp?.niche || 'generic',
      includeObjections: icp?.includeObjections !== false,
      customObjections: [],
      competitorContext: '',
      popupEnabled: false,
      popupGoal: null
    })
    // Sincronizare campuri din AliExpress (Claude poate sa fi inventat nume scurt)
    if (productInfo.title) copy.productName = productInfo.title.substring(0, 60)
    if (productInfo.priceUSD > 0) {
      const rp = Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10
      copy.price = rp; copy.oldPrice = Math.round(rp * 1.6); copy.bumpPrice = Math.round(rp * 0.2)
    }

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

    // Style selection:
    //  1. presetStyle (user a venit din Templates → are paleta fixata) → override
    //  2. smart pick din descriere + nume scrape-uit → palette + hero din keywords
    //  3. fallback random pentru diversitate
    if (presetStyle && presetStyle.primaryColor) {
      copy.style = Object.assign({}, copy.style || {}, presetStyle)
      if (!copy.heroVariant) copy.heroVariant = 'split'  // default safe daca preset nu specifica
      console.log('Variant signature: preset palette=' + presetStyle.primaryColor + ' hero=' + (presetStyle.heroVariant || 'split'))
    } else {
      // styleDesc — derivat din ICP (persona + niche) pentru pick-uri smart de paleta
      const styleDescV6 = (icp?.persona || '') + ' ' + (icp?.niche || '') + ' ' + (productInfo.title || '')
      const variants = pickVariantsByDescription(styleDescV6, copy.productName)
      copy.style = Object.assign({}, copy.style || {}, {
        primaryColor: variants.palette.primary,
        secondaryColor: variants.palette.secondary,
        bgAccent: variants.palette.bgAccent,
        bgAccentBorder: variants.palette.bgAccentBorder
      })
      copy.heroVariant = variants.heroVariant
      console.log('Variant signature: palette=' + variants.palette.primary + ' hero=' + variants.heroVariant)
    }

    // Save URL in returned data so editor's auto-save can use it as
    // a stable identifier for localStorage draft (otherwise drafts collide).
    copy.aliUrl = legacy.aliUrl || ''
    // Persist input params asa buildHTML poate aplica tone-variants,
    // niche-icons si countdown widgets bazat pe ele la render time.
    // Sursa: icp (din research agent) > legacy (back-compat).
    copy.meta = {
      tone: icp?.recommendedTone || legacy.tone || 'direct',
      niche: icp?.niche || legacy.niche || 'generic',
      urgencyLevel: icp?.recommendedUrgency || legacy.urgencyLevel || 'medie',
      lengthMode: icp?.recommendedLength || legacy.lengthMode || 'mediu'
    }

    console.log('=== DONE === Images:', copy.images.length, '/4 (', goodGemini.length, 'Gemini +', aliImages.length, 'Ali)', 'meta:', copy.meta)
    res.status(200).json({ success: true, data: copy })
  } catch(err) {
    console.error('Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
