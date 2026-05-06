import { useState, useEffect } from 'react'

export default function Dashboard({ shop, token, onNew, onEdit }) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [importModal, setImportModal] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', shop, token, pageId })
      })
      setPages(pages.filter(p => p.id !== pageId))
    } catch(e) { alert('Eroare la ștergere') }
    setDeleting(null)
  }

  async function togglePage(pageId, published) {
    try {
      await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', shop, token, pageId, published: !published })
      })
      setPages(pages.map(p => p.id === pageId ? { ...p, published: !published } : p))
    } catch(e) { alert('Eroare') }
  }

  function exportPage(page) {
    const exportData = {
      title: page.title,
      handle: page.handle,
      body_html: page.body_html,
      exported_at: new Date().toISOString(),
      shop: shop
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${page.handle || 'pagina-cod'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importPage() {
    setImportError('')
    try {
      const data = JSON.parse(importJson)
      if (!data.body_html) throw new Error('Fișier invalid — lipsește body_html')
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop, token,
          title: data.title || 'Pagina Importată',
          html: data.body_html
        })
      })
      const result = await res.json()
      if (result.success) {
        setImportModal(false)
        setImportJson('')
        loadPages()
        alert('Pagina importată cu succes!')
      } else {
        throw new Error(result.error)
      }
    } catch(e) {
      setImportError(e.message)
    }
  }

  const S = { fontFamily:'Inter,system-ui,sans-serif', color:'#fff', minHeight:'100vh', background:'#0a0a0f' }

  return (
    <div style={S}>
      {/* Header */}
      <div style={{ padding:'20px 28px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#e53e3e,#c53030)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🛒</div>
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>UnitOne Romania</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{shop}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setImportModal(true)}
            style={{ padding:'8px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            📥 Import
          </button>
          <button onClick={onNew}
            style={{ padding:'8px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#e53e3e,#c53030)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            + Pagină nouă
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:'28px' }}>
        <h1 style={{ fontSize:22, fontWeight:900, marginBottom:6 }}>Landing Pages</h1>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:14, marginBottom:24 }}>
          {pages.length} pagini active în magazin
        </p>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'rgba(255,255,255,0.3)' }}>Se încarcă...</div>
        ) : pages.length === 0 ? (
          <div style={{ textAlign:'center', padding:60 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📄</div>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:15, marginBottom:20 }}>Nu ai pagini create încă</p>
            <button onClick={onNew}
              style={{ padding:'12px 28px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#e53e3e,#c53030)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>
              Creează prima pagină COD
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {pages.map(page => (
              <div key={page.id} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'16px 20px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                {/* Status indicator */}
                <div style={{ width:8, height:8, borderRadius:'50%', background: page.published ? '#22c55e' : '#6b7280', flexShrink:0 }} />

                {/* Info */}
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:3 }}>{page.title}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>
                    {page.published ? '🟢 Activ' : '⚫ Inactiv'} · 
                    Creat {new Date(page.created_at).toLocaleDateString('ro-RO')}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <a href={`https://${shop}/pages/${page.handle}`} target="_blank" rel="noreferrer"
                    style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.7)', fontSize:12, textDecoration:'none', fontWeight:600 }}>
                    👁️ Vezi
                  </a>
                  <button onClick={async () => {
                      // Incarca HTML-ul complet al paginii
                      try {
                        const res = await fetch('/api/pages', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'get', shop, token, pageId: page.id })
                        })
                        const d = await res.json()
                        onEdit({ ...d.page, fromDashboard: true })
                      } catch(e) {
                        onEdit({ ...page, fromDashboard: true })
                      }
                    }}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.7)', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                    ✏️ Editează
                  </button>
                  <button onClick={() => exportPage(page)}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.7)', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                    📤 Export
                  </button>
                  <button onClick={() => togglePage(page.id, page.published)}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background: page.published ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: page.published ? '#f87171' : '#4ade80', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                    {page.published ? '⏸ Dezactivează' : '▶ Activează'}
                  </button>
                  <button onClick={() => deletePage(page.id)} disabled={deleting===page.id}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.1)', color:'#f87171', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                    {deleting===page.id ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {importModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a1a2e', borderRadius:20, padding:28, width:500, maxWidth:'90vw', border:'1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ color:'#fff', fontSize:17, fontWeight:800, margin:0 }}>📥 Import pagină</h3>
              <button onClick={() => { setImportModal(false); setImportJson(''); setImportError('') }} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:16 }}>
              Lipește conținutul fișierului JSON exportat dintr-o altă pagină sau magazin.
            </p>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:13, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:8 }}>Încarcă fișier JSON:</label>
              <input type="file" accept=".json"
                onChange={e => {
                  const file = e.target.files[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => setImportJson(ev.target.result)
                  reader.readAsText(file)
                }}
                style={{ color:'rgba(255,255,255,0.7)', fontSize:13, width:'100%' }}
              />
            </div>
            <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginBottom:8 }}>Sau lipește JSON direct:</p>
            <textarea value={importJson} onChange={e => setImportJson(e.target.value)}
              rows={5} placeholder='{"title":"...", "body_html":"..."}'
              style={{ width:'100%', padding:'12px', borderRadius:10, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:13, outline:'none', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }}
            />
            {importError && <p style={{ color:'#f87171', fontSize:13, marginTop:8 }}>⚠️ {importError}</p>}
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button onClick={() => { setImportModal(false); setImportJson(''); setImportError('') }}
                style={{ flex:1, padding:12, borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#fff', fontSize:14, cursor:'pointer' }}>
                Anulează
              </button>
              <button onClick={importPage} disabled={!importJson.trim()}
                style={{ flex:2, padding:12, borderRadius:10, border:'none', background: importJson.trim() ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'rgba(255,255,255,0.1)', color:'#fff', fontSize:14, fontWeight:700, cursor: importJson.trim() ? 'pointer' : 'not-allowed' }}>
                Importă pagina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
