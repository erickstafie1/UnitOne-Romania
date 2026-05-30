// v6 - locked 12-section structure + 4 niche palettes + no thinking
const https = require('https')
const http = require('http')

// 4 condensed niche palettes. AI mapează nișa ICP → una din astea, evitand
// 10 variante care diluau identitatea vizuala. Sub fiecare paletă coexistă
// 3 nuanțe similare ca să varieze ușor între LP-uri în aceeași nișă.
const NICHE_PALETTES = {
  // BEAUTY — pink/peach soft (Lumin, Versa, Primal Queen aesthetic)
  beauty: [
    { primary: '#db2777', secondary: '#500724', bgAccent: '#fdf2f8', bgAccentBorder: '#ec4899', accent2: '#fbcfe8' },
    { primary: '#e11d48', secondary: '#4c0519', bgAccent: '#fff1f2', bgAccentBorder: '#f43f5e', accent2: '#fecdd3' },
    { primary: '#ea580c', secondary: '#431407', bgAccent: '#fff7ed', bgAccentBorder: '#fb923c', accent2: '#fed7aa' }
  ],
  // HEALTH — clinical blue/teal (Neuro Vision aesthetic)
  health: [
    { primary: '#1e40af', secondary: '#0f172a', bgAccent: '#eff6ff', bgAccentBorder: '#3b82f6', accent2: '#dbeafe' },
    { primary: '#0d9488', secondary: '#042f2e', bgAccent: '#f0fdfa', bgAccentBorder: '#14b8a6', accent2: '#ccfbf1' },
    { primary: '#16a34a', secondary: '#14532d', bgAccent: '#f0fdf4', bgAccentBorder: '#22c55e', accent2: '#dcfce7' }
  ],
  // PET — beige/cream warm (Stellar Cat Bed aesthetic)
  pet: [
    { primary: '#a16207', secondary: '#451a03', bgAccent: '#fefce8', bgAccentBorder: '#d4af37', accent2: '#fef3c7' },
    { primary: '#92400e', secondary: '#451a03', bgAccent: '#fffbeb', bgAccentBorder: '#f59e0b', accent2: '#fde68a' },
    { primary: '#854d0e', secondary: '#422006', bgAccent: '#fefce8', bgAccentBorder: '#ca8a04', accent2: '#fef9c3' }
  ],
  // GENERIC — bold red (COD universal default)
  generic: [
    { primary: '#dc2626', secondary: '#111111', bgAccent: '#fffbeb', bgAccentBorder: '#facc15', accent2: '#fee2e2' },
    { primary: '#b91c1c', secondary: '#0a0a0a', bgAccent: '#fef2f2', bgAccentBorder: '#ef4444', accent2: '#fecaca' },
    { primary: '#7c3aed', secondary: '#1e1b4b', bgAccent: '#faf5ff', bgAccentBorder: '#a855f7', accent2: '#e9d5ff' }
  ]
}

// Mapează nișa ICP (10 variante vechi) la una din cele 4 nișe condensate.
function condenseNiche(rawNiche) {
  const n = String(rawNiche || 'generic').toLowerCase()
  if (['beauty', 'fashion'].includes(n)) return 'beauty'
  if (['health', 'sports', 'baby'].includes(n)) return 'health'
  if (n === 'pet') return 'pet'
  return 'generic'
}

function pickNichePalette(niche) {
  const key = condenseNiche(niche)
  const set = NICHE_PALETTES[key]
  return { niche: key, palette: set[Math.floor(Math.random() * set.length)] }
}

// Reviewer count random pe nișă (intervale realiste per categorie)
function randomReviewCount(niche) {
  const key = condenseNiche(niche)
  const ranges = {
    beauty: [800, 2500],
    health: [500, 1800],
    pet: [300, 1200],
    generic: [600, 2000]
  }
  const [min, max] = ranges[key]
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Format preț 99,00 LEI (RO standard: virgulă zecimală, spațiu LEI)
function formatLei(n) {
  const num = Math.round(Number(n) * 100) / 100
  return num.toFixed(2).replace('.', ',') + ' LEI'
}

// Backward compat — vechiul pickVariantsByDescription. Pastrat ca nu cade
// nimic dintr-un path neexplorat care îl mai folosește.
function pickVariantsByDescription(desc, productName) {
  const txt = ((desc || '') + ' ' + (productName || '')).toLowerCase()
  let niche = 'generic'
  if (/femei|beauty|cosmetic|skincare|machiaj|parfum|serum|crema|fashion|haine/.test(txt)) niche = 'beauty'
  else if (/sanatate|natural|wellness|supliment|vitamine|detox|sportiv|fitness/.test(txt)) niche = 'health'
  else if (/pet|catel|caine|pisica|hamster|animal/.test(txt)) niche = 'pet'
  const r = pickNichePalette(niche)
  return { palette: r.palette, heroVariant: 'split' }
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
STRUCTURA LOCKED — 12 SECTIUNI EXACTE (NU adaugi, NU omiti, NU schimbi ordinea):

1. HERO BLOCK
   image[0] + brandBadge + offerName + heroSubheadline +
   5★ reviewCount + 4 quickBullets (max 8 cuv fiecare) + ctaPrimary + 3 trustPills

2. TESTIMONIAL CAROUSEL ABOVE-FOLD (EXACT 3-4 carduri)
   foto placeholder + nume + varsta + oras + quote 4-part max 280 char + 5★
   Quote face OBJECTION HANDLING (din ICP beliefBarriers)

3. AS SEEN IN BAR
   mode='media': PRO TV / CAPITAL / ADEVĂRUL / ANTENA 1 / CLICK (text-only)
   mode='trust' (fallback daca produs niche): "Recomandat de specialiști RO"
     + 4 badges: ANPC Certificat / Made in EU / Plată la livrare / Livrare 24-48h

4. IDENTITY HEADLINE + INTRO PARAGRAFE (OBLIGATORIU)
   identityHeadline: "Pentru [Audience specifică] care vor [Result] fără [Objection]"
   introParagraphs: 2-3 fraze conversational cu "tu"

5. 3 FEATURE SECTIONS (image above + copy under, EXACT 3 cards)
   Fiecare: title CAPS mini-hook max 40 char + 3 fraze copy direct cu "tu"
   3 features = 3 UNGHIURI DIFERITE ale aceleeasi dureri/dorinte centrale

6. BEFORE / AFTER
   title "Diferenta in [timeframe]" + 2 columns
   beforeText: durere cotidiana concreta (inainte) max 180 char
   afterText: rezultat concret cu cifra + emotie (dupa) max 180 char

7. COMPARISON TABLE (us vs them, EXACT 4 rows)
   usLabel = nume produs scurt max 30 char
   themLabel = alte solutii CONCRETE (NU generic "concurenta")
   rows: feature + them (✗ dezavantaj concret) + us (✓ avantaj cu cifra)

8. HOW IT WORKS — EXACT 3 STEPS
   title imperativ 1-3 cuv + desc 1 fraza concreta
   Format: [Actiune usoara] → [Rezultat imediat] → [Beneficiu durabil]

9. CUSTOMER PHOTO GRID — EXACT 6 CARDS
   Fiecare: nume + varsta + oras + review 1 fraza autentica max 120 char

10. RISK REVERSAL
    "[Promisiune concreta cu timeframe] sau primesti banii inapoi + [bonus] pentru deranj"
    BUN: "Daca dupa 30 de zile nu vezi diferenta, returnam integral + 20 LEI pentru bataia de cap."

11. FAQ — EXACT 6 INTREBARI
    4 frici psihologice (din ICP beliefBarriers) + 2 logistice OBLIGATORII:
      Q5: "Cum se face plata?" → "Plata ramburs la curier, la livrare."
      Q6: "Cat dureaza livrarea?" → "24-48 ore lucratoare in toata Romania."

12. URGENCY + FINAL CTA
    urgencyMessage: cifra stoc concreta + presiune temporala
    BUN: "Doar 47 de bucati ramase din lotul de noiembrie"
    + ctaPrimary repetat (same text ca hero)
============================================================

GYMBEAM RO COPY PATTERNS (ce functioneaza pe milioane in vanzari RO)

heroSubheadline = 1 propozitie LUNGA cu hook senzorial + emotional + concret:
  BUN: "O combinatie de izolat si concentrat proteic cu gust excelent care iti sustine muschii"
  BUN: "Pasta 100% naturala pe care o vei indragi inca de la prima lingurita"
  BUN: "Magneziu premium in forma chelata cu biodisponibilitate excelenta in organism"

quickBullets = MIX categorial obligatoriu, NU toate de acelasi tip:
  • tehnic: "Formula cu Zinc + Magneziu + B12"
  • positioning: "Recomandat de specialisti nutritionisti"
  • compozitie: "100% naturala, fara adaos de zahar"
  • senzorial: "Gust delicios de ciocolata cu nuci"
  • health claim: "Sustine masa musculara dupa antrenament"
  • lifestyle: "Potrivit pentru vegani si keto"
  • use-case: "Excelent in smoothie-uri si deserturi"

Verbele de actiune RO standard: "promoveaza", "sustine", "ajuta la", "contribuie la"
Compatibility tags utile: "potrivit pentru vegani", "fara gluten", "fara adaos de zahar", "prietenos cu GLP-1"
============================================================

FEATURE SECTIONS — REGULI EXTRA STRICTE (cel mai vulnerabil la AI-speak)

TITLE — max 40 char CAPS. BENEFICIU sau frica concreta, NU spec.
  BUN: "AJUNGI ACOLO UNDE FURTUNUL NU AJUNGE"
  BUN: "FOLOSEȘTI O DATĂ. NU MAI VREI ALTCEVA."
  PROST: "TEHNOLOGIE INOVATOARE PREMIUM" (banned)

COPY (3 fraze):
a) Fiecare fraza INCEPE cu verb sau cu "Tu/Te/Iți/Ai" — NICIODATA cu:
   "Acest produs", "Această soluție", "Cu acest", "Datorită", "Mulțumită"
b) MIN 1 cifra / detaliu fizic concret per copy (bari, ml, %, mg, m, kg)
c) Diacritice 100%
d) Suna ca un om care a folosit produsul, NU ca slide PowerPoint

BANNED in feature copy:
"Vei beneficia", "Beneficiezi de", "Această caracteristică", "Tehnologie avansată",
"Funcționalitate optimă", "Confort sporit", "Eficiență ridicată", "Bucură-te de",
"Te vei bucura", "Experiență optimă", "Datorită materialelor"

BUN: "Bagi prelungirea sub bancheta și scoți praful pe care aspiratorul nu-l prinde. 50 bari împing tot ce s-a adunat luni de zile."
BUN: "Apeși o singură dată și schimbi între jet liniar și pulverizare. Aceeași poziție a mâinii, nici un buton ascuns."
PROST: "Această tehnologie revoluționară îți oferă o experiență optimă."

VOICE CHECK per fraza:
1. Începe cu verb / "tu" / detaliu fizic? (Nu "Acest...")
2. Are CIFRA sau DETALIU CONCRET?
3. Suna ca un OM, nu ca un AI?
Daca orice "Nu", REJECT + rescrie.
============================================================

5 REGULI CRITICE (peste structura LOCKED)

R1. HEADLINE / offerName / heroSubheadline — alege Sophistication Level 1-5:
    L1: claim direct ("Cum sa cureti masina in 15 minute")
    L2: claim marit ("...mai bine decat la spalatorie")
    L3: focus mecanism ("...cu jet variabil 30-50 bari")
    L4: mecanism marit ("Noua tehnologie de jet variabil in 15 minute")
    L5: identificare emotionala ("Pentru parintii care obosesc sa duca masina la spalatorie")

R2. SUBHEADLINE = "So That, Without" — promisiune + obiectie eliminata:
    BUN: "Cureti in 15 minute — fara scule, fara dezordine, fara experienta"

R3. quickBullets — EXACT 4, max 8 cuv, beneficii MASURABILE:
    BUN: "Reduce consumul cu 15-25% pe ruta urbana"
    PROST: "Calitate superioara garantata" (banned)

R4. Testimoniale 4-part: situatie initiala (durere) + actiune (cum a aflat) + rezultat (cifra) + emotie finala.
    Nume + varsta + oras RO (Cluj, Iasi, Constanta, etc.)
    BUN: "Plateam 80 LEI pe spalat la mana o data pe luna. Am vazut clipul si am comandat. In prima zi am terminat in 18 minute fata de 50 minute la mana. Acum nu mai duc masina niciunde."
    PROST: "Produs excelent recomand." (lipsa 4-part)

R5. urgencyMessage — concret + cifra credibila:
    BUN: "Doar 47 buc ramase din lotul de noiembrie"
    PROST: "STOC LIMITAT" (generic, vag)

Returneaza DOAR JSON valid (TOATE check-urile CHECKLIST FINAL respectate), fara markdown, fara backtick-uri, fara explicatii.`

  // Dynamic system block — schimba la fiecare call (ICP, brief, params).
  // Ramane in afara cache-ului. Trimite ~1-2k tokens per call.
  const dynamicSystem = `${personalizationBlock}${briefBlock}${competitorBlock}${matrixBlock}

============================================================
CHECKLIST FINAL (verifica fiecare punct INAINTE de a returna JSON):
[ ] STRUCTURA LOCKED — toate 12 sectiunile completate in JSON, NICIUNA omisa, ordine respectata
[ ] offerName aplica HORMOZI M.A.G.I.C. — Container word OBLIGATORIU + 2-3 din M-A-G-I, max 60 char
[ ] heroSubheadline = 1 propozitie LUNGA cu hook senzorial/emotional (stil GymBeam), max 140 char
[ ] DIACRITICE 100% (ă â î ș ț + majuscule) pe TOATE cuvintele. Niciun cuvant fara.
[ ] PUNCTUATIE RO: virgula inainte de care/dar/insa, ghilimele "...", NU em-dash excesiv.
[ ] ADRESARE: "tu/tau/ai/vei/poti" peste tot. ZERO "dumneavoastra/dvs."
[ ] TON CONVERSATIONAL: intrebari retorice, confesiuni, limbaj zi cu zi. ZERO corporate.
[ ] FIECARE fraza in featureSections + testimonialsAboveFold + customerPhotoGrid suna SPUSA de om real, NU AI.
[ ] FEATURE COPY: fiecare fraza INCEPE cu verb/tu (NU "Acest", "Această", "Cu", "Datorită"), MIN 1 cifra/detaliu fizic, voice check trecut.
[ ] FEATURE TITLES: max 40 char CAPS, beneficiu/frica concreta (NU "PREMIUM", NU "INOVATOR").
[ ] testimonialsAboveFold (EXACT 3-4): 4-part structure, max 280 char, nume+varsta+oras RO, OBJECTION HANDLING.
[ ] customerPhotoGrid (EXACT 6): nume+varsta+oras + review 1 fraza autentica max 120 char.
[ ] beforeAfter: beforeText (durere cotidiana) + afterText (rezultat cu cifra) max 180 char.
[ ] comparison: 4 rows, themLabel CONCRET (NU "concurenta"), fiecare us cu cifra.
[ ] howItWorks: EXACT 3 pasi imperativi + desc concret 1 fraza.
[ ] riskReversalText: promisiune concreta + cifra timeframe + bonus pentru deranj.
[ ] FAQ: EXACT 6 intrebari = 4 frici psihologice (ICP) + 2 logistice (plata/livrare).
[ ] urgencyMessage: cifra concreta stoc + presiune temporala (NU "STOC LIMITAT" generic).
[ ] identityHeadline OBLIGATORIU + introParagraphs 2-3 fraze.
[ ] FEEL→THINK→ACT flow: hero=emotie / features+comparison=logica / urgency+CTA=loss aversion.
[ ] Identity labeling min 3 ori ("Esti tipul de X care Y") in hero, features, urgency.
[ ] Min 1 belief limitativ (din ICP beliefBarriers) adresat in FAQ sau riskReversalText.
============================================================`

  const schema = `{
  "_schemaVersion": 2,
  "offerName": "M.A.G.I.C. name (Container word OBLIGATORIU + 2-3 din M-A-G-I), max 60 char. Ex: 'Sistemul de 14 Zile pentru Ten Curat', 'Kitul Mamici in Forma pentru Arderi Rapide'.",
  "productName": "Nume tehnic / oficial produs, max 60 char.",
  "brandBadge": "Badge text max 25 char (ex: 'Made in EU', 'Recomandat de specialiști', 'Premium Quality')",
  "heroSubheadline": "1 propozitie LUNGA cu hook senzorial+emotional+concret, max 140 char. Stil GymBeam: 'O combinatie de izolat si concentrat proteic cu gust excelent care iti sustine muschii' / 'Pasta 100% naturala pe care o vei indragi inca de la prima lingurita'.",
  "ctaPrimary": "Text scurt buton CTA, max 30 char (ex: 'Comanda acum cu plata la livrare', 'Vreau si eu')",
  "trustPills": ["Plata la livrare", "Livrare 24-48h", "Retur 30 zile"],
  "price": ${rp},
  "oldPrice": ${Math.round(rp * 1.4)},
  "quickBullets": [
    "max 8 cuv, beneficiu masurabil. MIX categorial obligatoriu (tehnic/positioning/compozitie/senzorial/health claim/lifestyle).",
    "...",
    "...",
    "..."
  ],
  "testimonialsAboveFold": [
    {"text": "4-part max 280 char: [situatie veche cu durere] + [actiune cum a aflat] + [rezultat cu cifra] + [emotie finala]. OBJECTION HANDLING (adreseaza o frica din ICP).", "name": "Prenume", "age": 35, "city": "Cluj-Napoca", "stars": 5},
    {"text": "Exemplu: 'Plateam 80 LEI pe spalat la mana o data pe luna. Am vazut clipul si am comandat. In prima zi am terminat in 18 minute fata de 50 minute. Acum nu mai duc masina niciunde.'", "name": "Marius", "age": 42, "city": "Cluj-Napoca", "stars": 5},
    {"text": "...", "name": "...", "age": 0, "city": "...", "stars": 5}
  ],
  "asSeenIn": {
    "mode": "media",
    "items": ["PRO TV", "CAPITAL", "ADEVĂRUL", "ANTENA 1", "CLICK"]
  },
  "identityHeadline": "Pentru [Audience specifica] care vor [Result concret] fara [Objection principala]. Ex: 'Pentru mamele ocupate care vor mancare gata in 15 minute fara compromis pe gust'.",
  "introParagraphs": [
    "Fraza 1: ce ESTE produsul + cui i se adreseaza, conversational cu 'tu'.",
    "Fraza 2: de ce e diferit + ce rezolva concret."
  ],
  "featureSections": [
    {"title": "MINI-HOOK CAPS max 40 char (BENEFICIU/FRICA concreta)", "copy": "3 fraze direct cu 'tu' + min 1 cifra/detaliu fizic. APLICA FEATURE SECTIONS REGULI EXTRA STRICTE."},
    {"title": "...", "copy": "..."},
    {"title": "...", "copy": "..."}
  ],
  "beforeAfter": {
    "title": "Diferenta in [timeframe]",
    "timeframe": "30 de zile",
    "beforeText": "Durere cotidiana concreta (ce traia INAINTE). Max 180 char. Ex: 'Te trezeai obosit la 3 dupa-amiaza chiar daca dormeai 8 ore.'",
    "afterText": "Rezultat concret cu cifra + emotie (DUPA). Max 180 char. Ex: 'Energie pana seara fara cafea, somn profund, 7 kg slabite in 60 de zile.'"
  },
  "comparison": {
    "usLabel": "Nume produs scurt, max 30 char",
    "themLabel": "Alte solutii CONCRETE (ex: 'Multivitamine farmacie', 'Aspiratoare wireless ieftine'). NU generic 'concurenta'.",
    "rows": [
      {"feature": "Aspect comparat", "them": "Dezavantaj concret max 80 char", "us": "Avantaj cu cifra max 80 char"},
      {"feature": "...", "them": "...", "us": "..."},
      {"feature": "...", "them": "...", "us": "..."},
      {"feature": "...", "them": "...", "us": "..."}
    ]
  },
  "howItWorks": [
    {"title": "1-3 cuv imperativ", "desc": "1 fraza concreta. Format: [Actiune usoara] → [Rezultat imediat] → [Beneficiu durabil]"},
    {"title": "...", "desc": "..."},
    {"title": "...", "desc": "..."}
  ],
  "customerPhotoGrid": [
    {"name": "Prenume", "age": 35, "city": "Oras RO", "review": "1 fraza autentica max 120 char (ton forum RO: 'L-am incercat dupa 2 ani de cautari. Nu am o a doua opinie.')"},
    {"name": "...", "age": 0, "city": "...", "review": "..."},
    {"name": "...", "age": 0, "city": "...", "review": "..."},
    {"name": "...", "age": 0, "city": "...", "review": "..."},
    {"name": "...", "age": 0, "city": "...", "review": "..."},
    {"name": "...", "age": 0, "city": "...", "review": "..."}
  ],
  "riskReversalText": "Promisiune CONCRETA + timeframe + bonus pentru deranj. Ex: 'Daca dupa 30 de zile nu vezi diferenta, returnam integral + 20 LEI pentru bataia de cap.'",
  "faq": [
    {"q": "Frica psihologica 1 (din ICP beliefBarriers)", "a": "Raspuns 1-2 fraze concret."},
    {"q": "Frica 2", "a": "..."},
    {"q": "Frica 3", "a": "..."},
    {"q": "Frica 4", "a": "..."},
    {"q": "Cum se face plata?", "a": "Plata se face ramburs la curier, la livrare. Verifici produsul si apoi platesti."},
    {"q": "Cat dureaza livrarea?", "a": "Livrare in 24-48 de ore lucratoare in toata Romania."}
  ],
  "urgencyMessage": "Cifra stoc concreta + presiune temporala. Ex: 'Doar 47 de bucati ramase din lotul de noiembrie' / 'Oferta 1+1 GRATIS valabila pana la epuizare stoc'.",
  "niche": "beauty|health|pet|generic"
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
    // Schema LOCKED + structura predictabila → max_tokens reduse 16k → 8k.
    // Extended thinking eliminat — structura nu mai necesita "gandire" pentru
    // alegerea sectiunilor, doar populare. Latency drop ~50%, cost drop ~25%.
    max_tokens: 8000,
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
- offerName, heroSubheadline si identityHeadline trebuie sa fie despre ACEST produs (nu generic).
- featureSections.copy sa cite specs concrete (dimensiuni, material, mod de folosire) din descriere/specs.
- testimonialsAboveFold + customerPhotoGrid sa mentioneze cum au folosit ACEST produs (nu generic "produs bun").
- comparison.themLabel CONCRET (numeste solutia reala alternativa, NU "concurenta").
- Daca descrierea spune ceva specific (gen "5 niveluri rezistenta", "40 ore baterie"), foloseste exact.

Returneaza EXACT acest JSON schema LOCKED (12 sectiuni), populat conform structurii:
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
  const reviewCount = randomReviewCount('generic')
  return {
    _schemaVersion: 2,
    offerName: `Pachetul Complet ${name}`.substring(0, 60),
    productName: name.substring(0, 60),
    brandBadge: 'Premium Quality',
    heroSubheadline: `Produs ${name.toLowerCase()} verificat și livrat în toată România cu plată la livrare`,
    ctaPrimary: 'Comandă acum cu plată la livrare',
    trustPills: ['Plată la livrare', 'Livrare 24-48h', 'Retur 30 zile'],
    price: rp,
    oldPrice: Math.round(rp * 1.4),
    reviewCount,
    quickBullets: [
      'Calitate verificată din stoc',
      'Livrare rapidă în toată țara',
      'Plată la livrare cu ramburs',
      'Retur gratuit în 30 zile'
    ],
    testimonialsAboveFold: [
      { text: 'Am comandat săptămâna trecută și am primit produsul în 2 zile. Funcționează exact cum mă așteptam. Recomand cu încredere.', name: 'Maria', age: 38, city: 'București', stars: 5 },
      { text: 'Plata la livrare a fost un plus mare. Am verificat pachetul cu curierul și totul era ok. Calitate peste așteptări.', name: 'Andrei', age: 42, city: 'Cluj-Napoca', stars: 5 },
      { text: 'Comandă plasată simplu, livrare rapidă, calitate bună. Am avut o întrebare și au răspuns în 10 minute pe telefon.', name: 'Ioana', age: 35, city: 'Iași', stars: 5 }
    ],
    asSeenIn: { mode: 'trust', items: ['ANPC Certificat', 'Made in EU', 'Plată la livrare', 'Livrare 24-48h'] },
    identityHeadline: `Pentru oamenii care vor ${name.toLowerCase()} fără riscuri și fără așteptări lungi`,
    introParagraphs: [
      `${name} e produsul pe care îl primești acasă cu plată la livrare, fără să avansezi bani sau să te înregistrezi nicăieri.`,
      'L-am ales pentru calitate și pentru că funcționează exact cum descrii la fiecare comandă.'
    ],
    featureSections: [
      { title: 'CALITATE VERIFICATĂ', copy: 'Tu primești produsul ambalat sigilat, verificat înainte să plece din stoc. Fiecare unitate trece printr-un control rapid pe linia de expediție.' },
      { title: 'LIVRARE ÎN 24-48 ORE', copy: 'Tu comanzi azi, primești în 24-48 de ore lucrătoare prin Fan Courier sau Sameday. Adresa o completezi rapid în formularul de comandă.' },
      { title: 'RETUR FĂRĂ INTREBĂRI', copy: 'Ai 30 de zile să te răzgândești. Dacă produsul nu îți place, îl returnezi și primești banii înapoi integral, fără explicații.' }
    ],
    beforeAfter: {
      title: 'Diferența o vezi din prima zi',
      timeframe: 'prima zi',
      beforeText: 'Comandai online și plăteai în avans, sperând că produsul ajunge cum trebuie.',
      afterText: 'Acum verifici pachetul cu curierul și plătești doar dacă totul e ok. Zero risc.'
    },
    comparison: {
      usLabel: name.substring(0, 30),
      themLabel: 'Magazine online standard',
      rows: [
        { feature: 'Plată', them: 'Card în avans, fără verificare', us: 'Ramburs la livrare ✓' },
        { feature: 'Verificare colet', them: 'Doar după ce ai plătit', us: 'Înainte de plată ✓' },
        { feature: 'Livrare', them: '5-10 zile lucrătoare', us: '24-48 ore ✓' },
        { feature: 'Retur', them: 'Doar în 14 zile cu factură', us: '30 zile fără întrebări ✓' }
      ]
    },
    howItWorks: [
      { title: 'Comanzi acum', desc: 'Completezi datele tale în 30 de secunde, fără card.' },
      { title: 'Primești în 24-48h', desc: 'Curierul te sună înainte și ajunge la ușa ta.' },
      { title: 'Plătești la livrare', desc: 'Verifici produsul și plătești curierului numerar sau cu cardul.' }
    ],
    customerPhotoGrid: [
      { name: 'Elena', age: 41, city: 'Brașov', review: 'Am comandat și am primit în 36 de ore. Recomand.' },
      { name: 'Vlad', age: 33, city: 'Timișoara', review: 'Plata la livrare a fost simplă, curierul foarte amabil.' },
      { name: 'Roxana', age: 29, city: 'Constanța', review: 'Calitate bună, ambalaj sigilat. Am verificat tot înainte de plată.' },
      { name: 'Mihai', age: 47, city: 'Oradea', review: 'L-am luat după ce am citit reviewurile. Nu regret.' },
      { name: 'Ana', age: 36, city: 'Sibiu', review: 'Livrare rapidă, exact cum era descris.' },
      { name: 'Cristi', age: 39, city: 'Galați', review: 'A doua comandă și sunt mulțumit la fel ca prima.' }
    ],
    riskReversalText: 'Dacă în 30 de zile produsul nu corespunde așteptărilor tale, îl returnezi și primești banii înapoi integral. Fără întrebări, fără explicații.',
    faq: [
      { q: 'Și dacă produsul nu merge la mine?', a: 'Ai 30 de zile să-l returnezi fără explicații. Primești banii înapoi integral.' },
      { q: 'Cum știu că nu se strică în 2 luni?', a: 'Produsul are garanție și e verificat înainte să plece din stoc.' },
      { q: 'Pot folosi și dacă nu am experiență?', a: 'Da, e gândit să fie ușor de folosit din prima încercare.' },
      { q: 'Funcționează cum se vede în poze?', a: 'Pozele sunt reale și produsul ajunge exact cum îl vezi.' },
      { q: 'Cum se face plata?', a: 'Plata se face ramburs la curier, la livrare. Verifici produsul și apoi plătești.' },
      { q: 'Cât durează livrarea?', a: 'Livrare în 24-48 de ore lucrătoare în toată România.' }
    ],
    urgencyMessage: 'Stoc limitat — verifică disponibilitatea înainte să comanzi',
    niche: 'generic'
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
    // Sincronizare campuri din productInfo (Claude poate sa fi inventat nume scurt)
    if (productInfo.title) copy.productName = productInfo.title.substring(0, 60)
    if (productInfo.priceUSD > 0) {
      const rp = Math.round(productInfo.priceUSD * 5 * 2.5 / 10) * 10
      copy.price = rp
      copy.oldPrice = Math.round(rp * 1.4)
    }
    // Currency format RO standard (99,00 LEI)
    copy.priceFormatted = formatLei(copy.price || 99)
    copy.oldPriceFormatted = formatLei(copy.oldPrice || 149)

    // Reviewer count random pe nisa daca AI nu a setat sau a setat generic
    const condensedNiche = condenseNiche(icp?.niche || copy.niche)
    if (!copy.reviewCount || copy.reviewCount === 1247) {
      copy.reviewCount = randomReviewCount(condensedNiche)
    }
    copy.niche = condensedNiche

    // ─── IMAGE STRATEGY V2 ────────────────────────────────────────────
    // 1 HERO + 6 CUSTOMER GRID = 7 Gemini calls (paralel).
    // Feature sections reuse imagini din grid (crop / zoom variations).
    // Cost ~$0.28/LP (vs $0.16 vechi), latency +18s, calitate ++.
    const heroImageUrl = aliImages[0] || null
    console.log('Product image for Gemini:', heroImageUrl ? 'YES' : 'NO')

    const HERO_PROMPT = `This is a product. Create a stunning cinematic hero image of this exact product on a clean elegant background. Dynamic angle, dramatic professional lighting, rich colors, photorealistic. Magazine cover quality, 8K resolution. No text overlays.`

    // 6 customer-grid prompts — diverse Romanian profiles 25-55 ani, lifestyle natural
    const GRID_PROMPTS = [
      `Authentic UGC-style photo of a happy Romanian woman 28-35 holding this exact product with a smile in her modern apartment. Soft natural daylight, candid feel, warm tones. Product clearly visible.`,
      `Authentic UGC-style photo of a Romanian man 35-45 using this exact product at home, focused expression, casual clothes, modern interior. Natural lighting, realistic look.`,
      `Authentic UGC-style photo of a Romanian woman 45-55 with this exact product in her kitchen or living room, warm friendly smile. Soft golden hour light, family-friendly feel.`,
      `Authentic UGC-style photo of a young Romanian man 25-30 with this exact product, casual urban outfit, modern apartment, relaxed pose. Editorial natural light.`,
      `Authentic UGC-style photo of a Romanian woman 32-40 actively using this exact product, joyful natural expression, modern home. Soft natural daylight, lifestyle vibe.`,
      `Authentic UGC-style photo of a Romanian man 40-50 with this exact product, satisfied expression, professional casual look. Warm natural lighting, magazine quality.`
    ]

    const allPrompts = [HERO_PROMPT, ...GRID_PROMPTS]
    const geminiPromises = geminiKey
      ? allPrompts.map((p, i) =>
          geminiImage(p, geminiKey, heroImageUrl)
            .then(img => { console.log('Gemini', i + 1, '/', allPrompts.length, img ? 'OK' : 'FAIL'); return img })
        )
      : Array(allPrompts.length).fill(null).map(() => Promise.resolve(null))

    const geminiImages = await Promise.all(geminiPromises)
    const heroAI = geminiImages[0]
    const gridAI = geminiImages.slice(1)
    const goodGrid = gridAI.filter(Boolean)
    console.log('Gemini Hero:', heroAI ? 'OK' : 'FAIL', '| Grid:', goodGrid.length, '/6')

    // copy.images[0] = hero. copy.images[1..6] = customer grid (used by render).
    // Feature sections reutilizeaza din grid (index 1, 3, 5 default).
    copy.images = [
      heroAI || aliImages[0] || null,
      gridAI[0] || aliImages[1] || null,
      gridAI[1] || aliImages[2] || null,
      gridAI[2] || aliImages[3] || null,
      gridAI[3] || aliImages[4] || null,
      gridAI[4] || aliImages[5] || null,
      gridAI[5] || aliImages[0] || null
    ].filter(Boolean)
    copy.aliImages = aliImages

    // Style — preset > niche-based 4-palette
    if (presetStyle && presetStyle.primaryColor) {
      copy.style = Object.assign({}, copy.style || {}, presetStyle)
      console.log('Style: preset', presetStyle.primaryColor)
    } else {
      const { niche: pickedNiche, palette } = pickNichePalette(condensedNiche)
      copy.style = Object.assign({}, copy.style || {}, {
        primaryColor: palette.primary,
        secondaryColor: palette.secondary,
        bgAccent: palette.bgAccent,
        bgAccentBorder: palette.bgAccentBorder,
        accent2: palette.accent2
      })
      copy.niche = pickedNiche
      console.log('Style: niche=' + pickedNiche + ' palette=' + palette.primary)
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
