// api/feedback.js
// Stocheaza feedback-ul user-ului dupa publish. V1 = log + console.error pentru
// vizibilitate in Vercel logs. V2 (todo) = scrie in Supabase / Notion / email.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      rating,          // 'good' | 'bad'
      shop,            // myshopify domain
      pageId,          // shopify page id (optional)
      pageUrl,         // live URL (optional)
      structured,      // pentru positive: array of checkbox values
      text,            // pentru positive: textarea continut
      conversation,    // pentru negative: array of {role, content}
      summary,         // pentru negative: AI-generated summary of issues
      contactEmail     // optional, daca user a lasat email
    } = req.body || {}

    if (!rating) return res.status(400).json({ error: 'Lipseste rating' })

    const entry = {
      ts: new Date().toISOString(),
      rating,
      shop: shop || 'unknown',
      pageId: pageId || null,
      pageUrl: pageUrl || null,
      structured: Array.isArray(structured) ? structured : [],
      text: String(text || '').slice(0, 4000),
      conversation: Array.isArray(conversation) ? conversation.slice(-20) : [],
      summary: String(summary || '').slice(0, 1000),
      contactEmail: String(contactEmail || '').slice(0, 200)
    }

    // V1: log clar in Vercel — apare in dashboard la Logs
    // V2: pipe into Notion / Supabase / email digest
    console.log('=== USER FEEDBACK ===')
    console.log(JSON.stringify(entry, null, 2))
    console.log('=== /USER FEEDBACK ===')

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Feedback error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
