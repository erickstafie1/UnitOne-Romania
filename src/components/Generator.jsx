import { useState, useRef } from 'react'
import { Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, ProgressBar, Box } from '@shopify/polaris'
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

export default function Generator({ onGenerated, onBack }) {
  const [aliUrl, setAliUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
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
        body: JSON.stringify({ aliUrl: aliUrl.trim(), styleDesc: styleDesc.trim() })
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
      narrowWidth
      title="Generator AI"
      subtitle="Generează automat o landing page COD pornind de la un produs AliExpress."
      backAction={{ content: 'Înapoi', onAction: onBack }}
    >
      <Card>
        <BlockStack gap="400">
          <TextField
            label="Link AliExpress"
            value={aliUrl}
            onChange={setAliUrl}
            placeholder="https://www.aliexpress.com/item/..."
            type="url"
            autoComplete="off"
            onKeyDown={e => e.key === 'Enter' && aliUrl.trim() && generate()}
          />

          <TextField
            label="Descriere stil"
            helpText='Opțional — context despre target, ton, paleta de culori. Apasă „Îmbunătățește cu AI” pentru un brief polished.'
            value={styleDesc}
            onChange={setStyleDesc}
            placeholder="Ex: Pagină pentru bărbați 25-45 ani, culori negru și roșu, ton direct, accent pe durabilitate..."
            multiline={3}
            autoComplete="off"
            disabled={enhancing}
          />

          <InlineStack align="end" gap="200">
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
