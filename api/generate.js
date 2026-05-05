import { useState } from 'react'

const STEPS_PAGE = [
  [10, '🔍 Accesez pagina AliExpress...'],
  [40, '🖼️ Extrag pozele produsului...'],
  [70, '✍️ Generez copywriting în română...'],
  [90, '📦 Construiesc pagina COD...'],
  [100, '✅ Pagina gata!'],
]

const STEPS_IMAGES = [
  [10, '🎨 Pornesc generarea imaginilor AI...'],
  [30, '📸 Generez poza 1 — Studio photography...'],
  [50, '🏠 Generez poza 2 — Lifestyle...'],
  [70, '🔍 Generez poza 3 — Close-up detaliu...'],
  [90, '😊 Generez poza 4 — Client fericit...'],
  [100, '✅ Imagini gata!'],
]

export default function Generator({ shop, token, onGenerated }) {
  const [aliUrl, setAliUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [phase, setPhase] = useState('idle') // idle | generating-page | generating-images | done
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')

  async function generate() {
    if (!aliUrl.trim()) return
    setError('')

    // FAZA 1: Genereaza pagina (rapid ~10s)
    setPhase('generating-page')
    setLoadPct(5)
    setLoadMsg(STEPS_PAGE[0][1])

    let si = 0
    const tid1 = setInterval(() => {
      si = Math.min(si + 1, STEPS_PAGE.length - 2)
      setLoadMsg(STEPS_PAGE[si][1])
      setLoadPct(STEPS_PAGE[si][0])
    }, 2000)

    let pageData = null
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliUrl: aliUrl.trim(), styleDesc: styleDesc.trim() })
      })
      clearInterval(tid1)
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare necunoscută')
      pageData = json.data
      setLoadPct(100)
      setLoadMsg(STEPS_PAGE[STEPS_PAGE.length - 1][1])
    } catch(e) {
      clearInterval(tid1)
      setError(e.message)
      setPhase('idle')
      return
    }

    // Scurta pauza sa vada "Pagina gata!"
    await new Promise(r => setTimeout(r, 800))

    // FAZA 2: Genereaza imaginile Gemini (lent ~60-120s)
    setPhase('generating-images')
    setLoadPct(5)
    setLoadMsg(STEPS_IMAGES[0][1])

    let si2 = 0
    const tid2 = setInterval(() => {
      si2 = Math.min(si2 + 1, STEPS_IMAGES.length - 2)
      setLoadMsg(STEPS_IMAGES[si2][1])
      setLoadPct(STEPS_IMAGES[si2][0])
    }, 20000) // 20s per imagine

    try {
      const res = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: pageData.productName,
          benefits: pageData.benefits,
          styleDesc: styleDesc.trim()
        })
      })
      clearInterval(tid2)

      if (res.ok) {
        const json = await res.json()
        if (json.success && json.images) {
          // Combina: AliExpress hero + Gemini imagini
          const aliImages = pageData.aliImages || []
          const geminiImages = json.images.filter(Boolean)
          pageData.images = aliImages.length > 0
            ? [aliImages[0], ...geminiImages]
            : geminiImages
          pageData.geminiImages = geminiImages
          console.log('Images combined:', pageData.images.length)
        }
      } else {
        console.log('Images endpoint failed, using AliExpress only')
      }
    } catch(e) {
      clearInterval(tid2)
      console.log('Images generation failed:', e.message)
      // Continuam cu imaginile AliExpress
    }

    setLoadPct(100)
    setLoadMsg('✅ Tot gata! Deschid editorul...')
    setPhase('done')
    await new Promise(r => setTimeout(r, 600))
    onGenerated(pageData)
  }

  const isLoading = phase !== 'idle'

  if (isLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f', fontFamily:'Inter,system-ui,sans-serif', color:'#fff' }}>
      <div style={{ textAlign:'center', maxWidth:480, padding:24 }}>
        <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,#e53e3e,#c53030)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 24px', boxShadow:'0 8px 24px rgba(229,62,62,0.3)' }}>
          {phase === 'generating-page' ? '🤖' : '🎨'}
        </div>

        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>
          {phase === 'generating-page' ? 'Se generează pagina...' : 'Se generează imaginile AI...'}
        </h2>

        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, marginBottom:8, lineHeight:1.6 }}>
          {loadMsg}
        </p>

        {phase === 'generating-images' && (
          <p style={{ color:'rgba(255,255,255,0.3)', fontSize:13, marginBottom:24 }}>
            ⏳ Imaginile AI durează 1-2 minute — calitate maximă, te rugăm să aștepți
          </p>
        )}

        <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:100, height:10, overflow:'hidden', marginBottom:12 }}>
          <div style={{ height:'100%', background: phase === 'generating-images' ? 'linear-gradient(90deg,#7c3aed,#a78bfa)' : 'linear-gradient(90deg,#e53e3e,#f87171)', borderRadius:100, width:`${loadPct}%`, transition:'width 1s ease' }} />
        </div>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.3)' }}>{loadPct}%</p>

        {phase === 'generating-images' && (
          <div style={{ marginTop:24, display:'flex', gap:8, justifyContent:'center' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ width:48, height:48, borderRadius:10, background: loadPct >= i * 22 ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)', border: loadPct >= i * 22 ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, transition:'all 0.5s' }}>
                {loadPct >= i * 22 ? ['📸','🏠','🔍','😊'][i-1] : '⏳'}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', fontFamily:'Inter,system-ui,sans-serif', color:'#fff' }}>
      <div style={{ padding:'20px 32px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#e53e3e,#c53030)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🛒</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800 }}>UnitOne Romania</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{shop}</div>
        </div>
      </div>

      <div style={{ maxWidth:600, margin:'0 auto', padding:'48px 24px' }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <h1 style={{ fontSize:32, fontWeight:900, marginBottom:12, letterSpacing:-1 }}>Generează pagină COD</h1>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:16, lineHeight:1.6 }}>
            Pune linkul AliExpress și descrie stilul dorit — AI-ul generează tot în română + 4 imagini profesionale.
          </p>
        </div>

        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:28, display:'flex', flexDirection:'column', gap:20 }}>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>Link produs AliExpress *</label>
            <input
              value={aliUrl}
              onChange={e => setAliUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aliUrl.trim() && generate()}
              placeholder="https://www.aliexpress.com/item/..."
              style={{ width:'100%', padding:'13px 16px', borderRadius:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:15, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>Descrie stilul paginii (opțional)</label>
            <textarea
              value={styleDesc}
              onChange={e => setStyleDesc(e.target.value)}
              rows={4}
              placeholder="Ex: Pagina pentru bărbați 25-45 ani, culori negru și roșu, ton direct și agresiv, accent pe durabilitate și calitate, text scurt și impactant..."
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
            Generează pagina → (40 RON la publicare)
          </button>

          <div style={{ background:'rgba(255,255,255,0.02)', borderRadius:12, padding:14, fontSize:12, color:'rgba(255,255,255,0.3)', lineHeight:1.7 }}>
            ℹ️ <strong style={{ color:'rgba(255,255,255,0.5)' }}>Cum funcționează:</strong><br/>
            1. Pagina + textele se generează rapid (~15s)<br/>
            2. Imaginile AI se generează separat (~1-2 min) — calitate maximă<br/>
            3. Editezi în editor drag & drop<br/>
            4. Publici în Shopify (40 RON)
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:24 }}>
          {[
            ['🖼️', 'Poze reale AliExpress', 'Extrase automat din link'],
            ['🤖', '4 imagini generate AI', 'Studio, lifestyle, detaliu, social proof'],
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
