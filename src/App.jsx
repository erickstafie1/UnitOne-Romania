import { useState, useEffect } from 'react'
import Generator from './components/Generator.jsx'
import Editor from './components/Editor.jsx'
import Dashboard from './components/Dashboard.jsx'
import Setup from './components/Setup.jsx'
import Pricing from './components/Pricing.jsx'
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
    <div style={{ minHeight:'100vh', background:'#0a0b0f', color:'#fff', fontFamily:"'Inter','SF Pro Display',-apple-system,system-ui,sans-serif", display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ position:'fixed', inset:0, background:'radial-gradient(ellipse at top, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:'linear-gradient(135deg,#3b82f6,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 8px 24px rgba(59,130,246,0.35)', fontSize:26 }}>🛒</div>
          <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:-0.8, marginBottom:8 }}>UnitOne Romania</h1>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:14 }}>Conectează-te cu magazinul tău Shopify</p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.6)', display:'block', marginBottom:6 }}>Magazin Shopify</label>
            <input
              value={shopVal}
              onChange={e => setShopVal(e.target.value)}
              placeholder="magazinul-tau.myshopify.com"
              style={{ width:'100%', padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.6)', display:'block', marginBottom:6 }}>Admin API Access Token</label>
            <div style={{ position:'relative' }}>
              <input
                value={tokenVal}
                onChange={e => setTokenVal(e.target.value)}
                placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                type={showToken ? 'text' : 'password'}
                style={{ width:'100%', padding:'12px 42px 12px 14px', borderRadius:10, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button onClick={() => setShowToken(v => !v)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:16, padding:0 }}>
                {showToken ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        {err && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#f87171', marginBottom:14 }}>{err}</div>}

        <button onClick={handleLogin} disabled={loading}
          style={{ width:'100%', padding:'13px', borderRadius:11, background: loading ? 'rgba(59,130,246,0.4)' : 'linear-gradient(135deg,#3b82f6,#2563eb)', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:'inherit', letterSpacing:-0.2, boxShadow:'0 4px 14px rgba(59,130,246,0.3)', marginBottom:20 }}>
          {loading ? 'Se conectează...' : 'Conectează →'}
        </button>

        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'16px 18px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.7)', marginBottom:10 }}>Cum obții tokenul:</div>
          <ol style={{ margin:0, paddingLeft:18, display:'flex', flexDirection:'column', gap:6 }}>
            {[
              'Shopify Admin → Settings → Apps and sales channels',
              'Develop apps → Create an app → Nume: UnitOne',
              'Configuration → API scopes: write_products, read_products, write_themes, read_themes',
              'Save → Install app → Install',
              'Copiază Admin API access token (apare o singură dată!)'
            ].map((s, i) => (
              <li key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.5 }}>{s}</li>
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('shop')
    const t = params.get('token')
    const host = params.get('host')
    const chargeId = params.get('charge_id')

    // Injecteaza App Bridge CDN cand e deschis din Shopify Admin
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

    // Billing callback - activeaza charge dupa aprobare Shopify
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
          if (bd.plan) { setPlan(bd.plan); setPlanLimit(bd.limit) }
        } catch(e) { console.log('Activate charge error:', e.message) }
        initApp(s, tok)
      }).catch(() => { (window.top || window).location.href = '/api/auth?shop=' + s })
      return
    }

    // OAuth callback legacy - token in URL (backwards compat)
    if (s && t) {
      localStorage.setItem('unitone_shop', s)
      localStorage.setItem('unitone_token_' + s, t)
      initApp(s, t)
      return
    }

    // Shop in URL - incearca cookie persistent, apoi localStorage, apoi re-auth
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

    // Credentials salvate din sesiune anterioara
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
    } catch { setPlan('free'); setPlanLimit(3) }
    const saved = localStorage.getItem('codform_' + s)
    setCodFormApp(saved || null)
    setScreen(saved ? 'dashboard' : 'setup')
  }

  function handleLogout() {
    const s = shop
    localStorage.removeItem('unitone_shop')
    if (s) localStorage.removeItem('unitone_token_' + s)
    setShop(''); setToken(''); setScreen('login')
  }

  if (screen === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f' }}>
      <div style={{ width:36, height:36, border:'3px solid #3b82f6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (screen === 'login') return <LoginScreen onLogin={(s, t) => initApp(s, t)} />

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f' }}>
      {screen === 'setup' && (
        <Setup shop={shop} onComplete={(app) => { setCodFormApp(app); setScreen('dashboard') }} isReconfigure={codFormApp !== null} />
      )}
      {screen === 'pricing' && (
        <Pricing currentPlan={plan} shop={shop} token={token} onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'dashboard' && (
        <Dashboard shop={shop} token={token}
          plan={plan} planLimit={planLimit}
          onNew={() => setScreen('generator')}
          onEdit={(pageData) => { setEditingPage(pageData); setScreen('editor') }}
          onReconfigure={() => setScreen('setup')}
          onLogout={handleLogout}
          onUpgrade={() => setScreen('pricing')}
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
          onUpgrade={() => { setGeneratedData(null); setEditingPage(null); setScreen('pricing') }}
        />
      )}
    </div>
  )
}
