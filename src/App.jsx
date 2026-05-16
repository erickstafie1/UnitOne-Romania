import { useState, useEffect } from 'react'
import { AppProvider, Page, Card, BlockStack, Text, Spinner } from '@shopify/polaris'
import { NavMenu } from '@shopify/app-bridge-react'
import enTranslations from '@shopify/polaris/locales/en.json'
import Generator from './components/Generator.jsx'
import Editor from './components/Editor.jsx'
import Dashboard from './components/Dashboard.jsx'
import { apiFetch } from './apiFetch.js'

const PATH_TO_SECTION = {
  '/': 'home',
  '/pages': 'pages',
  '/templates': 'templates',
  '/pricing': 'pricing',
  '/contact': 'contact',
  '/bug': 'bug'
}

function readPathRoute() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (PATH_TO_SECTION[path]) return { kind: 'section', value: PATH_TO_SECTION[path] }
  if (path === '/new') return { kind: 'screen', value: 'generator' }
  return null
}

function NotEmbeddedScreen() {
  return (
    <Page narrowWidth>
      <Card>
        <BlockStack gap="300" inlineAlign="center">
          <Text as="h1" variant="headingLg">UnitOne Romania</Text>
          <Text as="p" tone="subdued" alignment="center">
            Această aplicație rulează doar în interiorul Shopify Admin.
            Deschide-o din magazinul tău: Settings → Apps → UnitOne Romania.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  )
}

function AppShell() {
  const [screen, setScreen] = useState('loading')
  const [generatedData, setGeneratedData] = useState(null)
  const [editingPage, setEditingPage] = useState(null)
  const [shop, setShop] = useState('')
  const [plan, setPlan] = useState('free')
  const [planLimit, setPlanLimit] = useState(3)
  const [publishLimit, setPublishLimit] = useState(1)
  const [dashboardSection, setDashboardSection] = useState('home')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('shop')
    const host = params.get('host')
    const chargeId = params.get('charge_id')

    if (!s || !host) {
      setScreen('not-embedded')
      return
    }

    const initial = readPathRoute()
    if (initial?.kind === 'section') setDashboardSection(initial.value)

    if (chargeId) {
      apiFetch('/api/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate_charge', shop: s, chargeId })
      }).then(r => r.json()).then(bd => {
        if (bd.plan) { setPlan(bd.plan); setPlanLimit(bd.limit); setPublishLimit(bd.publishLimit ?? 1) }
      }).catch(e => console.log('Activate charge error:', e.message))
    }
    initApp(s)
  }, [])

  useEffect(() => {
    function handleNav() {
      const r = readPathRoute()
      if (!r) return
      if (r.kind === 'section') {
        setScreen('dashboard')
        setDashboardSection(r.value)
        setGeneratedData(null)
        setEditingPage(null)
      } else if (r.kind === 'screen') {
        setScreen(r.value)
      }
    }
    window.addEventListener('popstate', handleNav)
    return () => window.removeEventListener('popstate', handleNav)
  }, [])

  async function initApp(s) {
    setShop(s)
    // Surface install failures to console so we know when theme template push
    // fails — silent failure here was making LPs render with the merchant's
    // default theme.liquid instead of our pagecod/pagecodfull layouts.
    apiFetch('/api/pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reinstall', shop: s })
    }).then(r => r.json()).then(data => {
      if (data && data.success) {
        console.log('[UnitOne] Templates installed in theme:', data.themeName, '(id ' + data.themeId + ')', 'keys:', data.installed)
      } else {
        console.error('[UnitOne] Template install FAILED:', data)
      }
    }).catch(e => console.error('[UnitOne] Template install request errored:', e.message))
    try {
      const r = await apiFetch('/api/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_status', shop: s })
      })
      const bd = await r.json()
      setPlan(bd.plan || 'free')
      setPlanLimit(bd.limit || 3)
      setPublishLimit(bd.publishLimit ?? 1)
    } catch { setPlan('free'); setPlanLimit(3); setPublishLimit(1) }
    setScreen('dashboard')
  }

  function gotoSection(section) {
    const path = section === 'home' ? '/' : '/' + section
    window.history.pushState({}, '', path + window.location.search)
    setDashboardSection(section)
    setGeneratedData(null); setEditingPage(null)
    setScreen('dashboard')
  }

  const showNav = screen !== 'loading' && screen !== 'not-embedded'

  function renderScreen() {
    if (screen === 'loading') return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner accessibilityLabel="Se încarcă" size="large" />
      </div>
    )
    if (screen === 'not-embedded') return <NotEmbeddedScreen />
    if (screen === 'dashboard') return (
      <Dashboard shop={shop}
        plan={plan} planLimit={planLimit} publishLimit={publishLimit}
        section={dashboardSection}
        onSectionChange={(s) => setDashboardSection(s)}
        onPlanChange={(p, l, pl) => { setPlan(p); setPlanLimit(l); if (pl !== undefined) setPublishLimit(pl) }}
        onNew={() => setScreen('generator')}
        onEdit={(pageData) => { setEditingPage(pageData); setScreen('editor') }}
        onUseTemplate={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
      />
    )
    if (screen === 'generator') return (
      <Generator
        onGenerated={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
        onBack={() => setScreen('dashboard')}
      />
    )
    if (screen === 'editor' && (generatedData || editingPage)) return (
      <Editor
        data={editingPage || generatedData}
        shop={shop}
        planLimit={planLimit}
        onBack={() => { setGeneratedData(null); setEditingPage(null); setScreen('dashboard') }}
        onPublished={() => { setGeneratedData(null); setEditingPage(null); setScreen('dashboard') }}
        onUpgrade={() => gotoSection('pricing')}
      />
    )
    return null
  }

  return (
    <>
      {showNav && (
        <NavMenu>
          <a href="/" rel="home">Acasă</a>
          <a href="/pages">Pagini</a>
          <a href="/templates">Template-uri</a>
          <a href="/pricing">Prețuri</a>
          <a href="/contact">Contact</a>
          <a href="/bug">Raportează bug</a>
        </NavMenu>
      )}
      {renderScreen()}
    </>
  )
}

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <AppShell />
    </AppProvider>
  )
}
