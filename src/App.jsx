import { useState, useEffect } from 'react'
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
  const [showToken, setShowToken] = useState(false)

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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--hero-gradient)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg, var(--brand), var(--brand-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px color-mix(in srgb, var(--brand) 35%, transparent)', color: '#fff', fontWeight: 800, fontSize: 24, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>U</div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.03em', marginBottom: 8 }}>UnitOne Romania</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Conectează-te cu magazinul tău Shopify</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Magazin Shopify</label>
            <input
              value={shopVal}
              onChange={e => setShopVal(e.target.value)}
              placeholder="magazinul-tau.myshopify.com"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Admin API Access Token</label>
            <div style={{ position: 'relative' }}>
              <input
                value={tokenVal}
                onChange={e => setTokenVal(e.target.value)}
                placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                type={showToken ? 'text' : 'password'}
                style={{ width: '100%', padding: '12px 42px 12px 14px', borderRadius: 10, background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button onClick={() => setShowToken(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 0 }}>
                {showToken ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        {err && <div style={{ background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>{err}</div>}

        <button onClick={handleLogin} disabled={loading}
          style={{ width: '100%', padding: '13px', borderRadius: 11, background: loading ? 'var(--bg-3)' : 'var(--accent)', color: 'var(--accent-fg)', border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', marginBottom: 20 }}>
          {loading ? 'Se conectează...' : 'Conectează →'}
        </button>

        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Cum obții tokenul</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'Shopify Admin → Settings → Apps and sales channels',
              'Develop apps → Create an app → Nume: UnitOne',
              'Configuration → API scopes: write_products, read_products, write_themes, read_themes',
              'Save → Install app → Install',
              'Copiază Admin API access token (apare o singură dată!)'
            ].map((s, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

export default function App() {
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
    const t = params.get('token')
    const host = params.get('host')
    const chargeId = params.get('charge_id')

    const apiKey = import.meta.env.VITE_SHOPIFY_CLIENT_ID
    if (host && apiKey) {
      if (!document.getElementById('shopify-app-bridge')) {
        const script = document.createElement('script')
        script.id = 'shopify-app-bridge'
        script.src = 'https://cdn.shopify.com/shopifycloud/app-bridge.js'
        script.setAttribute('data-api-key', apiKey)
        script.onload = () => { window.__shopifyHost = true }
        document.head.appendChild(script)
      } else {
        window.__shopifyHost = true
      }
    }

    if (s && chargeId) {
      fetch('/api/get-token?shop=' + encodeURIComponent(s)).then(r => r.json()).then(async d => {
        const tok = d.token || localStorage.getItem('unitone_token_' + s)
        if (!tok) { (window.top || window).location.href = '/api/auth?shop=' + s; return }
        if (d.token) { localStorage.setItem('unitone_shop', s); localStorage.setItem('unitone_token_' + s, tok) }
        try {
          const br = await apiFetch('/api/billing', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'activate_charge', shop: s, token: tok, chargeId })
          })
          const bd = await br.json()
          if (bd.plan) { setPlan(bd.plan); setPlanLimit(bd.limit); setPublishLimit(bd.publishLimit ?? 1) }
        } catch(e) { console.log('Activate charge error:', e.message) }
        initApp(s, tok)
      }).catch(() => { (window.top || window).location.href = '/api/auth?shop=' + s })
      return
    }

    if (s && t) {
      localStorage.setItem('unitone_shop', s)
      localStorage.setItem('unitone_token_' + s, t)
      initApp(s, t)
      return
    }

    if (s) {
      fetch('/api/get-token?shop=' + encodeURIComponent(s))
        .then(r => r.json())
        .then(data => {
          if (data.token) {
            localStorage.setItem('unitone_shop', s)
            localStorage.setItem('unitone_token_' + s, data.token)
            initApp(s, data.token)
          } else {
            const saved = localStorage.getItem('unitone_token_' + s)
            if (saved) { initApp(s, saved); return }
            const authUrl = '/api/auth?shop=' + s
            try { window.top.location.href = authUrl } catch(e) { window.location.href = authUrl }
          }
        })
        .catch(() => {
          const authUrl = '/api/auth?shop=' + s
          try { window.top.location.href = authUrl } catch(e) { window.location.href = authUrl }
        })
      return
    }

    const savedShop = localStorage.getItem('unitone_shop')
    if (savedShop) {
      const savedToken = localStorage.getItem('unitone_token_' + savedShop)
      if (savedToken) {
        initApp(savedShop, savedToken)
        return
      }
    }

    setScreen('login')
  }, [])

  async function initApp(s, t) {
    setShop(s); setToken(t)
    apiFetch('/api/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reinstall', shop: s, token: t }) }).catch(() => {})
    try {
      const r = await apiFetch('/api/billing', {
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid var(--bg-3)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (screen === 'login') return <LoginScreen onLogin={(s, t) => initApp(s, t)} />

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {screen === 'setup' && (
        <Setup shop={shop} onComplete={(app) => { setCodFormApp(app); setScreen('dashboard') }} isReconfigure={codFormApp !== null} />
      )}
      {screen === 'dashboard' && (
        <Dashboard shop={shop} token={token}
          plan={plan} planLimit={planLimit} publishLimit={publishLimit}
          initialSection={dashboardSection}
          onPlanChange={(p, l, pl) => { setPlan(p); setPlanLimit(l); if (pl !== undefined) setPublishLimit(pl) }}
          onNew={() => setScreen('generator')}
          onEdit={(pageData) => { setEditingPage(pageData); setScreen('editor') }}
          onReconfigure={() => setScreen('setup')}
          onUseTemplate={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
        />
      )}
      {screen === 'generator' && (
        <Generator shop={shop} token={token}
          onGenerated={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
          onBack={() => setScreen('dashboard')}
        />
      )}
      {screen === 'editor' && (generatedData || editingPage) && (
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
      )}
    </div>
  )
}
