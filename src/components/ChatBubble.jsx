// Floating chat bubble accesibil din toate ecranele aplicatiei.
// 3 modes: 'general' (help generic), 'bad_lp' (bug report dupa publish),
// 'positive_review' (colectare review dupa publish reusit).
//
// External trigger via window event:
//   window.dispatchEvent(new CustomEvent('ue-open-chat', {
//     detail: { mode: 'bad_lp', context: { pageUrl: '...' } }
//   }))
// ChatBubble asculta evenimentul, deschide popup-ul cu mode-ul cerut si
// seedeaza primul mesaj de la asistent (hardcodat per mode pentru zero-latency).
//
// UI: popup phone-chat-style ancorat langa FAB (bottom-right). Mobile = full
// screen. NU mai foloseste Polaris Modal (overlay full-screen) ca sa pastreze
// context-ul ecranului in spate.

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
  bad_lp: 'Sfat util: dacă-mi spui în ce secțiune ai văzut problema (hero, testimoniale, FAQ etc) și pe ce dispozitiv erai, rezolvăm mai rapid.',
  positive_review: 'Cu cât ești mai specific (ex: „mi-au plăcut testimonialele pentru că..."), cu atât review-ul tău e mai util.',
  general: null
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
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Listener global pentru declansare externa
  useEffect(() => {
    function onOpenChat(e) {
      const detail = e.detail || {}
      const newMode = detail.mode || 'general'
      setMode(newMode)
      setContext(detail.context || {})
      setOpen(true)
      setSent(false)
      setMessages([{ role: 'assistant', content: INITIAL_MESSAGES[newMode] || INITIAL_MESSAGES.general }])
      // Focus input dupa animatia de slide-in
      setTimeout(() => inputRef.current?.focus(), 350)
    }
    window.addEventListener('ue-open-chat', onOpenChat)
    return () => window.removeEventListener('ue-open-chat', onOpenChat)
  }, [])

  // Auto-scroll la ultimul mesaj
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, loading, open])

  function openGeneral() {
    setMode('general')
    setContext({})
    setOpen(true)
    if (!sent && messages.length === 0) {
      setMessages([{ role: 'assistant', content: INITIAL_MESSAGES.general }])
    }
    setTimeout(() => inputRef.current?.focus(), 350)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const apiAction = mode === 'general'
        ? 'chat'
        : mode === 'bad_lp' ? 'bug_report' : 'positive_review'
      const r = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: apiAction, messages: next })
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
      const summary = messages.filter(m => m.role === 'user').map(m => m.content).join(' | ')
      await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: mode === 'bad_lp' ? 'bad' : 'good',
          shop,
          pageUrl: context.pageUrl || '',
          conversation: messages,
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
        /* Floating action button */
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

        /* Popup phone-chat */
        .ue-chat-popup {
          position: fixed; bottom: 24px; right: 24px;
          width: 380px; height: 600px;
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

        /* Header */
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
        .ue-chat-status {
          font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 5px;
        }
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

        /* Body */
        .ue-chat-body {
          flex: 1; overflow-y: auto; padding: 16px;
          background: #fafbfc;
        }
        .ue-chat-intro {
          font-size: 13px; line-height: 1.5; color: #4b5563;
          padding: 0 4px; margin-bottom: 12px;
        }
        .ue-chat-tip {
          background: #f3f4f6; border-radius: 10px; padding: 10px 12px;
          font-size: 12.5px; line-height: 1.45; color: #4b5563;
          margin-bottom: 14px; display: flex; gap: 8px; align-items: flex-start;
        }
        .ue-chat-tip svg { flex-shrink: 0; margin-top: 1px; color: #6b7280; }

        .ue-chat-msg-row {
          display: flex; margin-bottom: 10px;
        }
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
        .ue-chat-typing {
          color: #6b7280; font-size: 13px; font-style: italic;
          padding: 6px 4px; display: flex; align-items: center; gap: 6px;
        }
        .ue-chat-typing::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #6b7280; animation: ue-blink 1.4s infinite;
        }
        @keyframes ue-blink {
          0%, 80%, 100% { opacity: 0.3; }
          40% { opacity: 1; }
        }

        .ue-chat-success {
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          border: 1px solid #6ee7b7; border-radius: 12px;
          padding: 14px; color: #065f46;
          font-size: 14px; line-height: 1.5;
          text-align: center;
        }
        .ue-chat-success strong { display: block; margin-bottom: 4px; font-weight: 700; }

        /* Footer */
        .ue-chat-footer {
          padding: 12px 14px; border-top: 1px solid #eef0f2;
          background: #fff;
        }
        .ue-chat-finalize-row {
          margin-bottom: 10px;
        }
        .ue-chat-finalize-btn {
          width: 100%; padding: 10px 14px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #2c6ecb, #1e40af); color: #fff;
          font-weight: 600; font-size: 14px; cursor: pointer;
          transition: opacity .15s, transform .1s;
        }
        .ue-chat-finalize-btn:hover { opacity: .92; }
        .ue-chat-finalize-btn:active { transform: scale(.98); }
        .ue-chat-finalize-btn:disabled { opacity: .5; cursor: not-allowed; }

        .ue-chat-input-row {
          display: flex; align-items: center; gap: 8px;
          border: 1px solid #d1d5db; border-radius: 22px;
          padding: 4px 4px 4px 14px; transition: border-color .15s;
        }
        .ue-chat-input-row:focus-within { border-color: #2c6ecb; }
        .ue-chat-input {
          flex: 1; border: none; outline: none; background: transparent;
          font-size: 14px; padding: 8px 0; color: #111827;
          font-family: inherit;
        }
        .ue-chat-input::placeholder { color: #9ca3af; }
        .ue-chat-send {
          width: 36px; height: 36px; border-radius: 50%; border: none;
          background: linear-gradient(135deg, #2c6ecb, #1e40af); color: #fff;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: opacity .15s, transform .1s;
          flex-shrink: 0;
        }
        .ue-chat-send:hover { opacity: .92; }
        .ue-chat-send:active { transform: scale(.94); }
        .ue-chat-send:disabled { opacity: .35; cursor: not-allowed; }

        .ue-chat-hint {
          margin-top: 8px; font-size: 12px; color: #9ca3af; text-align: center;
        }
      `}</style>

      {/* Floating action button — vizibil cand chat-ul e inchis */}
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

      {/* Popup phone-chat — vizibil cand open=true */}
      {open && (
        <div className="ue-chat-popup" role="dialog" aria-label="Chat asistent">
          {/* Header */}
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

          {/* Body */}
          <div className="ue-chat-body">
            {sent ? (
              <div className="ue-chat-success">
                <strong>Mulțumesc!</strong>
                {SUCCESS_MESSAGES[mode]}
              </div>
            ) : (
              <>
                <div className="ue-chat-intro">
                  Suntem aici să te ajutăm. Răspundem de obicei în câteva minute, în timpul programului. Lasă-ne un mesaj.
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
                    <div className={'ue-chat-msg ' + m.role}>{m.content}</div>
                  </div>
                ))}
                {loading && (
                  <div className="ue-chat-typing">scrie...</div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Footer */}
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
              <div className="ue-chat-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className="ue-chat-input"
                  placeholder="Scrie un mesaj..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading || sending}
                />
                <button
                  className="ue-chat-send"
                  onClick={send}
                  disabled={!input.trim() || loading || sending}
                  aria-label="Trimite"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"/>
                    <polyline points="5 12 12 5 19 12"/>
                  </svg>
                </button>
              </div>
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
