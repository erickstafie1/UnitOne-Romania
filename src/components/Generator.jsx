// v3 - single endpoint
import { useState } from 'react'

const STEPS = [
  [5,  '🔍 Accesez pagina AliExpress...'],
  [20, '🖼️ Extrag pozele produsului...'],
  [40, '✍️ Generez copywriting în română...'],
  [55, '🎨 Generez imagini AI — Studio photography...'],
  [70, '🏠 Generez imagini AI — Lifestyle...'],
  [82, '🔍 Generez imagini AI — Close-up...'],
  [92, '😊 Generez imagini AI — Social proof...'],
  [98, '📦 Finalizez pagina...'],
]

export default function Generator({ shop, token, onGenerated }) {
  const [aliUrl, setAliUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [tab, setTab] = useState('aliexpress') // aliexpress | shopify

  // Incarca produsele din Shopify
  async function loadProducts() {
    setLoadingProducts(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_products', shop, token })
      })
      const data = await res.json()
      setProducts(data.products || [])
    } catch(e) {
      console.log('Load products error:', e.message)
    }
    setLoadingProducts(false)
  }

  async function generate() {
    if (!aliUrl.trim()) return
    setError('')
    setLoading(true)
    setLoadPct(5)
    setLoadMsg(STEPS[0][1])

    let si = 0
    const tid = setInterval(() => {
      si = Math.min(si + 1, STEPS.length - 1)
      setLoadMsg(STEPS[si][1])
      setLoadPct(STEPS[si][0])
    }, 8000) // 8s per step = ~64s total

    try {
      const body = tab === 'shopify' && selectedProduct
        ? { 
            shopifyProduct: selectedProduct,
            aliUrl: selectedProduct.images?.[0]?.src || '',
            styleDesc: styleDesc.trim(),
            productName: selectedProduct.title,
            priceRON: parseFloat(selectedProduct.variants?.[0]?.price || 0)
          }
        : { aliUrl: aliUrl.trim(), styleDesc: styleDesc.trim() }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      clearInterval(tid)
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare necunoscută')
      setLoadPct(100)
      setLoadMsg('✅ Gata! Deschid editorul...')
      await new Promise(r => setTimeout(r, 600))
      onGenerated(json.data)
    } catch(e) {
      clearInterval(tid)
      setError(e.message)
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f', fontFamily:'Inter,system-ui,sans-serif', color:'#fff' }}>
      <div style={{ textAlign:'center', maxWidth:480, padding:24 }}>
        <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,#e53e3e,#c53030)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 24px' }}>🤖</div>
        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>Se generează pagina ta...</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, marginBottom:8 }}>{loadMsg}</p>
        <p style={{ color:'rgba(255,255,255,0.3)', fontSize:13, marginBottom:28 }}>
          ⏳ Imaginile AI durează ~1 minut — calitate maximă
        </p>
        <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:100, height:10, overflow:'hidden', marginBottom:10 }}>
          <div style={{ height:'100%', background:'linear-gradient(90deg,#e53e3e,#f87171)', borderRadius:100, width:`${loadPct}%`, transition:'width 1.5s ease' }} />
        </div>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.3)' }}>{loadPct}%</p>
        <div style={{ marginTop:24, display:'flex', gap:8, justifyContent:'center' }}>
          {['📸','🏠','🔍','😊'].map((ic, i) => (
            <div key={i} style={{ width:48, height:48, borderRadius:10, background: loadPct > 55 + i*10 ? 'rgba(229,62,62,0.3)' : 'rgba(255,255,255,0.06)', border: loadPct > 55 + i*10 ? '1px solid rgba(229,62,62,0.5)' : '1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, transition:'all 0.5s' }}>
              {loadPct > 55 + i*10 ? ic : '⏳'}
            </div>
          ))}
        </div>
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
          <h1 style={{ fontSize:32, fontWeight:900, marginBottom:12 }}>Generează pagină COD</h1>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:16, lineHeight:1.6 }}>
            Pune linkul AliExpress și descrie stilul — AI-ul generează tot + 4 imagini profesionale.
          </p>
        </div>

        {/* Tab selector */}
        <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:12, padding:4, marginBottom:4, gap:4 }}>
          <button onClick={() => setTab('aliexpress')}
            style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background: tab==='aliexpress' ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'transparent', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            🔗 Link AliExpress
          </button>
          <button onClick={() => { setTab('shopify'); if(products.length===0) loadProducts() }}
            style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background: tab==='shopify' ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'transparent', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            🛍️ Produse magazin
          </button>
        </div>

        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:28, display:'flex', flexDirection:'column', gap:20 }}>
          
          {tab === 'aliexpress' && (
            <div>
              <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>Link produs AliExpress *</label>
              <input value={aliUrl} onChange={e => setAliUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && aliUrl.trim() && generate()}
                placeholder="https://www.aliexpress.com/item/..."
                style={{ width:'100%', padding:'13px 16px', borderRadius:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:15, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
              />
            </div>
          )}

          {tab === 'shopify' && (
            <div>
              <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>
                Alege produsul din magazin *
              </label>
              {loadingProducts ? (
                <div style={{ textAlign:'center', padding:20, color:'rgba(255,255,255,0.4)' }}>Se încarcă produsele...</div>
              ) : products.length === 0 ? (
                <div style={{ textAlign:'center', padding:20, color:'rgba(255,255,255,0.4)' }}>
                  Nu s-au găsit produse.
                  <button onClick={loadProducts} style={{ display:'block', margin:'10px auto 0', padding:'8px 16px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:13 }}>Reîncarcă</button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:300, overflowY:'auto' }}>
                  {products.map(p => (
                    <div key={p.id} onClick={() => setSelectedProduct(p)}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, border: selectedProduct?.id === p.id ? '1.5px solid #e53e3e' : '1px solid rgba(255,255,255,0.08)', background: selectedProduct?.id === p.id ? 'rgba(229,62,62,0.08)' : 'rgba(255,255,255,0.02)', cursor:'pointer' }}>
                      {p.images?.[0] && <img src={p.images[0].src} alt={p.title} style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }} />}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{p.variants?.[0]?.price} RON</div>
                      </div>
                      {selectedProduct?.id === p.id && <span style={{ color:'#e53e3e', fontSize:18, flexShrink:0 }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:10 }}>Descrie stilul paginii (opțional)</label>
            <textarea value={styleDesc} onChange={e => setStyleDesc(e.target.value)} rows={3}
              placeholder="Ex: Pagina pentru bărbați 25-45 ani, culori negru și roșu, ton direct și agresiv..."
              style={{ width:'100%', padding:'13px 16px', borderRadius:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.6, boxSizing:'border-box' }}
            />
          </div>

          {error && (
            <div style={{ padding:'12px 16px', background:'rgba(229,62,62,0.12)', border:'1px solid rgba(229,62,62,0.3)', borderRadius:10, fontSize:14, color:'#fc8181' }}>
              ⚠️ {error}
            </div>
          )}

          <button onClick={generate}
            disabled={tab === 'aliexpress' ? !aliUrl.trim() : !selectedProduct}
            style={{ padding:16, borderRadius:12, background: (tab==='aliexpress' ? aliUrl.trim() : selectedProduct) ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', fontSize:16, fontWeight:800, cursor: (tab==='aliexpress' ? aliUrl.trim() : selectedProduct) ? 'pointer' : 'not-allowed', opacity: (tab==='aliexpress' ? aliUrl.trim() : selectedProduct) ? 1 : 0.5 }}>
            Generează pagina → (40 RON la publicare)
          </button>

          <p style={{ fontSize:12, color:'rgba(255,255,255,0.25)', textAlign:'center' }}>
            ⏱️ Durează ~1 minut — generăm textele + 4 imagini AI de calitate maximă
          </p>
        </div>
      </div>
    </div>
  )
}
