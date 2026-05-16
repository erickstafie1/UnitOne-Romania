import { useState, useEffect, useRef } from 'react'
import {
  Frame, Page, Layout, Card, Button, TextField, Banner, Badge, Spinner,
  EmptyState, BlockStack, InlineStack, Text, Box, Divider, ButtonGroup,
  ResourceList, ResourceItem, ProgressBar, List, Icon, Toast
} from '@shopify/polaris'
import {
  PlusIcon, DeleteIcon, EditIcon, ViewIcon, PauseCircleIcon, PlayCircleIcon,
  SearchIcon, CheckIcon, ClipboardIcon, StoreIcon, ClockIcon,
  QuestionCircleIcon, SendIcon, ChevronRightIcon, MagicIcon, EmailIcon
} from '@shopify/polaris-icons'
import { apiFetch } from '../apiFetch.js'

const CONTACT_EMAIL = 'bellatorixx@gmail.com'

export default function Dashboard({
  shop, plan, planLimit, publishLimit = 1,
  onNew, onEdit, onUseTemplate,
  section = 'home',
  onSectionChange,
  onPlanChange
}) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [shopOwner, setShopOwner] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [toast, setToast] = useState('')

  // Navigate via URL pathname so Shopify Admin NavMenu highlights the right link.
  const goToSection = (s) => {
    const path = s === 'home' ? '/' : '/' + s
    window.history.pushState({}, '', path + window.location.search)
    window.dispatchEvent(new PopStateEvent('popstate'))
    if (onSectionChange) onSectionChange(s)
  }

  useEffect(() => { loadPages(); loadShopInfo() }, [])

  async function loadShopInfo() {
    try {
      const r = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shop_info', shop })
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
        body: JSON.stringify({ action: 'list', shop })
      })
      const data = await res.json()
      setPages(data.pages || [])
    } catch {}
    setLoading(false)
  }

  async function deletePage(pageId) {
    if (!confirm('Stergi aceasta pagina?')) return
    setDeleting(pageId)
    try {
      await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', shop, pageId })
      })
      setPages(pages.filter(p => p.id !== pageId))
      setToast('Pagină ștearsă')
    } catch { setToast('Eroare la ștergere') }
    setDeleting(null)
  }

  async function togglePage(pageId, published) {
    try {
      const res = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', shop, pageId, published: !published })
      })
      if (res.status === 402) {
        const d = await res.json()
        setToast(`Plan ${d.plan} permite ${d.publishLimit} pagină publicată simultan.`)
        return
      }
      setPages(pages.map(p => p.id === pageId ? { ...p, published: !published } : p))
      setToast(!published ? 'Pagină publicată' : 'Pagină dezactivată')
    } catch { setToast('Eroare') }
  }

  async function openEdit(page) {
    try {
      const res = await apiFetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', shop, pageId: page.id })
      })
      const d = await res.json()
      onEdit({ ...d.page, fromDashboard: true })
    } catch { onEdit({ ...page, fromDashboard: true }) }
  }

  return (
    <Frame>
      {section === 'home' && (
        <HomeView shopOwner={shopOwner} shop={shop} onNew={onNew} pagesCount={pages.length} plan={plan} planLimit={planLimit} publishLimit={publishLimit} pages={pages} onUpgrade={() => goToSection('pricing')} />
      )}
      {section === 'pages' && (
        <PagesView pages={pages} loading={loading} shop={shop}
          onNew={() => {
            if (planLimit < 9999 && pages.length >= planLimit) { goToSection('pricing'); return }
            onNew()
          }}
          onEdit={openEdit} onToggle={togglePage} onDelete={deletePage} deleting={deleting} />
      )}
      {section === 'templates' && (
        <TemplatesView onUse={onUseTemplate || onNew} />
      )}
      {section === 'pricing' && (
        <PricingView currentPlan={plan} shop={shop} onPlanChange={onPlanChange} />
      )}
      {section === 'contact' && (
        <ContactView shop={shop} />
      )}
      {section === 'bug' && (
        <BugReportView shop={shop} shopOwner={shopOwner} />
      )}
      {toast && <Toast content={toast} onDismiss={() => setToast('')} />}
    </Frame>
  )
}

/* ─── HOME ──────────────────────────────────────────────────────────── */
/* ─── COD app embed reminder banner ─────────────────────────────────── */
// Releasit / EasySell come as "app embeds" that must be turned ON by the
// merchant inside Online Store → Themes → Customize → App embeds. Until
// that toggle is on, our LP buttons can't be replaced and the customer
// sees the red fallback. This banner walks the merchant straight to the
// right screen with a deep link. Dismissable per shop (saved in localStorage).
function CodEmbedBanner({ shop }) {
  const key = `unitone_codembed_dismissed_${shop || ''}`
  const [dismissed, setDismissed] = useState(
    typeof window !== 'undefined' && localStorage.getItem(key) === '1'
  )
  if (dismissed) return null
  // Deep link to Online Store → Themes → Customize (App embeds visible there).
  // Shopify accepts plain handle (without .myshopify.com) in the admin URL.
  const handle = (shop || '').replace('.myshopify.com', '')
  const customizeUrl = `https://admin.shopify.com/store/${handle}/themes/current/editor?context=apps`
  function dismiss() {
    try { localStorage.setItem(key, '1') } catch {}
    setDismissed(true)
  }
  return (
    <Banner
      title="Activează app-ul COD în temă (Releasit sau EasySell)"
      tone="warning"
      onDismiss={dismiss}
      action={{
        content: 'Deschide App embeds',
        onAction: () => {
          try { (window.top || window).location.href = customizeUrl }
          catch { window.location.href = customizeUrl }
        }
      }}
    >
      <p>
        Ca să meargă butoanele COD pe paginile publicate: <strong>Online Store → Themes → Customize → App embeds (icon puzzle)</strong> → activează toggle-ul pentru <strong>Releasit COD Form</strong> sau <strong>EasySell COD Form</strong> → Save.
      </p>
      <p style={{ marginTop: 6 }}>
        Fără asta, pe pagini apare un buton roșu "COMANDĂ ACUM" fallback care nu primește comenzi.
      </p>
    </Banner>
  )
}

function HomeView({ shopOwner, shop, onNew, pagesCount, plan, planLimit, publishLimit, pages, onUpgrade }) {
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

  const planLabel = plan === 'pro' ? 'Pro' : plan === 'basic' ? 'Basic' : 'Free'
  const planTone = plan === 'pro' ? 'success' : plan === 'basic' ? 'info' : undefined
  const isUnlimited = planLimit >= 9999
  const activeCount = pages.filter(p => p.published).length

  return (
    <Page
      title={`${timeOfDay}, ${greeting}`}
      subtitle="Cu ce te ajut astăzi? Întreabă-mă orice despre paginile tale COD."
      primaryAction={{ content: 'Pagină nouă', icon: PlusIcon, onAction: onNew }}
    >
      <BlockStack gap="500">
        {/* Setup reminder — apears until user dismisses (stored in localStorage) */}
        <CodEmbedBanner shop={shop} />

        {/* Plan card */}
        <Card>
          <BlockStack gap="300">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text as="h3" variant="headingMd">Planul tău</Text>
                <Badge tone={planTone}>{planLabel}</Badge>
              </div>
              {plan !== 'pro' && (
                <Button onClick={onUpgrade} variant="plain">Upgrade</Button>
              )}
            </div>
            {isUnlimited ? (
              <Text as="p" tone="subdued">{pagesCount} pagini · nelimitate</Text>
            ) : (
              <BlockStack gap="200">
                <ProgressBar progress={Math.min(100, (pagesCount / planLimit) * 100)} size="small" />
                <Text as="p" tone="subdued">
                  {activeCount}/{publishLimit} publicate · {pagesCount}/{planLimit} create
                </Text>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* AI Chat */}
        <Card>
          <BlockStack gap="400">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Icon source={MagicIcon} tone="info" />
              </span>
              <Text as="h3" variant="headingMd">Asistent AI</Text>
            </div>

            {messages.length > 0 && (
              <div ref={scrollRef} style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
                <BlockStack gap="300">
                  {messages.map((m, i) => (
                    <ChatBubble key={i} role={m.role} content={m.content} />
                  ))}
                  {sending && <ChatBubble role="assistant" content="..." />}
                </BlockStack>
              </div>
            )}

            {messages.length === 0 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Sugestii rapide</Text>
                <BlockStack gap="200">
                  {suggestions.map(s => (
                    <Button key={s} onClick={() => send(s)} textAlign="start" disclosure="select">
                      {s}
                    </Button>
                  ))}
                </BlockStack>
              </BlockStack>
            )}

            {err && <Banner tone="critical">{err}</Banner>}

            <InlineStack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label=""
                  labelHidden
                  value={input}
                  onChange={setInput}
                  placeholder="Scrie un mesaj..."
                  multiline={1}
                  autoComplete="off"
                  disabled={sending}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                />
              </div>
              <Button variant="primary" onClick={() => send()} disabled={sending || !input.trim()} icon={SendIcon}>
                Trimite
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  )
}

// Inline-bold parser: turns **text** into <strong>text</strong>
function parseBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// Mini markdown renderer for AI responses: headings, lists (bullet + numbered),
// bold, paragraphs. Each line becomes its own block element so the layout
// breathes instead of being a wall of text.
function renderMarkdown(text) {
  const lines = (text || '').split(/\r?\n/)
  const out = []
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push(<div key={i} style={{ height: 6 }} />)
      return
    }
    // ## Heading
    const h = trimmed.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      const sizes = { 1: 16, 2: 15, 3: 14 }
      out.push(
        <div key={i} style={{ fontSize: sizes[h[1].length] || 14, fontWeight: 700, marginTop: i === 0 ? 0 : 8, marginBottom: 4, color: '#202223' }}>
          {parseBold(h[2])}
        </div>
      )
      return
    }
    // - bullet  or  * bullet
    const b = line.match(/^\s*[-*]\s+(.*)/)
    if (b) {
      out.push(
        <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 4, alignItems: 'flex-start' }}>
          <span style={{ color: '#6d7175', flexShrink: 0, lineHeight: 1.5 }}>•</span>
          <span>{parseBold(b[1])}</span>
        </div>
      )
      return
    }
    // 1. numbered
    const n = line.match(/^\s*(\d+)\.\s+(.*)/)
    if (n) {
      out.push(
        <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 4, alignItems: 'flex-start' }}>
          <span style={{ color: '#6d7175', flexShrink: 0, fontWeight: 600, minWidth: 18 }}>{n[1]}.</span>
          <span>{parseBold(n[2])}</span>
        </div>
      )
      return
    }
    // plain paragraph
    out.push(<div key={i}>{parseBold(line)}</div>)
  })
  return out
}

function ChatBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', width: '100%' }}>
      <div style={{
        background: isUser ? '#202223' : '#f6f6f7',
        color: isUser ? '#ffffff' : '#202223',
        padding: '12px 14px',
        borderRadius: 12,
        maxWidth: '88%',
        fontSize: 14,
        lineHeight: 1.55,
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}>
        {isUser ? content : renderMarkdown(content)}
      </div>
    </div>
  )
}

/* ─── PAGES ─────────────────────────────────────────────────────────── */
function PagesView({ pages, loading, shop, onNew, onEdit, onToggle, onDelete, deleting }) {
  const [query, setQuery] = useState('')
  const filtered = pages.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))

  if (loading) {
    return (
      <Page title="Pagini COD">
        <Card><Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box></Card>
      </Page>
    )
  }

  if (pages.length === 0) {
    return (
      <Page title="Pagini COD">
        <Card>
          <EmptyState
            heading="Nicio pagină încă"
            action={{ content: 'Creează prima pagină', onAction: onNew, icon: PlusIcon }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Generează automat o landing page COD pornind de la un produs AliExpress sau de la un template pre-făcut.</p>
          </EmptyState>
        </Card>
      </Page>
    )
  }

  return (
    <Page
      title="Pagini COD"
      subtitle={`${pages.length} ${pages.length === 1 ? 'pagină' : 'pagini'}`}
      primaryAction={{ content: 'Pagină nouă', icon: PlusIcon, onAction: onNew }}
    >
      <Card>
        <ResourceList
          resourceName={{ singular: 'pagină', plural: 'pagini' }}
          items={filtered}
          loading={loading}
          filterControl={
            <TextField
              label=""
              labelHidden
              value={query}
              onChange={setQuery}
              placeholder="Caută o pagină..."
              prefix={<Icon source={SearchIcon} />}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setQuery('')}
            />
          }
          emptyState={
            <Box padding="500">
              <Text as="p" tone="subdued" alignment="center">Nicio pagină cu numele "{query}"</Text>
            </Box>
          }
          renderItem={(page) => (
            <ResourceItem
              id={String(page.id)}
              accessibilityLabel={`Editează ${page.title}`}
              onClick={() => onEdit(page)}
            >
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h4" variant="bodyMd" fontWeight="semibold">{page.title}</Text>
                    <Badge tone={page.published ? 'success' : undefined}>
                      {page.published ? 'Activă' : 'Inactivă'}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {new Date(page.updated_at || page.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </BlockStack>

                <ButtonGroup>
                  <Button
                    icon={EditIcon}
                    accessibilityLabel="Editează"
                    onClick={(e) => { e?.stopPropagation?.(); onEdit(page) }}
                  >
                    Editează
                  </Button>
                  <Button
                    icon={ViewIcon}
                    accessibilityLabel="Vezi pagina live"
                    url={`https://${shop}/products/${page.handle}`}
                    external
                  />
                  <Button
                    icon={page.published ? PauseCircleIcon : PlayCircleIcon}
                    accessibilityLabel={page.published ? 'Dezactivează' : 'Activează'}
                    onClick={(e) => { e?.stopPropagation?.(); onToggle(page.id, page.published) }}
                  />
                  <Button
                    icon={DeleteIcon}
                    accessibilityLabel="Șterge"
                    tone="critical"
                    loading={deleting === page.id}
                    onClick={(e) => { e?.stopPropagation?.(); onDelete(page.id) }}
                  />
                </ButtonGroup>
              </InlineStack>
            </ResourceItem>
          )}
        />
      </Card>
    </Page>
  )
}

/* ─── TEMPLATES ─────────────────────────────────────────────────────── */
const TEMPLATES = [
  {
    id: 'beauty', name: 'Beauty & Cosmetice', emoji: '✦', accent: '#e879c5',
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
    id: 'tech', name: 'Tech & Gadgets', emoji: '◈', accent: '#5b8def',
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
    id: 'fashion', name: 'Fashion & Accesorii', emoji: '◐', accent: '#a855f7',
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
    id: 'health', name: 'Sănătate & Fitness', emoji: '◇', accent: '#10b981',
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
    <Page
      title="Template-uri"
      subtitle="Alege un template optimizat pe nișa ta — editorul se deschide cu conținutul pre-completat."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, gridAutoRows: '1fr' }}>
        {TEMPLATES.map((t) => (
          <div key={t.id} style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 0 0 1px rgba(26,26,26,0.07), 0 1px 0 rgba(0,0,0,0.05)',
            padding: 16,
            gap: 12
          }}>
            <div style={{
              background: '#f6f6f7',
              borderRadius: 8,
              padding: 32,
              minHeight: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: 48, color: '#6d7175', lineHeight: 1 }}>{t.emoji}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Text as="span" variant="bodySm" tone="subdued">{t.name}</Text>
              <Text as="h3" variant="headingMd">{t.data.headline}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{t.description}</Text>
            </div>
            <div style={{ flex: 1, minHeight: 4 }} />
            <Button onClick={() => onUse?.(t.data)} variant="primary" fullWidth icon={ChevronRightIcon}>
              Folosește template
            </Button>
          </div>
        ))}
      </div>
    </Page>
  )
}

/* ─── PRICING ───────────────────────────────────────────────────────── */
const PLANS = [
  {
    id: 'free', name: 'Free', price: 0,
    tagline: 'Pentru a testa și a începe',
    headline: '3 landing pages',
    sub: '1 publicată simultan',
    features: ['3 landing pages create', '1 publicată activ simultan', 'Editor complet GrapesJS', 'Templates de bază', 'Publicare directă în Shopify'],
    cta: null
  },
  {
    id: 'basic', name: 'Basic', price: 50, highlight: true,
    tagline: 'Pentru magazinele active',
    headline: 'Nelimitate',
    sub: 'create și publicate',
    features: ['Landing pages nelimitate', 'Toate publicate simultan', 'Editor complet GrapesJS', 'Toate templateurile', 'AI generator pagini', 'Autosave automat', 'Asistent AI integrat', 'Suport email'],
    cta: 'Activează Basic'
  },
  {
    id: 'pro', name: 'Pro', price: 150,
    tagline: 'Pentru afaceri în creștere',
    headline: 'Nelimitate',
    sub: 'create și publicate · prioritate AI',
    features: ['Landing pages nelimitate', 'Toate publicate simultan', 'Editor complet GrapesJS', 'Toate templateurile', 'AI generator pagini', 'Generare imagini AI premium', 'Asistent AI prioritar', 'Suport prioritar', 'Acces beta features'],
    cta: 'Activează Pro'
  }
]

function PricingView({ currentPlan, shop, onPlanChange }) {
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')

  async function selectPlan(planId) {
    if (planId === 'free' || planId === currentPlan) return
    setLoading(planId); setError('')
    try {
      const r = await apiFetch('/api/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_charge', shop, plan: planId })
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      if (data.confirmationUrl) {
        try { window.top.location.href = data.confirmationUrl }
        catch { window.location.href = data.confirmationUrl }
      }
    } catch(e) { setError(e.message); setLoading(null) }
  }

  return (
    <Page
      title="Planuri și prețuri"
      subtitle="Billing gestionat 100% de Shopify. Anulezi oricând din Shopify Admin."
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, gridAutoRows: '1fr', alignItems: 'stretch' }}>
          {PLANS.map((p) => {
            const isCurrent = p.id === currentPlan
            const isLoading = loading === p.id
            return (
              <div key={p.id} style={{
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                borderRadius: 12,
                boxShadow: p.highlight && !isCurrent
                  ? '0 0 0 2px #008060, 0 4px 12px rgba(0,128,96,0.15)'
                  : '0 0 0 1px rgba(26,26,26,0.07), 0 1px 0 rgba(0,0,0,0.05)',
                padding: 20,
                gap: 16
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h3" variant="headingLg">{p.name}</Text>
                    {p.highlight && !isCurrent && <Badge tone="success">Popular</Badge>}
                    {isCurrent && <Badge tone="success">Planul tău</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">{p.tagline}</Text>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text as="p" variant="heading2xl">
                    {p.price === 0 ? 'Gratuit' : `$${p.price}`}
                    {p.price > 0 && <Text as="span" variant="bodyMd" tone="subdued"> / lună</Text>}
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">{p.headline}</Text>
                  {p.sub && <Text as="p" variant="bodySm" tone="subdued">{p.sub}</Text>}
                </div>

                <div style={{ height: 1, background: '#e1e3e5' }} />

                <List type="bullet">
                  {p.features.map((f, i) => (
                    <List.Item key={i}>{f}</List.Item>
                  ))}
                </List>

                <div style={{ flex: 1, minHeight: 4 }} />

                {p.cta ? (
                  <Button
                    variant={p.highlight ? 'primary' : 'secondary'}
                    onClick={() => selectPlan(p.id)}
                    disabled={isCurrent || isLoading}
                    loading={isLoading}
                    fullWidth
                  >
                    {isCurrent ? 'Plan activ' : p.cta}
                  </Button>
                ) : (
                  <Button disabled fullWidth>{isCurrent ? 'Plan activ' : 'Gratuit întotdeauna'}</Button>
                )}
              </div>
            )
          })}
        </div>

        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
          Plata și facturarea sunt gestionate exclusiv de Shopify. Poți anula oricând din Shopify Admin → Settings → Apps.
        </Text>
      </BlockStack>
    </Page>
  )
}

/* ─── CONTACT ───────────────────────────────────────────────────────── */
function ContactView({ shop }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const handle = shop?.replace('.myshopify.com', '') || ''

  function copyEmail() {
    navigator.clipboard?.writeText(CONTACT_EMAIL).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }

  function send() {
    if (!subject.trim() || !message.trim()) {
      alert('Completează subiectul și mesajul')
      return
    }
    const fullSubject = `[UnitOne · ${handle}] ${subject.trim()}`
    const body = [
      message.trim(),
      '',
      '───────────────',
      `Magazin: ${shop}`,
      replyTo.trim() ? `Reply-to: ${replyTo.trim()}` : '',
      `Trimis: ${new Date().toLocaleString('ro-RO')}`
    ].filter(Boolean).join('\n')
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(fullSubject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
    setSent(true); setTimeout(() => setSent(false), 4000)
  }

  return (
    <Page title="Contact și asistență" subtitle="Ai întrebări sau ai nevoie de ajutor? Suntem aici.">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Trimite-ne un mesaj</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Mesajul tău va fi trimis la <strong>{CONTACT_EMAIL}</strong> prin clientul tău de email.
                Răspundem în maxim 24h în zilele lucrătoare.
              </Text>
            </BlockStack>

            <TextField
              label="Subiect"
              value={subject}
              onChange={setSubject}
              placeholder="Ex: Problemă la publicarea unei pagini"
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Mesaj"
              value={message}
              onChange={setMessage}
              placeholder="Descrie pe larg întrebarea / problema. Include URL-ul paginii și screenshot-uri dacă ai."
              multiline={6}
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Email pentru răspuns (opțional)"
              type="email"
              value={replyTo}
              onChange={setReplyTo}
              placeholder="adresa@email.com"
              autoComplete="email"
              helpText="Implicit primești răspuns pe emailul cu care deschizi clientul de mail."
            />

            <ButtonGroup>
              <Button
                variant="primary"
                icon={sent ? CheckIcon : SendIcon}
                onClick={send}
                size="large"
              >
                {sent ? 'Email pregătit' : 'Trimite mesaj'}
              </Button>
              <Button onClick={copyEmail} icon={copied ? CheckIcon : ClipboardIcon}>
                {copied ? 'Copiat' : `Copiază ${CONTACT_EMAIL}`}
              </Button>
            </ButtonGroup>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InfoRow icon={ClockIcon} label="Program suport" value="Lun–Vin · 09:00 — 18:00 EET" />
            <Divider />
            <InfoRow icon={StoreIcon} label="Magazinul tău" value={shop} mono />
            <Divider />
            <InfoRow icon={QuestionCircleIcon} label="Ce să incluzi" value="URL-ul paginii, ce ai încercat, screenshot dacă ai" />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  )
}

function InfoRow({ icon, label, value, mono }) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <Box minWidth="20px"><Icon source={icon} tone="subdued" /></Box>
      <BlockStack gap="050">
        <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="bodyMd" fontWeight={mono ? undefined : 'medium'}>
          {mono ? <code style={{ fontSize: 13 }}>{value}</code> : value}
        </Text>
      </BlockStack>
    </InlineStack>
  )
}

/* ─── BUG REPORT ────────────────────────────────────────────────────── */
function BugReportView({ shop, shopOwner }) {
  const [form, setForm] = useState({ severity: 'medium', title: '', desc: '', steps: '', expected: '' })
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

  return (
    <Page title="Raportează un bug" subtitle="Cu cât descrii mai bine, cu atât mai rapid putem rezolva.">
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="semibold">Severitate</Text>
            <ButtonGroup variant="segmented">
              <Button pressed={form.severity === 'low'} onClick={() => setForm({ ...form, severity: 'low' })}>Minor</Button>
              <Button pressed={form.severity === 'medium'} onClick={() => setForm({ ...form, severity: 'medium' })}>Mediu</Button>
              <Button pressed={form.severity === 'high'} onClick={() => setForm({ ...form, severity: 'high' })} tone="critical">Major</Button>
            </ButtonGroup>
          </BlockStack>

          <TextField
            label="Titlu scurt"
            value={form.title}
            onChange={v => setForm({ ...form, title: v })}
            placeholder="Ex: Butonul de publicare nu reacționează pe mobil"
            autoComplete="off"
          />

          <TextField
            label="Descriere"
            value={form.desc}
            onChange={v => setForm({ ...form, desc: v })}
            placeholder="Ce s-a întâmplat? Când? Pe ce pagină?"
            multiline={3}
            autoComplete="off"
          />

          <TextField
            label="Pași de reproducere (opțional)"
            value={form.steps}
            onChange={v => setForm({ ...form, steps: v })}
            placeholder="1. Apăs butonul X\n2. Selectez Y\n3. ..."
            multiline={4}
            autoComplete="off"
          />

          <TextField
            label="Ce te așteptai? (opțional)"
            value={form.expected}
            onChange={v => setForm({ ...form, expected: v })}
            placeholder="Mă așteptam să..."
            multiline={3}
            autoComplete="off"
          />

          <Banner tone="info">
            Info tehnic (browser, ecran, ora) se atașează automat la raport.
          </Banner>

          <Button variant="primary" onClick={submit} icon={sent ? CheckIcon : SendIcon} fullWidth size="large">
            {sent ? 'Email pregătit' : 'Trimite raportul'}
          </Button>
        </BlockStack>
      </Card>
    </Page>
  )
}
