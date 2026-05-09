import { useEffect, useRef, useState } from 'react'

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
          .replace(/href="#formular"([^>]*)>COMANDÄ ACUM/g, 'class="rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage"$1>COMANDÄ ACUM')
          .replace(/class="cod-button([^"]*)"/g, 'class="rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage$1"')
          .replace(/class="releasit-button([^"]*)"/g, 'class="rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage$1"')
        // Adauga div-ul magic GemPages care declanseaza Releasit
        finalHtml = '<div class="_rsi-cod-form-is-gempage"></div>' + finalHtml
        console.log('[Publish] Releasit GemPages integration added')
      } else if (finalCodFormApp === 'easysell') {
        finalHtml = finalHtml
          .replace(/href="#formular"([^>]*)>COMANDÄ ACUM/g, 'class="es-cod-button"$1>COMANDÄ ACUM')
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
    d.innerHTML = '<style>@keyframes uSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}</style><div onclick="document.getElementById(\'unitone-drawer\').remove()" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483646"></div><div style="position:fixed;top:0;right:0;width:100%;max-width:480px;height:100%;background:#fff;z-index:2147483647;display:flex;flex-direction:column;animation:uSlide 0.3s ease;box-shadow:-4px 0 30px rgba(0,0,0,0.2)"><div style="padding:14px 16px;background:#fff;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center"><span style="font-size:15px;font-weight:700">FinalizeazÄ comanda</span><button onclick="document.getElementById(\'unitone-drawer\').remove()" style="background:rgba(0,0,0,0.06);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">â</button></div><iframe src="/products/'+H+'?variant='+varId+'" style="flex:1;border:none;width:100%" id="unitone-iframe"></iframe></div>';
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
        <div style={{ fontSize:64, marginBottom:16 }}>ð</div>
        <h2 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>Pagina e live Ã®n Shopify!</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', marginBottom:24 }}>Pagina COD a fost publicatÄ Ã®n magazinul tÄu.</p>
        <a href={publishedUrl} target="_blank" rel="noreferrer"
          style={{ display:'inline-block', padding:'12px 24px', borderRadius:10, background:'linear-gradient(135deg,#e53e3e,#c53030)', color:'#fff', textDecoration:'none', fontSize:15, fontWeight:700, marginBottom:12 }}>
          ð Vezi pagina live
        </a>
        <br />
        <button onClick={onBack}
          style={{ padding:'10px 24px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#fff', fontSize:14, cursor:'pointer', marginTop:8 }}>
          + GenereazÄ altÄ paginÄ
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', fontFamily:'Inter,system-ui,sans-serif', background:'#1a1a2e' }}>
      {/* TOOLBAR */}
      <div style={{ height:64, background:'#0a0a0f', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', padding:'0 16px', gap:10, flexShrink:0, zIndex:100 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'6px 10px', borderRadius:8 }}>
          â Ãnapoi
        </button>

        <input
          value={pageTitle}
          onChange={e => setPageTitle(e.target.value)}
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'4px 10px', color:'#fff', fontSize:14, fontWeight:600, outline:'none', minWidth:0 }}
          placeholder="Numele paginii..."
        />

        {/* Device selector */}
        <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, gap:2 }}>
          {[['desktop','ð¥ï¸'],['mobile','ð±']].map(([d, ic]) => (
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
          {hideHeaderFooter ? 'â FÄrÄ H/F' : 'Cu H/F'}
        </button>

        {/* Undo/Redo */}
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => gjsRef.current?.UndoManager.undo()}
            style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:13 }}>â©ï¸</button>
          <button onClick={() => gjsRef.current?.UndoManager.redo()}
            style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:13 }}>âªï¸</button>
        </div>

        {error && <span style={{ fontSize:12, color:'#fc8181' }}>â ï¸ {error}</span>}

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
          {publishing ? 'â³ ...' : isEditing ? 'ð¾ SalveazÄ modificÄrile' : 'ð PublicÄ â 40 RON'}
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
          <div style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1, marginTop:8 }}>ProprietÄÈi</div>
          <div id="traits-panel" />
        </div>
      </div>
      {/* Modal selectare produs */}
      {showProductModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a1a2e', borderRadius:20, padding:28, width:460, maxWidth:'90vw', maxHeight:'80vh', display:'flex', flexDirection:'column', border:'1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ color:'#fff', fontSize:17, fontWeight:800, margin:0 }}>AsociazÄ produsul din magazin</h3>
              <button onClick={() => setShowProductModal(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:20 }}>â</button>
            </div>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:16, lineHeight:1.6 }}>
              SelecteazÄ produsul cÄruia Ã®i asociezi acest landing page. CÃ¢nd clienÈii vor accesa produsul, vor fi redirectaÈi la LP.
            </p>
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {loadingProducts ? (
                <div style={{ textAlign:'center', padding:20, color:'rgba(255,255,255,0.4)' }}>Se Ã®ncarcÄ produsele...</div>
              ) : products.map(p => (
                <div key={p.id} onClick={() => { console.log('[Modal] Selected product:', p.title, 'variantId:', p.variants?.[0]?.id); setSelectedProduct(p); }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, border: selectedProduct?.id===p.id ? '1.5px solid #e53e3e' : '1px solid rgba(255,255,255,0.08)', background: selectedProduct?.id===p.id ? 'rgba(229,62,62,0.08)' : 'rgba(255,255,255,0.02)', cursor:'pointer' }}>
                  {p.images?.[0] && <img src={p.images[0].src} alt={p.title} style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{p.variants?.[0]?.price} RON</div>
                  </div>
                  {selectedProduct?.id===p.id && <span style={{ color:'#e53e3e', fontSize:18 }}>â</span>}
                </div>
              ))}
            </div>
            {codFormApp && codFormApp !== 'none' && !selectedProduct && (
              <div style={{ padding:'10px 14px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:10, fontSize:13, color:'#fbbf24', marginBottom:12, display:'flex', gap:8 }}>
                <span>â ï¸</span>
                <span>SelecteazÄ produsul pentru a conecta {codFormApp === 'releasit' ? 'Releasit' : 'EasySell'} la butonul de comandÄ.</span>
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowProductModal(false)}
                style={{ flex:1, padding:12, borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#fff', fontSize:14, cursor:'pointer' }}>
                AnuleazÄ
              </button>
              <button onClick={() => { setShowProductModal(false); publish() }} disabled={!selectedProduct}
                style={{ flex:2, padding:12, borderRadius:10, border:'none', background: selectedProduct ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'rgba(255,255,255,0.1)', color:'#fff', fontSize:14, fontWeight:700, cursor: selectedProduct ? 'pointer' : 'not-allowed' }}>
                {selectedProduct ? `PublicÄ pentru "${selectedProduct.title.substring(0,25)}..."` : 'SelecteazÄ un produs'}
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

function buildHTML(data, codFormApp) {
  let btnClass = 'cod-button'
  if (codFormApp === 'releasit') btnClass = 'rsi-cod-form-gempages-button-overwrite rsi-cod-form-is-gempage'
  else if (codFormApp === 'easysell') btnClass = 'es-cod-button'
  const price = data.price || 149
  const oldPrice = data.oldPrice || Math.round(price * 1.6)
  const disc = Math.round((1 - price / oldPrice) * 100)
  const imgs = data.images || []
  const primary = data.style?.primaryColor || '#e8000d'
  const JUDETE = ["Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani","Braila","Brasov","Bucuresti","Buzau","Calarasi","Caras-Severin","Cluj","Constanta","Covasna","Dambovita","Dolj","Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures","Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava","Teleorman","Timis","Tulcea","Valcea","Vaslui","Vrancea"]
  const jOpts = JUDETE.map(j => '<option value="' + j + '">' + j + '</option>').join('')
  const img = (src, style) => src ? '<img src="' + src + '" style="' + (style || 'width:100%;display:block') + '" />' : ''
  const benefits = (data.benefits || []).slice(0, 5)
  // Placeholder vizibil pentru butonul Releasit - are border rosu dashed si text explicativ
  const relBtn = '<div class="unitone-releasit-btn" style="min-height:54px;display:block;border:2px dashed ' + primary + ';border-radius:6px;padding:6px;text-align:center;margin:8px 0"><span style="color:' + primary + ';font-size:12px;pointer-events:none;line-height:42px">&#x1F6D2; Buton COD Releasit — apare automat aici</span></div>'
  const tCards = (data.testimonials || []).map((t, i) => '<div style="margin-bottom:32px">' + (imgs[i] ? '<div style="margin-bottom:12px">' + img(imgs[i], 'width:100%;max-width:400px;display:block;margin:0 auto;border-radius:8px') + '</div>' : '') + '<p style="font-size:13px;color:#555;margin-bottom:6px">Recenzie de la ' + t.name + ': ' + '\u2B50'.repeat(t.stars||5) + '</p><p style="font-size:15px;color:#222;line-height:1.6;font-style:italic">"' + t.text + '"</p></div>').join('')
  const faqHtml = (data.faq || []).map(f => '<details style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:600;cursor:pointer;background:#f9fafb">' + f.q + '</summary><div style="padding:12px 16px;font-size:14px;color:#555;line-height:1.7">' + f.a + '</div></details>').join('')

  return '<div class="_rsi-cod-form-is-gempage" style="display:none"></div>\n' +
'<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;background:#fff;color:#111">\n' +
'<div style="background:#111;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:600">\uD83D\uDCDE 0700 000 000 \u00A0\u00B7\u00A0 \uD83D\uDE9A LIVRARE RAPIDA IN TOATA ROMANIA</div>\n' +
'<div style="padding:24px 20px 16px;text-align:center;border-bottom:2px solid ' + primary + '"><h1 style="font-size:22px;font-weight:900;line-height:1.3;margin:0;color:#111">' + (data.headline || data.productName) + '</h1></div>\n' +
'<div>' + (imgs[0] ? '<div style="background:#f8f8f8">' + img(imgs[0], 'width:100%;max-height:420px;object-fit:contain;display:block;margin:0 auto') + '</div>' : '') + (imgs.length > 1 ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#e5e7eb">' + imgs.slice(1,5).map(s => img(s,'width:100%;height:200px;object-fit:cover;display:block')).join('') + '</div>' : '') + '</div>\n' +
'<div style="padding:16px 20px;text-align:center;background:#fff8f0;border-bottom:1px solid #ffe0b2"><span style="font-size:18px">\u2B50\u2B50\u2B50\u2B50\u2B50</span><span style="font-size:14px;font-weight:700;color:#e65c00;margin-left:8px">' + (data.reviewCount||1247).toLocaleString() + '+ Clienti Multumiti!</span></div>\n' +
'<div style="padding:24px 20px;background:#fff"><div style="background:#e8000d;color:#fff;text-align:center;padding:8px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:16px">TOP ' + benefits.length + ' MOTIVE SA COMANZI ACUM:</div><ul style="margin:0;padding:0;list-style:none">' + benefits.map(b => '<li style="margin-bottom:10px;font-size:15px;line-height:1.5;color:#222;display:flex;gap:10px;align-items:flex-start"><span style="color:#e8000d;font-weight:900;flex-shrink:0">&#x2713;</span><span>' + b + '</span></li>').join('') + '</ul></div>\n' +
'<div style="padding:20px;background:#fff;border-top:1px solid #f3f4f6;border-bottom:3px solid #e8000d;text-align:center"><div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:16px"><span style="font-size:20px;color:#999;text-decoration:line-through">' + oldPrice + ' LEI</span><span style="font-size:42px;font-weight:900;color:#e8000d">' + price + ' LEI</span><span style="background:#e8000d;color:#fff;padding:4px 10px;border-radius:4px;font-size:14px;font-weight:700">-' + disc + '%</span></div>' + relBtn + '<p style="font-size:13px;color:#666;margin:8px 0 0">&#x2705; Plata la livrare \u00B7 \uD83D\uDE9A Livrare 2-4 zile \u00B7 \u21A9\uFE0F Retur 30 zile</p></div>\n' +
'<div style="padding:28px 20px;background:#f9fafb"><div style="text-align:center;background:#e8000d;color:#fff;padding:6px;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:16px">' + (data.subheadline || 'DE CE SA COMANZI DE LA NOI?') + '</div>' + (imgs[1] ? '<div style="margin-bottom:20px">' + img(imgs[1],'width:100%;border-radius:8px;display:block') + '</div>' : '') + (data.howItWorks||[]).map((s,i) => '<div style="display:flex;gap:14px;margin-bottom:16px;align-items:flex-start"><div style="width:32px;height:32px;background:#e8000d;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;flex-shrink:0">' + (i+1) + '</div><div><strong style="font-size:15px;display:block;margin-bottom:3px">' + s.title + '</strong><span style="font-size:14px;color:#555;line-height:1.6">' + s.desc + '</span></div></div>').join('') + relBtn + '</div>\n' +
(imgs[2] ? '<div style="background:#fff">' + img(imgs[2],'width:100%;display:block') + '</div>\n' : '') +
'<div style="padding:20px;background:#fff;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;text-align:center"><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x1F4B3;</div>Plata ramburs</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x2705;</div>Satisfactie garantata</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x21A9;&#xFE0F;</div>Banii inapoi 30 zile</div></div>\n' +
'<div style="padding:28px 20px;background:#f9fafb"><div style="text-align:center;background:#111;color:#fff;padding:8px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:24px">PARERILE CLIENTILOR NOSTRI:</div>' + tCards + '</div>\n' +
'<div style="padding:24px 20px;background:#fff"><h3 style="font-size:18px;font-weight:800;margin:0 0 16px;text-align:center">Intrebari frecvente</h3>' + faqHtml + '</div>\n' +
'<div id="formular" style="' + (codFormApp && codFormApp !== 'none' ? 'display:none;' : '') + 'padding:28px 20px;background:#fff3f3;border-top:4px solid #e8000d">' +
'<h2 style="font-size:22px;font-weight:900;text-align:center;margin:0 0 24px">COMANDA ACUM CU ' + disc + '% REDUCERE</h2>' +
'<div id="form-fields" style="display:flex;flex-direction:column;gap:12px">' +
'<input id="f-name" placeholder="Nume si Prenume" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>' +
'<input id="f-phone" placeholder="Numar de telefon" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>' +
'<input id="f-address" placeholder="Adresa completa" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>' +
'<input id="f-city" placeholder="Localitate" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>' +
'<select id="f-county" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif;color:#555;background:#fff"><option value="">Judet</option>' + jOpts + '</select>' +
'<button onclick="submitOrder()" style="background:#e8000d;color:#fff;border:none;padding:18px;border-radius:6px;font-size:18px;font-weight:900;cursor:pointer;width:100%;font-family:Arial,sans-serif">FINALIZEAZA COMANDA — PLATA LA LIVRARE</button>' +
'</div>' +
'<div id="form-success" style="display:none;text-align:center;padding:40px 20px"><div style="font-size:56px;margin-bottom:12px">&#x2705;</div><h3 style="font-size:22px;font-weight:800;color:#16a34a">Comanda plasata cu succes!</h3></div>' +
'</div>\n' +
'<div style="background:#111;color:#888;padding:20px;text-align:center;font-size:12px"><p style="margin:0 0 4px;color:#ccc;font-weight:600">\u00A9 2025 ' + data.productName + '</p><p style="margin:0">Termeni si Conditii \u00B7 Politica de Confidentialitate \u00B7 ANPC</p></div>\n' +
'<script>function submitOrder(){var n=document.getElementById("f-name").value.trim(),p=document.getElementById("f-phone").value.trim(),a=document.getElementById("f-address").value.trim(),c=document.getElementById("f-city").value.trim(),j=document.getElementById("f-county").value;if(!n||!p||!a||!c||!j){alert("Completeaza toate campurile!");return;}document.getElementById("form-fields").style.display="none";document.getElementById("form-success").style.display="block";}<\/script>\n' +
'</div>'
}

function addBlocks(editor, data) {
  const p = data?.style?.primaryColor || '#e8000d'
  // Placeholder vizibil in editor cu border rosu dashed
  const relBtn = (extra) => '<div class="unitone-releasit-btn" style="min-height:54px;display:block;border:2px dashed ' + p + ';border-radius:6px;padding:6px;text-align:center;' + (extra||'') + '"><span style="color:' + p + ';font-size:12px;pointer-events:none;line-height:42px">&#x1F6D2; Buton COD — trage-ma unde vrei</span></div>'

  const blocks = [
    // ── COD FORM (primele, deschise automat) ──
    {id:'releasit-btn', label:'🛒 Buton COD Form', cat:'COD Form', content: relBtn('margin:10px 0;')},
    {id:'releasit-btn-full', label:'🛒 Buton COD Full Width', cat:'COD Form', content:'<div style="padding:10px 20px">' + relBtn('width:100%;box-sizing:border-box;') + '</div>'},
    {id:'releasit-btn-center', label:'🛒 Buton COD Centrat', cat:'COD Form', content:'<div style="text-align:center;padding:16px 20px">' + relBtn('display:inline-block;min-width:240px;') + '</div>'},

    // ── LAYOUT ──
    {id:'row-2col', label:'2 Coloane', cat:'Layout', content:'<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px"><div style="padding:16px;background:#f9fafb;border-radius:8px;min-height:60px">Coloana 1</div><div style="padding:16px;background:#f9fafb;border-radius:8px;min-height:60px">Coloana 2</div></div>'},
    {id:'row-3col', label:'3 Coloane', cat:'Layout', content:'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:20px"><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 1</div><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 2</div><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 3</div></div>'},
    {id:'spacer', label:'Spatiu', cat:'Layout', content:'<div style="height:40px"></div>'},
    {id:'line', label:'Separator', cat:'Layout', content:'<hr style="border:none;border-top:2px solid #e5e7eb;margin:8px 20px"/>'},

    // ── TEXT ──
    {id:'heading', label:'Heading H2', cat:'Text', content:'<h2 style="font-size:28px;font-weight:900;color:#111;padding:16px 20px;margin:0;line-height:1.2">Titlul tau aici</h2>'},
    {id:'heading-h3', label:'Heading H3', cat:'Text', content:'<h3 style="font-size:20px;font-weight:800;color:#111;padding:12px 20px;margin:0">Subtitlu</h3>'},
    {id:'text-block', label:'Paragraf', cat:'Text', content:'<p style="font-size:15px;color:#444;line-height:1.7;padding:12px 20px;margin:0">Textul tau aici. Click pentru a edita.</p>'},
    {id:'button-cta', label:'Buton CTA', cat:'Text', content:'<div style="padding:16px 20px;text-align:center"><a href="#formular" style="display:inline-block;background:' + p + ';color:#fff;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:800;text-decoration:none">COMANDA ACUM!</a></div>'},

    // ── MEDIA ──
    {id:'image', label:'Imagine', cat:'Media', content:'<div><img src="https://placehold.co/650x400/f3f4f6/999?text=Imagine" style="width:100%;display:block"/></div>'},
    {id:'video', label:'Video YouTube', cat:'Media', content:'<div style="padding:20px"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div></div>'},
    {id:'img-comparison', label:'Inainte / Dupa', cat:'Media', content:'<div style="padding:20px"><div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="display:grid;grid-template-columns:1fr 1fr"><div style="text-align:center;padding:12px;background:#fef2f2"><div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px">INAINTE</div><img src="https://placehold.co/300x250/fee2e2/dc2626?text=Inainte" style="width:100%;display:block;border-radius:4px"/></div><div style="text-align:center;padding:12px;background:#f0fdf4"><div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:8px">DUPA</div><img src="https://placehold.co/300x250/dcfce7/16a34a?text=Dupa" style="width:100%;display:block;border-radius:4px"/></div></div></div></div>'},
    {id:'carousel', label:'Carousel', cat:'Media', content:'<div style="padding:20px;overflow:hidden"><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory"><div style="min-width:280px;scroll-snap-align:start;background:#f9fafb;border-radius:10px;overflow:hidden"><img src="https://placehold.co/280x200/f3f4f6/999?text=1" style="width:100%;display:block"/><div style="padding:12px;font-size:14px;font-weight:600">Produs 1</div></div><div style="min-width:280px;scroll-snap-align:start;background:#f9fafb;border-radius:10px;overflow:hidden"><img src="https://placehold.co/280x200/f3f4f6/999?text=2" style="width:100%;display:block"/><div style="padding:12px;font-size:14px;font-weight:600">Produs 2</div></div></div></div>'},

    // ── HERO ──
    {id:'hero-dark', label:'Hero Banner Inchis', cat:'Hero', content:'<div style="background:linear-gradient(135deg,#111 0%,#333 100%);padding:60px 20px;text-align:center"><h1 style="color:#fff;font-size:32px;font-weight:900;margin:0 0 14px">Titlu Principal</h1><p style="color:rgba(255,255,255,0.7);font-size:16px;margin:0 0 28px">Subtitlul ofertei tale</p>' + relBtn('display:inline-block;min-width:240px;') + '</div>'},
    {id:'hero-red', label:'Hero Banner Rosu', cat:'Hero', content:'<div style="background:' + p + ';padding:50px 20px;text-align:center"><h1 style="color:#fff;font-size:30px;font-weight:900;margin:0 0 12px">Titlu Promo</h1><p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0 0 24px">Oferta limitata!</p>' + relBtn('display:inline-block;min-width:240px;border-color:rgba(255,255,255,0.6);') + '</div>'},

    // ── ELEMENTE ──
    {id:'icon-list', label:'Lista Beneficii', cat:'Elemente', content:'<div style="padding:20px"><div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:' + p + ';color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#x2713;</span><span style="font-size:14px;color:#222">Livrare rapida in toata Romania</span></div><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:' + p + ';color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#x2713;</span><span style="font-size:14px;color:#222">Plata la livrare, fara risc</span></div><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:' + p + ';color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#x2713;</span><span style="font-size:14px;color:#222">Garantie 30 zile retur</span></div></div></div>'},
    {id:'accordion', label:'FAQ Accordion', cat:'Elemente', content:'<div style="padding:20px"><details style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">Cum functioneaza plata la livrare?</summary><div style="padding:14px 16px;font-size:14px;color:#555;line-height:1.7">Platesti curierului in momentul in care primesti coletul acasa.</div></details><details style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">Cat dureaza livrarea?</summary><div style="padding:14px 16px;font-size:14px;color:#555;line-height:1.7">2-5 zile lucratoare.</div></details></div>'},
    {id:'marquee', label:'Marquee Banner', cat:'Elemente', content:'<div style="overflow:hidden;background:#111;padding:12px 0"><div style="display:flex;animation:unitone-marquee 15s linear infinite;white-space:nowrap"><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#x1F69A; Livrare GRATUITA</span><span style="color:' + p + ';padding:0 12px">&#x2605;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#x2705; Plata la livrare</span><span style="color:' + p + ';padding:0 12px">&#x2605;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#x21A9;&#xFE0F; Retur 30 zile</span><span style="color:' + p + ';padding:0 12px">&#x2605;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#x1F69A; Livrare GRATUITA</span></div></div><style>@keyframes unitone-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>'},
    {id:'tabs', label:'Tabs', cat:'Elemente', content:'<div style="padding:20px"><div style="display:flex;border-bottom:2px solid #e5e7eb;margin-bottom:16px"><button onclick="this.closest('div').querySelectorAll('[data-tab]').forEach(t=>t.style.display='none');this.closest('div').querySelector('[data-tab=\'1\']').style.display='block'" style="padding:10px 20px;border:none;background:none;font-size:14px;font-weight:700;color:' + p + ';border-bottom:2px solid ' + p + ';margin-bottom:-2px;cursor:pointer;font-family:inherit">Tab 1</button><button onclick="this.closest('div').querySelectorAll('[data-tab]').forEach(t=>t.style.display='none');this.closest('div').querySelector('[data-tab=\'2\']').style.display='block'" style="padding:10px 20px;border:none;background:none;font-size:14px;font-weight:600;color:#666;cursor:pointer;font-family:inherit">Tab 2</button></div><div data-tab="1" style="font-size:14px;color:#444;line-height:1.7">Continutul primului tab.</div><div data-tab="2" style="display:none;font-size:14px;color:#444;line-height:1.7">Continutul celui de-al doilea tab.</div></div>'},

    // ── TRUST ──
    {id:'trust-badges', label:'Trust Badges', cat:'Trust', content:'<div style="padding:20px;background:#fff;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;text-align:center"><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x1F4B3;</div>Plata ramburs</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x2705;</div>Satisfactie garantata</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x21A9;&#xFE0F;</div>Banii inapoi 30 zile</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#x1F69A;</div>Livrare rapida</div></div>'},
    {id:'testimonial', label:'Testimonial Card', cat:'Trust', content:'<div style="padding:20px 20px 0"><div style="padding:20px;background:#f9fafb;border-radius:12px;border-left:4px solid ' + p + ';margin-bottom:12px"><div style="color:#f39c12;margin-bottom:8px;font-size:16px">&#x2605;&#x2605;&#x2605;&#x2605;&#x2605;</div><p style="color:#333;margin-bottom:12px;font-style:italic;font-size:15px;line-height:1.6">"Produs excelent! L-am primit in 5 zile."</p><strong style="color:#111;font-size:14px">— Maria D., Bucuresti</strong></div></div>'},

    // ── PRODUS ──
    {id:'product-card', label:'Product Card', cat:'Produs', content:'<div style="padding:20px;border:1px solid #e5e7eb;border-radius:10px;margin:16px 20px"><img src="https://placehold.co/400x300/f9fafb/999?text=Produs" style="width:100%;border-radius:8px;display:block;margin-bottom:14px"/><h3 style="font-size:18px;font-weight:800;margin:0 0 6px">Numele Produsului</h3><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:26px;font-weight:900;color:' + p + '">149 RON</span><span style="text-decoration:line-through;color:#999;font-size:16px">249 RON</span></div>' + relBtn() + '</div>'},
    {id:'sticky-cart', label:'Sticky Cart', cat:'Produs', content:'<div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2px solid ' + p + ';padding:12px 20px;display:flex;align-items:center;justify-content:space-between;z-index:999;box-shadow:0 -4px 20px rgba(0,0,0,0.1)"><div><div style="font-size:13px;font-weight:700">Produs</div><div style="font-size:20px;font-weight:900;color:' + p + '">149 RON</div></div>' + relBtn('min-width:180px;') + '</div>'},
    {id:'bundle', label:'Bundle Discount', cat:'Produs', content:'<div style="padding:20px;background:#fff8f0;border:2px solid #fed7aa;border-radius:10px;margin:16px 20px"><div style="text-align:center;font-size:12px;font-weight:700;color:#c2410c;letter-spacing:1px;margin-bottom:14px">&#x1F525; BUNDLE SPECIAL</div><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"><div style="display:flex;align-items:center;justify-content:space-between;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb"><div style="font-size:14px;font-weight:600">Produs Principal</div><div style="font-size:15px;font-weight:900;color:' + p + '">149 RON</div></div><div style="text-align:center;font-size:18px;color:#666">+</div><div style="display:flex;align-items:center;justify-content:space-between;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb"><div><div style="font-size:14px;font-weight:600">Produs Bonus</div><div style="font-size:11px;color:#16a34a;font-weight:600">GRATUIT la bundle</div></div><div style="font-size:15px;font-weight:900;text-decoration:line-through;color:#999">29 RON</div></div></div>' + relBtn() + '</div>'},

    // ── URGENTA ──
    {id:'stock-counter', label:'Stoc Limitat', cat:'Urgenta', content:'<div style="padding:12px 20px;background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;margin:0 20px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">&#x1F4E6;</span><div><div style="font-size:13px;font-weight:700;color:#c2410c">Stoc limitat!</div><div style="font-size:12px;color:#ea580c">Au mai ramas doar <strong>7 bucati</strong> la acest pret</div></div><div style="margin-left:auto;background:#fef3c7;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:700;color:#d97706">7 / 50</div></div>'},
    {id:'urgency-strip', label:'Strip Urgenta', cat:'Urgenta', content:'<div style="background:' + p + ';color:#fff;text-align:center;padding:12px 20px;font-size:14px;font-weight:700">&#x26A0;&#xFE0F; STOC LIMITAT — Comanda acum!</div>'},
    {id:'countdown', label:'Countdown Timer', cat:'Urgenta', content:'<div style="background:' + p + ';color:#fff;padding:14px 20px;text-align:center"><div style="font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px">&#x26A1; OFERTA EXPIRA IN:</div><div style="display:flex;justify-content:center;gap:10px"><div style="text-align:center"><span id="cd-h" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">00</span><div style="font-size:10px;margin-top:3px;opacity:0.8">ORE</div></div><span style="font-size:24px;font-weight:900;padding-top:8px">:</span><div style="text-align:center"><span id="cd-m" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">14</span><div style="font-size:10px;margin-top:3px;opacity:0.8">MIN</div></div><span style="font-size:24px;font-weight:900;padding-top:8px">:</span><div style="text-align:center"><span id="cd-s" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">00</span><div style="font-size:10px;margin-top:3px;opacity:0.8">SEC</div></div></div></div><script>(function(){var t=14*60;function r(){var h=String(Math.floor(t/3600)).padStart(2,"0"),m=String(Math.floor((t%3600)/60)).padStart(2,"0"),s=String(t%60).padStart(2,"0");var eh=document.getElementById("cd-h"),em=document.getElementById("cd-m"),es=document.getElementById("cd-s");if(eh)eh.textContent=h;if(em)em.textContent=m;if(es)es.textContent=s;}setInterval(function(){if(t>0)t--;r();},1000);r();})();<\/script>'},

    // ── CONVERSIE ──
    {id:'delivery-date', label:'Data Livrare', cat:'Conversie', content:'<div style="padding:12px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 20px;display:flex;align-items:center;gap:12px"><span style="font-size:24px">&#x1F69A;</span><div><div style="font-size:14px;font-weight:700;color:#15803d">Livrare estimata: 3-5 zile lucratoare</div><div style="font-size:12px;color:#16a34a">Comanda acum!</div></div></div>'},
    {id:'coupon', label:'Cod Reducere', cat:'Conversie', content:'<div style="padding:16px 20px;background:#f0fdf4;border:2px dashed #86efac;border-radius:8px;margin:0 20px;text-align:center"><div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px">&#x1F39F;&#xFE0F; COD REDUCERE</div><div style="display:flex;align-items:center;justify-content:center;gap:10px"><code style="background:#fff;border:1px solid #86efac;border-radius:6px;padding:8px 16px;font-size:18px;font-weight:900;letter-spacing:2px;color:#15803d">COD20</code><button onclick="navigator.clipboard.writeText('COD20');this.textContent='&#x2713; Copiat!';setTimeout(()=>this.textContent='&#x1F4CB; Copiaza',2000)" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">&#x1F4CB; Copiaza</button></div></div>'},

    // ── FORMULARE ──
    {id:'newsletter', label:'Newsletter', cat:'Formulare', content:'<div style="padding:32px 20px;background:#f9fafb;text-align:center"><h3 style="font-size:20px;font-weight:800;margin:0 0 8px">Aboneaza-te si primesti -10%</h3><div style="display:flex;gap:10px;max-width:400px;margin:0 auto"><input placeholder="Email" type="email" style="flex:1;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;font-family:inherit"/><button style="background:' + p + ';color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Abonare</button></div></div>'},

    // ── NAVIGARE ──
    {id:'back-to-top', label:'Back to Top', cat:'Navigare', content:'<div style="position:fixed;bottom:24px;right:20px;z-index:998"><button onclick="window.scrollTo({top:0,behavior:'smooth'})" style="width:44px;height:44px;background:' + p + ';color:#fff;border:none;border-radius:50%;font-size:18px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25)">&#x2191;</button></div>'},

    // ── AVANSAT ──
    {id:'custom-code', label:'Custom HTML', cat:'Avansat', content:'<div style="padding:16px 20px;background:#1e1e2e;border-radius:8px;margin:16px 20px"><code style="font-size:13px;color:#a5f3fc;font-family:monospace;display:block">&lt;div&gt;Codul tau HTML&lt;/div&gt;</code></div>'},
  ]

  blocks.forEach(b => {
    editor.Blocks.add(b.id, {
      label: b.label,
      category: { id: b.cat, label: b.cat, open: b.cat === 'COD Form' },
      content: b.content,
      attributes: { class: 'gjs-block-section' }
    })
  })
}
