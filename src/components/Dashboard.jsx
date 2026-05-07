import { useState, useEffect } from 'react'

export default function Dashboard({ shop, token, onNew, onEdit, onReconfigure }) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [importModal, setImportModal] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')
  const [hoveredCard, setHoveredCard] = useState(null)
  
  const codFormApp = localStorage.getItem(`codform_${shop}`)
  const codFormLabels = { releasit: 'Releasit COD', easysell: 'EasySell COD', none: 'Formular propriu' }

  useEffect(() => { loadPages() }, [])

  async function loadPages() {
    setLoading(true)
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', shop, token })
      })
      const data = await res.json()
      setPages(data.pages || [])
    } catch(e) { console.log('Load pages error:', e.message) }
    setLoading(false)
  }

  async function deletePage(pageId) {
    if (!confirm('Ștergi această pagină?')) return
    setDeleting(pageId)
    try {
      await fetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', shop, token, pageId })
      })
      setPages(pages.filter(p => p.id !== pageId))
    } catch(e) { alert('Eroare la ștergere') }
    setDeleting(null)
  }

  async function togglePage(pageId, published) {
    try {
      await fetch('/api/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', shop, token, pageId, published: !published })
      })
      setPages(pages.map(p => p.id === pageId ? { ...p, published: !published } : p))
    } catch(e) { alert('Eroare') }
  }

  function exportPage(page) {
    const exportData = {
      title: page.title, handle: page.handle, body_html: page.body_html,
      exported_at: new Date().toISOString(), shop
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${page.handle || 'pagina-cod'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  async function importPage() {
    setImportError('')
    try {
      let html = '', title = 'Pagina Importată'
      if (importJson.trim()) {
        try {
          const data = JSON.parse(importJson)
          html = data.body_html || data.html || data.content || ''
          title = data.title || title
        } catch(e) {
          if (importJson.trim().startsWith('<')) html = importJson
          else throw new Error('Format invalid')
        }
      }
      if (!html) throw new Error('Fișierul nu conține HTML')
      const res = await fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, token, title, html })
      })
      const result = await res.json()
      if (result.success) {
        setImportModal(false); setImportJson(''); loadPages()
      } else throw new Error(result.error)
    } catch(e) { setImportError(e.message) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0b0f', color:'#fff', fontFamily:"'Inter','SF Pro Display',-apple-system,system-ui,sans-serif" }}>
      {/* Subtle gradient background */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:400, background:'radial-gradient(ellipse at top, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      
      {/* Header */}
      <div style={{ position:'relative', zIndex:1, borderBottom:'1px solid rgba(255,255,255,0.06)', backdropFilter:'blur(20px)', background:'rgba(10,11,15,0.7)', position:'sticky', top:0 }}>
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'18px 32px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#3b82f6,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, boxShadow:'0 4px 14px rgba(59,130,246,0.35)' }}>U</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.2 }}>UnitOne</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:500 }}>{shop}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {codFormApp && (
              <button onClick={onReconfigure}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'rgba(255,255,255,0.5)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='rgba(255,255,255,0.8)' }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.color='rgba(255,255,255,0.5)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10"/><path d="M12 8v4l3 3M21 12a9 9 0 01-9 9"/></svg>
                {codFormLabels[codFormApp]}
              </button>
            )}
            <PremiumBtn onClick={() => setImportModal(true)} variant="ghost">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Import
            </PremiumBtn>
            <PremiumBtn onClick={onNew} variant="primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Pagină nouă
            </PremiumBtn>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ position:'relative', zIndex:1, maxWidth:1100, margin:'0 auto', padding:'56px 32px' }}>
        <div style={{ marginBottom:40 }}>
          <h1 style={{ fontSize:34, fontWeight:800, letterSpacing:-1.2, marginBottom:8, background:'linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.7) 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Landing Pages
          </h1>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:15, fontWeight:400 }}>
            {pages.length} {pages.length === 1 ? 'pagină activă' : 'pagini active'} în magazinul tău
          </p>
        </div>

        {loading ? (
          <LoadingState />
        ) : pages.length === 0 ? (
          <EmptyState onNew={onNew} />
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {pages.map(page => (
              <PageCard
                key={page.id} page={page} shop={shop}
                hovered={hoveredCard === page.id}
                onHover={() => setHoveredCard(page.id)}
                onLeave={() => setHoveredCard(null)}
                onEdit={async () => {
                  try {
                    const res = await fetch('/api/pages', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'get', shop, token, pageId: page.id })
                    })
                    const d = await res.json()
                    onEdit({ ...d.page, fromDashboard: true })
                  } catch(e) { onEdit({ ...page, fromDashboard: true }) }
                }}
                onExport={() => exportPage(page)}
                onToggle={() => togglePage(page.id, page.published)}
                onDelete={() => deletePage(page.id)}
                deleting={deleting === page.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {importModal && (
        <ImportModal
          json={importJson} setJson={setImportJson} error={importError}
          onClose={() => { setImportModal(false); setImportJson(''); setImportError('') }}
          onImport={importPage}
        />
      )}
    </div>
  )
}

function PremiumBtn({ children, onClick, variant = 'ghost', disabled }) {
  const [hover, setHover] = useState(false)
  const variants = {
    primary: {
      bg: hover ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
      color: '#fff', border: 'none',
      shadow: hover ? '0 6px 20px rgba(59,130,246,0.45)' : '0 4px 12px rgba(59,130,246,0.3)'
    },
    ghost: {
      bg: hover ? 'rgba(255,255,255,0.06)' : 'transparent',
      color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
      shadow: 'none'
    },
    danger: {
      bg: hover ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
      color: '#f87171', border: '1px solid rgba(239,68,68,0.2)',
      shadow: 'none'
    }
  }
  const v = variants[variant]
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display:'inline-flex', alignItems:'center', gap:7,
        padding: '8px 14px', borderRadius:8,
        background: v.bg, color: v.color, border: v.border,
        fontSize:13, fontWeight:600, fontFamily:'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition:'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: v.shadow,
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        letterSpacing:-0.1
      }}>
      {children}
    </button>
  )
}

function PageCard({ page, shop, hovered, onHover, onLeave, onEdit, onExport, onToggle, onDelete, deleting }) {
  return (
    <div
      onMouseEnter={onHover} onMouseLeave={onLeave}
      style={{
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
        border: hovered ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
        borderRadius:14, padding:'18px 22px',
        display:'flex', alignItems:'center', gap:18,
        transition:'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        cursor:'default',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.2)' : 'none'
      }}>
      {/* Status dot */}
      <div style={{
        width:8, height:8, borderRadius:'50%',
        background: page.published ? '#22c55e' : '#6b7280',
        boxShadow: page.published ? '0 0 12px rgba(34,197,94,0.6)' : 'none',
        flexShrink:0
      }} />
      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, marginBottom:3, letterSpacing:-0.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{page.title}</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', display:'flex', gap:10, alignItems:'center' }}>
          <span>{page.published ? 'Activ' : 'Inactiv'}</span>
          <span style={{ width:3, height:3, borderRadius:'50%', background:'rgba(255,255,255,0.2)' }} />
          <span>{new Date(page.created_at).toLocaleDateString('ro-RO', { day:'numeric', month:'short' })}</span>
        </div>
      </div>
      {/* Actions */}
      <div style={{ display:'flex', gap:6, opacity: hovered ? 1 : 0.7, transition:'opacity 0.15s' }}>
        <IconBtn href={`https://${shop}/pages/${page.handle}`} title="Vezi pagina">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </IconBtn>
        <IconBtn onClick={onEdit} title="Editează">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </IconBtn>
        <IconBtn onClick={onExport} title="Export">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </IconBtn>
        <IconBtn onClick={onToggle} title={page.published ? 'Dezactivează' : 'Activează'} variant={page.published ? 'warning' : 'success'}>
          {page.published 
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </IconBtn>
        <IconBtn onClick={onDelete} title="Șterge" variant="danger" disabled={deleting}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </IconBtn>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick, href, title, variant, disabled }) {
  const [hover, setHover] = useState(false)
  const colors = {
    default: { bg: hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', border:'rgba(255,255,255,0.06)' },
    success: { bg: hover ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.08)', color:'#4ade80', border:'rgba(34,197,94,0.2)' },
    warning: { bg: hover ? 'rgba(251,191,36,0.18)' : 'rgba(251,191,36,0.08)', color:'#fbbf24', border:'rgba(251,191,36,0.2)' },
    danger: { bg: hover ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.08)', color:'#f87171', border:'rgba(239,68,68,0.2)' }
  }
  const c = colors[variant || 'default']
  const styles = {
    width:32, height:32, borderRadius:8,
    background: c.bg, color: c.color, border:`1px solid ${c.border}`,
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition:'all 0.15s cubic-bezier(0.4,0,0.2,1)',
    textDecoration:'none',
    transform: hover && !disabled ? 'scale(1.05)' : 'scale(1)'
  }
  if (href) return <a href={href} target="_blank" rel="noreferrer" title={title} style={styles} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}</a>
  return <button onClick={onClick} title={title} disabled={disabled} style={styles} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}</button>
}

function LoadingState() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:80 }}>
      <div style={{ width:32, height:32, border:'2px solid rgba(255,255,255,0.1)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div style={{ textAlign:'center', padding:'80px 20px', background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.08)', borderRadius:18 }}>
      <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.1))', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
      </div>
      <h3 style={{ fontSize:18, fontWeight:700, marginBottom:8, letterSpacing:-0.3 }}>Nicio pagină încă</h3>
      <p style={{ color:'rgba(255,255,255,0.4)', fontSize:14, marginBottom:24, maxWidth:360, margin:'0 auto 24px' }}>
        Creează prima ta pagină de vânzare COD în câteva minute.
      </p>
      <PremiumBtn onClick={onNew} variant="primary">
        Începe acum
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </PremiumBtn>
    </div>
  )
}

function ImportModal({ json, setJson, error, onClose, onImport }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, animation:'fadeIn 0.2s' }}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div style={{ background:'#13141a', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:28, width:520, maxWidth:'100%', boxShadow:'0 24px 80px rgba(0,0,0,0.5)', animation:'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <h3 style={{ fontSize:17, fontWeight:700, letterSpacing:-0.3 }}>Import pagină</h3>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:8, color:'rgba(255,255,255,0.6)', cursor:'pointer', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:20 }}>
          Încarcă fișier JSON sau lipește conținut HTML direct.
        </p>
        <label style={{ display:'block', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.6)', marginBottom:8, letterSpacing:0.2, textTransform:'uppercase' }}>Fișier</div>
          <input type="file" accept=".json,.html"
            onChange={e => {
              const file = e.target.files[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = ev => setJson(ev.target.result)
              reader.readAsText(file)
            }}
            style={{ width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}
          />
        </label>
        <label style={{ display:'block', marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.6)', marginBottom:8, letterSpacing:0.2, textTransform:'uppercase' }}>Sau lipește direct</div>
          <textarea value={json} onChange={e => setJson(e.target.value)}
            rows={6} placeholder='{"title":"Pagina mea", "body_html":"<div>..."}'
            style={{ width:'100%', padding:'12px 14px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'#fff', fontSize:12, outline:'none', fontFamily:'ui-monospace,monospace', resize:'vertical', boxSizing:'border-box', lineHeight:1.5 }}
          />
        </label>
        {error && <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'#f87171', marginBottom:14 }}>{error}</div>}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <PremiumBtn onClick={onClose} variant="ghost">Anulează</PremiumBtn>
          <PremiumBtn onClick={onImport} variant="primary" disabled={!json.trim()}>Importă pagina</PremiumBtn>
        </div>
      </div>
    </div>
  )
}
