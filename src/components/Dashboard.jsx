import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../apiFetch.js'

const CONTACT_EMAIL = 'bellatorixx@gmail.com'

export default function Dashboard({
  shop, token, plan, planLimit,
  onNew, onEdit, onReconfigure, onUseTemplate,
  initialSection = 'home',
  onPlanChange
}) {
  const [section, setSection] = useState(initialSection)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [shopOwner, setShopOwner] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const codFormApp = typeof window !== 'undefined' ? localStorage.getItem(`codform_${shop}`) : null

  useEffect(() => { loadPages(); loadShopInfo() }, [])
  useEffect(() => { setSection(initialSection) }, [initialSection])

  async function loadShopInfo() {
    try {
      const r = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shop_info', shop, token })
      })
      const d = await r.json()
      if (d.shopOwner) setShopOwner(d.shopOwner.trim().split(/\s+/)[0])
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
    if (!confirm('Detaseaza acest produs din lista LP?')) return
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
    { id: 'home', label: 'Acasă', icon: <IconHome /> },
    { id: 'pages', label: 'Pagini', icon: <IconList />, badge: pages.length || null },
    { id: 'templates', label: 'Template-uri', icon: <IconGrid /> },
  ]
  const navFooter = [
    { id: 'pricing', label: 'Prețuri', icon: <IconCrown /> },
    { id: 'contact', label: 'Contact', icon: <IconMail /> },
    { id: 'bug', label: 'Raportează bug', icon: <IconBug /> },
  ]

  const planMeta = {
    free:  { label: 'Free',  tone: 'rgba(120,120,128,1)' },
    basic: { label: 'Basic', tone: 'var(--brand)' },
    pro:   { label: 'Pro',   tone: 'var(--brand-2)' }
  }[plan] || { label: 'Free', tone: 'var(--text-muted)' }

  return (
    <div className="ud-shell">
      <GlobalStyles />

      <button
        onClick={() => setSidebarOpen(s => !s)}
        className="ud-mobile-toggle"
        aria-label="Meniu">
        {sidebarOpen ? <IconX /> : <IconMenu />}
      </button>

      <aside className={`ud-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="ud-sb-section ud-sb-plan">
          <div className="ud-plan-row">
            <div className="ud-plan-dot" style={{ background: planMeta.tone }} />
            <div className="ud-plan-meta">
              <div className="ud-plan-label">Planul tău</div>
              <div className="ud-plan-name">{planMeta.label}</div>
            </div>
            {plan !== 'pro' && (
              <button className="ud-plan-cta" onClick={() => { setSection('pricing'); setSidebarOpen(false) }}>
                Upgrade
              </button>
            )}
          </div>
          <div className="ud-plan-bar">
            <div className="ud-plan-bar-fill" style={{
              width: `${Math.min(100, (pages.length / (planLimit || 3)) * 100)}%`,
              background: planMeta.tone
            }} />
          </div>
          <div className="ud-plan-stat">
            <span>{pages.length}</span>
            <span className="ud-divider-dot" />
            <span>{planLimit || 3} landing pages</span>
          </div>
        </div>

        <nav className="ud-nav">
          {nav.map((item, i) => (
            <NavItem key={item.id} index={i}
              active={section === item.id}
              icon={item.icon} label={item.label} badge={item.badge}
              onClick={() => { setSection(item.id); setSidebarOpen(false) }}
            />
          ))}
        </nav>

        <div className="ud-sb-divider" />

        <nav className="ud-nav ud-nav-footer">
          {navFooter.map((item, i) => (
            <NavItem key={item.id} index={i + nav.length}
              active={section === item.id}
              icon={item.icon} label={item.label}
              onClick={() => { setSection(item.id); setSidebarOpen(false) }}
            />
          ))}
        </nav>

        <div className="ud-sb-spacer" />

        <div className="ud-sb-footer">
          <button onClick={() => {
              if (pages.length >= (planLimit || 3)) { setSection('pricing'); setSidebarOpen(false); return }
              onNew(); setSidebarOpen(false)
            }}
            className="ud-new-btn">
            <IconPlus />
            <span>Pagină nouă</span>
            <kbd className="ud-kbd">N</kbd>
          </button>
          {codFormApp && (
            <button onClick={onReconfigure} className="ud-settings-btn">
              <IconSettings />
              <span>Setări COD</span>
            </button>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="ud-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="ud-main">
        <div className="ud-hero-gradient" />
        <div className="ud-mesh" />

        <div className="ud-container" key={section}>
          {section === 'home' && (
            <HomeView shopOwner={shopOwner} shop={shop} onNew={onNew} pagesCount={pages.length} plan={plan} />
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
          {section === 'pricing' && (
            <PricingView currentPlan={plan} shop={shop} token={token} onPlanChange={onPlanChange} />
          )}
          {section === 'contact' && (
            <ContactView shop={shop} />
          )}
          {section === 'bug' && (
            <BugReportView shop={shop} shopOwner={shopOwner} />
          )}
        </div>
      </main>
    </div>
  )
}

/* ─── Sidebar nav item ──────────────────────────────────────────────── */
function NavItem({ active, icon, label, badge, onClick, index = 0 }) {
  return (
    <button onClick={onClick}
      className={`ud-nav-item ${active ? 'active' : ''}`}
      style={{ animationDelay: `${index * 30}ms` }}>
      <span className="ud-nav-icon">{icon}</span>
      <span className="ud-nav-label">{label}</span>
      {badge !== null && badge !== undefined && (
        <span className="ud-nav-badge">{badge}</span>
      )}
    </button>
  )
}

/* ─── HOME ──────────────────────────────────────────────────────────── */
function HomeView({ shopOwner, shop, onNew, pagesCount, plan }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const scrollRef = useRef(null)

  const greeting = shopOwner || 'prieten'
  const timeOfDay = (() => {
    const h = new Date().getHours()
    if (h < 11) return 'Bună dimineața'
    if (h < 18) return 'Salut'
    return 'Bună seara'
  })()

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || sending) return
    setErr('')
    const newMessages = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages); setInput(''); setSending(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const d = await r.json()
      if (d.success) setMessages([...newMessages, { role: 'assistant', content: d.message }])
      else { setErr(d.error || 'Eroare AI'); setMessages(newMessages) }
    } catch { setErr('Eroare conexiune'); setMessages(newMessages) }
    setSending(false)
  }

  const suggestions = [
    'Dă-mi 5 idei de produse COD care se vând bine în România',
    'Cum scriu un titlu de pagină COD care convertește?',
    'Ce trebuie să pun pe pagină pentru creșterea conversiei?',
  ]

  return (
    <div className="ud-home fade-up">
      <header className="ud-page-header">
        <div className="ud-eyebrow">{timeOfDay}</div>
        <h1 className="ud-h1">
          {timeOfDay},{' '}
          <span className="ud-h1-accent">{greeting}</span>
        </h1>
        <p className="ud-lede">
          Cu ce te ajut astăzi? Întreabă-mă orice despre paginile tale COD sau cere idei pentru produse noi.
        </p>
      </header>

      <div className="ud-stats">
        <StatCard label="Pagini active" value={pagesCount} icon={<IconList />} />
        <StatCard label="Magazin" value={shop.replace('.myshopify.com', '')} icon={<IconShop />} small />
        <StatCard label="Plan curent" value={plan === 'pro' ? 'Pro' : plan === 'basic' ? 'Basic' : 'Free'} icon={<IconCrown />} />
      </div>

      <div className="ud-chat">
        {messages.length > 0 && (
          <div ref={scrollRef} className="ud-chat-feed">
            {messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)}
            {sending && <TypingIndicator />}
          </div>
        )}
        {messages.length === 0 && (
          <div className="ud-chat-intro">
            <div className="ud-chat-intro-head">
              <span className="ud-spark">✦</span>
              <span>Sugestii rapide</span>
            </div>
            <div className="ud-chat-suggestions">
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)} className="ud-suggestion">{s}</button>
              ))}
            </div>
          </div>
        )}
        {err && <div className="ud-chat-error">{err}</div>}
        <ChatInput value={input} setValue={setInput} onSend={() => send()} disabled={sending} />
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, small }) {
  return (
    <div className="ud-stat">
      <div className="ud-stat-icon">{icon}</div>
      <div className="ud-stat-body">
        <div className="ud-stat-label">{label}</div>
        <div className={`ud-stat-value ${small ? 'small' : ''}`}>{value}</div>
      </div>
    </div>
  )
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`ud-msg ${isUser ? 'user' : 'ai'}`}>
      <div className="ud-msg-avatar">{isUser ? '◔' : '✦'}</div>
      <div className="ud-msg-body">{content}</div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="ud-msg ai">
      <div className="ud-msg-avatar">✦</div>
      <div className="ud-msg-body ud-typing">
        {[0, 1, 2].map(i => <span key={i} className="ud-dot" style={{ animationDelay: `${i * 0.18}s` }} />)}
      </div>
    </div>
  )
}

function ChatInput({ value, setValue, onSend, disabled }) {
  return (
    <div className="ud-chat-input">
      <textarea value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        placeholder="Scrie un mesaj..." rows={1} className="ud-input"
      />
      <button onClick={onSend} disabled={disabled || !value.trim()} className="ud-send">
        <span>Trimite</span><IconArrowRight />
      </button>
    </div>
  )
}

/* ─── PAGES ─────────────────────────────────────────────────────────── */
function PagesView({ pages, loading, shop, onNew, onEdit, onToggle, onDelete, onUnmark, deleting }) {
  const [query, setQuery] = useState('')
  const filtered = pages.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="fade-up">
      <header className="ud-page-header ud-page-header-row">
        <div>
          <div className="ud-eyebrow">Biblioteca</div>
          <h1 className="ud-h1">
            Pagini <span className="ud-h1-italic">COD</span>
          </h1>
          <p className="ud-lede">
            {pages.length === 0 ? 'Nicio pagină încă' : `${pages.length} ${pages.length === 1 ? 'pagină activă' : 'pagini active'}`}
          </p>
        </div>
        <button onClick={onNew} className="ud-cta-primary">
          <IconPlus /> Pagină nouă
        </button>
      </header>

      {pages.length > 0 && (
        <div className="ud-search">
          <IconSearch />
          <input type="text" placeholder="Caută o pagină..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="ud-loading"><div className="ud-spinner" /></div>
      ) : pages.length === 0 ? (
        <EmptyState onNew={onNew} />
      ) : filtered.length === 0 ? (
        <div className="ud-empty-small">Nicio pagină cu numele "{query}"</div>
      ) : (
        <div className="ud-page-list">
          {filtered.map(p => (
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
  return (
    <div className="ud-card ud-page-card">
      <div className={`ud-status-dot ${page.published ? 'on' : 'off'}`} />
      <div className="ud-page-info">
        <div className="ud-page-title">{page.title}</div>
        <div className="ud-page-meta">
          <span>{page.published ? 'Activă' : 'Inactivă'}</span>
          <span className="ud-divider-dot" />
          <span>{new Date(page.updated_at || page.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}</span>
        </div>
      </div>
      <div className="ud-page-actions">
        <IconBtn href={`https://${shop}/products/${page.handle}`} title="Vezi pagina"><IconEye /></IconBtn>
        <IconBtn onClick={onEdit} title="Editează"><IconEdit /></IconBtn>
        <IconBtn onClick={onToggle} title={page.published ? 'Dezactivează' : 'Activează'}
          variant={page.published ? 'warning' : 'success'}>
          {page.published ? <IconPause /> : <IconPlay />}
        </IconBtn>
        {onUnmark && (
          <IconBtn onClick={onUnmark} title="Detașează din lista LP" variant="warning"><IconUnlink /></IconBtn>
        )}
        <IconBtn onClick={onDelete} title="Șterge complet" variant="danger" disabled={deleting}><IconTrash /></IconBtn>
      </div>
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div className="ud-empty fade-up">
      <div className="ud-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" />
        </svg>
      </div>
      <h3 className="ud-h3">Nicio pagină încă</h3>
      <p className="ud-text-muted">Creează prima ta pagină COD în câteva minute.</p>
      <button onClick={onNew} className="ud-cta-primary">Începe acum <IconArrowRight /></button>
    </div>
  )
}

/* ─── TEMPLATES ─────────────────────────────────────────────────────── */
const TEMPLATES = [
  {
    id: 'beauty', name: 'Beauty & Cosmetice', emoji: '✦',
    accent: '#e879c5',
    description: 'Pentru skincare, makeup, parfumuri',
    data: {
      productName: 'Serum Anti-Aging Premium',
      headline: 'Pielea Ta — Cu 10 Ani Mai Tânără în 30 Zile',
      subheadline: 'Cu colagen marin și vitamina C concentrată',
      price: 149, oldPrice: 299, reviewCount: 2847,
      benefits: ['Reduce ridurile în 14 zile', 'Hidratare profundă 24h', 'Ingrediente naturale premium', 'Aprobat dermatologic', 'Rezultate garantate'],
      howItWorks: [
        { title: 'Curăță fața', desc: 'Spală-te cu apă caldă și usucă tamponând' },
        { title: 'Aplică serul', desc: '2-3 picături pe față și gât, dimineața și seara' },
        { title: 'Vezi rezultate', desc: 'În 14-30 zile pielea ta va străluci' }
      ],
      style: { primaryColor: '#e879c5' }
    }
  },
  {
    id: 'tech', name: 'Tech & Gadgets', emoji: '◈',
    accent: '#5b8def',
    description: 'Pentru electronice, accesorii, gadgeturi',
    data: {
      productName: 'Căști Wireless Pro X3',
      headline: 'Sunetul Perfect, Libertatea Totală',
      subheadline: 'Bluetooth 5.3 — 40 ore autonomie',
      price: 199, oldPrice: 399, reviewCount: 1523,
      benefits: ['Sunet Hi-Fi cu bass profund', '40 ore autonomie', 'Anulare zgomot ANC', 'Rezistente la apă IPX5', 'Bluetooth 5.3 instant'],
      howItWorks: [
        { title: 'Despachetare', desc: 'Carcasă elegantă + cabluri + manual' },
        { title: 'Conectare', desc: 'Bluetooth instant la telefon sau laptop' },
        { title: 'Bucură-te', desc: 'Sunet de studio oriunde te-ai afla' }
      ],
      style: { primaryColor: '#5b8def' }
    }
  },
  {
    id: 'fashion', name: 'Fashion & Accesorii', emoji: '◐',
    accent: '#a855f7',
    description: 'Pentru îmbrăcăminte, încălțăminte, bijuterii',
    data: {
      productName: 'Geantă Premium din Piele',
      headline: 'Eleganța Care Te Definește',
      subheadline: 'Piele naturală — design atemporal',
      price: 249, oldPrice: 499, reviewCount: 892,
      benefits: ['Piele naturală 100%', 'Design modern și elegant', 'Compartimente practice', 'Garanție 2 ani', 'Ediție limitată'],
      howItWorks: [
        { title: 'Comandă azi', desc: 'Alege culoarea preferată' },
        { title: 'Livrare rapidă', desc: 'În 2-4 zile la ușa ta' },
        { title: 'Iubește-o', desc: 'Sau primești banii înapoi' }
      ],
      style: { primaryColor: '#a855f7' }
    }
  },
  {
    id: 'health', name: 'Sănătate & Fitness', emoji: '◇',
    accent: '#10b981',
    description: 'Pentru suplimente, fitness, wellness',
    data: {
      productName: 'Bandă Elastică Premium Set 5',
      headline: 'Transformă-ți Corpul Acasă',
      subheadline: '5 niveluri rezistență — antrenament complet',
      price: 89, oldPrice: 179, reviewCount: 3421,
      benefits: ['5 benzi pentru orice nivel', 'Material premium durabil', 'Ghid de antrenamente', 'Compact — oriunde', 'Garanție 30 zile'],
      howItWorks: [
        { title: 'Primești setul', desc: '5 benzi + ghid + săculeț' },
        { title: 'Antrenează-te', desc: '15-30 min/zi, oriunde' },
        { title: 'Vezi transformarea', desc: 'În 30 zile corpul tău se schimbă' }
      ],
      style: { primaryColor: '#10b981' }
    }
  }
]

function TemplatesView({ onUse }) {
  return (
    <div className="fade-up">
      <header className="ud-page-header">
        <div className="ud-eyebrow">Galerie</div>
        <h1 className="ud-h1">
          Template-uri <span className="ud-h1-italic">gata pregătite</span>
        </h1>
        <p className="ud-lede">Alege un template optimizat pe nișa ta — editorul se deschide cu conținutul pre-completat.</p>
      </header>

      <div className="ud-templates-grid">
        {TEMPLATES.map((t, i) => (
          <TemplateCard key={t.id} t={t} onUse={() => onUse?.(t.data)} index={i} />
        ))}
      </div>
    </div>
  )
}

function TemplateCard({ t, onUse, index }) {
  return (
    <button onClick={onUse} className="ud-tpl-card fade-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="ud-tpl-art" style={{
        background: `linear-gradient(135deg, ${t.accent}22 0%, ${t.accent}08 100%)`
      }}>
        <div className="ud-tpl-emoji" style={{ color: t.accent }}>{t.emoji}</div>
        <div className="ud-tpl-glow" style={{ background: `radial-gradient(circle at 70% 30%, ${t.accent}44, transparent 60%)` }} />
      </div>
      <div className="ud-tpl-body">
        <div className="ud-tpl-tag" style={{ color: t.accent }}>{t.name}</div>
        <h3 className="ud-tpl-headline">{t.data.headline}</h3>
        <p className="ud-tpl-desc">{t.description}</p>
        <span className="ud-tpl-cta">
          Folosește template <IconArrowRight />
        </span>
      </div>
    </button>
  )
}

/* ─── PRICING ───────────────────────────────────────────────────────── */
const PLANS = [
  {
    id: 'free', name: 'Free', price: 0, limit: 3,
    tagline: 'Pentru a testa și a începe',
    features: ['3 landing pages', 'Editor complet GrapesJS', 'Templates de bază', 'Publicare directă în Shopify'],
    cta: null
  },
  {
    id: 'basic', name: 'Basic', price: 50, limit: 200, highlight: true,
    tagline: 'Pentru magazinele active',
    features: ['200 landing pages', 'Editor complet GrapesJS', 'Toate templateurile', 'AI generator pagini', 'Autosave automat', 'Asistent AI integrat', 'Suport email'],
    cta: 'Activează Basic'
  },
  {
    id: 'pro', name: 'Pro', price: 150, limit: 1000,
    tagline: 'Pentru afaceri în creștere',
    features: ['1000 landing pages', 'Editor complet GrapesJS', 'Toate templateurile', 'AI generator pagini', 'Generare imagini AI', 'Asistent AI prioritar', 'Suport prioritar', 'Acces beta features'],
    cta: 'Activează Pro'
  }
]

function PricingView({ currentPlan, shop, token, onPlanChange }) {
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')

  async function selectPlan(planId) {
    if (planId === 'free' || planId === currentPlan) return
    setLoading(planId); setError('')
    try {
      const r = await apiFetch('/api/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_charge', shop, token, plan: planId })
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      if (data.confirmationUrl) {
        try { window.top.location.href = data.confirmationUrl }
        catch { window.location.href = data.confirmationUrl }
      }
    } catch(e) {
      setError(e.message); setLoading(null)
    }
  }

  return (
    <div className="fade-up">
      <header className="ud-page-header">
        <div className="ud-eyebrow">Planuri</div>
        <h1 className="ud-h1">
          Alege planul <span className="ud-h1-italic">potrivit</span>
        </h1>
        <p className="ud-lede">
          Billing gestionat 100% de Shopify. Anulezi oricând din Shopify Admin.
        </p>
      </header>

      {error && <div className="ud-banner danger">{error}</div>}

      <div className="ud-pricing-grid">
        {PLANS.map((p, i) => {
          const isCurrent = p.id === currentPlan
          const isLoading = loading === p.id
          return (
            <div key={p.id} className={`ud-price-card ${p.highlight ? 'highlight' : ''} ${isCurrent ? 'current' : ''} fade-up`}
              style={{ animationDelay: `${i * 80}ms` }}>
              {p.highlight && !isCurrent && <div className="ud-price-tag">Popular</div>}
              {isCurrent && <div className="ud-price-tag current">Planul tău</div>}

              <div className="ud-price-head">
                <div className="ud-price-name">{p.name}</div>
                <div className="ud-price-tagline">{p.tagline}</div>
                <div className="ud-price-amount">
                  {p.price === 0 ? (
                    <span className="ud-price-free">Gratuit</span>
                  ) : (
                    <>
                      <span className="ud-price-currency">$</span>
                      <span className="ud-price-num">{p.price}</span>
                      <span className="ud-price-period">/ lună</span>
                    </>
                  )}
                </div>
                <div className="ud-price-limit">
                  {p.limit === 3 ? '3 landing pages' : `Până la ${p.limit} landing pages`}
                </div>
              </div>

              <div className="ud-divider-h" />

              <ul className="ud-price-features">
                {p.features.map((f, j) => (
                  <li key={j}>
                    <span className="ud-check"><IconCheck /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {p.cta ? (
                <button onClick={() => selectPlan(p.id)}
                  disabled={isCurrent || isLoading}
                  className={`ud-price-cta ${p.highlight ? 'primary' : 'secondary'}`}>
                  {isLoading ? 'Se încarcă...' : isCurrent ? 'Plan activ' : p.cta}
                </button>
              ) : (
                <div className="ud-price-cta ud-price-cta-disabled">
                  {isCurrent ? 'Plan activ' : 'Gratuit întotdeauna'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="ud-fine-print">
        Plata și facturarea sunt gestionate exclusiv de Shopify. Poți anula oricând din Shopify Admin → Settings → Apps.
      </p>
    </div>
  )
}

/* ─── CONTACT ───────────────────────────────────────────────────────── */
function ContactView({ shop }) {
  const [copied, setCopied] = useState(false)
  const handle = shop?.replace('.myshopify.com', '') || ''

  function copyEmail() {
    navigator.clipboard?.writeText(CONTACT_EMAIL).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="fade-up">
      <header className="ud-page-header">
        <div className="ud-eyebrow">Suport</div>
        <h1 className="ud-h1">
          Contact <span className="ud-h1-italic">& asistență</span>
        </h1>
        <p className="ud-lede">
          Ai întrebări, propuneri sau ai nevoie de ajutor? Suntem aici.
        </p>
      </header>

      <div className="ud-contact-grid">
        <div className="ud-card ud-contact-main">
          <div className="ud-contact-head">
            <div className="ud-contact-icon"><IconMail /></div>
            <div>
              <div className="ud-contact-label">Email direct</div>
              <div className="ud-contact-value">{CONTACT_EMAIL}</div>
            </div>
          </div>
          <p className="ud-text-muted ud-mt-12">
            Răspundem în maxim 24 de ore în zilele lucrătoare. Pentru probleme urgente, menționează magazinul tău în subiect.
          </p>
          <div className="ud-contact-actions">
            <a href={`mailto:${CONTACT_EMAIL}?subject=UnitOne%20-%20${encodeURIComponent(handle)}`}
              className="ud-cta-primary">
              <IconMail /> Trimite email
            </a>
            <button onClick={copyEmail} className="ud-cta-secondary">
              {copied ? <><IconCheck /> Copiat</> : <><IconCopy /> Copiază adresa</>}
            </button>
          </div>
        </div>

        <div className="ud-contact-side">
          <InfoTile icon={<IconClock />} label="Program suport" value="Lun-Vin · 09:00 — 18:00 EET" />
          <InfoTile icon={<IconShop />} label="Magazinul tău" value={shop} mono />
          <InfoTile icon={<IconHelp />} label="Ce să incluzi" value="URL-ul paginii, ce ai încercat, screenshot dacă ai" />
        </div>
      </div>
    </div>
  )
}

function InfoTile({ icon, label, value, mono }) {
  return (
    <div className="ud-info-tile">
      <div className="ud-info-icon">{icon}</div>
      <div className="ud-info-body">
        <div className="ud-info-label">{label}</div>
        <div className={`ud-info-value ${mono ? 'mono' : ''}`}>{value}</div>
      </div>
    </div>
  )
}

/* ─── BUG REPORT ────────────────────────────────────────────────────── */
function BugReportView({ shop, shopOwner }) {
  const [form, setForm] = useState({ severity: 'medium', title: '', desc: '', steps: '', expected: '', actual: '' })
  const [sent, setSent] = useState(false)
  const [browserInfo] = useState(() => {
    if (typeof navigator === 'undefined') return ''
    const ua = navigator.userAgent
    const screen = `${window.screen?.width || 0}x${window.screen?.height || 0}`
    const viewport = `${window.innerWidth}x${window.innerHeight}`
    return { ua, screen, viewport, lang: navigator.language }
  })

  function submit() {
    if (!form.title.trim() || !form.desc.trim()) { alert('Completează titlul și descrierea'); return }
    const body = [
      `Severitate: ${form.severity.toUpperCase()}`,
      `Magazin: ${shop}`,
      shopOwner ? `Owner: ${shopOwner}` : '',
      '',
      '═══ DESCRIERE ═══',
      form.desc,
      '',
      form.steps ? `═══ PAȘI DE REPRODUCERE ═══\n${form.steps}\n` : '',
      form.expected ? `═══ COMPORTAMENT AȘTEPTAT ═══\n${form.expected}\n` : '',
      form.actual ? `═══ COMPORTAMENT REAL ═══\n${form.actual}\n` : '',
      '═══ INFO TEHNIC ═══',
      `User-Agent: ${browserInfo.ua}`,
      `Screen: ${browserInfo.screen}`,
      `Viewport: ${browserInfo.viewport}`,
      `Limbă: ${browserInfo.lang}`,
      `Data: ${new Date().toISOString()}`
    ].filter(Boolean).join('\n')

    const subject = `[BUG ${form.severity.toUpperCase()}] ${form.title}`
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
    setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  const severities = [
    { id: 'low', label: 'Minor', desc: 'Inconvenient mic, nu blochează', tone: 'var(--text-muted)' },
    { id: 'medium', label: 'Mediu', desc: 'Funcție afectată, există workaround', tone: 'var(--warning)' },
    { id: 'high', label: 'Major', desc: 'Funcționalitate blocată, fără soluție', tone: 'var(--danger)' }
  ]

  return (
    <div className="fade-up">
      <header className="ud-page-header">
        <div className="ud-eyebrow">Feedback</div>
        <h1 className="ud-h1">
          Raportează un <span className="ud-h1-italic">bug</span>
        </h1>
        <p className="ud-lede">
          Cu cât descrii mai bine, cu atât mai rapid putem rezolva. Toate datele tehnice sunt incluse automat.
        </p>
      </header>

      <div className="ud-card ud-bug-form">
        <div className="ud-field">
          <label className="ud-label">Severitate</label>
          <div className="ud-severity-grid">
            {severities.map(s => (
              <button key={s.id}
                onClick={() => setForm({ ...form, severity: s.id })}
                className={`ud-severity ${form.severity === s.id ? 'active' : ''}`}>
                <div className="ud-severity-dot" style={{ background: s.tone }} />
                <div className="ud-severity-meta">
                  <div className="ud-severity-label">{s.label}</div>
                  <div className="ud-severity-desc">{s.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="ud-field">
          <label className="ud-label" htmlFor="bug-title">Titlu scurt</label>
          <input id="bug-title" type="text" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Butonul de publicare nu reacționează pe mobil"
            className="ud-input-text" />
        </div>

        <div className="ud-field">
          <label className="ud-label" htmlFor="bug-desc">Descriere</label>
          <textarea id="bug-desc" value={form.desc}
            onChange={e => setForm({ ...form, desc: e.target.value })}
            placeholder="Ce s-a întâmplat? Când? Pe ce pagină?"
            rows={3} className="ud-input-text" />
        </div>

        <div className="ud-field-grid-2">
          <div className="ud-field">
            <label className="ud-label" htmlFor="bug-steps">Pași de reproducere <span className="ud-label-opt">opțional</span></label>
            <textarea id="bug-steps" value={form.steps}
              onChange={e => setForm({ ...form, steps: e.target.value })}
              placeholder="1. Apăs butonul X&#10;2. Selectez Y&#10;3. ..."
              rows={4} className="ud-input-text" />
          </div>
          <div className="ud-field">
            <label className="ud-label" htmlFor="bug-expected">Ce te așteptai? <span className="ud-label-opt">opțional</span></label>
            <textarea id="bug-expected" value={form.expected}
              onChange={e => setForm({ ...form, expected: e.target.value })}
              placeholder="Mă așteptam să..."
              rows={4} className="ud-input-text" />
          </div>
        </div>

        <div className="ud-bug-tech">
          <IconChip />
          <span>Info tehnic (browser, ecran, ora) se atașează automat la raport</span>
        </div>

        <button onClick={submit} className="ud-cta-primary ud-cta-block">
          {sent ? <><IconCheck /> Email pregătit</> : <><IconSend /> Trimite raportul</>}
        </button>
      </div>
    </div>
  )
}

/* ─── IconBtn ───────────────────────────────────────────────────────── */
function IconBtn({ children, onClick, href, title, variant, disabled }) {
  const cls = `ud-icon-btn ${variant || 'default'}`
  if (href) return <a href={href} target="_blank" rel="noreferrer" title={title} className={cls}>{children}</a>
  return <button onClick={onClick} title={title} disabled={disabled} className={cls}>{children}</button>
}

/* ─── Global styles (scoped to dashboard) ───────────────────────────── */
function GlobalStyles() {
  return (
    <style>{`
      .ud-shell {
        display: flex; min-height: 100vh; background: var(--bg);
        color: var(--text);
      }

      /* ── Sidebar ── */
      .ud-sidebar {
        width: 264px; flex-shrink: 0;
        background: var(--sidebar);
        backdrop-filter: blur(20px) saturate(120%);
        -webkit-backdrop-filter: blur(20px) saturate(120%);
        border-right: 1px solid var(--sidebar-border);
        display: flex; flex-direction: column;
        position: sticky; top: 0; height: 100vh;
        z-index: 100;
        padding: 22px 0 18px;
      }
      .ud-sb-section { padding: 0 18px; }
      .ud-sb-plan {
        padding-bottom: 18px;
        margin-bottom: 4px;
      }
      .ud-plan-row {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 14px;
      }
      .ud-plan-dot {
        width: 10px; height: 10px; border-radius: 50%;
        box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent);
        flex-shrink: 0;
      }
      .ud-plan-meta { flex: 1; min-width: 0; }
      .ud-plan-label {
        font-size: 10.5px; font-weight: 600;
        color: var(--text-subtle);
        text-transform: uppercase; letter-spacing: 0.1em;
      }
      .ud-plan-name {
        font-size: 14.5px; font-weight: 700;
        color: var(--text); letter-spacing: -0.02em; margin-top: 1px;
      }
      .ud-plan-cta {
        background: var(--brand-soft); border: 1px solid var(--brand-border);
        color: var(--brand); padding: 5px 10px; border-radius: 999px;
        font-size: 11px; font-weight: 700; cursor: pointer;
        font-family: inherit; transition: all 0.18s ease;
        letter-spacing: 0.02em;
      }
      .ud-plan-cta:hover { background: var(--brand); color: #fff; border-color: var(--brand); }
      .ud-plan-bar {
        height: 4px; border-radius: 999px;
        background: var(--bg-3); overflow: hidden;
      }
      .ud-plan-bar-fill {
        height: 100%; border-radius: 999px;
        transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ud-plan-stat {
        margin-top: 8px;
        font-size: 11.5px; color: var(--text-subtle);
        display: flex; align-items: center; gap: 8px;
      }
      .ud-divider-dot {
        width: 2px; height: 2px; border-radius: 50%;
        background: var(--text-faint);
      }

      .ud-sb-divider {
        height: 1px; background: var(--divider);
        margin: 10px 18px;
      }

      .ud-nav {
        display: flex; flex-direction: column; gap: 2px;
        padding: 0 12px;
      }
      .ud-nav-footer { opacity: 0.92; }

      .ud-nav-item {
        display: flex; align-items: center; gap: 11px;
        padding: 9px 12px; border-radius: 9px;
        background: transparent; border: 1px solid transparent;
        color: var(--text-muted);
        font-size: 13.5px; font-weight: 500; font-family: inherit;
        cursor: pointer; text-align: left; width: 100%;
        letter-spacing: -0.01em;
        transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        animation: slideRight 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
        position: relative;
      }
      .ud-nav-item:hover {
        background: var(--bg-3);
        color: var(--text);
      }
      .ud-nav-item.active {
        background: var(--bg-3);
        color: var(--text);
        font-weight: 600;
      }
      .ud-nav-item.active::before {
        content: '';
        position: absolute; left: -12px; top: 50%;
        transform: translateY(-50%);
        width: 3px; height: 18px; border-radius: 999px;
        background: var(--text);
      }
      .ud-nav-icon {
        display: flex; color: var(--text-subtle);
        transition: color 0.15s ease;
      }
      .ud-nav-item.active .ud-nav-icon { color: var(--text); }
      .ud-nav-label { flex: 1; }
      .ud-nav-badge {
        font-size: 10.5px; font-weight: 700;
        padding: 2px 8px; border-radius: 999px;
        background: var(--bg-3); color: var(--text-muted);
        min-width: 20px; text-align: center;
        border: 1px solid var(--border);
      }
      .ud-nav-item.active .ud-nav-badge {
        background: var(--text); color: var(--bg);
        border-color: transparent;
      }

      .ud-sb-spacer { flex: 1; }

      .ud-sb-footer {
        padding: 14px 16px 0;
        border-top: 1px solid var(--divider);
        margin-top: 12px;
        display: flex; flex-direction: column; gap: 8px;
      }

      .ud-new-btn {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 13px; border-radius: 10px;
        background: var(--accent); color: var(--accent-fg);
        border: 1px solid var(--accent);
        font-size: 13.5px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        box-shadow: var(--shadow-sm);
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ud-new-btn:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow);
        background: var(--accent-hover);
      }
      .ud-new-btn span { flex: 1; text-align: left; }
      .ud-kbd {
        font-family: var(--font-mono); font-size: 10.5px;
        padding: 2px 6px; border-radius: 5px;
        background: color-mix(in srgb, var(--accent-fg) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent-fg) 20%, transparent);
        color: var(--accent-fg); opacity: 0.8;
      }
      .ud-settings-btn {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px; border-radius: 9px;
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-muted);
        font-size: 12.5px; font-weight: 500; font-family: inherit;
        cursor: pointer;
      }
      .ud-settings-btn:hover { background: var(--bg-3); color: var(--text); }

      /* ── Main ── */
      .ud-main {
        flex: 1; min-width: 0; position: relative;
      }
      .ud-hero-gradient {
        position: absolute; top: 0; left: 0; right: 0; height: 480px;
        background: var(--hero-gradient);
        pointer-events: none; z-index: 0;
      }
      .ud-mesh {
        position: absolute; inset: 0;
        background: var(--mesh);
        pointer-events: none; z-index: 0;
        opacity: 0.6;
      }
      .ud-container {
        position: relative; z-index: 1;
        padding: clamp(28px, 4.5vw, 60px) clamp(20px, 4vw, 56px);
        max-width: 1180px; margin: 0 auto;
        animation: fadeUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      /* ── Mobile sidebar ── */
      .ud-mobile-toggle {
        display: none;
        position: fixed; top: 14px; left: 14px; z-index: 110;
        width: 40px; height: 40px; border-radius: 10px;
        background: var(--bg-elev); backdrop-filter: blur(12px);
        border: 1px solid var(--border);
        color: var(--text); cursor: pointer;
        align-items: center; justify-content: center;
        box-shadow: var(--shadow);
      }
      .ud-overlay {
        position: fixed; inset: 0; z-index: 90;
        background: rgba(0,0,0,0.4); backdrop-filter: blur(6px);
      }
      @media (max-width: 880px) {
        .ud-sidebar {
          position: fixed; top: 0; left: 0;
          transform: translateX(-100%);
          transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 24px 0 60px rgba(0,0,0,0.25);
        }
        .ud-sidebar.open { transform: translateX(0); }
        .ud-mobile-toggle { display: flex; }
        .ud-main { padding-top: 56px; }
      }

      /* ── Typography ── */
      .ud-page-header { margin-bottom: 32px; }
      .ud-page-header-row {
        display: flex; align-items: flex-end; justify-content: space-between;
        gap: 16px; flex-wrap: wrap;
      }
      .ud-eyebrow {
        font-size: 11.5px; font-weight: 700;
        color: var(--brand);
        text-transform: uppercase; letter-spacing: 0.16em;
        margin-bottom: 12px;
      }
      .ud-h1 {
        font-family: var(--font-display);
        font-size: clamp(36px, 5.5vw, 56px);
        font-weight: 400;
        letter-spacing: -0.035em;
        line-height: 1.05;
        color: var(--text);
        font-variation-settings: '"opsz" 144, "SOFT" 50';
      }
      .ud-h1-accent {
        font-style: italic;
        background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 60%, var(--text) 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .ud-h1-italic { font-style: italic; color: var(--text-muted); }
      .ud-lede {
        margin-top: 14px;
        font-size: 15.5px; line-height: 1.55;
        color: var(--text-muted);
        max-width: 620px;
      }
      .ud-h3 {
        font-family: var(--font-display);
        font-size: 24px; font-weight: 400;
        letter-spacing: -0.02em;
        font-style: italic; color: var(--text);
      }
      .ud-text-muted { color: var(--text-muted); font-size: 14px; line-height: 1.55; }
      .ud-mt-12 { margin-top: 12px; }

      /* ── Stat cards ── */
      .ud-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px; margin-top: 32px;
      }
      .ud-stat {
        padding: 14px 16px; border-radius: 13px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        display: flex; align-items: center; gap: 13px;
        transition: border-color 0.18s ease, transform 0.18s ease;
      }
      .ud-stat:hover { border-color: var(--border-strong); transform: translateY(-1px); }
      .ud-stat-icon {
        width: 36px; height: 36px; border-radius: 10px;
        background: var(--bg-3); color: var(--text);
        display: flex; align-items: center; justify-content: center;
      }
      .ud-stat-body { min-width: 0; flex: 1; }
      .ud-stat-label {
        font-size: 11px; color: var(--text-subtle);
        text-transform: uppercase; letter-spacing: 0.1em;
        font-weight: 600; margin-bottom: 3px;
      }
      .ud-stat-value {
        font-size: 18px; font-weight: 700;
        color: var(--text); letter-spacing: -0.02em;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ud-stat-value.small { font-size: 13.5px; font-weight: 600; }

      /* ── Chat ── */
      .ud-chat {
        margin-top: 28px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 18px;
        overflow: hidden;
        display: flex; flex-direction: column;
        box-shadow: var(--shadow-sm);
      }
      .ud-chat-feed {
        flex: 1; padding: 28px 28px 18px;
        overflow-y: auto; max-height: 540px;
        display: flex; flex-direction: column; gap: 18px;
      }
      .ud-chat-intro { padding: 32px 28px 12px; }
      .ud-chat-intro-head {
        display: flex; align-items: center; gap: 10px;
        margin-bottom: 16px;
        font-size: 13px; font-weight: 600; color: var(--text-muted);
      }
      .ud-spark {
        width: 26px; height: 26px; border-radius: 50%;
        background: linear-gradient(135deg, var(--brand), var(--brand-2));
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 12px;
        box-shadow: 0 0 16px color-mix(in srgb, var(--brand) 35%, transparent);
      }
      .ud-chat-suggestions {
        display: flex; flex-direction: column; gap: 8px;
      }
      .ud-suggestion {
        text-align: left; padding: 13px 16px; border-radius: 11px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text); font-family: inherit; font-size: 14px;
        cursor: pointer; letter-spacing: -0.01em;
        transition: all 0.18s ease;
      }
      .ud-suggestion:hover {
        background: var(--brand-soft);
        border-color: var(--brand-border);
        transform: translateX(2px);
      }
      .ud-chat-error {
        margin: 0 28px 12px;
        padding: 10px 14px; border-radius: 10px;
        background: var(--danger-soft);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
        color: var(--danger);
        font-size: 13px;
      }
      .ud-msg {
        display: flex; gap: 12px;
        animation: msgIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ud-msg.user { flex-direction: row-reverse; }
      .ud-msg-avatar {
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; flex-shrink: 0;
      }
      .ud-msg.user .ud-msg-avatar {
        background: var(--bg-3); color: var(--text);
        border: 1px solid var(--border);
      }
      .ud-msg.ai .ud-msg-avatar {
        background: linear-gradient(135deg, var(--brand), var(--brand-2));
        color: #fff;
        box-shadow: 0 0 14px color-mix(in srgb, var(--brand) 35%, transparent);
      }
      .ud-msg-body {
        padding: 12px 16px; border-radius: 14px;
        font-size: 14.5px; line-height: 1.6;
        max-width: 78%; white-space: pre-wrap; word-break: break-word;
      }
      .ud-msg.user .ud-msg-body {
        background: var(--brand-soft);
        border: 1px solid var(--brand-border);
        color: var(--text);
      }
      .ud-msg.ai .ud-msg-body {
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text);
      }
      .ud-typing { display: flex; gap: 6px; align-items: center; padding: 14px 16px; }
      .ud-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--text-muted);
        animation: pulse 1.4s ease-in-out infinite;
      }
      .ud-chat-input {
        border-top: 1px solid var(--divider);
        padding: 14px 18px;
        display: flex; gap: 10px; align-items: flex-end;
        background: var(--bg-2);
      }
      .ud-input {
        flex: 1; padding: 11px 14px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 11px; color: var(--text);
        font-size: 14.5px; font-family: inherit;
        outline: none; resize: none; line-height: 1.5;
        max-height: 140px; min-height: 42px;
        letter-spacing: -0.01em;
        transition: border-color 0.15s ease;
      }
      .ud-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
      .ud-send {
        padding: 11px 16px; border-radius: 11px;
        background: var(--accent); color: var(--accent-fg);
        border: none; font-family: inherit;
        font-size: 13.5px; font-weight: 700;
        cursor: pointer; letter-spacing: -0.01em;
        display: flex; align-items: center; gap: 7px;
        transition: all 0.18s ease;
      }
      .ud-send:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
      }
      .ud-send:disabled {
        background: var(--bg-3); color: var(--text-faint);
        cursor: not-allowed;
      }

      /* ── CTAs ── */
      .ud-cta-primary {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 11px 18px; border-radius: 11px;
        background: var(--accent); color: var(--accent-fg);
        border: 1px solid var(--accent);
        font-size: 14px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        text-decoration: none;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: var(--shadow-sm);
      }
      .ud-cta-primary:hover {
        transform: translateY(-1px);
        background: var(--accent-hover);
        box-shadow: var(--shadow);
      }
      .ud-cta-block { display: flex; justify-content: center; width: 100%; }
      .ud-cta-secondary {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 11px 18px; border-radius: 11px;
        background: transparent;
        border: 1px solid var(--border-strong);
        color: var(--text); font-size: 14px; font-weight: 600;
        font-family: inherit; cursor: pointer; letter-spacing: -0.01em;
        transition: all 0.18s ease;
      }
      .ud-cta-secondary:hover { background: var(--bg-3); }

      /* ── Search ── */
      .ud-search {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 16px; border-radius: 11px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        margin-bottom: 16px;
        color: var(--text-muted);
        transition: border-color 0.15s ease;
      }
      .ud-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
      .ud-search input {
        flex: 1; background: transparent; border: none; outline: none;
        font-size: 14px; font-family: inherit; color: var(--text);
        letter-spacing: -0.01em;
      }

      /* ── Page list ── */
      .ud-page-list { display: flex; flex-direction: column; gap: 8px; }
      .ud-card {
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 14px;
        transition: all 0.2s ease;
      }
      .ud-page-card {
        padding: 16px 20px;
        display: flex; align-items: center; gap: 16px;
      }
      .ud-page-card:hover {
        border-color: var(--border-strong);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
      }
      .ud-status-dot {
        width: 8px; height: 8px; border-radius: 50%;
        flex-shrink: 0;
      }
      .ud-status-dot.on {
        background: var(--success);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 18%, transparent);
      }
      .ud-status-dot.off { background: var(--text-faint); }
      .ud-page-info { flex: 1; min-width: 0; }
      .ud-page-title {
        font-size: 14.5px; font-weight: 600;
        color: var(--text); letter-spacing: -0.01em;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ud-page-meta {
        font-size: 12.5px; color: var(--text-muted);
        display: flex; gap: 10px; margin-top: 4px; align-items: center;
      }
      .ud-page-actions { display: flex; gap: 6px; }

      /* ── Icon button ── */
      .ud-icon-btn {
        width: 32px; height: 32px; border-radius: 8px;
        display: inline-flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
      }
      .ud-icon-btn.default {
        background: var(--bg-3); color: var(--text-muted);
        border: 1px solid var(--border);
      }
      .ud-icon-btn.default:hover {
        background: var(--bg-3); color: var(--text);
        border-color: var(--border-strong);
        transform: scale(1.06);
      }
      .ud-icon-btn.success {
        background: var(--success-soft); color: var(--success);
        border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
      }
      .ud-icon-btn.warning {
        background: var(--warning-soft); color: var(--warning);
        border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
      }
      .ud-icon-btn.danger {
        background: var(--danger-soft); color: var(--danger);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
      }
      .ud-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ── Empty states ── */
      .ud-loading {
        display: flex; justify-content: center; padding: 80px;
      }
      .ud-spinner {
        width: 32px; height: 32px;
        border: 2.5px solid var(--bg-3);
        border-top-color: var(--brand);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      .ud-empty {
        text-align: center; padding: 88px 24px;
        background: var(--bg-elev);
        border: 1px dashed var(--border-strong);
        border-radius: 18px;
      }
      .ud-empty-icon {
        width: 64px; height: 64px; border-radius: 16px;
        background: var(--brand-soft);
        display: flex; align-items: center; justify-content: center;
        color: var(--brand);
        margin: 0 auto 22px;
      }
      .ud-empty-small {
        text-align: center; padding: 40px;
        color: var(--text-muted); font-size: 14px;
      }

      /* ── Templates ── */
      .ud-templates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 18px;
      }
      .ud-tpl-card {
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 18px; overflow: hidden;
        display: flex; flex-direction: column;
        cursor: pointer; font-family: inherit;
        text-align: left;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ud-tpl-card:hover {
        transform: translateY(-4px);
        border-color: var(--border-strong);
        box-shadow: var(--shadow-lg);
      }
      .ud-tpl-art {
        height: 140px; position: relative; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
      }
      .ud-tpl-emoji {
        font-size: 52px;
        filter: drop-shadow(0 4px 16px rgba(0,0,0,0.12));
        transition: transform 0.4s ease;
        z-index: 1;
      }
      .ud-tpl-card:hover .ud-tpl-emoji { transform: scale(1.12) rotate(-3deg); }
      .ud-tpl-glow { position: absolute; inset: 0; }
      .ud-tpl-body { padding: 18px 20px 20px; }
      .ud-tpl-tag {
        font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.12em;
        margin-bottom: 6px;
      }
      .ud-tpl-headline {
        font-family: var(--font-display);
        font-size: 19px; font-weight: 500;
        letter-spacing: -0.02em; line-height: 1.25;
        color: var(--text); margin-bottom: 8px;
      }
      .ud-tpl-desc {
        font-size: 13px; color: var(--text-muted);
        line-height: 1.5; margin-bottom: 16px;
      }
      .ud-tpl-cta {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 9px 14px; border-radius: 9px;
        background: var(--bg-3); color: var(--text);
        border: 1px solid var(--border);
        font-size: 13px; font-weight: 600;
        transition: all 0.18s ease;
      }
      .ud-tpl-card:hover .ud-tpl-cta {
        background: var(--accent); color: var(--accent-fg);
        border-color: var(--accent);
      }

      /* ── Pricing ── */
      .ud-pricing-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 18px; margin-top: 8px;
      }
      .ud-price-card {
        position: relative;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 28px 26px 26px;
        display: flex; flex-direction: column;
        transition: all 0.25s ease;
      }
      .ud-price-card.highlight {
        border-color: var(--brand-border);
        box-shadow: var(--shadow-glow);
        transform: translateY(-2px);
      }
      .ud-price-card.current {
        border-color: var(--accent);
      }
      .ud-price-tag {
        position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
        background: var(--brand); color: #fff;
        padding: 4px 14px; border-radius: 999px;
        font-size: 10.5px; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
      }
      .ud-price-tag.current { background: var(--accent); color: var(--accent-fg); }
      .ud-price-head { margin-bottom: 20px; }
      .ud-price-name {
        font-size: 13px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--text-muted);
      }
      .ud-price-tagline {
        font-size: 13.5px; color: var(--text-subtle);
        margin-top: 2px;
      }
      .ud-price-amount {
        margin-top: 16px;
        display: flex; align-items: baseline; gap: 2px;
        color: var(--text);
      }
      .ud-price-free {
        font-family: var(--font-display); font-size: 38px;
        font-weight: 400; letter-spacing: -0.03em;
        font-style: italic;
      }
      .ud-price-currency { font-size: 20px; font-weight: 600; }
      .ud-price-num {
        font-family: var(--font-display);
        font-size: 48px; font-weight: 400;
        letter-spacing: -0.04em; line-height: 1;
      }
      .ud-price-period {
        font-size: 14px; color: var(--text-muted); margin-left: 4px;
      }
      .ud-price-limit {
        margin-top: 8px;
        font-size: 13px; color: var(--text-muted);
      }
      .ud-divider-h { height: 1px; background: var(--divider); margin: 4px 0 20px; }
      .ud-price-features {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 11px;
        flex: 1; margin-bottom: 22px;
      }
      .ud-price-features li {
        display: flex; gap: 10px; align-items: flex-start;
        font-size: 14px; color: var(--text);
      }
      .ud-check {
        width: 18px; height: 18px; flex-shrink: 0;
        border-radius: 50%;
        background: var(--brand-soft); color: var(--brand);
        display: inline-flex; align-items: center; justify-content: center;
        margin-top: 1px;
      }
      .ud-price-cta {
        padding: 12px 16px; border-radius: 11px;
        font-size: 14px; font-weight: 700; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        text-align: center;
        border: 1px solid transparent;
        transition: all 0.18s ease;
      }
      .ud-price-cta.primary {
        background: var(--accent); color: var(--accent-fg);
      }
      .ud-price-cta.primary:hover:not(:disabled) {
        background: var(--accent-hover); transform: translateY(-1px);
      }
      .ud-price-cta.secondary {
        background: transparent; color: var(--text);
        border-color: var(--border-strong);
      }
      .ud-price-cta.secondary:hover:not(:disabled) { background: var(--bg-3); }
      .ud-price-cta:disabled { opacity: 0.6; cursor: not-allowed; }
      .ud-price-cta-disabled {
        background: var(--bg-2); color: var(--text-muted);
        cursor: default;
      }
      .ud-fine-print {
        text-align: center; color: var(--text-subtle);
        font-size: 12.5px; margin-top: 32px;
      }
      .ud-banner.danger {
        padding: 12px 18px; border-radius: 11px;
        background: var(--danger-soft);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
        color: var(--danger);
        font-size: 13.5px; margin-bottom: 24px;
        text-align: center;
      }

      /* ── Contact ── */
      .ud-contact-grid {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 18px;
      }
      @media (max-width: 760px) {
        .ud-contact-grid { grid-template-columns: 1fr; }
      }
      .ud-contact-main { padding: 28px; }
      .ud-contact-head {
        display: flex; gap: 16px; align-items: center;
      }
      .ud-contact-icon {
        width: 48px; height: 48px; border-radius: 13px;
        background: linear-gradient(135deg, var(--brand-soft), color-mix(in srgb, var(--brand) 14%, transparent));
        border: 1px solid var(--brand-border);
        color: var(--brand);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ud-contact-label {
        font-size: 11px; font-weight: 700;
        color: var(--text-subtle);
        text-transform: uppercase; letter-spacing: 0.12em;
        margin-bottom: 4px;
      }
      .ud-contact-value {
        font-family: var(--font-mono);
        font-size: 17px; font-weight: 500;
        color: var(--text);
        letter-spacing: -0.01em;
      }
      .ud-contact-actions {
        display: flex; gap: 10px; flex-wrap: wrap;
        margin-top: 20px;
      }
      .ud-contact-side {
        display: flex; flex-direction: column; gap: 10px;
      }
      .ud-info-tile {
        padding: 14px 16px; border-radius: 13px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        display: flex; gap: 12px; align-items: flex-start;
      }
      .ud-info-icon {
        width: 32px; height: 32px; border-radius: 9px;
        background: var(--bg-3); color: var(--text-muted);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ud-info-label {
        font-size: 10.5px; font-weight: 700;
        color: var(--text-subtle);
        text-transform: uppercase; letter-spacing: 0.1em;
        margin-bottom: 3px;
      }
      .ud-info-value {
        font-size: 13.5px; color: var(--text);
        letter-spacing: -0.005em;
        line-height: 1.45;
      }
      .ud-info-value.mono {
        font-family: var(--font-mono); font-size: 12.5px;
      }

      /* ── Bug form ── */
      .ud-bug-form { padding: 28px; }
      .ud-field { margin-bottom: 22px; }
      .ud-field:last-of-type { margin-bottom: 16px; }
      .ud-field-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px; margin-bottom: 22px;
      }
      @media (max-width: 640px) {
        .ud-field-grid-2 { grid-template-columns: 1fr; }
      }
      .ud-label {
        display: block;
        font-size: 12px; font-weight: 700;
        color: var(--text);
        text-transform: uppercase; letter-spacing: 0.08em;
        margin-bottom: 8px;
      }
      .ud-label-opt {
        font-weight: 500;
        color: var(--text-subtle);
        text-transform: none; letter-spacing: 0;
      }
      .ud-input-text {
        width: 100%;
        padding: 12px 14px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text);
        font-size: 14px; font-family: inherit;
        outline: none; resize: vertical;
        line-height: 1.5;
        letter-spacing: -0.01em;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .ud-input-text:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-soft);
      }
      .ud-severity-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      @media (max-width: 640px) {
        .ud-severity-grid { grid-template-columns: 1fr; }
      }
      .ud-severity {
        display: flex; gap: 11px; align-items: flex-start;
        padding: 13px 14px; border-radius: 11px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        cursor: pointer; font-family: inherit; text-align: left;
        transition: all 0.18s ease;
      }
      .ud-severity:hover { border-color: var(--border-strong); }
      .ud-severity.active {
        background: var(--bg-elev);
        border-color: var(--brand-border);
        box-shadow: 0 0 0 3px var(--brand-soft);
      }
      .ud-severity-dot {
        width: 10px; height: 10px; border-radius: 50%;
        margin-top: 4px; flex-shrink: 0;
        box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 14%, transparent);
      }
      .ud-severity-label {
        font-size: 13.5px; font-weight: 600;
        color: var(--text); letter-spacing: -0.01em;
        margin-bottom: 2px;
      }
      .ud-severity-desc {
        font-size: 11.5px; color: var(--text-subtle);
        line-height: 1.4;
      }
      .ud-bug-tech {
        display: flex; gap: 10px; align-items: center;
        padding: 11px 14px; border-radius: 10px;
        background: var(--bg-2);
        border: 1px dashed var(--border-strong);
        color: var(--text-muted);
        font-size: 12.5px;
        margin-bottom: 18px;
      }
    `}</style>
  )
}

/* ─── Icons ─────────────────────────────────────────────────────────── */
function IconHome() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2V9.5z"/></svg> }
function IconList() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg> }
function IconGrid() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function IconCrown() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20l-2-10-5 4-5-8-5 8-5-4-2 10z"/><path d="M2 21h20"/></svg> }
function IconMail() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg> }
function IconBug() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="8" height="12" rx="4"/><path d="M12 3v3M3 12h2M19 12h2M5 5l2 2M19 5l-2 2M5 19l2-2M19 19l-2-2M8 14h8M8 18h8"/></svg> }
function IconPlus() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg> }
function IconSettings() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function IconMenu() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function IconX() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg> }
function IconShop() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 13h6"/></svg> }
function IconEye() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function IconEdit() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function IconPlay() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function IconPause() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> }
function IconTrash() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> }
function IconUnlink() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18.84 12.25l1.72-1.71a5.004 5.004 0 00-.12-7.07 5.006 5.006 0 00-6.95 0l-1.72 1.71M5.17 11.75l-1.71 1.71a5.004 5.004 0 00.12 7.07 5.006 5.006 0 006.95 0l1.71-1.71M8 2v3M2 8h3M16 19v3M19 16h3"/></svg> }
function IconArrowRight() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> }
function IconSearch() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg> }
function IconCheck() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconCopy() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> }
function IconClock() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function IconHelp() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg> }
function IconChip() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg> }
function IconSend() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> }
