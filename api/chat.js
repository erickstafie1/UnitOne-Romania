// api/chat.js - AI chat backend (Anthropic) - cheia NICIODATA pe client
// Supports two modes:
//   action: 'chat' (default)         — conversational assistant
//   action: 'enhance_prompt'         — takes user's rough style description for
//                                       LP generation and returns polished version
const https = require('https')

const SYSTEM_PROMPT = `Esti asistentul UnitOne, un app Shopify pentru magazine din Romania care vand cu plata ramburs (COD).
Ajuti utilizatorul cu:
- Idei pentru landing page-uri COD (titluri, beneficii, garantii, sectiuni)
- Sfaturi pentru cresterea conversiilor pe pagini COD
- Recomandari pentru produse de tip dropshipping cu plata la livrare
- Intrebari tehnice despre app (Releasit, EasySell, GemPages)
- Optimizare texte de vanzare pentru piata din Romania

Raspunde scurt si direct, in romana. Foloseste bullet points cand listezi idei.
Daca utilizatorul cere sa creezi o pagina, spune-i sa apese "Pagina noua" din meniu.
Nu folosi emoji decat foarte rar (max 1-2 pe raspuns).`

// System prompt pentru AI Enhance — primeste DESCRIEREA PRODUSULUI scrisa de
// user (poate fi scurta/incompleta) si o EXTINDE cu detalii comerciale. NU
// inventeaza alt produs. NU schimba ce a zis user-ul. Doar adauga detalii
// care lipsesc: durerea exacta, audienta tinta, unghi de vanzare, ton.
// Output-ul devine `styleDesc` in api/generate.js si serveste ca SURSA DE
// ADEVAR pentru AI principal (peste ce scrape-uieste de pe AliExpress).
const ENHANCE_SYSTEM_PROMPT = `Esti un expert in copywriting pentru landing page-uri COD din Romania.

User-ul ti-a scris o DESCRIERE A PRODUSULUI sau (uneori) doar cateva fraze. Tu primesti acea descriere si o EXTINZI cu detalii comerciale pe care un alt AI le va folosi sa genereze landing page-ul.

REGULI ABSOLUTE — NU INCALCA:
1. PASTREAZA TOATE FAPTELE pe care le-a scris user-ul despre produs. NU schimba ce produs e. NU schimba ce face. NU contrazice ce a scris.
2. EXTINDE cu detalii care lipsesc, deduse logic din ce a scris:
   - Cine cumpara (audienta tinta: varsta, sex, situatie viata)
   - Ce durere/problema concreta rezolva produsul
   - Ce moment al zilei/saptamanii il foloseste cumparatorul
   - Unghiul principal de vanzare (frica/dorinta/economie/aspiratie)
   - Tonul (emotional/profesional/direct) potrivit audientei
   - Atmosfera de culori sugerata (cald/rece/luxos/energic)
3. Daca user-ul a scris ceva VAG (ex: "produs bun pt acasa"), pui intrebari implicit doar atunci cand nu poti deduce — DAR nu cere user-ului sa raspunda. Adaugi o presupunere realista marcata clar (gen "Probabil pentru...").

OUTPUT:
- Maxim 800 caractere total — brief pentru alt AI, nu eseu.
- Romana cu diacritice.
- Proza fluenta — nu liste cu bullets.
- NU prefatare ("Iata:" / "Brief:"). NU mentiona ca esti AI.
- Incepe direct cu descrierea extinsa a produsului.`

function anthropicCall(messages, apiKey, systemPromptOverride) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPromptOverride || SYSTEM_PROMPT,
      messages
    })
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 60000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(new Error('Parse error: ' + Buffer.concat(chunks).toString().substring(0, 200))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(payload)
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
    const body = req.body || {}
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'AI nu este configurat (lipseste ANTHROPIC_API_KEY)' })

    // Mode: enhance_prompt — takes user's product description (whatever they
    // wrote about the product) and EXTENDS it with commercial details for LP
    // generation. Preserves all user facts, adds audience/pain/angle/tone.
    if (body.action === 'enhance_prompt') {
      const userText = (body.text || '').trim()
      const productContext = (body.productContext || '').trim()
      if (!userText) return res.status(400).json({ error: 'text required' })

      const userMessage = productContext
        ? `Context produs (link sau alta info): ${productContext}\n\nDESCRIEREA SCRISA DE USER (extinde-o, NU o schimba):\n"""\n${userText}\n"""\n\nReturneaza descrierea extinsa, in proza.`
        : `DESCRIEREA SCRISA DE USER (extinde-o, NU o schimba):\n"""\n${userText}\n"""\n\nReturneaza descrierea extinsa, in proza.`

      const response = await anthropicCall(
        [{ role: 'user', content: userMessage.slice(0, 3000) }],
        apiKey,
        ENHANCE_SYSTEM_PROMPT
      )
      if (response.error) return res.status(500).json({ error: response.error.message || 'AI error' })
      const enhanced = (response.content?.[0]?.text || '').trim()
      return res.status(200).json({ success: true, enhanced })
    }

    // Default mode: chat
    const { messages } = body
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' })
    }
    if (messages.length > 30) {
      return res.status(400).json({ error: 'too many messages' })
    }

    const clean = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))

    if (!clean.length) return res.status(400).json({ error: 'invalid messages' })

    const response = await anthropicCall(clean, apiKey)
    if (response.error) return res.status(500).json({ error: response.error.message || 'AI error' })

    const text = response.content?.[0]?.text || ''
    res.status(200).json({ success: true, message: text })
  } catch(err) {
    console.error('Chat error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
