import { useState } from 'react'
import { Page, Card, Button, BlockStack, InlineStack, Text, Banner, RadioButton, Link, Icon, Box } from '@shopify/polaris'
import { CheckIcon, ChevronRightIcon } from '@shopify/polaris-icons'

export default function Setup({ shop, onComplete, isReconfigure }) {
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState(null)

  function confirm() {
    localStorage.setItem(`codform_${shop}`, selected)
    onComplete(selected)
  }

  const apps = [
    {
      id: 'releasit',
      name: 'Releasit COD Form',
      desc: 'Cel mai popular formular COD pentru Shopify',
      link: 'https://apps.shopify.com/releasit-cod-order-form'
    },
    {
      id: 'easysell',
      name: 'EasySell COD Form',
      desc: 'Simplu și rapid de configurat',
      link: 'https://apps.shopify.com/easy-order-form'
    },
    {
      id: 'none',
      name: 'Formular propriu',
      desc: 'Folosesc formularul COD inclus în LP'
    }
  ]

  const instructions = {
    releasit: {
      steps: [
        { n: 1, title: 'Instalează Releasit', desc: 'Dacă nu ai instalat deja, mergi la link-ul de mai jos și instalează aplicația în magazinul tău Shopify.', link: 'https://apps.shopify.com/releasit-cod-order-form', linkText: 'Instalează Releasit' },
        { n: 2, title: 'Activează GemPages integration', desc: 'În Releasit → Settings → Where to display → activează "GemPages integration" sau "Show on all pages". Aplicația va detecta automat hook-ul din LP-ul tău.' },
        { n: 3, title: 'Gata!', desc: 'Butonul din LP-ul tău va deschide automat formularul Releasit când clientul apasă "Comandă acum". Nu trebuie să faci nimic altceva.' }
      ]
    },
    easysell: {
      steps: [
        { n: 1, title: 'Instalează EasySell', desc: 'Dacă nu ai instalat deja, mergi la link-ul de mai jos și instalează aplicația în magazinul tău Shopify.', link: 'https://apps.shopify.com/easy-order-form', linkText: 'Instalează EasySell' },
        { n: 2, title: 'Activează pe toate paginile', desc: 'În EasySell → Settings → asigură-te că aplicația este activată și funcționează pe paginile magazinului tău.' },
        { n: 3, title: 'Gata!', desc: 'Butonul din LP-ul tău va deschide automat formularul EasySell când clientul apasă "Comandă acum".' }
      ]
    }
  }

  if (step === 1) {
    return (
      <Page
        narrowWidth
        title={isReconfigure ? 'Schimbă formularul COD' : 'Ce formular COD folosești?'}
        subtitle={isReconfigure
          ? 'Alege o altă aplicație de formular COD pentru butoanele din LP-urile tale.'
          : 'Conectează aplicația ta de formular COD ca să apară automat în paginile generate.'}
      >
        <BlockStack gap="400">
          {apps.map(app => (
            <Card key={app.id}>
              <div onClick={() => setSelected(app.id)} style={{ cursor: 'pointer' }}>
                <RadioButton
                  label={
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">{app.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{app.desc}</Text>
                    </BlockStack>
                  }
                  checked={selected === app.id}
                  id={app.id}
                  name="cod-form-app"
                  onChange={() => setSelected(app.id)}
                />
              </div>
            </Card>
          ))}

          <Button
            variant="primary"
            size="large"
            disabled={!selected}
            onClick={() => selected === 'none' ? confirm() : setStep(2)}
            icon={selected && selected !== 'none' ? ChevronRightIcon : undefined}
            fullWidth
          >
            {selected === 'none' ? 'Continuă cu formular propriu' : 'Continuă'}
          </Button>
        </BlockStack>
      </Page>
    )
  }

  if (step === 2 && selected && selected !== 'none') {
    const app = apps.find(a => a.id === selected)
    return (
      <Page
        narrowWidth
        title={`Cum conectezi ${app.name}`}
        subtitle="Urmează pașii de mai jos — durează 2 minute."
        backAction={{ content: 'Înapoi', onAction: () => setStep(1) }}
      >
        <BlockStack gap="400">
          {instructions[selected].steps.map(s => (
            <Card key={s.n}>
              <InlineStack gap="400" wrap={false} blockAlign="start">
                <Box
                  background="bg-fill-brand"
                  padding="200"
                  borderRadius="200"
                  minWidth="36px"
                  minHeight="36px"
                >
                  <InlineStack align="center" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="bold" tone="text-inverse">{s.n}</Text>
                  </InlineStack>
                </Box>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{s.title}</Text>
                  <Text as="p" tone="subdued">{s.desc}</Text>
                  {s.link && (
                    <Box>
                      <Button url={s.link} external variant="secondary" size="slim">
                        {s.linkText}
                      </Button>
                    </Box>
                  )}
                </BlockStack>
              </InlineStack>
            </Card>
          ))}

          <Banner tone="info">
            <Text as="p"><strong>Cum funcționează: </strong>
            Butonul "Comandă acum" din LP-ul generat deschide automat formularul {app.name} cu produsul și prețul pre-completat.</Text>
          </Banner>

          <Button variant="primary" size="large" icon={CheckIcon} onClick={confirm} fullWidth>
            Am configurat — continuă
          </Button>
        </BlockStack>
      </Page>
    )
  }

  return null
}
