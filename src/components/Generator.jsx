import { useState, useRef } from 'react'
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, ProgressBar, Box, ChoiceList, Select, Checkbox, Divider } from '@shopify/polaris'
import { ArrowLeftIcon, ChevronRightIcon, MagicIcon, WandIcon } from '@shopify/polaris-icons'

const STEPS = [
  { pct: 12, msg: 'Conectare la AliExpress', delay: 700 },
  { pct: 28, msg: 'Extragere imagini produs', delay: 900 },
  { pct: 46, msg: 'Generare copywriting în română', delay: 1100 },
  { pct: 62, msg: 'Imagini AI · Studio', delay: 1100 },
  { pct: 78, msg: 'Imagini AI · Lifestyle', delay: 1200 },
  { pct: 86, msg: 'Imagini AI · Detaliu', delay: 6500 },
  { pct: 92, msg: 'Imagini AI · Social proof', delay: 8500 },
  { pct: 97, msg: 'Finalizare pagină', delay: 14000 },
]

export default function Generator({ onGenerated, onBack, presetStyle }) {
  const [aliUrl, setAliUrl] = useState('')
  const [competitorUrl, setCompetitorUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  // Personalizare AI — fiecare camp influenteaza prompt-ul Claude direct
  const [tone, setTone] = useState('direct')              // agresiv | direct | casual | profesional
  const [salesAngle, setSalesAngle] = useState('practic') // frica | dorinta | economie | practic
  const [urgencyLevel, setUrgencyLevel] = useState('medie') // inalta | medie | fara
  const [lengthMode, setLengthMode] = useState('mediu')   // scurt | mediu | lung
  const [includeObjections, setIncludeObjections] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceMsg, setEnhanceMsg] = useState('')
  const cancelRef = useRef(false)

  // AI Enhance — ia textul vag al user-ului si returneaza un brief polished
  // pe care Claude principal il poate folosi sa genereze copy mult mai bun.
  async function enhancePrompt() {
    const txt = styleDesc.trim()
    if (!txt) return
    setEnhancing(true); setEnhanceMsg(''); setError('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enhance_prompt',
          text: txt,
          productContext: aliUrl.trim() ? `Link AliExpress: ${aliUrl.trim()}` : ''
        })
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Eroare AI')
      if (json.enhanced) {
        setStyleDesc(json.enhanced)
        setEnhanceMsg('✓ Descrierea a fost îmbunătățită — poți edita mai departe sau apăsa Generează')
      }
    } catch (e) {
      setError('AI Enhance: ' + e.message)
    } finally {
      setEnhancing(false)
    }
  }

  async function generate() {
    if (!aliUrl.trim()) return
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
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aliUrl: aliUrl.trim(),
          competitorUrl: competitorUrl.trim() || null,
          styleDesc: styleDesc.trim(),
          presetStyle: presetStyle?.style || null,
          // Personalizare AI — toate ajung in prompt-ul Claude
          tone, salesAngle, urgencyLevel, lengthMode,
          includeObjections
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
                Imaginile AI durează ~1 minut · Calitate maximă
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

  return (
    <Page
      title="Generator AI"
      subtitle="Generează automat o landing page COD personalizată — răspunde la câteva întrebări pentru ca AI-ul să o facă perfect pentru produsul și audiența ta."
      backAction={{ content: 'Înapoi', onAction: onBack }}
    >
      <Card>
        <BlockStack gap="500">
          {presetStyle && (
            <Banner tone="info">
              Stil pre-selectat: <strong>{presetStyle.templateName}</strong>. AI-ul va genera conținutul pentru produsul tău folosind paleta și layout-ul acestui stil.
            </Banner>
          )}

          {/* ─── SECȚIUNEA 1: Sursele (link AliExpress + competitor opțional) ─── */}
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">1. De unde luăm produsul</Text>
            <TextField
              label="Link AliExpress"
              value={aliUrl}
              onChange={setAliUrl}
              placeholder="https://www.aliexpress.com/item/..."
              type="url"
              autoComplete="off"
              helpText="Sursa principală: nume, preț, poze produs."
            />
            <TextField
              label="Link competitor (opțional)"
              value={competitorUrl}
              onChange={setCompetitorUrl}
              placeholder="https://magazin-concurent.ro/products/..."
              type="url"
              autoComplete="off"
              helpText="Dă-ne un link de la un competitor cu LP bun → AI-ul învață stilul și unghiul de vânzare ca să te bată pe terenul lor."
            />
          </BlockStack>

          <Divider />

          {/* ─── SECȚIUNEA 2: Personalizare AI ─── */}
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">2. Cum vrei să sune pagina</Text>

            <Select
              label="Ton copy"
              options={[
                { label: 'Direct (clar, fără ocoluri) — recomandat', value: 'direct' },
                { label: 'Agresiv (urgență mare, pression sales)', value: 'agresiv' },
                { label: 'Casual (prietenos, ca un sfat de la prieten)', value: 'casual' },
                { label: 'Profesional (autoritate, încredere, formal)', value: 'profesional' },
                { label: 'Emoțional (storytelling, accent pe sentiment)', value: 'emotional' }
              ]}
              value={tone}
              onChange={setTone}
            />

            <Select
              label="Unghi principal de vânzare"
              options={[
                { label: 'Soluție practică — "Rezolvă X problemă"', value: 'practic' },
                { label: 'Frică / Urgență — "Nu pierde ocazia"', value: 'frica' },
                { label: 'Dorință / Aspirație — "Devino mai bun"', value: 'dorinta' },
                { label: 'Economie / Valoare — "Cea mai bună ofertă"', value: 'economie' }
              ]}
              value={salesAngle}
              onChange={setSalesAngle}
            />

            <Select
              label="Nivel urgență vizuală"
              options={[
                { label: 'Medie — banner "stoc limitat" + scarcity ușor', value: 'medie' },
                { label: 'Înaltă — countdown timer + stock counter + urgency bars', value: 'inalta' },
                { label: 'Fără — fără presiune, focus pe valoare', value: 'fara' }
              ]}
              value={urgencyLevel}
              onChange={setUrgencyLevel}
              helpText='Cât de „pushy" să fie LP-ul.'
            />

            <Select
              label="Lungime conținut"
              options={[
                { label: 'Mediu (5-7 secțiuni) — recomandat pentru COD', value: 'mediu' },
                { label: 'Scurt (3-4 secțiuni) — pentru ad-uri rapide, FB Reels', value: 'scurt' },
                { label: 'Lung (8-10 secțiuni) — pentru SEO/email traffic cald', value: 'lung' }
              ]}
              value={lengthMode}
              onChange={setLengthMode}
            />

            <Checkbox
              label="Include secțiune Obiecții Tratate"
              checked={includeObjections}
              onChange={setIncludeObjections}
              helpText='AI generează rebuttals la obiecții comune ("e prea scump", "nu funcționează", "deja am alt produs", "e fragil") — crește conversia cu 10-15%.'
            />
          </BlockStack>

          <Divider />

          {/* ─── SECȚIUNEA 3: Audiența țintă (opțional) ─── */}
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">3. Audiență țintă (opțional)</Text>
            <TextField
              label="Detalii audiență"
              helpText='Cine cumpără produsul? Vârstă, sex, situație de viață, durere specifică. Apasă „Îmbunătățește cu AI" să extindem contextul.'
              value={styleDesc}
              onChange={setStyleDesc}
              placeholder="Ex: pentru mame cu copii 1-3 ani, durere = mizeria de pe haine la masă"
              multiline={3}
              autoComplete="off"
              disabled={enhancing}
            />
            <InlineStack align="end">
              <Button
                icon={WandIcon}
                onClick={enhancePrompt}
                loading={enhancing}
                disabled={!styleDesc.trim() || enhancing}
                size="slim"
              >
                {enhancing ? 'Îmbunătățesc...' : 'Îmbunătățește cu AI'}
              </Button>
            </InlineStack>
          </BlockStack>

          {enhanceMsg && <Banner tone="success">{enhanceMsg}</Banner>}
          {error && <Banner tone="critical">{error}</Banner>}

          <Button
            variant="primary"
            size="large"
            icon={MagicIcon}
            onClick={generate}
            disabled={!aliUrl.trim()}
            fullWidth
          >
            Generează pagina
          </Button>

          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            ≈ 1 minut de procesare
          </Text>
        </BlockStack>
      </Card>
    </Page>
  )
}
