// api/gifs.js — proxy catre Tenor v2 pentru cautare GIF.
// Necesita TENOR_API_KEY in env. Daca lipseste, returneaza array gol +
// flag `configured: false` ca UI-ul sa afiseze indicatie.

const https = require('https')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.TENOR_API_KEY
  if (!apiKey) {
    return res.status(200).json({ success: true, configured: false, gifs: [] })
  }

  try {
    const query = String(req.query.q || '').trim() || 'reaction'
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 30)
    const path = '/v2/search?q=' + encodeURIComponent(query) +
                 '&key=' + apiKey +
                 '&client_key=unitone&limit=' + limit +
                 '&media_filter=tinygif,gif&contentfilter=high'

    const tenor = await new Promise((resolve, reject) => {
      const r = https.get({
        hostname: 'tenor.googleapis.com',
        path,
        timeout: 10000
      }, (response) => {
        const chunks = []
        response.on('data', c => chunks.push(c))
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
          catch (e) { reject(e) }
        })
      })
      r.on('error', reject)
      r.on('timeout', () => { r.destroy(); reject(new Error('Tenor timeout')) })
    })

    const results = (tenor.results || []).map(g => {
      const tiny = g.media_formats?.tinygif
      const full = g.media_formats?.gif
      return {
        id: g.id,
        preview: tiny?.url || full?.url || '',
        url: full?.url || tiny?.url || '',
        alt: g.content_description || ''
      }
    }).filter(g => g.preview && g.url)

    return res.status(200).json({ success: true, configured: true, gifs: results })
  } catch (err) {
    console.error('Gifs error:', err.message)
    return res.status(500).json({ success: false, error: err.message, gifs: [] })
  }
}
