import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../apiFetch.js'

const FONT_STACK = "'Inter','SF Pro Display',-apple-system,system-ui,sans-serif"
const FONT_DISPLAY = "'Fraunces',Georgia,serif"

export default function Dashboard({ shop, token, plan, planLimit, onNew, onEdit, onReconfigure, onLogout, onUpgrade, onUseTemplate }) {
  const [section, setSection] = useState('home')
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [shopOwner, setShopOwner] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const codFormApp = typeof window !== 'undefined' ? localStorage.getItem(`codform_${shop}`) : null

  useEffect(() => { loadPages(); loadShopInfo() }, [])

  async function loadShopInfo() {
    try {
      const r = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shop_info', shop, token })
      })
      const d = await r.json()
      if (d.shopOwner) {
        const first = d.shopOwner.trim().split(/\s+/)[0]
        setShopOwner(first)
      }
    } catch {}
  }

  async function loadPages() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', shop, token })
      })
      const data = await res.json()
      setPages(data.pages || [])
    } catch(e) { console.log('Load pages error:', e.message) }
    setLoading(false)
  }

  async function deletePage(pageId) {
    if (!confirm('Stergi aceasta pagina?')) return
    setDeleting(pageId)
    try {
      await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', shop, token, pageId })
      })
      setPages(pages.filter(p => p.id !== pageId))
    } catch { alert('Eroare la stergere') }
    setDeleting(null)
  }

  async function togglePage(pageId, published) {
    try {
      await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', shop, token, pageId, published: !published })
      })
      setPages(pages.map(p => p.id === pageId ? { ...p, published: !published } : p))
    } catch { alert('Eroare') }
  }

  async function unmarkPage(pageId) {
    if (!confirm('Detaseaza acest produs din lista LP? (produsul ramane in magazin, doar nu mai apare aici)')) return
    try {
      await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unmark', shop, token, pageId })
      })
      setPages(pages.filter(p => p.id !== pageId))
    } catch { alert('Eroare la detasare') }
  }

  async function openEdit(page) {
    try {
      const res = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', shop, token, pageId: page.id })
      })
      const d = await res.json()
      onEdit({ ...d.page, fromDashboard: true })
    } catch { onEdit({ ...page, fromDashboard: true }) }
  }

  const nav = [
    { id: 'home', label: 'Acasa', icon: <IconHome /> },
    { id: 'pages', label: 'Pagini', icon: <IconList />, badge: pages.length || null },
    { id: 'templates', label: 'Template-uri', icon: <IconGrid /> },
  ]

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: '#08090d', color: '#fff',
      fontFamily: FONT_STACK,
      letterSpacing: '-0.01em'
    }}>
      <GlobalStyles />

      {/* Mobile menu trigger */}
      <button
        onClick={() => setSidebarOpen(s => !s)}
        className="dash-mobile-toggle"
        aria-label="Meniu">
        {sidebarOpen ? <IconX /> : <IconMenu />}
      </button>

      {/* Sidebar */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '24px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#3b82f6,#1e40af)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em',
              boxShadow: '0 6px 18px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.15)'
            }}>U</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>UnitOne</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 500 }}>Romania</div>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)', margin: '4px 0 16px' }} />

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
          {nav.map(item => (
            <NavItem key={item.id}
              active={section === item.id}
              icon={item.icon} label={item.label} badge={item.badge}
              onClick={() => { setSection(item.id); setSidebarOpen(false) }}
            />
          ))}

          <div style={{ height: 14 }} />

          {/* Plan badge */}
          <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: plan === 'pro' ? 'rgba(168,85,247,0.1)' : plan === 'basic' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${plan === 'pro' ? 'rgba(168,85,247,0.25)' : plan === 'basic' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.07)'}`,
            marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: plan === 'pro' ? '#c084fc' : plan === 'basic' ? '#60a5fa' : 'rgba(255,255,255,0.4)' }}>
                {plan === 'pro' ? '★ Pro' : plan === 'basic' ? '◆ Basic' : 'Free'}
              </span>
              {plan !== 'pro' && (
                <button onClick={onUpgrade} style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Upgrade →</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: plan === 'pro' ? '#a855f7' : plan === 'basic' ? '#3b82f6' : '#6b7280', width: `${Math.min(100, (pages.length / (planLimit || 3)) * 100)}%`, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{pages.length}/{planLimit || 3} LP</span>
            </div>
          </div>

          <button onClick={() => {
              if (pages.length >= (planLimit || 3)) {
                if (onUpgrade) onUpgrade()
                setSidebarOpen(false)
                return
              }
              onNew(); setSidebarOpen(false)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '11px 14px', borderRadius: 10,
              background: 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)',
              color: '#fff', border: 'none',
              fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', letterSpacing: '-0.01em',
              boxShadow: '0 6px 18px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 10px 24px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 6px 18px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
            <IconPlus />
            <span>Pagina noua</span>
          </button>
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ padding: '14px 16px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 12 }}>
          {codFormApp && (
            <button onClick={onReconfigure}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 9,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.6)',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer', marginBottom: 6
              }}>
              <IconSettings />
              <span>Setari COD</span>
            </button>
          )}
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', padding: '6px 12px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shop}</div>
          <button onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '8px 12px', borderRadius: 8,
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
            <IconLogout />
            <span>Iesire</span>
          </button>
        </div>
      </aside>

      {/* Overlay on mobile when sidebar open */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90, backdropFilter: 'blur(4px)' }} />
      )}

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 320,
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.10) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 4vw, 56px)', maxWidth: 1280, margin: '0 auto' }}>
          {section === 'home' && (
            <HomeView shopOwner={shopOwner} shop={shop} onNew={onNew} pagesCount={pages.length} />
          )}
          {section === 'pages' && (
            <PagesView
              pages={pages} loading={loading} shop={shop}
              onNew={onNew} onEdit={openEdit} onToggle={togglePage} onDelete={deletePage} onUnmark={unmarkPage}
              deleting={deleting}
            />
          )}
          {section === 'templates' && (
            <TemplatesView onUse={onUseTemplate || onNew} />
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Sidebar nav item ───────────────────────────────────────────────────────────
function NavItem({ active, icon, label, badge, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '10px 12px', borderRadius: 9,
        background: active ? 'rgba(59,130,246,0.12)' : hover ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'rgba(59,130,246,0.25)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.65)',
        fontSize: 13.5, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
        cursor: 'pointer', letterSpacing: '-0.01em',
        textAlign: 'left', width: '100%',
        transition: 'all 0.15s ease',
        position: 'relative'
      }}>
      <span style={{ color: active ? '#60a5fa' : 'rgba(255,255,255,0.5)', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== null && badge !== undefined && (
        <span style={{
          fontSize: 10.5, fontWeight: 700,
          padding: '2px 7px', borderRadius: 999,
          background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
          color: active ? '#93c5fd' : 'rgba(255,255,255,0.5)',
          minWidth: 18, textAlign: 'center', letterSpacing: '0.02em'
        }}>{badge}</span>
      )}
      {active && (
        <span style={{
          position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: 18, borderRadius: 2,
          background: 'linear-gradient(180deg,#3b82f6,#2563eb)',
          boxShadow: '0 0 8px rgba(59,130,246,0.6)'
        }} />
      )}
    </button>
  )
}

// ─── HOME (greeting + AI chat) ──────────────────────────────────────────────────
function HomeView({ shopOwner, shop, onNew, pagesCount }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const scrollRef = useRef(null)

  const greeting = shopOwner ? shopOwner : 'prieten'
  const timeOfDay = (() => {
    const h = new Date().getHours()
    if (h < 11) return 'Buna dimineata'
    if (h < 18) return 'Salut'
    return 'Buna seara'
  })()

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || sending) return
    setErr('')
    const newMessages = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setInput('')
    setSending(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const d = await r.json()
      if (d.success) setMessages([...newMessages, { role: 'assistant', content: d.message }])
      else { setErr(d.error || 'Eroare AI'); setMessages(newMessages) }
    } catch(e) { setErr('Eroare conexiune'); setMessages(newMessages) }
    setSending(false)
  }

  const suggestions = [
    'Da-mi 5 idei de produse COD care se vand bine in Romania',
    'Cum scriu un titlu de pagina COD care converteste?',
    'Ce trebuie sa pun pe o pagina pentru cresterea conversiei?',
  ]

  const hasChat = messages.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Greeting */}
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 10 }}>
          {timeOfDay}
        </div>
        <h1 style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 'clamp(38px, 6vw, 64px)',
          fontWeight: 400,
          letterSpacing: '-0.04em',
          lineHeight: 1.05,
          margin: 0,
          fontVariationSettings: '"opsz" 144, "SOFT" 50'
        }}>
          {timeOfDay === 'Salut' ? 'Salut' : (timeOfDay === 'Buna dimineata' ? 'Buna dimineata' : 'Buna seara')},{' '}
          <span style={{
            fontStyle: 'italic',
            background: 'linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>{greeting}</span>
        </h1>
        <p style={{ marginTop: 12, fontSize: 15.5, color: 'rgba(255,255,255,0.5)', maxWidth: 580, lineHeight: 1.55 }}>
          Cu ce te ajut astazi? Intreaba-ma orice despre paginile tale COD sau cere idei pentru produse noi.
        </p>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <StatCard label="Pagini active" value={pagesCount} icon={<IconList />} accent="#3b82f6" />
        <StatCard label="Magazin" value={shop.replace('.myshopify.com', '')} icon={<IconShop />} accent="#a78bfa" small />
        <StatCard label="Plan" value="Pro" icon={<IconSparkle />} accent="#f59e0b" />
      </div>

      {/* Chat */}
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        minHeight: hasChat ? 520 : 'auto'
      }}>
        {hasChat && (
          <div ref={scrollRef} style={{
            flex: 1, padding: '28px 28px 18px',
            overflowY: 'auto', maxHeight: 540,
            display: 'flex', flexDirection: 'column', gap: 18
          }}>
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && <TypingIndicator />}
          </div>
        )}

        {!hasChat && (
          <div style={{ padding: '32px 28px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg,#3b82f6,#a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                boxShadow: '0 0 12px rgba(59,130,246,0.4)'
              }}>✦</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Sugestii rapide</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{
                    textAlign: 'left', padding: '13px 16px', borderRadius: 11,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.85)', fontFamily: 'inherit', fontSize: 14,
                    cursor: 'pointer', letterSpacing: '-0.01em',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && (
          <div style={{ margin: '0 28px 12px', padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13 }}>{err}</div>
        )}

        <ChatInput
          value={input} setValue={setInput} onSend={() => send()} disabled={sending}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, accent, small }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 13,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', gap: 12
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: `linear-gradient(135deg,${accent}22,${accent}11)`,
        border: `1px solid ${accent}33`,
        color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: small ? 13.5 : 18, fontWeight: small ? 600 : 700, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </div>
  )
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div style={{
      display: 'flex', gap: 12,
      flexDirection: isUser ? 'row-reverse' : 'row',
      animation: 'msgIn 0.3s cubic-bezier(0.4,0,0.2,1)'
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: isUser ? 'linear-gradient(135deg,#475569,#334155)' : 'linear-gradient(135deg,#3b82f6,#a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, flexShrink: 0,
        boxShadow: isUser ? 'none' : '0 0 12px rgba(59,130,246,0.35)'
      }}>{isUser ? '◔' : '✦'}</div>
      <div style={{
        background: isUser ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
        border: '1px solid',
        borderColor: isUser ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
        padding: '12px 16px', borderRadius: 14,
        fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.92)',
        maxWidth: '78%', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
      }}>{content}</div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'linear-gradient(135deg,#3b82f6,#a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        boxShadow: '0 0 12px rgba(59,130,246,0.35)'
      }}>✦</div>
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 16px', borderRadius: 14, display: 'flex', gap: 6, alignItems: 'center'
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'rgba(255,255,255,0.5)',
            animation: `pulse 1.4s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`
          }} />
        ))}
      </div>
    </div>
  )
}

function ChatInput({ value, setValue, onSend, disabled }) {
  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '14px 18px',
      display: 'flex', gap: 10, alignItems: 'flex-end',
      background: 'rgba(255,255,255,0.015)'
    }}>
      <textarea value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        placeholder="Scrie un mesaj..."
        rows={1}
        style={{
          flex: 1, padding: '11px 14px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 11, color: '#fff',
          fontSize: 14.5, fontFamily: 'inherit', outline: 'none',
          resize: 'none', lineHeight: 1.5,
          maxHeight: 140, minHeight: 42, boxSizing: 'border-box',
          letterSpacing: '-0.01em'
        }}
      />
      <button onClick={onSend} disabled={disabled || !value.trim()}
        style={{
          padding: '11px 16px', borderRadius: 11,
          background: disabled || !value.trim() ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
          color: '#fff', border: 'none', fontFamily: 'inherit',
          fontSize: 13.5, fontWeight: 700, cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
          letterSpacing: '-0.01em',
          boxShadow: disabled || !value.trim() ? 'none' : '0 4px 14px rgba(59,130,246,0.35)',
          display: 'flex', alignItems: 'center', gap: 7,
          transition: 'transform 0.15s ease'
        }}>
        Trimite
        <IconArrowRight />
      </button>
    </div>
  )
}

// ─── PAGES VIEW ─────────────────────────────────────────────────────────────────
function PagesView({ pages, loading, shop, onNew, onEdit, onToggle, onDelete, onUnmark, deleting }) {
  return (
    <div>
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 10 }}>Biblioteca</div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 400, letterSpacing: '-0.04em', margin: 0 }}>
            Pagini <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.5)' }}>COD</span>
          </h1>
          <p style={{ marginTop: 10, fontSize: 14.5, color: 'rgba(255,255,255,0.5)' }}>
            {pages.length === 0 ? 'Nicio pagina inca' : `${pages.length} ${pages.length === 1 ? 'pagina activa' : 'pagini active'}`}
          </p>
        </div>
        <button onClick={onNew}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 18px', borderRadius: 11,
            background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
            color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer', letterSpacing: '-0.01em',
            boxShadow: '0 6px 18px rgba(59,130,246,0.35)'
          }}>
          <IconPlus /> Pagina noua
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : pages.length === 0 ? (
        <EmptyState onNew={onNew} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pages.map(p => (
            <PageCard key={p.id} page={p} shop={shop}
              onEdit={() => onEdit(p)}
              onToggle={() => onToggle(p.id, p.published)}
              onDelete={() => onDelete(p.id)}
              onUnmark={() => onUnmark(p.id)}
              deleting={deleting === p.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PageCard({ page, shop, onEdit, onToggle, onDelete, onUnmark, deleting }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
        border: '1px solid', borderColor: hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        borderRadius: 14, padding: '17px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        transition: 'all 0.2s ease',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)'
      }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: page.published ? '#22c55e' : '#6b7280',
        boxShadow: page.published ? '0 0 12px rgba(34,197,94,0.6)' : 'none',
        flexShrink: 0
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'flex', gap: 10, marginTop: 3 }}>
          <span>{page.published ? 'Activa' : 'Inactiva'}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', alignSelf: 'center' }} />
          <span>{new Date(page.updated_at || page.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <IconBtn href={`https://${shop}/products/${page.handle}`} title="Vezi"><IconEye /></IconBtn>
        <IconBtn onClick={onEdit} title="Editeaza"><IconEdit /></IconBtn>
        <IconBtn onClick={onToggle} title={page.published ? 'Dezactiveaza' : 'Activeaza'}
          variant={page.published ? 'warning' : 'success'}>
          {page.published ? <IconPause /> : <IconPlay />}
        </IconBtn>
        {onUnmark && (
          <IconBtn onClick={onUnmark} title="Detaseaza din LP (pastreaza produsul in magazin)" variant="warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 00-.12-7.07 5.006 5.006 0 00-6.95 0l-1.72 1.71M5.17 11.75l-1.71 1.71a5.004 5.004 0 00.12 7.07 5.006 5.006 0 006.95 0l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>
          </IconBtn>
        )}
        <IconBtn onClick={onDelete} title="Sterge complet" variant="danger" disabled={deleting}><IconTrash /></IconBtn>
      </div>
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div style={{
      textAlign: 'center', padding: '90px 24px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px dashed rgba(255,255,255,0.08)',
      borderRadius: 18
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(167,139,250,0.1))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 22px', color: '#60a5fa'
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>
        </svg>
      </div>
      <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontStyle: 'italic' }}>Nicio pagina inca</h3>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 8, marginBottom: 22 }}>
        Creeaza prima ta pagina COD in cateva minute.
      </p>
      <button onClick={onNew}
        style={{
          padding: '11px 22px', borderRadius: 11,
          background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
          color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          cursor: 'pointer', boxShadow: '0 6px 18px rgba(59,130,246,0.35)'
        }}>
        Incepe acum →
      </button>
    </div>
  )
}

// ─── TEMPLATES ──────────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'beauty', name: 'Beauty & Cosmetice', emoji: '✨',
    color: '#ec4899', gradient: 'linear-gradient(135deg,#fce7f3,#fbcfe8)',
    description: 'Pentru produse de infrumusetare, skincare, makeup',
    data: {
      productName: 'Serum Anti-Aging Premium',
      headline: 'Pielea Ta - Cu 10 Ani Mai Tanara in 30 Zile',
      subheadline: 'Cu colagen marin si vitamina C concentrata',
      price: 149, oldPrice: 299, reviewCount: 2847,
      benefits: [
        'Reduce ridurile vizibile in doar 14 zile',
        'Hidratare profunda 24h non-stop',
        'Cu ingrediente naturale premium',
        'Aprobat dermatologic - testat clinic',
        'Rezultate garantate sau banii inapoi'
      ],
      howItWorks: [
        { title: 'Curata fata', desc: 'Spala-te cu apa calda si usuca tamponand usor' },
        { title: 'Aplica seru', desc: '2-3 picaturi pe fata si gat, dimineata si seara' },
        { title: 'Vezi rezultate', desc: 'In 14-30 zile pielea ta va straluci' }
      ],
      style: { primaryColor: '#ec4899' }
    }
  },
  {
    id: 'tech', name: 'Tech & Gadgets', emoji: '⚡',
    color: '#3b82f6', gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
    description: 'Pentru gadgeturi, accesorii tech, electronice',
    data: {
      productName: 'Casti Wireless Pro X3',
      headline: 'Suntul Perfect, Libertatea Totala',
      subheadline: 'Bluetooth 5.3 - 40 ore autonomie',
      price: 199, oldPrice: 399, reviewCount: 1523,
      benefits: [
        'Sunet Hi-Fi cu bass profund',
        '40 ore autonomie cu carcasa',
        'Anularea zgomotului activa (ANC)',
        'Rezistente la apa IPX5',
        'Conectare instantanee Bluetooth 5.3'
      ],
      howItWorks: [
        { title: 'Despachetare', desc: 'Carcasa eleganta + cabluri + manual' },
        { title: 'Conectare', desc: 'Bluetooth instant la telefon sau laptop' },
        { title: 'Bucura-te', desc: 'Sunet de studio oriunde te-ai afla' }
      ],
      style: { primaryColor: '#3b82f6' }
    }
  },
  {
    id: 'fashion', name: 'Fashion & Accesorii', emoji: '👗',
    color: '#a855f7', gradient: 'linear-gradient(135deg,#f3e8ff,#e9d5ff)',
    description: 'Pentru imbracaminte, accesorii, incaltaminte',
    data: {
      productName: 'Geanta Premium din Piele',
      headline: 'Eleganta Care Te Defineste',
      subheadline: 'Piele naturala - design atemporal',
      price: 249, oldPrice: 499, reviewCount: 892,
      benefits: [
        'Piele naturala 100% premium',
        'Design modern si elegant',
        'Compartimente practice pentru orice',
        'Garantie 2 ani la cusaturi',
        'Edition limitata - exclusivitate'
      ],
      howItWorks: [
        { title: 'Comanda azi', desc: 'Alege culoarea preferata' },
        { title: 'Livrare rapida', desc: 'In 2-4 zile la usa ta' },
        { title: 'Iubeste-o', desc: 'Sau primesti banii inapoi' }
      ],
      style: { primaryColor: '#a855f7' }
    }
  },
  {
    id: 'health', name: 'Sanatate & Fitness', emoji: '💪',
    color: '#10b981', gradient: 'linear-gradient(135deg,#d1fae5,#a7f3d0)',
    description: 'Pentru suplimente, echipamente fitness, wellness',
    data: {
      productName: 'Banda Elastica Premium Set 5',
      headline: 'Transforma-ti Corpul Acasa',
      subheadline: '5 nivele rezistenta - antrenament complet',
      price: 89, oldPrice: 179, reviewCount: 3421,
      benefits: [
        '5 benzi diferite pentru orice nivel',
        'Material premium, durabil ani de zile',
        'Ghid de antrenamente inclus',
        'Compact - foloseste oriunde',
        'Garantie 30 zile - banii inapoi'
      ],
      howItWorks: [
        { title: 'Primesti setul', desc: '5 benzi + ghid + saculet transport' },
        { title: 'Antreneaza-te', desc: '15-30 min/zi, oriunde, oricand' },
        { title: 'Vezi transformarea', desc: 'In 30 zile corpul tau se schimba' }
      ],
      style: { primaryColor: '#10b981' }
    }
  }
]

function TemplatesView({ onUse }) {
  return (
    <div>
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 10 }}>Galerie</div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 400, letterSpacing: '-0.04em', margin: 0 }}>
          Template-uri <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.5)' }}>gata pregatite</span>
        </h1>
        <p style={{ marginTop: 10, fontSize: 14.5, color: 'rgba(255,255,255,0.5)', maxWidth: 540 }}>
          Alege un template optimizat pe nisa ta, iar editorul se va deschide automat cu continut pre-completat.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
        {TEMPLATES.map(t => <TemplateCard key={t.id} t={t} onUse={() => onUse?.(t.data)} />)}
      </div>
    </div>
  )
}

function TemplateCard({ t, onUse }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid', borderColor: hover ? `${t.color}55` : 'rgba(255,255,255,0.06)',
        borderRadius: 16, overflow: 'hidden',
        transition: 'all 0.25s ease',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hover ? `0 18px 40px ${t.color}22, 0 0 0 1px ${t.color}33` : 'none',
        display: 'flex', flexDirection: 'column'
      }}>
      <div style={{
        height: 140,
        background: t.gradient,
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 70% 30%, ${t.color}33, transparent 60%)`
        }} />
        <div style={{
          fontSize: 56, opacity: 0.8,
          filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.15))',
          transform: hover ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.4s ease'
        }}>{t.emoji}</div>
      </div>

      <div style={{ padding: '18px 20px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
          {t.name}
        </div>
        <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 6px', lineHeight: 1.25 }}>
          {t.data.headline}
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', lineHeight: 1.5 }}>{t.description}</p>
        <button onClick={onUse}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: hover ? `linear-gradient(135deg,${t.color},${t.color}dd)` : 'rgba(255,255,255,0.05)',
            color: hover ? '#fff' : 'rgba(255,255,255,0.85)',
            border: '1px solid', borderColor: hover ? 'transparent' : 'rgba(255,255,255,0.08)',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}>
          Foloseste template <IconArrowRight />
        </button>
      </div>
    </div>
  )
}

// ─── Reusable IconBtn ───────────────────────────────────────────────────────────
function IconBtn({ children, onClick, href, title, variant, disabled }) {
  const [hover, setHover] = useState(false)
  const colors = {
    default: { bg: hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', border: 'rgba(255,255,255,0.06)' },
    success: { bg: hover ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.08)', color: '#4ade80', border: 'rgba(34,197,94,0.2)' },
    warning: { bg: hover ? 'rgba(251,191,36,0.18)' : 'rgba(251,191,36,0.08)', color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
    danger: { bg: hover ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.08)', color: '#f87171', border: 'rgba(239,68,68,0.2)' }
  }
  const c = colors[variant || 'default']
  const s = {
    width: 32, height: 32, borderRadius: 8,
    background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease', textDecoration: 'none',
    transform: hover && !disabled ? 'scale(1.08)' : 'scale(1)'
  }
  if (href) return <a href={href} target="_blank" rel="noreferrer" title={title} style={s} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}</a>
  return <button onClick={onClick} title={title} disabled={disabled} style={s} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}</button>
}

// ─── Global styles ──────────────────────────────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      @keyframes spin { to { transform: rotate(360deg) } }
      @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8) } 40% { opacity: 1; transform: scale(1) } }
      @keyframes msgIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes slideIn { from { transform: translateX(-100%) } to { transform: translateX(0) } }
      .dash-sidebar {
        width: 260px; flex-shrink: 0;
        background: rgba(13,14,20,0.7);
        border-right: 1px solid rgba(255,255,255,0.05);
        backdrop-filter: blur(20px);
        display: flex; flex-direction: column;
        position: sticky; top: 0; height: 100vh;
        z-index: 100;
      }
      .dash-mobile-toggle {
        display: none;
        position: fixed; top: 16px; left: 16px; z-index: 110;
        width: 40px; height: 40px; border-radius: 10px;
        background: rgba(13,14,20,0.9); backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.1);
        color: #fff; cursor: pointer;
        align-items: center; justify-content: center;
      }
      @media (max-width: 880px) {
        .dash-sidebar {
          position: fixed; top: 0; left: 0;
          transform: translateX(-100%);
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 20px 0 60px rgba(0,0,0,0.4);
        }
        .dash-sidebar.open { transform: translateX(0); }
        .dash-mobile-toggle { display: flex; }
        main { padding-top: 50px !important; }
      }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
    `}</style>
  )
}

// ─── Icons ──────────────────────────────────────────────────────────────────────
function IconHome() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2V9.5z"/></svg> }
function IconList() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg> }
function IconGrid() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function IconPlus() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg> }
function IconSettings() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function IconLogout() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg> }
function IconMenu() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function IconX() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg> }
function IconShop() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 13h6"/></svg> }
function IconSparkle() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg> }
function IconEye() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function IconEdit() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconPlay() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function IconPause() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> }
function IconTrash() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> }
function IconArrowRight() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> }
