// api/feedback.js
// Stocheaza feedback-ul user-ului dupa publish + conversatii general-mode.
// V1 = log Vercel + push Notion (daca NOTION_TOKEN + NOTION_DATABASE_ID setate).

const { saveConversationToNotion } = require('./_notion.js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      rating,           // 'good' | 'bad' | 'neutral'
      mode,             // 'bad_lp' | 'positive_review' | 'general' (opt)
      shop,
      pageId,
      pageUrl,
      structured,       // checkbox values (legacy positive form)
      text,             // textarea (legacy positive form)
      conversation,     // array [{role, content, attachments?}]
      summary,
      contactEmail
    } = req.body || {}

    if (!rating) return res.status(400).json({ error: 'Lipseste rating' })

    const effectiveMode = mode || (rating === 'bad' ? 'bad_lp' : rating === 'good' ? 'positive_review' : 'general')

    const entry = {
      ts: new Date().toISOString(),
      rating,
      mode: effectiveMode,
      shop: shop || 'unknown',
      pageId: pageId || null,
      pageUrl: pageUrl || null,
      structured: Array.isArray(structured) ? structured : [],
      text: String(text || '').slice(0, 4000),
      conversation: Array.isArray(conversation) ? conversation.slice(-30) : [],
      summary: String(summary || '').slice(0, 1000),
      contactEmail: String(contactEmail || '').slice(0, 200)
    }

    // V1: log clar in Vercel — apare in dashboard la Logs
    console.log('=== USER FEEDBACK ===')
    console.log(JSON.stringify({ ...entry, conversation: '<' + entry.conversation.length + ' msgs>' }, null, 2))
    console.log('=== /USER FEEDBACK ===')

    // Push Notion (fire-but-wait pentru error visibility)
    let notionResult = { skipped: true, reason: 'no try' }
    try {
      // Daca user-ul a folosit structured form (legacy positive flow), include in conv
      let conv = entry.conversation
      if ((!conv || conv.length === 0) && (entry.structured.length || entry.text)) {
        conv = [
          { role: 'assistant', content: 'Ce ți-a plăcut la pagina generată?' },
          {
            role: 'user',
            content: (entry.structured.length ? 'Selectat: ' + entry.structured.join(', ') : '') +
                     (entry.text ? '\n\n' + entry.text : '')
          }
        ]
      }
      notionResult = await saveConversationToNotion({
        shop: entry.shop,
        mode: effectiveMode,
        rating,
        pageUrl: entry.pageUrl,
        summary: entry.summary,
        messages: conv,
        contactEmail: entry.contactEmail
      })
      if (notionResult.skipped) {
        console.log('[notion] skipped:', notionResult.reason)
      } else {
        console.log('[notion] saved page', notionResult.pageId, notionResult.url)
      }
    } catch (e) {
      console.error('[notion] save failed:', e.message)
      notionResult = { error: e.message }
    }

    return res.status(200).json({ success: true, notion: notionResult })
  } catch (err) {
    console.error('Feedback error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
