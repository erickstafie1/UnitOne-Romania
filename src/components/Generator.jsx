import { useState, useRef, useEffect } from 'react'
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, ProgressBar, Box, Select } from '@shopify/polaris'
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
  const [researching, setResearching] = useState(false)

  // Generation
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')
  const cancelRef = useRef(false)

  // Wizard state
  const STEPS_COUNT = 2
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState('forward')

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
    setResearching(true)
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
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Eroare la analiza')
      setProductInfo(json.productInfo)
      setIcp(json.icp)
      setResearchImages(json.images || [])
      setDirection('forward')
      setStep(1)
    } catch (e) {
      setError('Cercetare esuata: ' + e.message)
    } finally {
      setResearching(false)
    }
  }

  function updateIcpField(field, value) {
    setIcp({ ...icp, [field]: value })
  }

  async function generate() {
    if (!icp || !productInfo) return
    setError(''); setLoading(true); setLoadPct(STEPS[0].pct); setLoadMsg(STEPS[0].msg)
    cancelRef.current = false

    let i = 1
    const advance = () => {
      if (cancelRef.current || i >= STEPS.length) return
      const s = STEPS[i]
      setLoadPct(s.pct); setLoadMsg(s.msg)
      i++
      setTimeout(advance, s.delay)
    }
    setTimeout(advance, STEPS[0].delay)

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
      cancelRef.current = true
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare')
      setLoadPct(100); setLoadMsg('Pagina ta este gata')
      await new Promise(r => setTimeout(r, 700))
      onGenerated(json.data)
    } catch (e) {
      cancelRef.current = true
      setError(e.message); setLoading(false)
    }
  }

  // ─── Loading screen ────────────────────────────────────────────────────
  if (loading) {
    return (
      <Page narrowWidth title="Generare in curs">
        <Card>
          <BlockStack gap="500" inlineAlign="center">
            <Box background="bg-fill-brand" padding="500" borderRadius="400" minWidth="84px" minHeight="84px">
              <InlineStack align="center" blockAlign="center">
                <Box minWidth="44px" minHeight="44px">
                  <span style={{ display: 'inline-block', animation: 'spin 2s linear infinite' }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                  </span>
                </Box>
              </InlineStack>
            </Box>
            <BlockStack gap="200" inlineAlign="center">
              <Text as="h2" variant="headingXl" alignment="center">Construim pagina ta</Text>
              <Text as="p" variant="bodyMd" alignment="center">{loadMsg}</Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                AI gandeste adanc · 2-3 minute pentru calitate maxima
              </Text>
            </BlockStack>
            <Box width="100%">
              <BlockStack gap="100">
                <ProgressBar progress={loadPct} size="small" />
                <Text as="p" variant="bodySm" tone="subdued" alignment="end">{loadPct}%</Text>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>
      </Page>
    )
  }

  // ─── Wizard ────────────────────────────────────────────────────────────
  function goNext() {
    if (step === 0) startResearch()
  }

  function goBack() {
    setDirection('backward')
    setStep(s => Math.max(0, s - 1))
  }

  return (
    <Page
      title="Generator AI"
      subtitle={'Pasul ' + (step + 1) + ' din ' + STEPS_COUNT}
      backAction={{ content: 'Anulează', onAction: onBack }}
    >
      <style>{`
        @keyframes ue-slide-in-right { from {opacity:0;transform:translateX(40px)} to {opacity:1;transform:translateX(0)} }
        @keyframes ue-slide-in-left { from {opacity:0;transform:translateX(-40px)} to {opacity:1;transform:translateX(0)} }
        .ue-wizard-step { animation: ue-slide-in-right 0.35s cubic-bezier(0.16,1,0.3,1); }
        .ue-wizard-step.back { animation: ue-slide-in-left 0.35s cubic-bezier(0.16,1,0.3,1); }
        .ue-progress-bar { height: 4px; background: #f1f2f4; border-radius: 2px; overflow: hidden; margin-bottom: 24px; }
        .ue-progress-fill { height: 100%; background: linear-gradient(90deg,#2c6ecb 0%,#5b8def 100%); transition: width 0.4s cubic-bezier(0.16,1,0.3,1); border-radius: 2px; }
      `}</style>

      <Card>
        <div className="ue-progress-bar">
          <div className="ue-progress-fill" style={{ width: (((step + 1) / STEPS_COUNT) * 100) + '%' }} />
        </div>

        {presetStyle && step === 0 && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="info">
              Stil pre-selectat: <strong>{presetStyle.templateName}</strong>
            </Banner>
          </div>
        )}

        <div className={'ue-wizard-step' + (direction === 'backward' ? ' back' : '')} key={step}>
          {step === 0 && (
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

          {step === 1 && icp && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">ICP-ul construit de AI</Text>
                <Text as="p" tone="subdued">
                  AI a analizat produsul și a construit profilul cumpărătorului ideal. Poți edita orice câmp înainte de generare,
                  sau lasă tot așa și apasă Generează.
                </Text>
              </BlockStack>

              <Banner tone="success">
                <Text as="p" variant="bodySm">
                  <strong>Produs identificat:</strong> {productInfo?.title}
                </Text>
              </Banner>

              <TextField
                label="Persona (cine e cumpărătorul)"
                value={icp.persona || ''}
                onChange={(v) => updateIcpField('persona', v)}
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
                label="Credințe limitative (obiecții psihologice — una per linie)"
                value={(icp.beliefBarriers || []).join('\n')}
                onChange={(v) => updateIcpField('beliefBarriers', v.split('\n').filter(s => s.trim()))}
                multiline={3}
                autoComplete="off"
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                <Select
                  label="Hawkins level"
                  options={[
                    { label: 'Vină (guilt)', value: 'guilt' },
                    { label: 'Frică (fear)', value: 'fear' },
                    { label: 'Durere/Dor (grief)', value: 'grief' },
                    { label: 'Apatie (apathy)', value: 'apathy' },
                    { label: 'Neutralitate', value: 'neutrality' },
                    { label: 'Curaj (courage)', value: 'courage' },
                  ]}
                  value={icp.hawkinsLevel || 'fear'}
                  onChange={(v) => updateIcpField('hawkinsLevel', v)}
                />
                <Select
                  label="Sophistication Level (piață)"
                  options={[
                    { label: '1 — Piață nouă', value: '1' },
                    { label: '2 — Competiție directă', value: '2' },
                    { label: '3 — Mecanism', value: '3' },
                    { label: '4 — Mecanism mărit', value: '4' },
                    { label: '5 — Identificare emoțională', value: '5' },
                  ]}
                  value={String(icp.sophisticationLevel || 3)}
                  onChange={(v) => updateIcpField('sophisticationLevel', parseInt(v, 10))}
                />
                <Select
                  label="Nișă"
                  options={['fashion','electronics','beauty','auto','health','home','sports','baby','pet','generic'].map(n => ({ label: n, value: n }))}
                  value={icp.niche || 'generic'}
                  onChange={(v) => updateIcpField('niche', v)}
                />
                <Select
                  label="Ton recomandat"
                  options={['direct','agresiv','casual','profesional','emotional'].map(n => ({ label: n, value: n }))}
                  value={icp.recommendedTone || 'direct'}
                  onChange={(v) => updateIcpField('recommendedTone', v)}
                />
                <Select
                  label="Urgență"
                  options={[{label:'Înaltă',value:'inalta'},{label:'Medie',value:'medie'},{label:'Fără',value:'fara'}]}
                  value={icp.recommendedUrgency || 'medie'}
                  onChange={(v) => updateIcpField('recommendedUrgency', v)}
                />
                <Select
                  label="Lungime pagină"
                  options={[{label:'Scurtă',value:'scurt'},{label:'Medie',value:'mediu'},{label:'Lungă',value:'lung'}]}
                  value={icp.recommendedLength || 'mediu'}
                  onChange={(v) => updateIcpField('recommendedLength', v)}
                />
              </div>

              <TextField
                label="Unique Angle (de ce ASTA și nu alt produs)"
                value={icp.uniqueAngle || ''}
                onChange={(v) => updateIcpField('uniqueAngle', v)}
                multiline={2}
                autoComplete="off"
              />
            </BlockStack>
          )}
        </div>

        {error && <div style={{ marginTop: 16 }}><Banner tone="critical">{error}</Banner></div>}

        {/* Navigation footer */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #e1e3e5', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Button onClick={goBack} disabled={step === 0 || researching || loading}>← Înapoi</Button>
          {step === 0 ? (
            <Button variant="primary" size="large" onClick={goNext} disabled={!canStartResearch() || researching} loading={researching}>
              Analizează produsul →
            </Button>
          ) : (
            <Button variant="primary" size="large" icon={MagicIcon} onClick={generate}>
              Generează pagina
            </Button>
          )}
        </div>
      </Card>
    </Page>
  )
}
