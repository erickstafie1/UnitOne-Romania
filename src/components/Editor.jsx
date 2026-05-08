import { useEffect, useRef, useState } from 'react'
import { buildHTML, addBlocks } from './EditorHelpers.js'

export default function Editor({ data, shop, token, codFormApp: codFormAppProp, onBack }) {
  const codFormApp = codFormAppProp || (typeof window !== 'undefined' ? localStorage.getItem('codform_' + shop) : null) || null
  console.log('[Editor] codFormApp:', codFormApp, 'shop:', shop)
  const editorRef = useRef(null)
  const gjsRef = useRef(null)
  const [device, setDevice] = useState('desktop')
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState('')
  const [error, setError] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [hideHeaderFooter, setHideHeaderFooter] = useState(true)
  const [pageTitle, setPageTitle] = useState(data.title || data.productName || 'Pagina COD')
  const isEditing = !!data.fromDashboard

  useEffect(() => {
    // Incarca GrapesJS dinamic
    Promise.all([
      import('grapesjs'),
      import('grapesjs/dist/css/grapes.min.css')
    ]).then(([{ default: grapesjs }]) => {
      if (gjsRef.current) gjsRef.current.destroy()

      const editor = grapesjs.init({
        container: editorRef.current,
        fromElement: false,
        height: 'calc(100vh - 64px)',
        storageManager: false,
        undoManager: { trackChanges: true },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Mobile', width: '390px', widthMedia: '480px' }
          ]
        },
        panels: { defaults: [] }, // ascundem panels default, facem ale noastre
        blockManager: { appendTo: '#blocks-panel', blocks: [] },
        styleManager: {
          appendTo: '#styles-panel',
          sectors: [
            {
              name: 'Typography',
              properties: ['font-family', 'font-size', 'font-weight', 'color', 'text-align', 'line-height']
            },
            {
              name: 'Spacing',
              properties: ['padding', 'margin']
            },
            {
              name: 'Background',
              properties: ['background-color', 'background-image']
            },
            {
              name: 'Border',
              properties: ['border-radius', 'border', 'border-color']
            },
            {
              name: 'Dimensions',
              properties: ['width', 'max-width', 'height']
            }
          ]
        },
        layerManager: false,
        traitManager: { appendTo: '#traits-panel' },
        canvas: {
          styles: [
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
          ]
        }
      })

      gjsRef.current = editor

      // Daca e pagina existenta din dashboard, incarca HTML-ul ei
      if (data.fromDashboard && data.body_html) {
        // Extrage CSS si HTML separat
        const styleMatch = data.body_html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        const css = styleMatch ? styleMatch[1] : ''
        const htmlOnly = data.body_html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        editor.setComponents(htmlOnly)
        if (css) editor.setStyle(css)
      } else {
        const html = buildHTML(data, codFormApp)
        const css = buildCSS(data)
        editor.setComponents(html)
        editor.setStyle(css)
      }

      // Adauga blocuri custom
      addBlocks(editor, data)

      // Sync device cu toolbar
      editor.on('device:change', () => {
        setDevice(editor.Devices.getSelected().id === 'Mobile' ? 'mobile' : 'desktop')
      })
    })

    return () => {
      if (gjsRef.current) gjsRef.current.destroy()
    }
  }, [data])

  function switchDevice(d) {
    setDevice(d)
    if (!gjsRef.current) return
    gjsRef.current.Devices.select(d === 'mobile' ? 'Mobile' : 'Desktop')
  }

  async function loadProducts() {
    setLoadingProducts(true)
    try {
      const res = await fetch('/api/get-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, token })
      })
      const d = await res.json()
      setProducts(d.products || [])
    } catch(e) { console.log('Load products error:', e.message) }
    setLoadingProducts(false)
  }

  async function publish() {
    if (!gjsRef.current) return
    setPublishing(true)
    setError('')
    try {
      const html = gjsRef.current.getHtml()
      const css = gjsRef.current.getCss()
      const fullHtml = `<style>${css}</style>${html}`

      // Comprima agresiv imaginile base64 - max 600px, quality 0.5
      async function compressImage(base64, maxWidth=600, quality=0.5) {
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            const ratio = Math.min(1, maxWidth / img.width)
            canvas.width = Math.round(img.width * ratio)
            canvas.height = Math.round(img.height * ratio)
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            // Incearca sa fie sub 80KB
            let q = quality
            let result = canvas.toDataURL('image/jpeg', q)
            while (result.length > 80000 && q > 0.2) {
              q -= 0.1
              result = canvas.toDataURL('image/jpeg', q)
            }
            resolve(result)
          }
          img.onerror = () => resolve(base64)
          img.src = base64
        })
      }

      // Comprima toate imaginile
      const images = data.images || []
      const compressedImages = await Promise.all(
        images.map(img => img && img.startsWith('data:') ? compressImage(img) : Promise.resolve(img))
      )
      const sizes = compressedImages.map(img => img ? Math.round(img.length/1024) + 'KB' : 'null')
      console.log('Compressed sizes:', sizes.join(', '))

      // Inlocuieste in HTML
      let finalHtml = fullHtml
      images.forEach((originalImg, i) => {
        if (originalImg && compressedImages[i]) {
          finalHtml = finalHtml.split(originalImg).join(compressedImages[i])
        }
      })
      console.log('Final HTML size:', Math.round(finalHtml.length/1024), 'KB')
      
      // Daca tot e prea mare, scoatem imaginile base64 complet
      if (finalHtml.length > 450000) {
        console.log('Still too big, removing base64 images')
        finalHtml = finalHtml.replace(/src="data:image\/[^"]{100,}"/g, 'src="https://placehold.co/600x400/f3f4f6/999?text=Imagine"')
        console.log('After removal:', Math.round(finalHtml.length/1024), 'KB')
      }

      const variantId = selectedProduct?.variants?.[0]?.id || data.variantId || null
      const productHandle = selectedProduct?.handle || null
      const finalCodFormApp = localStorage.getItem('codform_' + shop) || codFormApp || null
      console.log('[Publish] finalCodFormApp:', finalCodFormApp, 'variantId:', variantId)
      
      // Adauga clasa si div-ul Releasit GemPages
      if (finalCodFormApp === 'releasit') {
        // Inlocuieste toate butoanele de comanda cu clasa Releasit
        finalHtml = finalHtml
          .replace(/href="#formular"([^>]*)>COMANDĂ ACUM/g, 'class="rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage"$1>COMANDĂ ACUM')
          .replace(/class="cod-button([^"]*)"/g, 'class="rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage$1"')
          .replace(/class="releasit-button([^"]*)"/g, 'class="rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage$1"')
        // Adauga div-ul magic GemPages care declanseaza Releasit
        finalHtml = '<div class="_rsi-cod-form-is-gempage"></div>' + finalHtml
        console.log('[Publish] Releasit GemPages integration added')
      } else if (finalCodFormApp === 'easysell') {
        finalHtml = finalHtml
          .replace(/href="#formular"([^>]*)>COMANDĂ ACUM/g, 'class="es-cod-button"$1>COMANDĂ ACUM')
        console.log('[Publish] EasySell integration added')
      }
      
      // Inlocuieste VARIANT_ID cu variantId real DIRECT IN BROWSER
      if (variantId) {
        finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
        console.log('[Publish] Replaced VARIANT_ID with:', variantId)
      }
      
      // Injecteaza scriptul COD form direct in browser
      if (finalCodFormApp === 'releasit' && productHandle) {
        const vid = variantId || '0'
        const handle = productHandle || ''
        const codScript = `<script>
(function(){
  var V="${vid}";
  var H="${handle}";
  window._PRODUCT_HANDLE = H;
  
  function openDrawer(varId) {
    var old = document.getElementById('unitone-drawer');
    if (old) old.remove();
    var d = document.createElement('div');
    d.id = 'unitone-drawer';
    d.innerHTML = '<style>@keyframes uSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}</style><div onclick="document.getElementById(\'unitone-drawer\').remove()" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483646"></div><div style="position:fixed;top:0;right:0;width:100%;max-width:480px;height:100%;background:#fff;z-index:2147483647;display:flex;flex-direction:column;animation:uSlide 0.3s ease;box-shadow:-4px 0 30px rgba(0,0,0,0.2)"><div style="padding:14px 16px;background:#fff;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center"><span style="font-size:15px;font-weight:700">Finalizează comanda</span><button onclick="document.getElementById(\'unitone-drawer\').remove()" style="background:rgba(0,0,0,0.06);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button></div><iframe src="/products/'+H+'?variant='+varId+'" style="flex:1;border:none;width:100%" id="unitone-iframe"></iframe></div>';
    document.body.appendChild(d);
    // Dupa load, click pe butonul Releasit din iframe
    document.getElementById('unitone-iframe').onload = function() {
      try {
        var iDoc = this.contentDocument;
        setTimeout(function(){
          var b = iDoc.querySelector('._rsi-buy-now-button');
          if(b){b.click();console.log('[UnitOne] Releasit button clicked in iframe');}
        }, 1500);
      } catch(e){}
    };
  }
  
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('._rsi-cod-form-pagefly-button-overwrite-v2, .releasit-button');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openDrawer(btn.getAttribute('data-variant-id') || V);
  }, true);
  
  console.log('[UnitOne] Drawer ready, handle:', H, 'variant:', V);
})();
</script>`
        finalHtml = codScript + finalHtml
        console.log('[Publish] COD drawer script injected in browser')
      }

      const body = isEditing
        ? { action: 'update', shop, token, pageId: data.id, title: pageTitle, html: finalHtml, hideHeaderFooter, codFormApp: finalCodFormApp, variantId, productHandle }
        : { shop, token, title: pageTitle, html: finalHtml, productId: selectedProduct?.id, hideHeaderFooter, codFormApp: finalCodFormApp, variantId, productHandle }

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      // Redirect la Shopify Billing
      if (json.billingUrl) {
        window.top.location.href = json.billingUrl
      } else if (json.pageUrl) {
        setPublishedUrl(json.pageUrl)
        setPublished(true)
      }
    } catch (e) {
      setError('Eroare la publicare: ' + e.message)
    }
    setPublishing(false)
  }

  if (published) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f', fontFamily:'Inter,system-ui,sans-serif', color:'#fff' }}>
      <div style={{ textAlign:'center', maxWidth:440 }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
        <h2 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>Pagina e live în Shopify!</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', marginBottom:24 }}>Pagina COD a fost publicată în magazinul tău.</p>
        <a href={publishedUrl} target="_blank" rel="noreferrer"
          style={{ display:'inline-block', padding:'12px 24px', borderRadius:10, background:'linear-gradient(135deg,#e53e3e,#c53030)', color:'#fff', textDecoration:'none', fontSize:15, fontWeight:700, marginBottom:12 }}>
          🔗 Vezi pagina live
        </a>
        <br />
        <button onClick={onBack}
          style={{ padding:'10px 24px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#fff', fontSize:14, cursor:'pointer', marginTop:8 }}>
          + Generează altă pagină
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', fontFamily:'Inter,system-ui,sans-serif', background:'#1a1a2e' }}>
      {/* TOOLBAR */}
      <div style={{ height:64, background:'#0a0a0f', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', padding:'0 16px', gap:10, flexShrink:0, zIndex:100 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'6px 10px', borderRadius:8 }}>
          ← Înapoi
        </button>

        <input
          value={pageTitle}
          onChange={e => setPageTitle(e.target.value)}
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'4px 10px', color:'#fff', fontSize:14, fontWeight:600, outline:'none', minWidth:0 }}
          placeholder="Numele paginii..."
        />

        {/* Device selector */}
        <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, gap:2 }}>
          {[['desktop','🖥️'],['mobile','📱']].map(([d, ic]) => (
            <button key={d} onClick={() => switchDevice(d)}
              style={{ padding:'5px 12px', borderRadius:8, border:'none', background: device===d ? 'rgba(229,62,62,0.8)' : 'transparent', color:'#fff', fontSize:14, cursor:'pointer' }}>
              {ic}
            </button>
          ))}
        </div>

        {/* Toggle header/footer */}
        <button onClick={() => setHideHeaderFooter(!hideHeaderFooter)}
          title={hideHeaderFooter ? 'Header/Footer ascuns' : 'Header/Footer vizibil'}
          style={{ padding:'5px 12px', borderRadius:8, border:'none', background: hideHeaderFooter ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)', color: hideHeaderFooter ? '#4ade80' : 'rgba(255,255,255,0.5)', fontSize:12, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
          {hideHeaderFooter ? '✓ Fără H/F' : 'Cu H/F'}
        </button>

        {/* Undo/Redo */}
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => gjsRef.current?.UndoManager.undo()}
            style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:13 }}>↩️</button>
          <button onClick={() => gjsRef.current?.UndoManager.redo()}
            style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:13 }}>↪️</button>
        </div>

        {error && <span style={{ fontSize:12, color:'#fc8181' }}>⚠️ {error}</span>}

        <button onClick={() => { 
          if(isEditing) { 
            publish() 
          } else { 
            setSelectedProduct(null)
            setShowProductModal(true)
            if(products.length===0) loadProducts() 
          } 
        }} disabled={publishing}
          style={{ padding:'8px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#e53e3e,#c53030)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity: publishing ? 0.6 : 1, boxShadow:'0 2px 8px rgba(229,62,62,0.3)', whiteSpace:'nowrap' }}>
          {publishing ? '⏳ ...' : isEditing ? '💾 Salvează modificările' : '🚀 Publică — 40 RON'}
        </button>
      </div>

      {/* EDITOR LAYOUT */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* LEFT: Blocks */}
        <div style={{ width:220, background:'#0f0f1a', borderRight:'1px solid rgba(255,255,255,0.06)', overflow:'auto', flexShrink:0 }}>
          <div style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1 }}>Blocuri</div>
          <div id="blocks-panel" />
        </div>

        {/* CENTER: Canvas */}
        <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
          <div ref={editorRef} style={{ width:'100%', height:'100%' }} />
        </div>

        {/* RIGHT: Styles + Traits */}
        <div style={{ width:260, background:'#0f0f1a', borderLeft:'1px solid rgba(255,255,255,0.06)', overflow:'auto', flexShrink:0 }}>
          <div style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1 }}>Stiluri</div>
          <div id="styles-panel" />
          <div style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1, marginTop:8 }}>Proprietăți</div>
          <div id="traits-panel" />
        </div>
      </div>
      {/* Modal selectare produs */}
      {showProductModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a1a2e', borderRadius:20, padding:28, width:460, maxWidth:'90vw', maxHeight:'80vh', display:'flex', flexDirection:'column', border:'1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ color:'#fff', fontSize:17, fontWeight:800, margin:0 }}>Asociază produsul din magazin</h3>
              <button onClick={() => setShowProductModal(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:16, lineHeight:1.6 }}>
              Selectează produsul căruia îi asociezi acest landing page. Când clienții vor accesa produsul, vor fi redirectați la LP.
            </p>
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {loadingProducts ? (
                <div style={{ textAlign:'center', padding:20, color:'rgba(255,255,255,0.4)' }}>Se încarcă produsele...</div>
              ) : products.map(p => (
                <div key={p.id} onClick={() => { console.log('[Modal] Selected product:', p.title, 'variantId:', p.variants?.[0]?.id); setSelectedProduct(p); }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, border: selectedProduct?.id===p.id ? '1.5px solid #e53e3e' : '1px solid rgba(255,255,255,0.08)', background: selectedProduct?.id===p.id ? 'rgba(229,62,62,0.08)' : 'rgba(255,255,255,0.02)', cursor:'pointer' }}>
                  {p.images?.[0] && <img src={p.images[0].src} alt={p.title} style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{p.variants?.[0]?.price} RON</div>
                  </div>
                  {selectedProduct?.id===p.id && <span style={{ color:'#e53e3e', fontSize:18 }}>✓</span>}
                </div>
              ))}
            </div>
            {codFormApp && codFormApp !== 'none' && !selectedProduct && (
              <div style={{ padding:'10px 14px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:10, fontSize:13, color:'#fbbf24', marginBottom:12, display:'flex', gap:8 }}>
                <span>⚠️</span>
                <span>Selectează produsul pentru a conecta {codFormApp === 'releasit' ? 'Releasit' : 'EasySell'} la butonul de comandă.</span>
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowProductModal(false)}
                style={{ flex:1, padding:12, borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#fff', fontSize:14, cursor:'pointer' }}>
                Anulează
              </button>
              <button onClick={() => { setShowProductModal(false); publish() }} disabled={!selectedProduct}
                style={{ flex:2, padding:12, borderRadius:10, border:'none', background: selectedProduct ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'rgba(255,255,255,0.1)', color:'#fff', fontSize:14, fontWeight:700, cursor: selectedProduct ? 'pointer' : 'not-allowed' }}>
                {selectedProduct ? `Publică pentru "${selectedProduct.title.substring(0,25)}..."` : 'Selectează un produs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function buildCSS(data) {
  const primary = data.style?.primaryColor || '#dc2626'
  const secondary = data.style?.secondaryColor || '#111111'
  const font = data.style?.fontFamily || 'Inter, system-ui, sans-serif'
  const radius = data.style?.borderRadius || '12px'

  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${font}; background: #fff; color: #111; max-width: 600px; margin: 0 auto; }
    .btn-main { width: 100%; padding: 17px; border-radius: ${radius}; background: linear-gradient(135deg, ${primary}, ${adjustColor(primary, -20)}); color: #fff; border: none; font-size: 18px; font-weight: 900; cursor: pointer; font-family: inherit; }
    .inp { padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 15px; outline: none; width: 100%; font-family: inherit; box-sizing: border-box; }
    .benefit-row { display: flex; gap: 12px; align-items: flex-start; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: ${radius}; padding: 12px 14px; margin-bottom: 10px; }
    .timer-block { display: flex; gap: 8px; justify-content: center; }
    .timer-val { background: ${secondary}; color: #fff; border-radius: 8px; padding: 10px 18px; font-size: 26px; font-weight: 900; font-family: monospace; min-width: 56px; text-align: center; display: inline-block; }
    .timer-lbl { font-size: 10px; color: #999; margin-top: 3px; letter-spacing: 2px; display: block; text-align: center; }
  `
}

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, (num >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
