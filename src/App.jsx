import { useState, useEffect } from 'react'
import { AppProvider, Page, Card, TextField, Button, Banner, BlockStack, InlineStack, Text, List, Spinner } from '@shopify/polaris'
import enTranslations from '@shopify/polaris/locales/en.json'
import Generator from './components/Generator.jsx'
import Editor from './components/Editor.jsx'
import Dashboard from './components/Dashboard.jsx'
import Setup from './components/Setup.jsx'
import { apiFetch } from './apiFetch.js'

function LoginScreen({ onLogin }) {
  const [shopVal, setShopVal] = useState('')
  const [tokenVal, setTokenVal] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    let s = shopVal.trim()
    const t = tokenVal.trim()
    if (!s || !t) { setErr('Completează ambele câmpuri.'); return }
    if (!s.includes('.myshopify.com')) s += '.myshopify.com'
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', shop: s, token: t })
      })
      const data = await r.json()
      if (!r.ok || data.error) { setErr('Token sau shop invalid. Verifică și încearcă din nou.'); setLoading(false); return }
      localStorage.setItem('unitone_shop', s)
      localStorage.setItem('unitone_token_' + s, t)
      onLogin(s, t)
    } catch {
      setErr('Eroare de conexiune. Încearcă din nou.')
      setLoading(false)
    }
  }

  return (
    <Page narrowWidth>
      <BlockStack gap="600">
        <BlockStack gap="200" align="center" inlineAlign="center">
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #5C6AC4, #9C6ADE)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 24, fontStyle: 'italic' }}>U</div>
          <Text as="h1" variant="heading2xl">UnitOne Romania</Text>
          <Text as="p" tone="subdued">Conectează-te cu magazinul tău Shopify</Text>
        </BlockStack>

        <Card>
          <BlockStack gap="400">
            <TextField
              label="Magazin Shopify"
              value={shopVal}
              onChange={setShopVal}
              placeholder="magazinul-tau.myshopify.com"
              autoComplete="off"
            />
            <TextField
              label="Admin API Access Token"
              value={tokenVal}
              onChange={setTokenVal}
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
              type="password"
              autoComplete="off"
            />
            {err && <Banner tone="critical">{err}</Banner>}
            <Button variant="primary" size="large" loading={loading} onClick={handleLogin} fullWidth>
              Conectează
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Cum obții token-ul</Text>
            <List type="number">
              <List.Item>Shopify Admin → Settings → Apps and sales channels</List.Item>
              <List.Item>Develop apps → Create an app → Nume: UnitOne</List.Item>
              <List.Item>Configuration → API scopes: write_products, read_products, write_themes, read_themes</List.Item>
              <List.Item>Save → Install app → Install</List.Item>
              <List.Item>Copiază Admin API access token (apare o singură dată!)</List.Item>
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  )
}

function AppShell() {
  const [screen, setScreen] = useState('loading')
  const [codFormApp, setCodFormApp] = useState(null)
  const [generatedData, setGeneratedData] = useState(null)
  const [editingPage, setEditingPage] = useState(null)
  const [shop, setShop] = useState('')
  const [token, setToken] = useState('')
  const [plan, setPlan] = useState('free')
  const [planLimit, setPlanLimit] = useState(3)
  const [publishLimit, setPublishLimit] = useState(1)
  const [dashboardSection, setDashboardSection] = useState('home')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('shop')
    const host = params.get('host')
    const chargeId = params.get('charge_id')

    if (s && host) {
      // Embedded mode: App Bridge handles auth via session tokens (loaded in main.jsx).
      if (chargeId) {
        apiFetch('/api/billing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activate_charge', shop: s, chargeId })
        }).then(r => r.json()).then(bd => {
          if (bd.plan) { setPlan(bd.plan); setPlanLimit(bd.limit); setPublishLimit(bd.publishLimit ?? 1) }
        }).catch(e => console.log('Activate charge error:', e.message))
      }
      initApp(s, '')
      return
    }

    if (s) {
      // Non-embedded with shop: try stored token, fall back to OAuth
      fetch('/api/get-token?shop=' + encodeURIComponent(s))
        .then(r => r.json())
        .then(data => {
          const tok = data.token || localStorage.getItem('unitone_token_' + s)
          if (tok) {
            if (data.token) localStorage.setItem('unitone_token_' + s, data.token)
            initApp(s, tok)
          } else {
            window.location.href = '/api/auth?shop=' + s
          }
        })
        .catch(() => { window.location.href = '/api/auth?shop=' + s })
      return
    }

    const savedShop = localStorage.getItem('unitone_shop')
    if (savedShop) {
      const savedToken = localStorage.getItem('unitone_token_' + savedShop)
      if (savedToken) { initApp(savedShop, savedToken); return }
    }

    setScreen('login')
  }, [])

  async function initApp(s, t) {
    setShop(s); setToken(t)
    fetch('/api/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reinstall', shop: s, token: t }) }).catch(() => {})
    try {
      const r = await fetch('/api/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_status', shop: s, token: t })
      })
      const bd = await r.json()
      setPlan(bd.plan || 'free')
      setPlanLimit(bd.limit || 3)
      setPublishLimit(bd.publishLimit ?? 1)
    } catch { setPlan('free'); setPlanLimit(3); setPublishLimit(1) }
    const saved = localStorage.getItem('codform_' + s)
    setCodFormApp(saved || null)
    setScreen(saved ? 'dashboard' : 'setup')
  }

  function gotoPricing() {
    setDashboardSection('pricing')
    setGeneratedData(null); setEditingPage(null)
    setScreen('dashboard')
  }

  if (screen === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner accessibilityLabel="Se încarcă" size="large" />
    </div>
  )

  if (screen === 'login') return <LoginScreen onLogin={(s, t) => initApp(s, t)} />

  if (screen === 'setup') return (
    <Setup shop={shop} onComplete={(app) => { setCodFormApp(app); setScreen('dashboard') }} isReconfigure={codFormApp !== null} />
  )

  if (screen === 'dashboard') return (
    <Dashboard shop={shop} token={token}
      plan={plan} planLimit={planLimit} publishLimit={publishLimit}
      initialSection={dashboardSection}
      onPlanChange={(p, l, pl) => { setPlan(p); setPlanLimit(l); if (pl !== undefined) setPublishLimit(pl) }}
      onNew={() => setScreen('generator')}
      onEdit={(pageData) => { setEditingPage(pageData); setScreen('editor') }}
      onReconfigure={() => setScreen('setup')}
      onUseTemplate={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
    />
  )

  if (screen === 'generator') return (
    <Generator shop={shop} token={token}
      onGenerated={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
      onBack={() => setScreen('dashboard')}
    />
  )

  if (screen === 'editor' && (generatedData || editingPage)) return (
    <Editor
      data={editingPage || generatedData}
      shop={shop}
      token={token}
      codFormApp={codFormApp}
      planLimit={planLimit}
      onBack={() => { setGeneratedData(null); setEditingPage(null); setScreen('dashboard') }}
      onPublished={() => { setGeneratedData(null); setEditingPage(null); setScreen('dashboard') }}
      onUpgrade={gotoPricing}
    />
  )

  return null
}

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <AppShell />
    </AppProvider>
  )
}
