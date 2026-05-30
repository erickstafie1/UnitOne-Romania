import { useState, useRef, useEffect } from 'react'
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, ProgressBar, Box, Select, Divider, Modal } from '@shopify/polaris'

// Mic chip pentru demografice (varsta, oras, ocupatie)
function Chip({ text }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px',
      background: '#f1f5f9',
      borderRadius: 12,
      fontSize: 12,
      color: '#475569',
      fontWeight: 500
    }}>{text}</span>
  )
}

// Card compact pentru sumar (dureri/dorinte/frici)
function InfoCard({ emoji, label, items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{
      background: '#fafbfc',
      border: '1px solid #e1e3e5',
      borderRadius: 10,
      padding: 14
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        <span style={{ marginRight: 4 }}>{emoji}</span>{label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#202223', lineHeight: 1.5 }}>
        {items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{typeof it === 'string' ? it : (it.title || JSON.stringify(it))}</li>)}
      </ul>
    </div>
  )
}
import { MagicIcon } from '@shopify/polaris-icons'
import { apiFetch } from '../apiFetch.js'

const STEPS = [
  { pct: 8, msg: 'Conectare la sursa produs', delay: 800 },
  { pct: 16, msg: 'Extragere imagini produs', delay: 1200 },
  { pct: 24, msg: 'Aplicare ICP construit', delay: 2000 },
  { pct: 32, msg: 'Identificare Sophistication Level (1-5)', delay: 4000 },
  { pct: 42, msg: 'Selectare hook levers din 7', delay: 8000 },
  { pct: 52, msg: 'Construire 3 variante de headline', delay: 12000 },
  { pct: 60, msg: 'Mapare Feel → Think → Act per sectiune', delay: 14000 },
  { pct: 68, msg: 'Generare copy direct-response in romana', delay: 18000 },
  { pct: 75, msg: 'Imagini AI · Studio', delay: 14000 },
  { pct: 82, msg: 'Imagini AI · Lifestyle', delay: 16000 },
  { pct: 88, msg: 'Imagini AI · Detaliu', delay: 18000 },
  { pct: 93, msg: 'Imagini AI · Social proof', delay: 20000 },
  { pct: 97, msg: 'Verificare CHECKLIST FINAL + asamblare pagina', delay: 25000 },
]

const SOURCES = [
  { id: 'aliexpress', label: 'AliExpress', emoji: '🛒', color: '#ff4747' },
  { id: 'amazon', label: 'Amazon', emoji: '📦', color: '#ff9900' },
  { id: 'alibaba', label: 'Alibaba', emoji: '🏭', color: '#ff6a00' },
  { id: 'shopify', label: 'Shopify (produs existent)', emoji: '🛍️', color: '#96bf48' },
  { id: 'photo', label: 'Poza produs', emoji: '📷', color: '#3b82f6' },
  { id: 'competitor', label: 'Link competitor', emoji: '🎯', color: '#a855f7' },
]

// Iconite SVG (Lucide-style) pentru pasii roadmap. currentColor permite
// flip-ul albastru → alb dupa ce cercul s-a umplut (controlat din CSS).
function StepIcon({ stepKey }) {
  const p = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (stepKey) {
    case 'importData': return (
      <svg {...p}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    )
    case 'marketResearch': return (
      <svg {...p}>
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <path d="M8 11h6M11 8v6"/>
      </svg>
    )
    case 'icpConfirm': return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <polyline points="17,11 19,13 23,9"/>
      </svg>
    )
    case 'salesCopy': return (
      <svg {...p}>
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    )
    case 'images': return (
      <svg {...p}>
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21,15 16,10 5,21"/>
      </svg>
    )
    case 'finalize': return (
      <svg {...p}>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
      </svg>
    )
    default: return null
  }
}

export default function Generator({ onGenerated, onBack, presetStyle, shop }) {
  // Source picker
  const [source, setSource] = useState('aliexpress')
  const [sourceUrl, setSourceUrl] = useState('')
  const [productImage, setProductImage] = useState('')
  const [productImageName, setProductImageName] = useState('')
  const [shopifyProductId, setShopifyProductId] = useState('')
  const [shopifyProducts, setShopifyProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  // Research output (ICP)
  const [icp, setIcp] = useState(null)
  const [productInfo, setProductInfo] = useState(null)
  const [researchImages, setResearchImages] = useState([])
  const [icpModalOpen, setIcpModalOpen] = useState(false)

  // Phases — 'pick' | 'roadmap-research' | 'icp-review' | 'roadmap-generate' | 'done'
  const [phase, setPhase] = useState('pick')
  // Roadmap state — fiecare step are status pending/active/done
  // Steps: import-data, market-research, icp-confirm, sales-copy, images, finalize
  const [stepStatus, setStepStatus] = useState({
    importData: 'pending',
    marketResearch: 'pending',
    icpConfirm: 'pending',
    salesCopy: 'pending',
    images: 'pending',
    finalize: 'pending'
  })
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const cancelRef = useRef(false)
  // ICP review animation direction (slide-in-right / slide-out-left)
  const [icpSlide, setIcpSlide] = useState('in')

  // Load Shopify products when source = shopify
  useEffect(() => {
    if (source !== 'shopify' || shopifyProducts.length > 0 || loadingProducts) return
    setLoadingProducts(true)
    apiFetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_products' })
    })
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.products)) {
          setShopifyProducts(d.products)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [source])

  function canStartResearch() {
    if (source === 'photo') return !!productImage
    if (source === 'shopify') return !!shopifyProductId
    return !!sourceUrl.trim()
  }

  async function startResearch() {
    setError('')
    setPhase('roadmap-research')
    // Activate step 1
    setStepStatus(s => ({ ...s, importData: 'active' }))
    setProgressPct(8)

    // Fake progressive feedback while research runs (real time ~30-90s)
    let fakeProgress = 8
    const advance = setInterval(() => {
      fakeProgress = Math.min(35, fakeProgress + 0.7)
      setProgressPct(fakeProgress)
      if (fakeProgress >= 18 && stepStatus.importData !== 'done') {
        setStepStatus(s => ({ ...s, importData: 'done', marketResearch: 'active' }))
      }
    }, 1000)

    try {
      const body = { source }
      if (source === 'photo') body.productImage = productImage
      else if (source === 'shopify') body.shopifyProductId = shopifyProductId
      else body.url = sourceUrl.trim()

      const res = await apiFetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      clearInterval(advance)
      // Body poate fi HTML (Vercel timeout page) sau JSON cu error ca obiect
      // (Anthropic / Vercel forwardeaza {error:{message,code}}). Coerce sigur.
      let json = {}
      try { json = await res.json() } catch (parseErr) { json = {} }
      if (!res.ok || !json.success) {
        const errMsg = typeof json.error === 'string'
          ? json.error
          : (json.error && (json.error.message || json.error.code))
            || ('Eroare server (HTTP ' + res.status + ')')
        throw new Error(errMsg)
      }
      setProductInfo(json.productInfo)
      setIcp(json.icp)
      setResearchImages(json.images || [])
      // Mark research steps complete, jump to ICP review
      setStepStatus(s => ({ ...s, importData: 'done', marketResearch: 'done', icpConfirm: 'active' }))
      setProgressPct(40)
      setTimeout(() => {
        setIcpSlide('in')
        setPhase('icp-review')
      }, 600)
    } catch (e) {
      clearInterval(advance)
      setError('Cercetare esuata: ' + e.message)
      setPhase('pick')
    }
  }

  async function confirmIcpAndGenerate() {
    if (!icp || !productInfo) return
    setError('')
    // Slide ICP out left, return to roadmap
    setIcpSlide('out')
    setStepStatus(s => ({ ...s, icpConfirm: 'done', salesCopy: 'active' }))
    setProgressPct(45)
    setTimeout(() => setPhase('roadmap-generate'), 350)

    // Fake progress while generate runs (~120s real)
    let fakeProgress = 45
    const advance = setInterval(() => {
      fakeProgress = Math.min(97, fakeProgress + 0.4)
      setProgressPct(fakeProgress)
      if (fakeProgress >= 65 && stepStatus.salesCopy !== 'done') {
        setStepStatus(s => ({ ...s, salesCopy: 'done', images: 'active' }))
      }
      if (fakeProgress >= 88 && stepStatus.images !== 'done') {
        setStepStatus(s => ({ ...s, images: 'done', finalize: 'active' }))
      }
    }, 1200)

    try {
      const res = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          productInfo,
          icp,
          images: researchImages,
          presetStyle: presetStyle?.style || null
        })
      })
      clearInterval(advance)
      cancelRef.current = true
      let json = {}
      try { json = await res.json() } catch (parseErr) { json = {} }
      if (!res.ok || !json.success) {
        const errMsg = typeof json.error === 'string'
          ? json.error
          : (json.error && (json.error.message || json.error.code))
            || ('Server error ' + res.status)
        throw new Error(errMsg)
      }
      setStepStatus(s => ({ ...s, salesCopy: 'done', images: 'done', finalize: 'done' }))
      setProgressPct(100)
      await new Promise(r => setTimeout(r, 700))
      onGenerated(json.data)
    } catch (e) {
      clearInterval(advance)
      setError(e.message)
      setPhase('icp-review')  // back to ICP so user can retry
    }
  }

  function updateIcpField(field, value) {
    setIcp({ ...icp, [field]: value })
  }

  // ─── ROADMAP UI (phases: research + generate) ────────────────────────
  const roadmapSteps = [
    { key: 'importData', label: 'Importăm datele produsului', emoji: '📦' },
    { key: 'marketResearch', label: 'AI face research de piață + ICP', emoji: '🔬' },
    { key: 'icpConfirm', label: 'Confirmi avatarul cumpărător', emoji: '✅' },
    { key: 'salesCopy', label: 'AI scrie copy direct-response', emoji: '✍️' },
    { key: 'images', label: 'AI generează imagini lifestyle', emoji: '🎨' },
    { key: 'finalize', label: 'Finalizăm pagina ta', emoji: '🚀' }
  ]

  function RoadmapView({ title }) {
    const accent = '#1e40af'
    const trackColor = '#e2e8f0'
    const ICON = 52
    const ROW = 78
    const CONTAINER_W = 360   // roadmap se centreaza in card; max 360px latime
    const COL_LEFT = ICON / 2                   // 26 — centru-x cercuri stanga
    const COL_RIGHT = CONTAINER_W - ICON / 2    // 334 — centru-x cercuri dreapta
    const n = roadmapSteps.length
    const totalH = (n - 1) * ROW + ICON

    return (
      <Page narrowWidth>
        <style>{`
          .ue-step-icon{
            width:${ICON}px;height:${ICON}px;border-radius:50%;
            position:relative;overflow:hidden;
            background:#fff;border:3px solid ${accent};
            display:flex;align-items:center;justify-content:center;
            flex-shrink:0;
            transition:transform .35s ease, box-shadow .35s ease
          }
          .ue-step-icon.active{transform:scale(1.08);animation:ue-pulse 1.8s ease-in-out infinite}
          @keyframes ue-pulse{0%,100%{box-shadow:0 0 0 6px ${accent}1f}50%{box-shadow:0 0 0 14px ${accent}0f}}
          /* Radial fill cand stepul devine done — albastrul se extinde din centru */
          .ue-step-icon::before{
            content:'';position:absolute;inset:-3px;border-radius:50%;
            background:${accent};transform:scale(0);
            transition:transform .65s cubic-bezier(.16,1,.3,1);
            z-index:1
          }
          .ue-step-icon.done::before{transform:scale(1)}
          /* Iconita ramane aceeasi; doar culoarea inverseaza dupa ce cercul s-a umplut */
          .ue-step-icon svg{position:relative;z-index:2;color:${accent};transition:color .4s ease .25s}
          .ue-step-icon.done svg{color:#fff}
          .ue-step-label{font-size:14px;line-height:1.4;color:#0f172a;transition:color .35s ease}
          .ue-step-label.pending{color:#94a3b8}
          .ue-step-label.active{color:${accent};font-weight:700}
          .ue-step-label.done{color:#475569;text-decoration:line-through;text-decoration-color:${accent};text-decoration-thickness:2px}
          .ue-progress-track{height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden}
          .ue-progress-fill{height:100%;background:linear-gradient(90deg,#7c3aed,${accent});transition:width .8s cubic-bezier(.16,1,.3,1);border-radius:4px}
        `}</style>
        <Card>
          <BlockStack gap="500">
            <BlockStack gap="200" inlineAlign="center">
              <Text as="h2" variant="headingLg" alignment="center">{title || 'Construim pagina ta'}</Text>
              <div style={{ width: '100%' }}>
                <div className="ue-progress-track"><div className="ue-progress-fill" style={{ width: progressPct + '%' }} /></div>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">{Math.round(progressPct)}% complete</Text>
              </div>
            </BlockStack>

            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: CONTAINER_W,
              margin: '0 auto',           // centrat in card
              height: totalH,
              marginTop: 8
            }}>
              {/* Conectori SVG Bezier intre cercuri */}
              <svg
                style={{ position: 'absolute', left: 0, top: 0, width: CONTAINER_W, height: totalH, pointerEvents: 'none', overflow: 'visible' }}
                aria-hidden="true"
              >
                {roadmapSteps.slice(0, -1).map((s, i) => {
                  const fromRight = i % 2 === 1
                  const toRight = (i + 1) % 2 === 1
                  const x1 = fromRight ? COL_RIGHT : COL_LEFT
                  const x2 = toRight ? COL_RIGHT : COL_LEFT
                  const y1 = i * ROW + ICON
                  const y2 = (i + 1) * ROW
                  const midY = (y1 + y2) / 2
                  const d = x1 === x2
                    ? `M ${x1} ${y1} L ${x2} ${y2}`
                    : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
                  const isDone = stepStatus[s.key] === 'done'
                  return (
                    <path key={s.key} d={d}
                      stroke={isDone ? accent : trackColor}
                      strokeWidth="3" fill="none" strokeLinecap="round"
                      style={{ transition: 'stroke .55s ease' }}
                    />
                  )
                })}
              </svg>

              {roadmapSteps.map((s, i) => {
                const isRight = i % 2 === 1
                const status = stepStatus[s.key]
                // Mirror pattern: cerc stanga → label dreapta cu text-align left;
                // cerc dreapta → label stanga cu text-align right (toward center).
                return (
                  <div key={s.key} style={{
                    position: 'absolute',
                    top: i * ROW,
                    [isRight ? 'right' : 'left']: 0,
                    display: 'flex',
                    flexDirection: isRight ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: 12
                  }}>
                    <div className={'ue-step-icon ' + status}>
                      <StepIcon stepKey={s.key} />
                    </div>
                    <div
                      className={'ue-step-label ' + status}
                      style={{ maxWidth: 220, textAlign: isRight ? 'right' : 'left' }}
                    >
                      {s.label}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 8, padding: 14, background: '#fafbfc', borderRadius: 10, border: '1px solid #e1e3e5' }}>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                AI gândește adânc · 2-3 minute pentru calitate maximă
              </Text>
            </div>
          </BlockStack>
        </Card>
      </Page>
    )
  }

  // ─── Loading screens dispatched per phase ────────────────────────────
  // Apel direct ca FUNCTIE (nu JSX <RoadmapView/>): RoadmapView e definit
  // inside Generator, deci type-ul lui se schimba la fiecare render parent.
  // <RoadmapView/> ar fi vazut ca COMPONENT NOU de React → unmount+remount →
  // animatia repornea la fiecare 1% progress. Apel direct returneaza JSX-ul
  // ca element static, reconciliat dupa type (Page/Card), nu component.
  if (phase === 'roadmap-research') return RoadmapView({ title: 'Pregătim avatarul tău' })
  if (phase === 'roadmap-generate') return RoadmapView({ title: 'Construim pagina ta' })

  function goNext() {
    if (phase === 'pick') startResearch()
  }

  return (
    <Page
      title="Generator AI"
      subtitle={phase === 'pick' ? 'Pasul 1 din 2 — alege sursa' : 'Pasul 2 din 2 — confirmă avatarul'}
      backAction={{ content: 'Anulează', onAction: onBack }}
    >
      <style>{`
        @keyframes ue-slide-in-right { from {opacity:0;transform:translateX(60px)} to {opacity:1;transform:translateX(0)} }
        @keyframes ue-slide-out-left { from {opacity:1;transform:translateX(0)} to {opacity:0;transform:translateX(-60px)} }
        .ue-wizard-step { animation: ue-slide-in-right 0.4s cubic-bezier(0.16,1,0.3,1); }
        .ue-wizard-step.out { animation: ue-slide-out-left 0.35s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>

      <Card>
        {presetStyle && phase === 'pick' && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="info">
              Stil pre-selectat: <strong>{presetStyle.templateName}</strong>
            </Banner>
          </div>
        )}

        <div className={'ue-wizard-step' + (icpSlide === 'out' ? ' out' : '')} key={phase}>
          {phase === 'pick' && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">De unde luăm produsul?</Text>
                <Text as="p" tone="subdued">
                  Alege sursa. AI-ul scrape-uiește produsul, face research, construiește un ICP (Ideal Customer Profile)
                  și recomandă parametrii optimi pentru pagina ta — fără să mai completezi nimic manual.
                </Text>
              </BlockStack>

              {/* Source picker — 6 carduri 2 col grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {SOURCES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSource(s.id)}
                    style={{
                      textAlign: 'center',
                      padding: '14px 8px',
                      background: source === s.id ? '#f0f7ff' : '#fff',
                      border: '2px solid ' + (source === s.id ? '#2c6ecb' : '#e1e3e5'),
                      borderRadius: 10,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit'
                    }}
                  >
                    <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 6 }}>{s.emoji}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#202223' }}>{s.label}</div>
                  </button>
                ))}
              </div>

              {/* Dynamic input below per source */}
              <div style={{ marginTop: 4 }}>
                {(source === 'aliexpress' || source === 'amazon' || source === 'alibaba' || source === 'competitor') && (
                  <TextField
                    label={'Link ' + (source === 'competitor' ? 'pagina competitor' : source.charAt(0).toUpperCase() + source.slice(1))}
                    value={sourceUrl}
                    onChange={setSourceUrl}
                    placeholder={
                      source === 'aliexpress' ? 'https://www.aliexpress.com/item/...' :
                      source === 'amazon' ? 'https://www.amazon.com/dp/...' :
                      source === 'alibaba' ? 'https://www.alibaba.com/product-detail/...' :
                      'https://magazin-concurent.ro/products/...'
                    }
                    type="url"
                    autoComplete="off"
                    onKeyDown={e => e.key === 'Enter' && canStartResearch() && goNext()}
                  />
                )}

                {source === 'shopify' && (
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Alege un produs din magazinul tău</Text>
                    {loadingProducts ? (
                      <Text as="p" tone="subdued">Se încarcă produsele...</Text>
                    ) : shopifyProducts.length === 0 ? (
                      <Text as="p" tone="subdued">Nu am găsit produse în magazin. Adaugă unul mai întâi.</Text>
                    ) : (
                      <Select
                        label=""
                        labelHidden
                        options={[
                          { label: '— Selectează produs —', value: '' },
                          ...shopifyProducts.map(p => ({ label: p.title, value: String(p.id) }))
                        ]}
                        value={shopifyProductId}
                        onChange={setShopifyProductId}
                      />
                    )}
                  </BlockStack>
                )}

                {source === 'photo' && (
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Poză produs</Text>
                    <div
                      style={{
                        border: '2px dashed ' + (productImage ? '#16a34a' : '#d1d5db'),
                        borderRadius: 10,
                        padding: 18,
                        textAlign: 'center',
                        background: productImage ? '#f0fdf4' : '#fafafa',
                        cursor: 'pointer'
                      }}
                      onClick={() => document.getElementById('productImageInput')?.click()}
                    >
                      <input
                        id="productImageInput"
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 5 * 1024 * 1024) { setError('Poză prea mare (max 5MB)'); return }
                          const reader = new FileReader()
                          reader.onload = () => {
                            setProductImage(String(reader.result || ''))
                            setProductImageName(file.name)
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                      {productImage ? (
                        <BlockStack gap="200" inlineAlign="center">
                          <img src={productImage} alt="preview" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, objectFit: 'contain' }} />
                          <Text as="p" variant="bodySm" fontWeight="semibold">✓ {productImageName}</Text>
                          <Button size="slim" tone="critical" variant="plain" onClick={(e) => { e.stopPropagation(); setProductImage(''); setProductImageName('') }}>
                            Șterge poza
                          </Button>
                        </BlockStack>
                      ) : (
                        <BlockStack gap="100" inlineAlign="center">
                          <div style={{ fontSize: 28 }}>📷</div>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">Click pentru a încărca poză</Text>
                          <Text as="p" variant="bodySm" tone="subdued">JPG / PNG · max 5MB</Text>
                        </BlockStack>
                      )}
                    </div>
                  </BlockStack>
                )}
              </div>

            </BlockStack>
          )}

          {phase === 'icp-review' && icp && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Avatar cumpărător</Text>
                <Text as="p" tone="subdued">
                  AI a construit avatarul psihologic. Click pe card pentru a vedea / edita toate detaliile.
                </Text>
              </BlockStack>

              <Banner tone="success">
                <Text as="p" variant="bodySm">
                  <strong>Produs:</strong> {productInfo?.title}
                </Text>
              </Banner>

              <style>{`
                .ue-icp-preview {
                  text-align:left; background:#fff; border:1px solid #e1e3e5;
                  border-radius:12px; padding:18px; display:flex; gap:16px;
                  align-items:flex-start; cursor:pointer; font-family:inherit;
                  width:100%; transition:border-color .15s, box-shadow .15s, transform .15s;
                }
                .ue-icp-preview:hover {
                  border-color:#2c6ecb; box-shadow:0 4px 14px rgba(44,110,203,.14);
                  transform:translateY(-1px);
                }
                .ue-icp-preview:hover .ue-icp-arrow { transform:translateX(3px); color:#2c6ecb; }
                .ue-icp-arrow { transition:transform .15s, color .15s; }
              `}</style>

              {/* Preview card compact — click → modal cu toate detaliile */}
              <button type="button" onClick={() => setIcpModalOpen(true)} className="ue-icp-preview">
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#eef2ff,#c7d2fe)',
                  color: '#4338ca', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                    {icp.archetype || 'Avatar cumpărător'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                    {icp.name || 'Avatar fără nume'}
                  </div>
                  <div style={{
                    fontSize: 13, color: '#6b7280', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {icp.bio || ''}
                  </div>
                </div>
                <div className="ue-icp-arrow" style={{ color: '#9ca3af', fontSize: 13, flexShrink: 0, marginTop: 6, fontWeight: 600 }}>
                  Detalii →
                </div>
              </button>

              {/* Modal cu toate detaliile editabile */}
              <Modal
                open={icpModalOpen}
                onClose={() => setIcpModalOpen(false)}
                title={icp.archetype || 'Avatar cumpărător'}
                size="large"
                primaryAction={{ content: 'Gata', onAction: () => setIcpModalOpen(false) }}
                secondaryActions={[{ content: 'Anulează', onAction: () => setIcpModalOpen(false) }]}
              >
                <Modal.Section>
                  <BlockStack gap="500">
                    {/* Persona header — gradient cu icon mare */}
                    <div style={{
                      background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)',
                      border: '1px solid #ddd6fe',
                      borderRadius: 14, padding: 22,
                      display: 'flex', gap: 20, alignItems: 'center'
                    }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#6366f1,#4338ca)',
                        color: '#fff', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(67,56,202,.28)'
                      }}>
                        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                          {icp.archetype || 'Avatar'}
                        </div>
                        <Text as="h3" variant="headingLg">{icp.name || 'Avatar'}</Text>
                        <div style={{ marginTop: 4 }}>
                          <Text as="p" variant="bodyMd" tone="subdued">{icp.bio || ''}</Text>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                          {icp.demographics?.age && <Chip text={'Vârstă: ' + icp.demographics.age} />}
                          {icp.demographics?.occupation && <Chip text={icp.demographics.occupation} />}
                          {icp.demographics?.location && <Chip text={icp.demographics.location} />}
                          {icp.demographics?.income && <Chip text={icp.demographics.income} />}
                        </div>
                      </div>
                    </div>

                    {/* Quick-scan cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                      <InfoCard emoji="🚩" label="Top 3 dureri" items={(icp.pains || icp.painPoints?.map(p => p.title) || []).slice(0, 3)} />
                      <InfoCard emoji="🌟" label="Top 3 dorințe" items={(icp.desires || icp.longTermAspirations || []).slice(0, 3)} />
                      <InfoCard emoji="🧠" label="Frici principale" items={(icp.keyFears || icp.beliefBarriers || []).slice(0, 3)} />
                    </div>

                    <Divider />

                    {/* Editable fields */}
                    <Text as="h4" variant="headingMd">Editează detaliile</Text>
                    <BlockStack gap="300">
                      <TextField label="Etichetă archetype" value={icp.archetype || ''} onChange={(v) => updateIcpField('archetype', v)} autoComplete="off" helpText="Ex: Utility-Driven Victor, Skeptical-Bargain Maria" />
                      <TextField label="Nume avatar" value={icp.name || ''} onChange={(v) => updateIcpField('name', v)} autoComplete="off" />
                      <TextField label="Bio scurt" value={icp.bio || ''} onChange={(v) => updateIcpField('bio', v)} multiline={2} autoComplete="off" />
                      <TextField label="Dureri (una per linie)" value={(icp.pains || []).join('\n')} onChange={(v) => updateIcpField('pains', v.split('\n').filter(s => s.trim()))} multiline={4} autoComplete="off" />
                      <TextField label="Dorințe (una per linie)" value={(icp.desires || []).join('\n')} onChange={(v) => updateIcpField('desires', v.split('\n').filter(s => s.trim()))} multiline={3} autoComplete="off" />
                      <TextField label="Frici / credințe limitative (una per linie)" value={(icp.beliefBarriers || []).join('\n')} onChange={(v) => updateIcpField('beliefBarriers', v.split('\n').filter(s => s.trim()))} multiline={3} autoComplete="off" />
                      <TextField label="Unique Angle" value={icp.uniqueAngle || ''} onChange={(v) => updateIcpField('uniqueAngle', v)} multiline={2} autoComplete="off" />
                    </BlockStack>
                  </BlockStack>
                </Modal.Section>
              </Modal>
            </BlockStack>
          )}
        </div>

        {error && <div style={{ marginTop: 16 }}><Banner tone="critical">{error}</Banner></div>}

        {/* Navigation footer */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #e1e3e5', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Button onClick={() => { setIcpSlide('out'); setTimeout(() => setPhase('pick'), 300) }} disabled={phase === 'pick'}>← Înapoi</Button>
          {phase === 'pick' ? (
            <Button variant="primary" size="large" onClick={goNext} disabled={!canStartResearch()}>
              Analizează produsul →
            </Button>
          ) : (
            <Button variant="primary" size="large" icon={MagicIcon} onClick={confirmIcpAndGenerate}>
              Confirm & Generează pagina
            </Button>
          )}
        </div>
      </Card>
    </Page>
  )
}
