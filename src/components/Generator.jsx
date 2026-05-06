import { useState } from 'react'

const STEPS = [
  [5,  'Conectare la AliExpress'],
  [20, 'Extragere imagini produs'],
  [40, 'Generare copywriting în română'],
  [55, 'Imagini AI · Studio'],
  [70, 'Imagini AI · Lifestyle'],
  [82, 'Imagini AI · Detaliu'],
  [92, 'Imagini AI · Social proof'],
  [98, 'Finalizare pagină'],
]

export default function Generator({ shop, token, onGenerated, onBack }) {
  const [aliUrl, setAliUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')
  const [hover, setHover] = useState(false)
  const [focusUrl, setFocusUrl] = useState(false)
  const [focusStyle, setFocusStyle] = useState(false)

  async function generate() {
    if (!aliUrl.trim()) return
    setError(''); setLoading(true); setLoadPct(5); setLoadMsg(STEPS[0][1])

    let si = 0
    const tid = setInterval(() => {
      si = Math.min(si + 1, STEPS.length - 1)
      setLoadMsg(STEPS[si][1]); setLoadPct(STEPS[si][0])
    }, 8000)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliUrl: aliUrl.trim(), styleDesc: styleDesc.trim() })
      })
      clearInterval(tid)
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare')
      setLoadPct(100); setLoadMsg('Pagina ta este gata')
      await new Promise(r => setTimeout(r, 700))
      onGenerated(json.data)
    } catch(e) {
      clearInterval(tid); setError(e.message); setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0a0b0f', color:'#fff', fontFamily:"'Inter','SF Pro Display',-apple-system,system-ui,sans-serif", display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ position:'fixed', inset:0, background:'radial-gradient(ellipse at center, rgba(59,130,246,0.1) 0%, transparent 60%)', pointerEvents:'none' }} />
      <div style={{ position:'relative', textAlign:'center', maxWidth:420 }}>
        <div style={{ width:78, height:78, borderRadius:18, background:'linear-gradient(135deg,#3b82f6,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 32px', boxShadow:'0 10px 40px rgba(59,130,246,0.4)', position:'relative' }}>
          <div style={{ position:'absolute', inset:-2, borderRadius:18, background:'linear-gradient(135deg,#3b82f6,#2563eb)', opacity:0.5, filter:'blur(10px)', animation:'pulse 2s ease-in-out infinite' }} />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ position:'relative' }}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:0.4}50%{opacity:0.8}}`}</style>
        <h2 style={{ fontSize:24, fontWeight:800, marginBottom:10, letterSpacing:-0.6 }}>Generăm pagina ta</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginBottom:6, fontWeight:500 }}>{loadMsg}</p>
        <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginBottom:32 }}>Imaginile AI durează ~1 minut · Calitate maximă</p>
        <div style={{ height:6, borderRadius:100, background:'rgba(255,255,255,0.06)', overflow:'hidden', marginBottom:10 }}>
          <div style={{ height:'100%', borderRadius:100, background:'linear-gradient(90deg,#3b82f6,#60a5fa)', width:`${loadPct}%`, transition:'width 1.2s cubic-bezier(0.4,0,0.2,1)', boxShadow:'0 0 10px rgba(59,130,246,0.5)' }} />
        </div>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', fontWeight:600, letterSpacing:1 }}>{loadPct}%</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#0a0b0f', color:'#fff', fontFamily:"'Inter','SF Pro Display',-apple-system,system-ui,sans-serif" }}>
      <div style={{ position:'fixed', inset:0, background:'radial-gradient(ellipse at top, rgba(59,130,246,0.06) 0%, transparent 70%)', pointerEvents:'none' }} />

      {/* Header */}
      <div style={{ position:'relative', borderBottom:'1px solid rgba(255,255,255,0.06)', backdropFilter:'blur(20px)', background:'rgba(10,11,15,0.7)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ maxWidth:680, margin:'0 auto', padding:'18px 32px', display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'rgba(255,255,255,0.6)', cursor:'pointer', padding:'7px 12px', fontSize:13, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, transition:'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='rgba(255,255,255,0.6)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Înapoi
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#3b82f6,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800 }}>U</div>
            <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.2 }}>Pagină nouă</div>
          </div>
        </div>
      </div>

      <div style={{ position:'relative', maxWidth:540, margin:'0 auto', padding:'72px 32px' }}>
        <div style={{ textAlign:'center', marginBottom:48 }}>
          <h1 style={{ fontSize:38, fontWeight:800, letterSpacing:-1.5, marginBottom:14, lineHeight:1.1, background:'linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.65) 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Generează landing page COD
          </h1>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, lineHeight:1.6, fontWeight:400 }}>
            Pune linkul AliExpress și descrie stilul dorit.<br/>AI-ul generează copywriting în română și 4 imagini profesionale.
          </p>
        </div>

        <div style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:28, display:'flex', flexDirection:'column', gap:20, boxShadow:'0 4px 30px rgba(0,0,0,0.3)' }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.55)', display:'block', marginBottom:8, letterSpacing:0.2, textTransform:'uppercase' }}>Link AliExpress</label>
            <input value={aliUrl} onChange={e => setAliUrl(e.target.value)}
              onFocus={() => setFocusUrl(true)} onBlur={() => setFocusUrl(false)}
              onKeyDown={e => e.key === 'Enter' && aliUrl.trim() && generate()}
              placeholder="https://www.aliexpress.com/item/..."
              style={{ width:'100%', padding:'13px 16px', borderRadius:10, background:'rgba(255,255,255,0.04)', border: focusUrl ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box', transition:'all 0.15s', boxShadow: focusUrl ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.55)', display:'block', marginBottom:8, letterSpacing:0.2, textTransform:'uppercase' }}>
              Descriere stil <span style={{ color:'rgba(255,255,255,0.3)', textTransform:'none', letterSpacing:0, fontWeight:400 }}>· opțional</span>
            </label>
            <textarea value={styleDesc} onChange={e => setStyleDesc(e.target.value)}
              onFocus={() => setFocusStyle(true)} onBlur={() => setFocusStyle(false)}
              rows={3}
              placeholder="Ex: Pagina pentru bărbați 25-45 ani, culori negru și roșu, ton direct și agresiv, accent pe durabilitate..."
              style={{ width:'100%', padding:'13px 16px', borderRadius:10, background:'rgba(255,255,255,0.04)', border: focusStyle ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.6, boxSizing:'border-box', transition:'all 0.15s', boxShadow: focusStyle ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none' }}
            />
          </div>

          {error && (
            <div style={{ padding:'11px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'#f87171', display:'flex', alignItems:'center', gap:8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
              {error}
            </div>
          )}

          <button onClick={generate} disabled={!aliUrl.trim()}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{
              padding:'14px', borderRadius:10,
              background: aliUrl.trim() ? (hover ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'linear-gradient(135deg,#3b82f6,#2563eb)') : 'rgba(255,255,255,0.04)',
              color:'#fff', border:'none', fontSize:15, fontWeight:700,
              cursor: aliUrl.trim() ? 'pointer' : 'not-allowed',
              opacity: aliUrl.trim() ? 1 : 0.5,
              transition:'all 0.18s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: aliUrl.trim() && hover ? '0 8px 24px rgba(59,130,246,0.45)' : (aliUrl.trim() ? '0 4px 14px rgba(59,130,246,0.3)' : 'none'),
              transform: aliUrl.trim() && hover ? 'translateY(-1px)' : 'translateY(0)',
              fontFamily:'inherit', letterSpacing:-0.2,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8
            }}>
            Generează pagina
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>

          <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', textAlign:'center', fontWeight:500 }}>
            ~ 1 minut · 40 RON la publicare
          </p>
        </div>
      </div>
    </div>
  )
}
