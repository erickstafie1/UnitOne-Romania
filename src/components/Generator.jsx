import { useState, useRef, useEffect } from 'react'
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, ProgressBar, Box, Select, Divider } from '@shopify/polaris'

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
  const [showEditDetails, setShowEditDetails] = useState(false)

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
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Eroare la analiza')
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
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare')
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
    return (
      <Page narrowWidth>
        <style>{`
          @keyframes ue-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
          @keyframes ue-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          .ue-step-row{animation:ue-fadein .35s ease-out both}
          .ue-step-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;transition:all .3s ease}
          .ue-step-icon.pending{background:#f1f5f9;color:#94a3b8}
          .ue-step-icon.active{background:linear-gradient(135deg,#2c6ecb,#5b8def);color:#fff;box-shadow:0 0 0 6px rgba(44,110,203,.15);animation:ue-pulse 1.6s ease-in-out infinite}
          .ue-step-icon.done{background:#16a34a;color:#fff}
          @keyframes ue-pulse{0%,100%{box-shadow:0 0 0 6px rgba(44,110,203,.15)}50%{box-shadow:0 0 0 12px rgba(44,110,203,.05)}}
          .ue-step-label.pending{color:#94a3b8}
          .ue-step-label.active{color:#0f172a;font-weight:700}
          .ue-step-label.done{color:#475569;text-decoration:line-through;text-decoration-color:#86efac}
          .ue-progress-track{height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden}
          .ue-progress-fill{height:100%;background:linear-gradient(90deg,#7c3aed,#2c6ecb);transition:width .8s cubic-bezier(.16,1,.3,1);border-radius:4px}
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
            <BlockStack gap="300">
              {roadmapSteps.map((s, i) => {
                const status = stepStatus[s.key]
                const icon = status === 'done' ? '✓' : (status === 'active' ? (
                  <span style={{ display: 'inline-block', animation: 'ue-spin 1.4s linear infinite' }}>↻</span>
                ) : s.emoji)
                return (
                  <div key={s.key} className="ue-step-row" style={{ display: 'flex', gap: 14, alignItems: 'center', animationDelay: (i * 0.05) + 's' }}>
                    <div className={'ue-step-icon ' + status}>{icon}</div>
                    <div className={'ue-step-label ' + status} style={{ fontSize: 14, lineHeight: 1.4 }}>{s.label}</div>
                  </div>
                )
              })}
            </BlockStack>
            <div style={{ marginTop: 16, padding: 14, background: '#fafbfc', borderRadius: 10, border: '1px solid #e1e3e5' }}>
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
  if (phase === 'roadmap-research') return <RoadmapView title="Pregătim avatarul tău" />
  if (phase === 'roadmap-generate') return <RoadmapView title="Construim pagina ta" />

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

              {researching && (
                <Banner tone="info">
                  AI face research pe produs și construiește ICP-ul... Durează ~30-60 secunde.
                </Banner>
              )}
            </BlockStack>
          )}

          {phase === 'icp-review' && icp && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Avatar cumpărător</Text>
                <Text as="p" tone="subdued">
                  AI a analizat produsul și a construit avatarul psihologic. Verifică-l rapid și apasă Generează.
                </Text>
              </BlockStack>

              <Banner tone="success">
                <Text as="p" variant="bodySm">
                  <strong>Produs:</strong> {productInfo?.title}
                </Text>
              </Banner>

              {/* Persona card — Atlas-style */}
              <div style={{
                background: '#fff',
                border: '1px solid #e1e3e5',
                borderRadius: 12,
                padding: 24,
                display: 'flex',
                gap: 18,
                alignItems: 'flex-start'
              }}>
                <div style={{
                  width: 64, height: 64,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#2c6ecb,#5b8def)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {(icp.name || 'A').charAt(0).toUpperCase()}
                </div>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{icp.name || 'Avatar'}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{icp.bio || ''}</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {icp.demographics?.age && <Chip text={'Vârstă: ' + icp.demographics.age} />}
                    {icp.demographics?.occupation && <Chip text={icp.demographics.occupation} />}
                    {icp.demographics?.location && <Chip text={icp.demographics.location} />}
                  </div>
                </BlockStack>
              </div>

              {/* Compact summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <InfoCard
                  emoji="🚩"
                  label="Top 3 dureri"
                  items={(icp.pains || icp.painPoints?.map(p => p.title) || []).slice(0, 3)}
                />
                <InfoCard
                  emoji="🌟"
                  label="Top 3 dorințe"
                  items={(icp.desires || icp.longTermAspirations || []).slice(0, 3)}
                />
                <InfoCard
                  emoji="🧠"
                  label="Frici principale"
                  items={(icp.keyFears || icp.beliefBarriers || []).slice(0, 3)}
                />
              </div>

              {/* Edit details toggle */}
              <Button
                variant="plain"
                onClick={() => setShowEditDetails(!showEditDetails)}
                disclosure={showEditDetails ? 'up' : 'down'}
              >
                {showEditDetails ? 'Ascunde editarea detaliilor' : 'Editează în detaliu'}
              </Button>

              {showEditDetails && (
                <BlockStack gap="400">
                  <Divider />
                  <TextField
                    label="Nume avatar"
                    value={icp.name || ''}
                    onChange={(v) => updateIcpField('name', v)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Bio scurt"
                    value={icp.bio || ''}
                    onChange={(v) => updateIcpField('bio', v)}
                    multiline={2}
                    autoComplete="off"
                  />
                  <TextField
                    label="Dureri (una per linie)"
                    value={(icp.pains || []).join('\n')}
                    onChange={(v) => updateIcpField('pains', v.split('\n').filter(s => s.trim()))}
                    multiline={4}
                    autoComplete="off"
                  />
                  <TextField
                    label="Dorințe (una per linie)"
                    value={(icp.desires || []).join('\n')}
                    onChange={(v) => updateIcpField('desires', v.split('\n').filter(s => s.trim()))}
                    multiline={3}
                    autoComplete="off"
                  />
                  <TextField
                    label="Frici / credințe limitative (una per linie)"
                    value={(icp.beliefBarriers || []).join('\n')}
                    onChange={(v) => updateIcpField('beliefBarriers', v.split('\n').filter(s => s.trim()))}
                    multiline={3}
                    autoComplete="off"
                  />
                  <TextField
                    label="Unique Angle"
                    value={icp.uniqueAngle || ''}
                    onChange={(v) => updateIcpField('uniqueAngle', v)}
                    multiline={2}
                    autoComplete="off"
                  />
                </BlockStack>
              )}
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
