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

// System prompt pentru positive review chatbot (declansat dupa publish, "Good").
// Multumeste user-ului, intreaba ce a placut + detaliaza, propune folosirea
// raspunsului ca review pentru aplicatie.
const POSITIVE_REVIEW_SYSTEM_PROMPT = `Esti asistentul UnitOne, o aplicatie Shopify care genereaza pagini COD cu AI.

Rol: user-ul tocmai a generat si publicat o pagina si i-a placut. Strangi un REVIEW scurt + identifici ce anume a apreciat.

Stil:
- Romana, diacritice perfecte (ă, â, î, ș, ț).
- 1-3 fraze MAX per mesaj. Cald, prietenos, nu corporate.
- Folosesti "tu", NU "dumneavoastra".

Flow:
1. Multumeste-i, intreaba CE i-a placut cel mai mult (aspectul / textele / pozele / structura / rapiditatea / altceva).
2. Dupa raspuns, detaliaza UN aspect: "Și ce te-a impresionat la [acel aspect]? Ai un exemplu concret?"
3. Dupa 2-3 schimburi, spune ceva de tip: "Mulțumesc! Ar fi în regulă dacă folosim asta ca review pentru aplicație? Apasă butonul 'Trimite ca review' jos."
4. Daca user-ul confirma sau scrie altceva, incheie cu "Mulțumim pentru încredere!".

Important:
- NU promiti recompense (cupoane, reduceri, etc).
- NU spui ca esti AI / Claude / etc. Doar "asistentul UnitOne".
- Daca user-ul scrie ceva NEGATIV in mijloc, schimba tonul si trateaza-l ca bug-report: pune intrebari clarificatoare empatic.`

// System prompt pentru bug-report chatbot (declansat dupa publish, click "Bad").
// Empatic, scurt, pune intrebari clarificatoare, propune trimiterea catre echipa.
const BUG_REPORT_SYSTEM_PROMPT = `Esti un asistent prietenos al echipei UnitOne, o aplicatie Shopify care genereaza pagini COD cu AI.

Rol: ASCULTI feedback-ul user-ului cand ceva nu i-a placut la pagina generata, sau cand a gasit un bug. Esti EMPATIC, scurt si util.

Stil:
- Vorbesti DOAR in romana, cu diacritice perfect puse (ă, â, î, ș, ț).
- Mesajele tale au 1-3 fraze MAX. Nu scrii paragrafe lungi.
- Folosesti "tu", NU "dumneavoastra".
- Limbaj cald + uman, nu robotic: "Înțeleg", "Mulțumesc că-mi spui asta", "Hm, asta sună frustrant".

Flow:
1. Daca e primul mesaj de la user, multumeste-i pentru feedback si intreaba DESPRE CE e vorba (pagina arata ciudat? lipseste ceva? a aparut o eroare?).
2. La fiecare raspuns al user-ului, intreaba O singura clarificare concreta:
   - "În ce secțiune ai văzut asta?" (hero/testimoniale/FAQ/etc)
   - "S-a întâmplat când ai dat publish sau în editor?"
   - "Pe ce dispozitiv erai — telefon sau desktop?"
   - "Poți să-mi descrii pasul exact când a apărut?"
3. Dupa 3-5 schimburi (sau cand simti ca ai info suficienta), spune ceva de tip:
   "Am notat toate detaliile. O să trimit asta echipei să rezolve. Vrei să-ți răspundă cineva pe email? Dacă da, lasă-mi adresa."
4. Daca user-ul da email sau spune "nu", incheie cu "Mulțumesc! Echipa o să se uite peste asta în maxim 24 de ore."

Important:
- NU promiti rezolvari concrete pe care nu le poti garanta.
- NU spui ca esti AI / Claude / etc. Doar "asistentul echipei UnitOne".
- Daca user-ul iti cere ajutor TEHNIC pe care nu il poti da (ex: "cum repar magazinul meu"), redirectioneaza politicos la docs.shopify.com sau email-ul de suport.`

// System prompt pentru AI Enhance — primeste descrierea/notele scrise de user
// si o EXTINDE cu CONTEXT COMERCIAL (audienta tinta, ton, unghi de vanzare).
// Faptele despre produs (ce este, ce face) vin oricum din AliExpress in
// pipeline-ul principal; aici doar adunam context strategic peste.
const ENHANCE_SYSTEM_PROMPT = `Esti un expert in copywriting pentru landing page-uri COD din Romania.

User-ul ti-a scris cateva fraze despre cum vrea pagina de produs (poate scurt si vag). Tu primesti ce a scris si EXTINZI cu CONTEXT COMERCIAL pe care un alt AI il va folosi sa genereze pagina.

REGULI ABSOLUTE:
1. PASTREAZA tot ce a scris user-ul. NU contrazice. NU schimba subiectul.
2. EXTINDE cu detalii comerciale care lipsesc:
   - Audienta tinta (varsta, sex, situatie de viata)
   - Durere/problema pe care produsul o rezolva
   - Momentul cheie cand cumparatorul il foloseste
   - Unghi principal de vanzare (frica/dorinta/economie/aspiratie/practic)
   - Tonul potrivit (emotional/profesional/direct/cald)
   - Atmosfera de culori sugerata (cald/rece/luxos/energic/calm)
3. Daca user-ul a scris foarte vag (gen "produs bun" sau doar 1-2 cuvinte), adaugi un context generic dar concret pentru COD RO (mama tanara cu copii, barbat 30-45 ani, etc.) marcat ca presupunere.

OUTPUT:
- Maxim 800 caractere total — brief pentru alt AI, nu eseu.
- Romana cu diacritice.
- Proza fluenta, fara liste cu bullets.
- NU prefatare ("Iata:" / "Brief:"). NU mentiona ca esti AI.
- Incepe direct cu continutul extins.`

function anthropicCall(messages, apiKey, systemPromptOverride, modelOverride) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: modelOverride || 'claude-sonnet-4-5',
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

    // Mode: bug_report sau positive_review — chatbot Haiku 4.5 (ieftin)
    // cu system prompt specific. Acelasi cod, system prompt diferit.
    if (body.action === 'bug_report' || body.action === 'positive_review') {
      const { messages: convMessages } = body
      if (!Array.isArray(convMessages) || convMessages.length === 0) {
        return res.status(400).json({ error: 'messages array required' })
      }
      const sanitized = convMessages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
      if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== 'user') {
        return res.status(400).json({ error: 'last message must be user' })
      }
      const sysPrompt = body.action === 'bug_report' ? BUG_REPORT_SYSTEM_PROMPT : POSITIVE_REVIEW_SYSTEM_PROMPT
      const response = await anthropicCall(
        sanitized,
        apiKey,
        sysPrompt,
        'claude-haiku-4-5-20251001'
      )
      if (response.error) return res.status(500).json({ error: response.error.message || 'AI error' })
      const reply = (response.content?.[0]?.text || '').trim()
      return res.status(200).json({ success: true, reply })
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

    // General chat → Haiku 4.5 (ieftin, suficient pentru Q&A simple)
    const response = await anthropicCall(clean, apiKey, null, 'claude-haiku-4-5-20251001')
    if (response.error) return res.status(500).json({ error: response.error.message || 'AI error' })

    const text = response.content?.[0]?.text || ''
    res.status(200).json({ success: true, message: text })
  } catch(err) {
    console.error('Chat error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
