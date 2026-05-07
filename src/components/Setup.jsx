import { useState } from 'react'

export default function Setup({ shop, onComplete, isReconfigure }) {
  const [step, setStep] = useState(1) // 1=alegere, 2=instructiuni, 3=confirmare
  const [selected, setSelected] = useState(null) // 'releasit' | 'easysell' | 'none'
  const [hover, setHover] = useState(null)

  function confirm() {
    localStorage.setItem(`codform_${shop}`, selected)
    onComplete(selected)
  }

  const apps = [
    {
      id: 'releasit',
      name: 'Releasit COD Form',
      desc: 'Cel mai popular formular COD pentru Shopify',
      color: '#6366f1',
      icon: '🟣',
      link: 'https://apps.shopify.com/releasit-cod-order-form'
    },
    {
      id: 'easysell',
      name: 'EasySell COD Form',
      desc: 'Simplu și rapid de configurat',
      color: '#f59e0b',
      icon: '🟡',
      link: 'https://apps.shopify.com/easy-order-form'
    },
    {
      id: 'none',
      name: 'Formular propriu',
      desc: 'Folosesc formularul COD inclus în LP',
      color: '#6b7280',
      icon: '⚪'
    }
  ]

  const instructions = {
    releasit: {
      steps: [
        { n: 1, title: 'Instalează Releasit', desc: 'Dacă nu ai instalat deja, mergi la link-ul de mai jos și instalează aplicația în magazinul tău Shopify.', link: 'https://apps.shopify.com/releasit-cod-order-form', linkText: 'Instalează Releasit →' },
        { n: 2, title: 'Activează pe toate paginile', desc: 'În Releasit → Settings → General → asigură-te că aplicația este activată pentru magazinul tău.' },
        { n: 3, title: 'Gata!', desc: 'Butonul din LP-ul tău va deschide automat formularul Releasit când clientul apasă "Comandă Acum". Nu trebuie să faci nimic altceva.' }
      ]
    },
    easysell: {
      steps: [
        { n: 1, title: 'Instalează EasySell', desc: 'Dacă nu ai instalat deja, mergi la link-ul de mai jos și instalează aplicația în magazinul tău Shopify.', link: 'https://apps.shopify.com/easy-order-form', linkText: 'Instalează EasySell →' },
        { n: 2, title: 'Activează pe toate paginile', desc: 'În EasySell → Settings → asigură-te că aplicația este activată și funcționează pe paginile magazinului tău.' },
        { n: 3, title: 'Gata!', desc: 'Butonul din LP-ul tău va deschide automat formularul EasySell când clientul apasă "Comandă Acum".' }
      ]
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0b0f', color:'#fff', fontFamily:"'Inter','SF Pro Display',-apple-system,system-ui,sans-serif", display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ position:'fixed', inset:0, background:'radial-gradient(ellipse at top, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ position:'relative', width:'100%', maxWidth:560 }}>

        {/* Step 1: Alegere app */}
        {step === 1 && (
          <div style={{ animation:'slideUp 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
            <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <div style={{ textAlign:'center', marginBottom:40 }}>
              <div style={{ width:56, height:56, borderRadius:14, background:'linear-gradient(135deg,#3b82f6,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 8px 24px rgba(59,130,246,0.35)', fontSize:24 }}>🛒</div>
              <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:-0.8, marginBottom:10 }}>
                {isReconfigure ? 'Schimbă formularul COD' : 'Configurare rapidă'}
              </h1>
              <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, lineHeight:1.6 }}>
                {isReconfigure ? 'Alege o altă aplicație de formular COD pentru butoanele din LP-urile tale.' : 'Ce aplicație de formular COD folosești în magazinul tău?'}
              </p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:28 }}>
              {apps.map(app => (
                <div key={app.id}
                  onClick={() => setSelected(app.id)}
                  onMouseEnter={() => setHover(app.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    padding:'18px 20px', borderRadius:14,
                    border: selected===app.id ? `1.5px solid ${app.color}` : hover===app.id ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.07)',
                    background: selected===app.id ? `${app.color}12` : hover===app.id ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
                    cursor:'pointer', display:'flex', alignItems:'center', gap:16,
                    transition:'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                    transform: hover===app.id ? 'translateY(-1px)' : 'translateY(0)',
                    boxShadow: selected===app.id ? `0 4px 20px ${app.color}20` : 'none'
                  }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:`${app.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{app.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, marginBottom:3, letterSpacing:-0.2 }}>{app.name}</div>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>{app.desc}</div>
                  </div>
                  <div style={{ width:20, height:20, borderRadius:'50%', border: selected===app.id ? `2px solid ${app.color}` : '2px solid rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                    {selected===app.id && <div style={{ width:10, height:10, borderRadius:'50%', background:app.color }} />}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => selected === 'none' ? confirm() : setStep(2)}
              disabled={!selected}
              style={{
                width:'100%', padding:'14px', borderRadius:12,
                background: selected ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'rgba(255,255,255,0.06)',
                color:'#fff', border:'none', fontSize:15, fontWeight:700,
                cursor: selected ? 'pointer' : 'not-allowed', opacity: selected ? 1 : 0.5,
                fontFamily:'inherit', letterSpacing:-0.2,
                transition:'all 0.18s',
                boxShadow: selected ? '0 4px 14px rgba(59,130,246,0.3)' : 'none'
              }}>
              {selected === 'none' ? 'Continuă cu formularul propriu' : 'Continuă'}
              {selected && selected !== 'none' && ' →'}
            </button>
          </div>
        )}

        {/* Step 2: Instructiuni */}
        {step === 2 && selected && selected !== 'none' && (
          <div style={{ animation:'slideUp 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
            <button onClick={() => setStep(1)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'rgba(255,255,255,0.6)', cursor:'pointer', padding:'7px 14px', fontSize:13, fontWeight:600, fontFamily:'inherit', marginBottom:28, display:'flex', alignItems:'center', gap:6 }}>
              ← Înapoi
            </button>

            <div style={{ textAlign:'center', marginBottom:36 }}>
              <div style={{ fontSize:40, marginBottom:14 }}>{apps.find(a=>a.id===selected)?.icon}</div>
              <h2 style={{ fontSize:24, fontWeight:800, letterSpacing:-0.6, marginBottom:8 }}>
                Cum conectezi {apps.find(a=>a.id===selected)?.name}
              </h2>
              <p style={{ color:'rgba(255,255,255,0.45)', fontSize:14 }}>
                Urmează pașii de mai jos — durează 2 minute
              </p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:28 }}>
              {instructions[selected].steps.map(s => (
                <div key={s.n} style={{ display:'flex', gap:16, padding:'18px 20px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#3b82f6,#2563eb)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, flexShrink:0, boxShadow:'0 4px 10px rgba(59,130,246,0.25)' }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, marginBottom:5, letterSpacing:-0.2 }}>{s.title}</div>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>{s.desc}</div>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noreferrer"
                        style={{ display:'inline-block', marginTop:10, padding:'7px 14px', borderRadius:8, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)', color:'#60a5fa', fontSize:13, fontWeight:600, textDecoration:'none' }}>
                        {s.linkText}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:12, padding:'14px 18px', marginBottom:24, display:'flex', gap:12, alignItems:'flex-start' }}>
              <span style={{ fontSize:18, flexShrink:0 }}>💡</span>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.6 }}>
                <strong style={{ color:'rgba(255,255,255,0.8)' }}>Cum funcționează: </strong>
                Butonul "Comandă Acum" din LP-ul generat va deschide automat formularul {apps.find(a=>a.id===selected)?.name} cu produsul și prețul pre-completat.
              </div>
            </div>

            <button onClick={confirm}
              style={{ width:'100%', padding:'14px', borderRadius:12, background:'linear-gradient(135deg,#3b82f6,#2563eb)', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit', letterSpacing:-0.2, boxShadow:'0 4px 14px rgba(59,130,246,0.3)' }}>
              Am configurat — Continuă ✓
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
