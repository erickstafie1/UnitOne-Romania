// Floating chat bubble accesibil din toate ecranele aplicatiei.
// 3 modes: 'general' (help generic), 'bad_lp' (bug report dupa publish),
// 'positive_review' (colectare review dupa publish reusit).
//
// External trigger via window event:
//   window.dispatchEvent(new CustomEvent('ue-open-chat', {
//     detail: { mode: 'bad_lp', context: { pageUrl: '...' } }
//   }))
// ChatBubble asculta evenimentul, deschide modal-ul cu mode-ul cerut si
// seedeaza primul mesaj de la asistent (hardcodat per mode pentru zero-latency).

import { useState, useEffect, useRef } from 'react'
import { Modal, Button, TextField, BlockStack, InlineStack, Text, Banner } from '@shopify/polaris'
import { apiFetch } from '../apiFetch.js'

const INITIAL_MESSAGES = {
  general: 'Bună! Sunt asistentul UnitOne. Cu ce te pot ajuta — generator, editor sau o întrebare despre platforma?',
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

const TITLES = {
  bad_lp: 'Spune-ne ce nu a mers',
  positive_review: 'Lasă-ne un review',
  general: 'Asistent UnitOne'
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
    }
    window.addEventListener('ue-open-chat', onOpenChat)
    return () => window.removeEventListener('ue-open-chat', onOpenChat)
  }, [])

  // Auto-scroll la ultimul mesaj
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, open])

  function openGeneral() {
    setMode('general')
    setContext({})
    setOpen(true)
    if (!sent && messages.length === 0) {
      setMessages([{ role: 'assistant', content: INITIAL_MESSAGES.general }])
    }
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

  const userMessages = messages.filter(m => m.role === 'user').length
  const canFinalize = mode !== 'general' && userMessages >= 2 && !sent
  const submitLabel = SUBMIT_LABELS[mode]

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
      `}</style>

      {/* Floating action button - vizibil cand chat-ul e inchis */}
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

      {/* Chat modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={TITLES[mode]}
        size="large"
        primaryAction={canFinalize ? {
          content: sending ? 'Se trimite...' : submitLabel,
          onAction: finalize,
          loading: sending
        } : undefined}
        secondaryActions={[{ content: 'Închide', onAction: () => setOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {sent ? (
              <Banner tone="success" title="Mulțumesc!">
                <Text as="p" variant="bodyMd">{SUCCESS_MESSAGES[mode]}</Text>
              </Banner>
            ) : (
              <>
                <div style={{
                  maxHeight: 420, minHeight: 280,
                  overflowY: 'auto', padding: 14,
                  background: '#f6f6f7', borderRadius: 10,
                  border: '1px solid #e1e3e5'
                }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                      marginBottom: 10
                    }}>
                      <div style={{
                        maxWidth: '78%', padding: '10px 14px', borderRadius: 14,
                        background: m.role === 'user' ? '#2c6ecb' : '#fff',
                        color: m.role === 'user' ? '#fff' : '#202223',
                        fontSize: 14, lineHeight: 1.45,
                        border: m.role === 'user' ? 'none' : '1px solid #e1e3e5',
                        whiteSpace: 'pre-wrap', wordWrap: 'break-word'
                      }}>{m.content}</div>
                    </div>
                  ))}
                  {loading && (
                    <div style={{ color: '#6b7280', fontSize: 13, fontStyle: 'italic', padding: '6px 4px' }}>
                      Se gândește...
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <InlineStack gap="200" align="space-between" blockAlign="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      labelHidden
                      value={input}
                      onChange={setInput}
                      placeholder="Scrie aici..."
                      autoComplete="off"
                      disabled={loading || sending}
                      multiline={1}
                    />
                  </div>
                  <Button
                    onClick={send}
                    disabled={!input.trim() || loading || sending}
                    variant="primary"
                  >
                    Trimite
                  </Button>
                </InlineStack>
                {mode !== 'general' && userMessages < 2 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Răspunde la încă {2 - userMessages} mesaj{2 - userMessages > 1 ? 'e' : ''} pentru a finaliza.
                  </Text>
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  )
}
