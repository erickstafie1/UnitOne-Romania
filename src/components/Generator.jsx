import { useState } from 'react'

const STEPS = [
  [10, '🔍 Accesez pagina AliExpress...'],
  [30, '🖼️ Extrag pozele produsului...'],
  [55, '✍️ Generez copywriting în română...'],
  [75, '🎨 Generez imagini AI...'],
  [90, '📦 Construiesc pagina COD...'],
  [98, '✅ Finalizez...'],
]

export default function Generator({ shop, onGenerated }) {
  const [aliUrl, setAliUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')

  async function generate() {
    if (!aliUrl.trim()) return
    setLoading(true)
    setError('')
    setLoadPct(5)
    setLoadMsg(STEPS[0][1])

    let si = 0
    const tid = setInterval(() => {
      si = Math.min(si + 1, STEPS.length - 1)
      setLoadMsg(STEPS[si][1])
      setLoadPct(STEPS[si][0])
    }, 3000)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliUrl: aliUrl.trim(), styleDesc: styleDesc.trim(), shop })
      })
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare necunoscută')
      setLoadPct(100)
      setTimeout(() => onGenerated(json.data), 400)
    } catch (e) {
      setError(e.message)
    } finally {
      clearInterval(tid)
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f', fontFamily:'Inter,system-ui,sans-serif', color:'#fff' }}>
      <div style={{ textAlign:'center', maxWidth:440, padding:24 }}>
        <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,#e53e3e,#c53030)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 24px' }}>🤖</div>
        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>Se generează pagina ta...</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, marginBottom:32 }}>{loadMsg}</p>
        <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:100, height:10, overflow:'hidden' }}>
          <div style={{ height:'100%', background:'linear-gradient(90deg,#e53e3e,#f87171)', borderRadius:100, width:`${loadPct}%`, transition:'width 0.8s ease' }} />
        </div>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginTop:10 }}>{loadPct}%</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', fontFamily:'Inter,system-ui,sans-serif', color:'#fff' }}>
      {/* Header */}
      <div style={{ padding:'20px 32px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#e53e3e,#c53030)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🛒</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800 }}>UnitOne Romania</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{shop}</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:600, margin:'0 auto', padding:'48px 24px' }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <h1 style={{ fontSize:32, fontWeight:900, marginBottom:12, letterSpacing:-1 }}>Generează pagină COD</h1>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:16, lineHeight:1.6 }}>
            Pune linkul AliExpress și descrie stilul dorit — AI-ul generează tot în română.
          </p>
        </div>

        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:28, display:'flex', flexDirection:'column', gap:20 }}>
          {/* AliExpress URL */}
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>
              Link produs AliExpress *
            </label>
            <input
              value={aliUrl}
              onChange={e => setAliUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aliUrl.trim() && generate()}
              placeholder="https://www.aliexpress.com/item/..."
              style={{ width:'100%', padding:'13px 16px', borderRadius:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:15, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
            />
          </div>

          {/* Style description */}
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>
              Descrie stilul paginii (opțional)
            </label>
            <textarea
              value={styleDesc}
              onChange={e => setStyleDesc(e.target.value)}
              rows={4}
              placeholder="Ex: Vreau pagina în negru și auriu, pentru femei 25-45 ani, ton elegant și exclusivist, accent pe imagini mari și text puțin..."
              style={{ width:'100%', padding:'13px 16px', borderRadius:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.6, boxSizing:'border-box' }}
            />
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:8 }}>
              Dacă lași gol, AI-ul alege un stil optimizat pentru conversii COD.
            </p>
          </div>

          {error && (
            <div style={{ padding:'12px 16px', background:'rgba(229,62,62,0.12)', border:'1px solid rgba(229,62,62,0.3)', borderRadius:10, fontSize:14, color:'#fc8181' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={!aliUrl.trim()}
            style={{ padding:16, borderRadius:12, background: aliUrl.trim() ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', fontSize:16, fontWeight:800, cursor: aliUrl.trim() ? 'pointer' : 'not-allowed', boxShadow: aliUrl.trim() ? '0 4px 16px rgba(229,62,62,0.35)' : 'none', opacity: aliUrl.trim() ? 1 : 0.5 }}
          >
            Generează pagina → (40 RON)
          </button>

          <p style={{ fontSize:12, color:'rgba(255,255,255,0.25)', textAlign:'center' }}>
            Plata de 40 RON se face prin Shopify după ce editezi și publici pagina.
          </p>
        </div>

        {/* Features */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:24 }}>
          {[
            ['🖼️', 'Poze reale AliExpress', 'Extrase automat din link'],
            ['🤖', '4 imagini generate AI', 'Studio, lifestyle, detaliu, social'],
            ['✍️', 'Copy în română', 'Titlu, beneficii, testimoniale, FAQ'],
            ['✏️', 'Editor drag & drop', 'Modifici orice element vizual'],
          ].map(([ic, t, d]) => (
            <div key={t} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:16 }}>
              <div style={{ fontSize:24, marginBottom:8 }}>{ic}</div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{t}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', lineHeight:1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
