// Floating chat bubble accesibil din toate ecranele aplicatiei.
// 3 modes: 'general' (help generic), 'bad_lp' (bug report dupa publish),
// 'positive_review' (colectare review dupa publish reusit).
//
// External trigger via window event:
//   window.dispatchEvent(new CustomEvent('ue-open-chat', {
//     detail: { mode: 'bad_lp', context: { pageUrl: '...' } }
//   }))
//
// UI: phone-style popup. Footer cu toolbar (📎 fisiere / 😊 emoji /
// GIF / 🎤 voice). Atasamente shown ca chips + render inline in bubble.

import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../apiFetch.js'

const INITIAL_MESSAGES = {
  general: 'Bună! Sunt asistentul UnitOne. Cu ce te pot ajuta — generator, editor sau o întrebare despre platformă?',
  bad_lp: 'Bună! Mulțumesc că-mi spui că ceva nu a fost cum trebuie. Poți să-mi descrii rapid ce nu ți-a plăcut sau ce nu a funcționat la pagina generată?',
  positive_review: 'Mulțumesc că-ți place pagina generată! 🎉 Spune-mi ce te-a impresionat cel mai mult — feedback-ul tău ne ajută enorm și am putea să-l folosim ca review pentru aplicație.'
}

const SUBMIT_LABELS = {
  bad_lp: 'Trimite echipei',
  positive_review: 'Trimite ca review',
  general: null
}

const SUCCESS_MESSAGES = {
  bad_lp: 'Am notat tot — mulțumim! Echipa o să se uite peste asta în maxim 24 de ore.',
  positive_review: 'Mulțumim pentru review! Ne bucurăm că-ți place.'
}

const TIPS = {
  general: 'Sfat util: dacă atașezi un screenshot și descrii pe scurt ce s-a întâmplat, te putem ajuta mai rapid.',
  bad_lp: 'Sfat util: atașează un screenshot și spune-mi în ce secțiune ai văzut problema (hero, testimoniale, FAQ etc) — rezolvăm mai repede.',
  positive_review: 'Sfat util: fii specific (ex: „mi-au plăcut testimonialele pentru că..."). Cu cât mai concret, cu atât review-ul tău e mai util.'
}

const TITLES = {
  bad_lp: 'Spune-ne ce nu a mers',
  positive_review: 'Lasă-ne un review',
  general: 'Asistent UnitOne'
}

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😍',
  '🥰','😘','😋','😎','🤩','🥳','😏','😒','😞','😔',
  '😢','😭','😤','😡','🤬','🤯','😱','😨','😰','😥',
  '😓','🤗','🤔','🤭','🤫','🤥','😐','😶','😴','🥱',
  '🤤','🤐','😈','💩','💀','👍','👎','👌','✌️','🤞',
  '🤝','🙏','💪','🔥','✨','💯','🎉','❤️','💔','💙',
  '💚','💛','🧡','💜','🖤','⭐','🌟','💡','📷','📎'
]

let attachmentIdCounter = 0
function nextAttId() { return 'att_' + (++attachmentIdCounter) + '_' + Date.now() }

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function formatBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return Math.round(n / 102.4) / 10 + ' KB'
  return Math.round(n / 1048.576) / 1000 + ' MB'
}

export default function ChatBubble({ shop }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('general')
  const [context, setContext] = useState({})
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Attachments pending (inainte sa fie trimise cu urmatorul mesaj)
  const [attachments, setAttachments] = useState([])

  // Pickere
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifConfigured, setGifConfigured] = useState(true)

  // Voice recording
  const [recording, setRecording] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    function onOpenChat(e) {
      const detail = e.detail || {}
      const newMode = detail.mode || 'general'
      setMode(newMode)
      setContext(detail.context || {})
      setOpen(true)
      setSent(false)
      setMessages([{ role: 'assistant', content: INITIAL_MESSAGES[newMode] || INITIAL_MESSAGES.general }])
      setAttachments([])
      setTimeout(() => inputRef.current?.focus(), 350)
    }
    window.addEventListener('ue-open-chat', onOpenChat)
    return () => window.removeEventListener('ue-open-chat', onOpenChat)
  }, [])

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, loading, open])

  // Close pickers when clicking elsewhere (simple — close on body change)
  function closePickers() {
    setEmojiOpen(false)
    setGifOpen(false)
  }

  function openGeneral() {
    setMode('general')
    setContext({})
    setOpen(true)
    if (!sent && messages.length === 0) {
      setMessages([{ role: 'assistant', content: INITIAL_MESSAGES.general }])
    }
    setTimeout(() => inputRef.current?.focus(), 350)
  }

  // ── Fisiere ──────────────────────────────────────────────────────
  async function handleFilesPicked(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newAtts = []
    for (const f of files) {
      // limit la 5MB per fisier
      if (f.size > 5 * 1024 * 1024) {
        alert('Fișierul „' + f.name + '" e prea mare (max 5 MB).')
        continue
      }
      try {
        const dataUrl = await readFileAsDataUrl(f)
        const isImage = f.type.startsWith('image/')
        const isAudio = f.type.startsWith('audio/')
        newAtts.push({
          id: nextAttId(),
          type: isImage ? 'image' : isAudio ? 'audio' : 'file',
          name: f.name,
          size: f.size,
          mimeType: f.type,
          dataUrl
        })
      } catch (err) { /* skip */ }
    }
    setAttachments(prev => [...prev, ...newAtts])
    // reset input ca sa permita re-select acelasi fisier
    e.target.value = ''
  }
  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // ── Emoji ────────────────────────────────────────────────────────
  function insertEmoji(emoji) {
    const el = inputRef.current
    if (!el) {
      setInput(prev => prev + emoji)
      return
    }
    const start = el.selectionStart ?? input.length
    const end = el.selectionEnd ?? input.length
    const newVal = input.slice(0, start) + emoji + input.slice(end)
    setInput(newVal)
    setTimeout(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  // ── GIF ──────────────────────────────────────────────────────────
  async function searchGifs(q) {
    setGifLoading(true)
    try {
      const r = await apiFetch('/api/gifs?q=' + encodeURIComponent(q || 'reaction'), { method: 'GET' })
      const j = await r.json()
      setGifConfigured(j.configured !== false)
      setGifResults(Array.isArray(j.gifs) ? j.gifs : [])
    } catch (e) {
      setGifResults([])
    }
    setGifLoading(false)
  }
  function openGifPicker() {
    closePickers()
    setGifOpen(true)
    if (gifResults.length === 0) searchGifs(gifQuery || 'reaction')
  }
  function attachGif(g) {
    setAttachments(prev => [...prev, {
      id: nextAttId(),
      type: 'gif',
      name: g.alt || 'GIF',
      url: g.url,
      previewUrl: g.preview
    }])
    setGifOpen(false)
  }

  // ── Voice ────────────────────────────────────────────────────────
  async function startRecording() {
    setVoiceError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Browserul tău nu suportă înregistrarea vocală.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const dataUrl = await readFileAsDataUrl(blob)
        setAttachments(prev => [...prev, {
          id: nextAttId(),
          type: 'audio',
          name: 'Mesaj vocal',
          size: blob.size,
          mimeType: 'audio/webm',
          dataUrl
        }])
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch (err) {
      setVoiceError('Nu am acces la microfon. Verifică permisiunile browserului.')
    }
  }
  function stopRecording() {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    setRecording(false)
  }
  function toggleRecording() {
    if (recording) stopRecording()
    else startRecording()
  }

  // ── Trimite mesaj ────────────────────────────────────────────────
  async function send() {
    const text = input.trim()
    if ((!text && attachments.length === 0) || loading) return
    const userMsg = {
      role: 'user',
      content: text,
      attachments: attachments.length ? attachments : undefined
    }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setAttachments([])
    closePickers()
    setLoading(true)
    try {
      // Backend primeste DOAR text (Haiku nu proceseaza atasamentele inca).
      const apiMessages = next.map(m => ({ role: m.role, content: m.content || '(fără text)' }))
      const apiAction = mode === 'general'
        ? 'chat'
        : mode === 'bad_lp' ? 'bug_report' : 'positive_review'
      const r = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: apiAction, messages: apiMessages })
      })
      const j = await r.json()
      const reply = j.success ? (j.reply || j.message) : null
      if (reply) {
        setMessages([...next, { role: 'assistant', content: reply }])
      } else {
        setMessages([...next, { role: 'assistant', content: 'Hm, am întâmpinat o problemă tehnică. Poți încerca din nou?' }])
      }
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: 'Nu am putut trimite mesajul. Verifică conexiunea.' }])
    }
    setLoading(false)
  }

  async function finalize() {
    setSending(true)
    try {
      const summary = messages.filter(m => m.role === 'user').map(m => m.content || '(atașament)').join(' | ')
      await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: mode === 'bad_lp' ? 'bad' : 'good',
          shop,
          pageUrl: context.pageUrl || '',
          conversation: messages,  // include attachments pentru log
          summary
        })
      })
      setSent(true)
    } catch (e) { /* ignore */ }
    setSending(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const userMessages = messages.filter(m => m.role === 'user').length
  const canFinalize = mode !== 'general' && userMessages >= 2 && !sent
  const submitLabel = SUBMIT_LABELS[mode]
  const tipText = TIPS[mode]

  return (
    <>
      <style>{`
        .ue-chat-fab {
          position: fixed; bottom: 24px; right: 24px; z-index: 9999;
          width: 56px; height: 56px; border-radius: 50%;
          background: linear-gradient(135deg, #2c6ecb, #1e40af);
          color: #fff; border: none; cursor: pointer;
          box-shadow: 0 8px 24px rgba(30,64,175,.35);
          display: flex; align-items: center; justify-content: center;
          transition: transform .2s, box-shadow .2s;
        }
        .ue-chat-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(30,64,175,.45); }
        .ue-chat-fab:active { transform: translateY(0); }

        .ue-chat-popup {
          position: fixed; bottom: 24px; right: 24px;
          width: 380px; height: 620px;
          max-height: calc(100vh - 48px);
          background: #fff; border-radius: 18px;
          box-shadow: 0 20px 50px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.06);
          display: flex; flex-direction: column; overflow: hidden;
          z-index: 9999;
          animation: ue-chat-in .28s cubic-bezier(.16,1,.3,1);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        @keyframes ue-chat-in {
          from { opacity: 0; transform: translateY(20px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (max-width: 480px) {
          .ue-chat-popup {
            bottom: 0; right: 0; left: 0; top: 0;
            width: 100%; height: 100%; max-height: 100%;
            border-radius: 0;
          }
        }

        .ue-chat-header {
          padding: 14px 16px; border-bottom: 1px solid #eef0f2;
          display: flex; align-items: center; gap: 12px;
        }
        .ue-chat-avatars { display: flex; flex-direction: row-reverse; flex-shrink: 0; }
        .ue-chat-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          border: 2px solid #fff; margin-left: -10px;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 700; font-size: 13px;
        }
        .ue-chat-avatar:nth-child(1) { background: linear-gradient(135deg, #a855f7, #6366f1); z-index: 3; }
        .ue-chat-avatar:nth-child(2) { background: linear-gradient(135deg, #14b8a6, #0d9488); z-index: 2; }
        .ue-chat-avatar:nth-child(3) { background: linear-gradient(135deg, #f59e0b, #ea580c); z-index: 1; }
        .ue-chat-brand { flex: 1; min-width: 0; }
        .ue-chat-brand-name { font-size: 15px; font-weight: 700; color: #111827; }
        .ue-chat-status { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 5px; }
        .ue-chat-status::before {
          content: ''; width: 7px; height: 7px; border-radius: 50%;
          background: #22c55e; display: inline-block;
        }
        .ue-chat-close {
          width: 32px; height: 32px; border-radius: 50%; border: none;
          background: transparent; cursor: pointer; color: #6b7280;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s;
        }
        .ue-chat-close:hover { background: #f3f4f6; color: #111827; }

        .ue-chat-body { flex: 1; overflow-y: auto; padding: 16px; background: #fafbfc; }
        .ue-chat-intro {
          font-size: 13px; line-height: 1.5; color: #4b5563;
          padding: 0 4px; margin-bottom: 12px;
        }
        .ue-chat-tip {
          background: #fff; border: 1px solid #e5e7eb;
          border-radius: 12px; padding: 12px 14px;
          font-size: 12.5px; line-height: 1.5; color: #374151;
          margin-bottom: 14px; display: flex; gap: 10px; align-items: flex-start;
        }
        .ue-chat-tip svg { flex-shrink: 0; margin-top: 1px; color: #6b7280; }

        .ue-chat-msg-row { display: flex; margin-bottom: 10px; }
        .ue-chat-msg-row.user { justify-content: flex-end; }
        .ue-chat-msg {
          max-width: 78%; padding: 9px 13px; border-radius: 14px;
          font-size: 14px; line-height: 1.45;
          white-space: pre-wrap; word-wrap: break-word;
        }
        .ue-chat-msg.assistant {
          background: #fff; color: #111827;
          border: 1px solid #e5e7eb;
          border-bottom-left-radius: 4px;
        }
        .ue-chat-msg.user {
          background: linear-gradient(135deg, #2c6ecb, #1e40af);
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .ue-chat-msg-atts { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
        .ue-chat-msg-att-img {
          max-width: 180px; max-height: 180px; border-radius: 10px; cursor: pointer;
          object-fit: cover;
        }
        .ue-chat-msg-att-file {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 8px;
          background: rgba(255,255,255,.18); color: inherit;
          font-size: 12px; text-decoration: none;
        }
        .ue-chat-msg.assistant .ue-chat-msg-att-file { background: #f3f4f6; color: #374151; }
        .ue-chat-msg-att-audio { display: block; max-width: 220px; }

        .ue-chat-typing {
          color: #6b7280; font-size: 13px; font-style: italic;
          padding: 6px 4px; display: flex; align-items: center; gap: 6px;
        }
        .ue-chat-typing::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #6b7280; animation: ue-blink 1.4s infinite;
        }
        @keyframes ue-blink {
          0%, 80%, 100% { opacity: .3; }
          40% { opacity: 1; }
        }

        .ue-chat-success {
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          border: 1px solid #6ee7b7; border-radius: 12px;
          padding: 14px; color: #065f46;
          font-size: 14px; line-height: 1.5; text-align: center;
        }
        .ue-chat-success strong { display: block; margin-bottom: 4px; font-weight: 700; }

        .ue-chat-footer {
          padding: 12px 14px; border-top: 1px solid #eef0f2;
          background: #fff; position: relative;
        }
        .ue-chat-finalize-row { margin-bottom: 10px; }
        .ue-chat-finalize-btn {
          width: 100%; padding: 10px 14px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #2c6ecb, #1e40af); color: #fff;
          font-weight: 600; font-size: 14px; cursor: pointer;
          transition: opacity .15s, transform .1s;
        }
        .ue-chat-finalize-btn:hover { opacity: .92; }
        .ue-chat-finalize-btn:disabled { opacity: .5; cursor: not-allowed; }

        .ue-chat-att-chips {
          display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
        }
        .ue-chat-att-chip {
          display: inline-flex; align-items: center; gap: 6px;
          background: #f3f4f6; border: 1px solid #e5e7eb;
          border-radius: 12px; padding: 4px 6px 4px 8px;
          font-size: 12px; color: #374151; max-width: 100%;
        }
        .ue-chat-att-chip img { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; }
        .ue-chat-att-chip-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ue-chat-att-chip-size { color: #9ca3af; font-size: 11px; }
        .ue-chat-att-chip-x {
          width: 18px; height: 18px; border-radius: 50%;
          background: #d1d5db; color: #fff; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; line-height: 1; padding: 0;
        }
        .ue-chat-att-chip-x:hover { background: #9ca3af; }

        .ue-chat-input-row {
          border: 1px solid #d1d5db; border-radius: 14px;
          padding: 6px 8px; transition: border-color .15s;
          background: #fff;
        }
        .ue-chat-input-row:focus-within { border-color: #2c6ecb; }
        .ue-chat-input {
          width: 100%; border: none; outline: none; background: transparent;
          font-size: 14px; padding: 6px 4px; color: #111827;
          font-family: inherit; resize: none;
        }
        .ue-chat-input::placeholder { color: #9ca3af; }
        .ue-chat-toolbar {
          display: flex; align-items: center; gap: 4px;
          padding-top: 4px;
        }
        .ue-chat-tool-btn {
          width: 30px; height: 30px; border-radius: 8px; border: none;
          background: transparent; cursor: pointer; color: #6b7280;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s, color .15s;
        }
        .ue-chat-tool-btn:hover { background: #f3f4f6; color: #2c6ecb; }
        .ue-chat-tool-btn.active { color: #2c6ecb; background: #eff6ff; }
        .ue-chat-tool-btn.recording { color: #dc2626; background: #fee2e2; animation: ue-pulse-rec 1.2s ease-in-out infinite; }
        @keyframes ue-pulse-rec {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,.35); }
          50% { box-shadow: 0 0 0 6px rgba(220,38,38,0); }
        }
        .ue-chat-tool-gif {
          font-size: 11px; font-weight: 800; letter-spacing: .3px;
        }
        .ue-chat-send {
          margin-left: auto;
          width: 32px; height: 32px; border-radius: 50%; border: none;
          background: linear-gradient(135deg, #2c6ecb, #1e40af); color: #fff;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: opacity .15s, transform .1s;
        }
        .ue-chat-send:disabled { opacity: .35; cursor: not-allowed; background: #d1d5db; }
        .ue-chat-send:not(:disabled):hover { opacity: .9; }

        /* Pickere overlay */
        .ue-chat-picker {
          position: absolute; bottom: calc(100% + 6px); left: 14px; right: 14px;
          background: #fff; border: 1px solid #e5e7eb;
          border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
          padding: 12px; z-index: 10;
          max-height: 280px; overflow-y: auto;
        }
        .ue-chat-emoji-grid {
          display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px;
        }
        .ue-chat-emoji-btn {
          width: 100%; aspect-ratio: 1; border: none; background: transparent;
          font-size: 20px; cursor: pointer; border-radius: 6px;
          padding: 0;
          transition: background .1s;
        }
        .ue-chat-emoji-btn:hover { background: #f3f4f6; }

        .ue-chat-gif-search {
          width: 100%; padding: 8px 10px; margin-bottom: 10px;
          border: 1px solid #e5e7eb; border-radius: 8px;
          font-size: 13px; outline: none;
        }
        .ue-chat-gif-search:focus { border-color: #2c6ecb; }
        .ue-chat-gif-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
        }
        .ue-chat-gif-btn {
          border: none; padding: 0; background: transparent; cursor: pointer;
          border-radius: 8px; overflow: hidden; aspect-ratio: 1;
        }
        .ue-chat-gif-btn img { width: 100%; height: 100%; object-fit: cover; }
        .ue-chat-gif-empty {
          padding: 20px; text-align: center; color: #6b7280; font-size: 13px;
        }

        .ue-chat-hint {
          margin-top: 8px; font-size: 12px; color: #9ca3af; text-align: center;
        }
        .ue-chat-voice-err {
          margin-top: 8px; font-size: 12px; color: #dc2626; text-align: center;
        }
      `}</style>

      {!open && (
        <button
          type="button"
          onClick={openGeneral}
          className="ue-chat-fab"
          aria-label="Chat asistent"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      )}

      {open && (
        <div className="ue-chat-popup" role="dialog" aria-label="Chat asistent">
          <div className="ue-chat-header">
            <div className="ue-chat-avatars">
              <div className="ue-chat-avatar">U</div>
              <div className="ue-chat-avatar">A</div>
              <div className="ue-chat-avatar">M</div>
            </div>
            <div className="ue-chat-brand">
              <div className="ue-chat-brand-name">UnitOne</div>
              <div className="ue-chat-status">Răspuns sub 30 min</div>
            </div>
            <button className="ue-chat-close" onClick={() => setOpen(false)} aria-label="Închide">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="ue-chat-body">
            {sent ? (
              <div className="ue-chat-success">
                <strong>Mulțumesc!</strong>
                {SUCCESS_MESSAGES[mode]}
              </div>
            ) : (
              <>
                <div className="ue-chat-intro">
                  Suntem aici să te ajutăm. Răspundem de obicei în câteva minute, în timpul programului. Lasă-ne un mesaj și revenim cât mai repede.
                </div>
                {tipText && (
                  <div className="ue-chat-tip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span>{tipText}</span>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={'ue-chat-msg-row ' + m.role}>
                    <div className={'ue-chat-msg ' + m.role}>
                      {m.content && <div>{m.content}</div>}
                      {m.attachments?.length > 0 && (
                        <div className="ue-chat-msg-atts">
                          {m.attachments.map(a => {
                            if (a.type === 'image' || a.type === 'gif') {
                              return (
                                <img
                                  key={a.id}
                                  className="ue-chat-msg-att-img"
                                  src={a.dataUrl || a.previewUrl || a.url}
                                  alt={a.name}
                                />
                              )
                            }
                            if (a.type === 'audio') {
                              return (
                                <audio
                                  key={a.id}
                                  className="ue-chat-msg-att-audio"
                                  controls
                                  src={a.dataUrl}
                                />
                              )
                            }
                            return (
                              <span key={a.id} className="ue-chat-msg-att-file">
                                📎 {a.name}
                                {a.size ? <em>({formatBytes(a.size)})</em> : null}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && <div className="ue-chat-typing">scrie...</div>}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {!sent && (
            <div className="ue-chat-footer">
              {canFinalize && (
                <div className="ue-chat-finalize-row">
                  <button
                    className="ue-chat-finalize-btn"
                    onClick={finalize}
                    disabled={sending}
                  >
                    {sending ? 'Se trimite...' : submitLabel}
                  </button>
                </div>
              )}

              {/* Emoji picker overlay */}
              {emojiOpen && (
                <div className="ue-chat-picker">
                  <div className="ue-chat-emoji-grid">
                    {EMOJIS.map(e => (
                      <button
                        key={e}
                        className="ue-chat-emoji-btn"
                        onClick={() => insertEmoji(e)}
                      >{e}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* GIF picker overlay */}
              {gifOpen && (
                <div className="ue-chat-picker">
                  <input
                    type="text"
                    className="ue-chat-gif-search"
                    placeholder="Caută GIF-uri..."
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchGifs(gifQuery) } }}
                  />
                  {gifLoading ? (
                    <div className="ue-chat-gif-empty">Se încarcă...</div>
                  ) : !gifConfigured ? (
                    <div className="ue-chat-gif-empty">
                      GIF-urile vor fi disponibile după ce administratorul setează TENOR_API_KEY.
                    </div>
                  ) : gifResults.length === 0 ? (
                    <div className="ue-chat-gif-empty">Niciun rezultat. Încearcă alt cuvânt.</div>
                  ) : (
                    <div className="ue-chat-gif-grid">
                      {gifResults.map(g => (
                        <button key={g.id} className="ue-chat-gif-btn" onClick={() => attachGif(g)}>
                          <img src={g.preview} alt={g.alt} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Atasament chips */}
              {attachments.length > 0 && (
                <div className="ue-chat-att-chips">
                  {attachments.map(a => (
                    <span key={a.id} className="ue-chat-att-chip">
                      {a.type === 'image' || a.type === 'gif' ? (
                        <img src={a.dataUrl || a.previewUrl} alt="" />
                      ) : a.type === 'audio' ? (
                        <span>🎤</span>
                      ) : (
                        <span>📎</span>
                      )}
                      <span className="ue-chat-att-chip-name">{a.name}</span>
                      {a.size ? <span className="ue-chat-att-chip-size">{formatBytes(a.size)}</span> : null}
                      <button className="ue-chat-att-chip-x" onClick={() => removeAttachment(a.id)} aria-label="Șterge">×</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="ue-chat-input-row">
                <textarea
                  ref={inputRef}
                  className="ue-chat-input"
                  placeholder="Scrie un mesaj..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading || sending}
                  rows={1}
                  onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
                />
                <div className="ue-chat-toolbar">
                  {/* Fisiere */}
                  <button
                    className="ue-chat-tool-btn"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Atașează fișiere"
                    title="Atașează fișiere"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.txt,audio/*,video/*"
                    style={{ display: 'none' }}
                    onChange={handleFilesPicked}
                  />

                  {/* Emoji */}
                  <button
                    className={'ue-chat-tool-btn' + (emojiOpen ? ' active' : '')}
                    onClick={() => { setGifOpen(false); setEmojiOpen(v => !v) }}
                    aria-label="Emoji"
                    title="Emoji"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                      <line x1="9" y1="9" x2="9.01" y2="9"/>
                      <line x1="15" y1="9" x2="15.01" y2="9"/>
                    </svg>
                  </button>

                  {/* GIF */}
                  <button
                    className={'ue-chat-tool-btn ue-chat-tool-gif' + (gifOpen ? ' active' : '')}
                    onClick={() => { setEmojiOpen(false); gifOpen ? setGifOpen(false) : openGifPicker() }}
                    aria-label="GIF"
                    title="GIF"
                  >GIF</button>

                  {/* Voice */}
                  <button
                    className={'ue-chat-tool-btn' + (recording ? ' recording' : '')}
                    onClick={toggleRecording}
                    aria-label={recording ? 'Oprește înregistrarea' : 'Mesaj vocal'}
                    title={recording ? 'Oprește înregistrarea' : 'Mesaj vocal'}
                  >
                    {recording ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                    )}
                  </button>

                  {/* Send */}
                  <button
                    className="ue-chat-send"
                    onClick={send}
                    disabled={(!input.trim() && attachments.length === 0) || loading || sending}
                    aria-label="Trimite"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"/>
                      <polyline points="5 12 12 5 19 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {voiceError && <div className="ue-chat-voice-err">{voiceError}</div>}

              {mode !== 'general' && userMessages < 2 && !canFinalize && (
                <div className="ue-chat-hint">
                  Răspunde la încă {2 - userMessages} mesaj{2 - userMessages > 1 ? 'e' : ''} pentru a finaliza.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
