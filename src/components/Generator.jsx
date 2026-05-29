import { useState, useRef } from 'react'
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, ProgressBar, Box, ChoiceList, Select, Checkbox, Divider } from '@shopify/polaris'
import { ArrowLeftIcon, ChevronRightIcon, MagicIcon, WandIcon } from '@shopify/polaris-icons'

const STEPS = [
  { pct: 8, msg: 'Conectare la sursă produs', delay: 800 },
  { pct: 16, msg: 'Extragere imagini produs', delay: 1200 },
  { pct: 24, msg: 'Analiză profil cumpărător', delay: 2000 },
  { pct: 32, msg: 'Identificare Sophistication Level (1-5)', delay: 4000 },
  { pct: 42, msg: 'Selectare hook levers din 7', delay: 8000 },
  { pct: 52, msg: 'Construire 3 variante de headline', delay: 12000 },
  { pct: 60, msg: 'Mapare Feel → Think → Act per secțiune', delay: 14000 },
  { pct: 68, msg: 'Generare copy direct-response în română', delay: 18000 },
  { pct: 75, msg: 'Imagini AI · Studio', delay: 14000 },
  { pct: 82, msg: 'Imagini AI · Lifestyle', delay: 16000 },
  { pct: 88, msg: 'Imagini AI · Detaliu', delay: 18000 },
  { pct: 93, msg: 'Imagini AI · Social proof', delay: 20000 },
  { pct: 97, msg: 'Verificare CHECKLIST FINAL + asamblare pagină', delay: 25000 },
]

export default function Generator({ onGenerated, onBack, presetStyle }) {
  const [aliUrl, setAliUrl] = useState('')
  const [competitorUrl, setCompetitorUrl] = useState('')
  // Personalizare AI — fiecare camp influenteaza prompt-ul Claude direct
  const [tone, setTone] = useState('direct')              // agresiv | direct | casual | profesional | emotional
  const [salesAngle, setSalesAngle] = useState('')        // FREE TEXT: cine cumpara + ce-l motiveaza
  const [urgencyLevel, setUrgencyLevel] = useState('medie') // inalta | medie | fara
  const [lengthMode, setLengthMode] = useState('mediu')   // scurt | mediu | lung
  const [includeObjections, setIncludeObjections] = useState(true)
  const [customObjections, setCustomObjections] = useState('')  // FREE TEXT: obiectii custom, una per linie
  // Popup options — adauga popup pe pagina cu un obiectiv specific
  const [popupEnabled, setPopupEnabled] = useState(false)
  const [popupGoal, setPopupGoal] = useState('discount')  // phone | order | discount
  // Niche / vertical — adapteaza sectiuni LP (tabel marimi pt fashion, specs pt tech, etc.)
  const [niche, setNiche] = useState('generic')
  // Product image — base64 din upload, AI vision o citeste si extrage nume + descriere
  const [productImage, setProductImage] = useState('')
  const [productImageName, setProductImageName] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceMsg, setEnhanceMsg] = useState('')
  const cancelRef = useRef(false)
  // Wizard state — MUST be here (before any return), nu dupa if(loading)
  // altfel violam regula React hooks (order changes between renders).
  const STEPS_COUNT = 8
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState('forward')

  // AI Enhance — ia textul user-ului (profilul cumparatorului) si il extinde
  // cu detalii comerciale: ce-l motiveaza, ce durere are, ce moment cumpara.
  async function enhancePrompt() {
    const txt = salesAngle.trim()
    if (!txt) return
    setEnhancing(true); setEnhanceMsg(''); setError('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enhance_prompt',
          text: txt,
          productContext: (aliUrl.trim() || competitorUrl.trim()) ? `Link produs: ${aliUrl.trim() || competitorUrl.trim()}` : ''
        })
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Eroare AI')
      if (json.enhanced) {
        setSalesAngle(json.enhanced)
        setEnhanceMsg('✓ Profilul a fost îmbunătățit — poți edita mai departe sau treci la pasul următor')
      }
    } catch (e) {
      setError('AI Enhance: ' + e.message)
    } finally {
      setEnhancing(false)
    }
  }

  async function generate() {
    // Accept either AliExpress link OR competitor link (cel putin unul)
    if (!aliUrl.trim() && !competitorUrl.trim() && !productImage) return
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
      // customObjections: lista pe care user-ul a scris in pasul final
      // (una per linie). Daca e populata, Claude le foloseste in loc sa
      // inventeze obiectiile default.
      const customObjList = customObjections
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 3)
        .slice(0, 8)
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aliUrl: aliUrl.trim(),
          competitorUrl: competitorUrl.trim() || null,
          // salesAngle e acum text liber descrievind profilul buyer-ului
          // (audienta + ce-l motiveaza). Inlocuieste vechiul styleDesc.
          styleDesc: salesAngle.trim(),
          salesAngle: salesAngle.trim(),
          customObjections: customObjList,
          presetStyle: presetStyle?.style || null,
          tone, urgencyLevel, lengthMode,
          includeObjections,
          popupEnabled,
          popupGoal: popupEnabled ? popupGoal : null,
          niche,
          productImage: productImage || null
        })
      })
      cancelRef.current = true
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare')
      setLoadPct(100); setLoadMsg('Pagina ta este gata')
      await new Promise(r => setTimeout(r, 700))
      onGenerated(json.data)
    } catch(e) {
      cancelRef.current = true
      setError(e.message); setLoading(false)
    }
  }

  if (loading) {
    return (
      <Page narrowWidth title="Generare în curs">
        <Card>
          <BlockStack gap="500" inlineAlign="center">
            <Box
              background="bg-fill-brand"
              padding="500"
              borderRadius="400"
              minWidth="84px"
              minHeight="84px"
            >
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
              <Text as="h2" variant="headingXl" alignment="center">Pregătim pagina ta</Text>
              <Text as="p" variant="bodyMd" alignment="center">{loadMsg}</Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                AI gândește adânc · 2-3 minute pentru calitate maximă
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

  // ─── Wizard step-by-step cu swipe transitions ───────────────────────────
  // (state declarat sus impreuna cu celelalte useState — regula React)
  function goNext() {
    if (!canAdvance()) return
    setDirection('forward')
    setStep(s => Math.min(s + 1, STEPS_COUNT - 1))
  }
  function goBack() {
    setDirection('backward')
    setStep(s => Math.max(s - 1, 0))
  }
  function canAdvance() {
    if (step === 0) return aliUrl.trim() || competitorUrl.trim() || productImage  // cel putin unul
    return true  // alte pasi au valori default, OK
  }
  function isLastStep() { return step === STEPS_COUNT - 1 }

  // Card option for visual selectors — used in tone/angle/urgency/length steps
  function OptionCard({ active, onClick, icon, label, desc }) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          textAlign: 'left',
          padding: '18px 18px',
          background: active ? '#f0f7ff' : '#fff',
          border: '2px solid ' + (active ? '#2c6ecb' : '#e1e3e5'),
          borderRadius: 10,
          cursor: 'pointer',
          transition: 'all 0.15s',
          width: '100%',
          fontFamily: 'inherit'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
          <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#202223', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#6d7175', lineHeight: 1.4 }}>{desc}</div>
          </div>
          {active && <div style={{ color: '#2c6ecb', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>✓</div>}
        </div>
      </button>
    )
  }

  return (
    <Page
      title="Generator AI"
      subtitle={`Pasul ${step + 1} din ${STEPS_COUNT}`}
      backAction={{ content: 'Anulează', onAction: onBack }}
    >
      <style>{`
        @keyframes ue-slide-in-right { from {opacity:0;transform:translateX(40px)} to {opacity:1;transform:translateX(0)} }
        @keyframes ue-slide-in-left { from {opacity:0;transform:translateX(-40px)} to {opacity:1;transform:translateX(0)} }
        .ue-wizard-step { animation: ue-slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        .ue-wizard-step.back { animation: ue-slide-in-left 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        .ue-progress-bar { height: 4px; background: #f1f2f4; border-radius: 2px; overflow: hidden; margin-bottom: 24px; }
        .ue-progress-fill { height: 100%; background: linear-gradient(90deg, #2c6ecb 0%, #5b8def 100%); transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1); border-radius: 2px; }
      `}</style>

      <Card>
        {/* Progress bar */}
        <div className="ue-progress-bar">
          <div className="ue-progress-fill" style={{ width: ((step + 1) / STEPS_COUNT * 100) + '%' }} />
        </div>

        {presetStyle && step === 0 && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="info">
              Stil pre-selectat: <strong>{presetStyle.templateName}</strong>
            </Banner>
          </div>
        )}

        {/* Step content cu animatie */}
        <div className={'ue-wizard-step' + (direction === 'backward' ? ' back' : '')} key={step}>
          {step === 0 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">De unde luăm produsul?</Text>
                <Text as="p" tone="subdued">Link AliExpress, link competitor, SAU poză produs — minim unul. Poți combina.</Text>
              </BlockStack>
              <TextField
                label="Link AliExpress"
                value={aliUrl}
                onChange={setAliUrl}
                placeholder="https://www.aliexpress.com/item/..."
                type="url"
                autoComplete="off"
                onKeyDown={e => e.key === 'Enter' && canAdvance() && goNext()}
              />
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">— sau —</Text>
              <TextField
                label="Link competitor (LP de la concurent)"
                value={competitorUrl}
                onChange={setCompetitorUrl}
                placeholder="https://magazin-concurent.ro/products/..."
                type="url"
                autoComplete="off"
                helpText="AI învață stilul și unghiul, apoi îl bate la conversie"
                onKeyDown={e => e.key === 'Enter' && canAdvance() && goNext()}
              />
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">— sau —</Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="semibold">Poză produs</Text>
                <Text as="p" variant="bodySm" tone="subdued">Încarcă o poză. AI-ul Vision identifică produsul și generează LP fără să mai scrii nimic.</Text>
                <div style={{
                  border: '2px dashed ' + (productImage ? '#16a34a' : '#d1d5db'),
                  borderRadius: 10,
                  padding: 18,
                  textAlign: 'center',
                  background: productImage ? '#f0fdf4' : '#fafafa',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onClick={() => document.getElementById('productImageInput')?.click()}>
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
            </BlockStack>
          )}

          {step === 1 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Cum vrei să sune copy-ul?</Text>
                <Text as="p" tone="subdued">Tonul determină cum vorbește pagina cu clientul.</Text>
              </BlockStack>
              <BlockStack gap="200">
                <OptionCard active={tone === 'direct'} onClick={() => setTone('direct')}
                  icon="🎯" label="Direct" desc="Clar, fără ocoluri, propoziții scurte. Recomandat." />
                <OptionCard active={tone === 'agresiv'} onClick={() => setTone('agresiv')}
                  icon="🔥" label="Agresiv" desc='Urgență mare, "ACUM", "ULTIMA ȘANSĂ". Conversie mare pe rece.' />
                <OptionCard active={tone === 'casual'} onClick={() => setTone('casual')}
                  icon="😎" label="Casual" desc="Ca sfat de la un prieten. 'Tu' peste tot, fără jargon." />
                <OptionCard active={tone === 'profesional'} onClick={() => setTone('profesional')}
                  icon="👔" label="Profesional" desc="Autoritate, dovezi, ton de expert. Pentru produse premium." />
                <OptionCard active={tone === 'emotional'} onClick={() => setTone('emotional')}
                  icon="💞" label="Emoțional" desc="Storytelling, sentiment. Pentru cosmetice, copii, cadouri." />
              </BlockStack>
            </BlockStack>
          )}

          {step === 2 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Cine cumpără și ce-l motivează?</Text>
                <Text as="p" tone="subdued">Descrie în câteva fraze cumpărătorul ideal + unghiul de vânzare. AI-ul va adapta copy-ul exact pe profilul ăsta.</Text>
              </BlockStack>
              <TextField
                label=""
                value={salesAngle}
                onChange={setSalesAngle}
                placeholder="Ex: Mamă de 30 ani cu copil 1-3 ani care se chinuie când mănâncă (varsă mâncarea, se murdărește). Caută o soluție rapidă care să-i scape de stresul curățeniei și hainelor murdare."
                multiline={5}
                autoComplete="off"
                disabled={enhancing}
                helpText='Cât mai concret: vârstă, sex, situație, durerea principală. Apasă „Îmbunătățește cu AI" să extindem profilul automat.'
              />
              <InlineStack align="end">
                <Button
                  icon={WandIcon}
                  onClick={enhancePrompt}
                  loading={enhancing}
                  disabled={!salesAngle.trim() || enhancing}
                  size="slim"
                >
                  {enhancing ? 'Îmbunătățesc...' : 'Îmbunătățește cu AI'}
                </Button>
              </InlineStack>
              {enhanceMsg && <Banner tone="success">{enhanceMsg}</Banner>}
            </BlockStack>
          )}

          {step === 3 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Ce tip de produs este?</Text>
                <Text as="p" tone="subdued">Selectează nișa — AI-ul va adăuga secțiuni specifice (tabel mărimi pentru fashion, specs pentru tech, ingrediente pentru beauty, etc.).</Text>
              </BlockStack>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <OptionCard active={niche === 'fashion'} onClick={() => setNiche('fashion')}
                  icon="👗" label="Fashion & Accesorii" desc="Tabel mărimi, ghid fit, instrucțiuni îngrijire" />
                <OptionCard active={niche === 'electronics'} onClick={() => setNiche('electronics')}
                  icon="📱" label="Electronics & Gadgets" desc="Specs tehnice, compatibilitate, ce conține cutia" />
                <OptionCard active={niche === 'beauty'} onClick={() => setNiche('beauty')}
                  icon="💄" label="Beauty & Cosmetice" desc="Ingrediente, tip piele, mod de aplicare" />
                <OptionCard active={niche === 'auto'} onClick={() => setNiche('auto')}
                  icon="🚗" label="Auto & Moto" desc="Compatibilitate vehicul, pași instalare" />
                <OptionCard active={niche === 'health'} onClick={() => setNiche('health')}
                  icon="💊" label="Sănătate & Suplimente" desc="Compoziție, dozaj, contraindicații" />
                <OptionCard active={niche === 'home'} onClick={() => setNiche('home')}
                  icon="🏠" label="Casă & Bucătărie" desc="Dimensiuni, materiale, instrucțiuni curățare" />
                <OptionCard active={niche === 'sports'} onClick={() => setNiche('sports')}
                  icon="🏋️" label="Sport & Fitness" desc="Mușchi targetați, durată sesiune, nivel" />
                <OptionCard active={niche === 'baby'} onClick={() => setNiche('baby')}
                  icon="🍼" label="Copii & Bebe" desc="Vârstă recomandată, certificări siguranță" />
                <OptionCard active={niche === 'pet'} onClick={() => setNiche('pet')}
                  icon="🐶" label="Animale de Companie" desc="Mărime animal, rasă, ingrediente (dacă mâncare)" />
                <OptionCard active={niche === 'generic'} onClick={() => setNiche('generic')}
                  icon="🛍️" label="Altele / General" desc="Fără secțiuni specifice de nișă" />
              </div>
            </BlockStack>
          )}

          {step === 4 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Cât de „pushy" să fie pagina?</Text>
                <Text as="p" tone="subdued">Cantitatea de urgență vizuală și presiune.</Text>
              </BlockStack>
              <BlockStack gap="200">
                <OptionCard active={urgencyLevel === 'medie'} onClick={() => setUrgencyLevel('medie')}
                  icon="📦" label="Medie" desc='Banner "stoc limitat" + scarcity ușor. Recomandat.' />
                <OptionCard active={urgencyLevel === 'inalta'} onClick={() => setUrgencyLevel('inalta')}
                  icon="⏰" label="Înaltă" desc='Countdown timer + stock counter + bare urgență. Conversie maximă pe trafic rece.' />
                <OptionCard active={urgencyLevel === 'fara'} onClick={() => setUrgencyLevel('fara')}
                  icon="🌿" label="Fără" desc="Zero presiune, focus pe valoare. Pentru produse premium/luxury." />
              </BlockStack>
              <Divider />
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">Cât de lungă să fie pagina?</Text>
              </BlockStack>
              <BlockStack gap="200">
                <OptionCard active={lengthMode === 'mediu'} onClick={() => setLengthMode('mediu')}
                  icon="📄" label="Mediu (5-7 secțiuni)" desc="Recomandat pentru COD. Echilibru info / conversie." />
                <OptionCard active={lengthMode === 'scurt'} onClick={() => setLengthMode('scurt')}
                  icon="⚡" label="Scurt (3-4 secțiuni)" desc="Pentru ads rapide FB Reels, TikTok. Decizie imediată." />
                <OptionCard active={lengthMode === 'lung'} onClick={() => setLengthMode('lung')}
                  icon="📚" label="Lung (8-10 secțiuni)" desc="Pentru trafic SEO/email cald. Mai mult timp pe pagină." />
              </BlockStack>
            </BlockStack>
          )}

          {step === 5 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Tratăm obiecțiile cumpărătorilor?</Text>
                <Text as="p" tone="subdued">Secțiune cu "Răspundem îngrijorărilor tale" — crește conversia cu 10-15%.</Text>
              </BlockStack>
              <BlockStack gap="200">
                <OptionCard active={includeObjections === true} onClick={() => setIncludeObjections(true)}
                  icon="✅" label="Da, include obiecții" desc='AI generează 4 rebuttals la "e scump", "nu funcționează", "am alt produs", "e fragil". Recomandat.' />
                <OptionCard active={includeObjections === false} onClick={() => setIncludeObjections(false)}
                  icon="✗" label="Nu, sări peste" desc="LP mai scurt fără secțiunea de obiecții." />
              </BlockStack>
            </BlockStack>
          )}

          {step === 6 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Adăugăm un popup pe pagină?</Text>
                <Text as="p" tone="subdued">Popup-ul apare la exit-intent sau după 30 secunde, cu un obiectiv clar. Crește conversia cu 5-15%.</Text>
              </BlockStack>
              <BlockStack gap="200">
                <OptionCard active={popupEnabled === false} onClick={() => setPopupEnabled(false)}
                  icon="✗" label="Fără popup" desc="Pagina rămâne simplă, fără popup. Recomandat dacă vrei minimalism." />
                <OptionCard active={popupEnabled === true} onClick={() => setPopupEnabled(true)}
                  icon="✅" label="Da, adaugă popup" desc="Popup la exit-intent + after delay. Alege obiectivul mai jos." />
              </BlockStack>
              {popupEnabled && (
                <>
                  <Divider />
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Ce obiectiv are popup-ul?</Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <OptionCard active={popupGoal === 'discount'} onClick={() => setPopupGoal('discount')}
                      icon="🎁" label="Oferă reducere" desc='Popup cu cod de reducere (poți edita codul și procentul). Recomandat pentru produse cu margin bun.' />
                    <OptionCard active={popupGoal === 'order'} onClick={() => setPopupGoal('order')}
                      icon="🛒" label="Forțează formularul de comandă" desc="Popup care duce direct la butonul COD. La click pe CTA, popup-ul se închide automat și rămâne formularul." />
                  </BlockStack>
                </>
              )}
            </BlockStack>
          )}

          {step === 7 && (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">{includeObjections ? 'Obiecții specifice (opțional)' : 'Aproape gata!'}</Text>
                <Text as="p" tone="subdued">
                  {includeObjections
                    ? 'Dacă ai obiecții SPECIFICE pe care le auzi des de la clienți, scrie-le aici — una pe linie. AI-ul le va trata pe pagină. Lasă gol să folosească obiecțiile standard.'
                    : 'Treci direct la generare. Ai bifat să nu includem secțiunea de obiecții.'
                  }
                </Text>
              </BlockStack>
              {includeObjections && (
                <TextField
                  label=""
                  value={customObjections}
                  onChange={setCustomObjections}
                  placeholder={'Ex (una pe linie):\nE prea scump pentru un simplu produs\nAm încercat altele similare și nu au funcționat\nMi-e teamă că se sparge după 2 utilizări\nNu pot să-l returnez dacă nu-mi place'}
                  multiline={6}
                  autoComplete="off"
                  helpText="Lasă gol pentru obiecțiile standard COD (preț, funcționare, alternative, fragilitate)."
                />
              )}
              <Box paddingBlockStart="200">
                <Banner tone="info">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Recapitulare comandă AI:</Text>
                    <Text as="p" variant="bodySm">• <strong>Ton:</strong> {tone} · <strong>Urgență:</strong> {urgencyLevel} · <strong>Lungime:</strong> {lengthMode}</Text>
                    <Text as="p" variant="bodySm">• <strong>Nișă:</strong> {({fashion: 'Fashion', electronics: 'Electronics', beauty: 'Beauty', auto: 'Auto', health: 'Sănătate', home: 'Casă', sports: 'Sport', baby: 'Copii', pet: 'Animale', generic: 'General'}[niche] || niche)}</Text>
                    <Text as="p" variant="bodySm">• <strong>Obiecții tratate:</strong> {includeObjections ? (customObjections.trim() ? 'Custom (' + customObjections.split('\n').filter(s => s.trim()).length + ')' : 'Standard') : 'Nu'}</Text>
                    <Text as="p" variant="bodySm">• <strong>Popup:</strong> {popupEnabled ? ({discount: 'Reducere', order: 'Forțare comandă'}[popupGoal] || popupGoal) : 'Nu'}</Text>
                    <Text as="p" variant="bodySm">• <strong>Profil cumpărător:</strong> {salesAngle.trim() ? salesAngle.slice(0, 80) + (salesAngle.length > 80 ? '...' : '') : '(nedefinit — AI va folosi default)'}</Text>
                  </BlockStack>
                </Banner>
              </Box>
            </BlockStack>
          )}
        </div>

        {error && <div style={{ marginTop: 16 }}><Banner tone="critical">{error}</Banner></div>}

        {/* Navigation footer */}
        <div style={{
          marginTop: 28,
          paddingTop: 18,
          borderTop: '1px solid #e1e3e5',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <Button onClick={goBack} disabled={step === 0}>
            ← Înapoi
          </Button>
          {isLastStep() ? (
            <Button
              variant="primary"
              size="large"
              icon={MagicIcon}
              onClick={generate}
              disabled={!aliUrl.trim() && !competitorUrl.trim() && !productImage}
            >
              Generează pagina ta
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              onClick={goNext}
              disabled={!canAdvance()}
            >
              Următorul →
            </Button>
          )}
        </div>
      </Card>
    </Page>
  )
}
