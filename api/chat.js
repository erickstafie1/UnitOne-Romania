// api/chat.js - AI chat backend (Anthropic) - cheia NICIODATA pe client
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

function anthropicCall(messages, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
    const { messages } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' })
    }
    if (messages.length > 30) {
      return res.status(400).json({ error: 'too many messages' })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'AI nu este configurat (lipseste ANTHROPIC_API_KEY)' })

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
