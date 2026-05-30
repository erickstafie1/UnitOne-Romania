// api/_notion.js — helper pentru Notion API.
// Folosit din api/feedback.js (si in viitor din /api/chat pentru injectare
// feedback in system prompt).
//
// SETUP:
//   1. Creezi un Notion integration: https://www.notion.so/my-integrations
//   2. Copiezi "Internal Integration Token" → env var NOTION_TOKEN
//   3. Creezi o baza de date in Notion cu coloanele:
//        - Title (title) — obligatoriu, default
//        - Date (date)
//        - Shop (text/rich text)
//        - Mode (select cu optiuni: general, bad_lp, positive_review)
//        - Rating (select cu optiuni: 👍 Good, 👎 Bad, — Neutral)
//        - PageUrl (url)
//        - Summary (text)
//        - Status (select cu optiuni: New, Reviewing, Resolved)
//        - AI Feedback (text) — pentru notele tale, citite de chat in viitor
//        - Email (email) — optional
//   4. Click pe "..." in DB → Add connections → alegi integration-ul
//   5. Copy DB ID din URL (32 char hex) → env var NOTION_DATABASE_ID

const https = require('https')

function notionApi(path, method, body) {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error('NOTION_TOKEN missing')
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : ''
    const req = https.request({
      hostname: 'api.notion.com',
      path: '/v1' + path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: 15000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString()
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(txt)) } catch (e) { reject(e) }
        } else {
          reject(new Error('Notion HTTP ' + res.statusCode + ': ' + txt.slice(0, 400)))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Notion timeout')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// Sparge un text lung in chunks de max 1900 char (Notion rich_text limit ~2000)
function chunkText(s, n = 1900) {
  const out = []
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n))
  return out.length ? out : ['']
}

// Construieste blocks Notion pentru un mesaj (1+ paragraph blocks)
function messageBlocks(m) {
  const blocks = []
  const isUser = m.role === 'user'
  const rolePrefix = isUser ? '👤 User' : '🤖 Asistent'
  const content = (m.content || '').trim()
  const attLines = (m.attachments || []).map(a => {
    if (a.type === 'image') return '🖼️ Imagine: ' + (a.name || 'fără nume') + (a.size ? ' (' + Math.round(a.size / 1024) + ' KB)' : '')
    if (a.type === 'gif') return '🎬 GIF: ' + (a.name || 'reaction') + (a.url ? ' — ' + a.url : '')
    if (a.type === 'audio') return '🎤 Mesaj vocal' + (a.size ? ' (' + Math.round(a.size / 1024) + ' KB)' : '')
    return '📎 Fișier: ' + (a.name || 'unnamed') + (a.size ? ' (' + Math.round(a.size / 1024) + ' KB)' : '')
  })
  const attBlock = attLines.length ? '\n  ' + attLines.join('\n  ') : ''
  const full = rolePrefix + ': ' + (content || '(fără text)') + attBlock
  const chunks = chunkText(full)
  for (const ch of chunks) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: ch },
          annotations: { color: isUser ? 'blue_background' : 'gray_background' }
        }]
      }
    })
  }

  // Pentru atasamente image/gif cu URL (gif tenor), adauga si block image
  // (Notion afiseaza preview). Image data URI NU functioneaza in Notion —
  // doar URL-uri externe.
  for (const a of (m.attachments || [])) {
    if (a.type === 'gif' && a.url && /^https?:\/\//.test(a.url)) {
      blocks.push({
        object: 'block',
        type: 'image',
        image: { type: 'external', external: { url: a.url } }
      })
    }
  }
  return blocks
}

async function saveConversationToNotion({ shop, mode, rating, pageUrl, summary, messages, contactEmail }) {
  const dbId = process.env.NOTION_DATABASE_ID
  if (!process.env.NOTION_TOKEN || !dbId) {
    return { skipped: true, reason: 'notion not configured' }
  }

  const now = new Date()
  const titleStr = 'Chat ' + now.toISOString().replace('T', ' ').slice(0, 16) + ' — ' + (shop || 'unknown')

  const ratingLabel = rating === 'good' ? '👍 Good' : rating === 'bad' ? '👎 Bad' : '— Neutral'
  const modeLabel = mode || 'general'

  // Build all message blocks
  const allBlocks = []
  for (const m of (messages || [])) {
    allBlocks.push(...messageBlocks(m))
  }

  const properties = {
    'Title': { title: [{ text: { content: titleStr.slice(0, 200) } }] },
    'Date': { date: { start: now.toISOString() } },
    'Shop': { rich_text: [{ text: { content: (shop || '').slice(0, 200) } }] },
    'Mode': { select: { name: modeLabel } },
    'Rating': { select: { name: ratingLabel } },
    'Status': { select: { name: 'New' } }
  }
  if (pageUrl && /^https?:\/\//.test(pageUrl)) {
    properties['PageUrl'] = { url: pageUrl.slice(0, 1900) }
  }
  if (summary) {
    properties['Summary'] = { rich_text: [{ text: { content: String(summary).slice(0, 1900) } }] }
  }
  if (contactEmail) {
    properties['Email'] = { email: String(contactEmail).slice(0, 200) }
  }

  // Notion create-page limit: 100 children blocks. Initial 90, rest via append.
  const initialChildren = allBlocks.slice(0, 90)
  const page = await notionApi('/pages', 'POST', {
    parent: { database_id: dbId },
    properties,
    children: initialChildren
  })

  // Append remaining blocks if any (batches of 90)
  const remaining = allBlocks.slice(90)
  if (remaining.length && page.id) {
    for (let i = 0; i < remaining.length; i += 90) {
      const batch = remaining.slice(i, i + 90)
      try {
        await notionApi('/blocks/' + page.id + '/children', 'PATCH', { children: batch })
      } catch (e) {
        console.error('Notion append failed:', e.message)
        break  // continua fara remaining
      }
    }
  }

  return { skipped: false, pageId: page.id, url: page.url }
}

module.exports = { saveConversationToNotion, notionApi }
