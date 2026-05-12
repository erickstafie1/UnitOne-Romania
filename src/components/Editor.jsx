import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../apiFetch.js'
import ThemeToggle from './ThemeToggle.jsx'

export default function Editor({ data, shop, token, codFormApp: codFormAppProp, planLimit, onBack, onPublished, onUpgrade }) {
  const codFormApp = codFormAppProp || (typeof window !== 'undefined' ? localStorage.getItem('codform_' + shop) : null) || null
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
  const [productsError, setProductsError] = useState('')
  const [hideHeaderFooter, setHideHeaderFooter] = useState(true)
  const [pageTitle, setPageTitle] = useState(data.title || data.productName || 'Pagina COD')
  const [lastSaved, setLastSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const [autosaveOn, setAutosaveOn] = useState(true)
  const isEditing = !!data.fromDashboard
  const dirtyRef = useRef(false)
  const pageIdRef = useRef(data.id || null)

  useEffect(() => {
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
            { name: 'Tablet', width: '768px', widthMedia: '992px' },
            { name: 'Mobile', width: '390px', widthMedia: '480px' }
          ]
        },
        panels: { defaults: [] },
        blockManager: { appendTo: '#blocks-panel', blocks: [] },
        styleManager: {
          appendTo: '#styles-panel',
          sectors: [
            { name: 'Typography', properties: ['font-family','font-size','font-weight','color','text-align','line-height'] },
            { name: 'Spacing', properties: ['padding','margin'] },
            { name: 'Background', properties: ['background-color','background-image'] },
            { name: 'Border', properties: ['border-radius','border','border-color'] },
            { name: 'Dimensions', properties: ['width','max-width','height'] }
          ]
        },
        layerManager: false,
        traitManager: { appendTo: '#traits-panel' },
        canvas: {
          styles: ['https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap']
        }
      })

      gjsRef.current = editor

      if (data.fromDashboard && data.body_html) {
        let raw = data.body_html
        // Extrage continutul LP din overlay-ul nostru (adaugat la publish)
        const overlayMatch = raw.match(/<div[^>]+id="unitone-lp"[^>]*>([\s\S]*?)<!--\/unitone-lp-->/)
        if (overlayMatch) raw = overlayMatch[1]
        // Sterge scripturile si div-ul GemPages adaugate de publish
        raw = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        raw = raw.replace(/<div[^>]+class="[^"]*_rsi-cod-form-is-gempage[^"]*"[^>]*><\/div>/gi, '')
        // Extrage CSS din primul style tag (LP-ul generat de GrapesJS)
        const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        const css = styleMatch ? styleMatch[1] : ''
        const htmlOnly = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        editor.setComponents(htmlOnly.trim())
        if (css) editor.setStyle(css)
      } else {
        const html = buildHTML(data, codFormApp)
        const css = buildCSS(data)
        editor.setComponents(html)
        editor.setStyle(css)
      }

      addBlocks(editor, data)

      editor.on('device:change', () => {
        const id = editor.Devices.getSelected().id
        setDevice(id === 'Mobile' ? 'mobile' : id === 'Tablet' ? 'tablet' : 'desktop')
      })

      // Track schimbari pentru autosave (ignora schimbarile din load-ul initial)
      const markDirty = () => { dirtyRef.current = true }
      setTimeout(() => {
        dirtyRef.current = false
        editor.on('component:update', markDirty)
        editor.on('component:add', markDirty)
        editor.on('component:remove', markDirty)
        editor.on('style:update', markDirty)
      }, 1000)
    })

    return () => {
      if (gjsRef.current) gjsRef.current.destroy()
    }
  }, [data])

  function switchDevice(d) {
    setDevice(d)
    if (!gjsRef.current) return
    const name = d === 'mobile' ? 'Mobile' : d === 'tablet' ? 'Tablet' : 'Desktop'
    gjsRef.current.Devices.select(name)
  }

  // ─── Validare nume unic ─────────────────────────────────────────────────────
  async function validateName() {
    if (!pageTitle || pageTitle.trim().length < 2) {
      throw new Error('Numele paginii trebuie sa aiba cel putin 2 caractere')
    }
    if (isEditing || pageIdRef.current) return  // editare aceeasi pagina = OK
    const r = await apiFetch('/api/pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', shop, token })
    })
    const d = await r.json()
    const t = pageTitle.trim().toLowerCase()
    const exists = (d.pages || []).find(p => (p.title || '').trim().toLowerCase() === t)
    if (exists) throw new Error(`O pagina cu numele "${pageTitle}" exista deja. Alege alt nume.`)
  }

  // ─── Autosave silent (la 2 min) ─────────────────────────────────────────────
  useEffect(() => {
    if (!autosaveOn) return
    const interval = setInterval(() => {
      if (dirtyRef.current && !publishing && !saving && (isEditing || pageIdRef.current)) {
        autoSave()
      }
    }, 120000)  // 2 min
    return () => clearInterval(interval)
  }, [autosaveOn, publishing, saving])

  async function autoSave() {
    if (!gjsRef.current) return
    setSaving(true)
    try {
      const html = gjsRef.current.getHtml()
      const css = gjsRef.current.getCss()
      const fullHtml = `<style>${css}</style>${html}`
      const variantId = selectedProduct?.variants?.[0]?.id || data.variantId || null
      const finalCodFormApp = localStorage.getItem('codform_' + shop) || codFormApp || null
      const pid = pageIdRef.current || data.id
      const body = {
        action: 'update', shop, token, pageId: pid,
        title: pageTitle, html: fullHtml, hideHeaderFooter,
        codFormApp: finalCodFormApp, variantId
      }
      const res = await apiFetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = await res.json()
      if (json.success) {
        setLastSaved(new Date())
        dirtyRef.current = false
      }
    } catch(e) { console.log('Autosave error:', e.message) }
    setSaving(false)
  }

  async function loadProducts() {
    setLoadingProducts(true)
    setProductsError('')
    try {
      const res = await apiFetch('/api/get-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, token })
      })
      const d = await res.json()
      console.log('get-products response:', d)
      if (!res.ok || d.error) throw new Error(d.error || 'Eroare server')
      if ((d.products || []).length === 0) setProductsError('Niciun produs găsit. Debug: ' + JSON.stringify(d.debug))
      else setProducts(d.products)
    } catch(e) { setProductsError('Eroare: ' + e.message) }
    setLoadingProducts(false)
  }

  async function publish() {
    if (!gjsRef.current) return
    setPublishing(true)
    setError('')
    try {
      await validateName()

      // Verifica limita LP pentru pagini noi (nu pentru editari)
      if (!isEditing && !pageIdRef.current && planLimit) {
        const lr = await apiFetch('/api/pages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', shop, token })
        })
        const ld = await lr.json()
        const count = (ld.pages || []).length
        if (count >= planLimit) {
          setPublishing(false)
          setError(`Ai atins limita de ${planLimit} landing pages pentru planul tau. Fa upgrade pentru mai multe.`)
          return
        }
      }
      const html = gjsRef.current.getHtml()
      const css = gjsRef.current.getCss()
      const fullHtml = `<style>${css}</style>${html}`

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

      const images = data.images || []
      const compressedImages = await Promise.all(
        images.map(img => img && img.startsWith('data:') ? compressImage(img) : Promise.resolve(img))
      )

      let finalHtml = fullHtml
      images.forEach((originalImg, i) => {
        if (originalImg && compressedImages[i]) {
          finalHtml = finalHtml.split(originalImg).join(compressedImages[i])
        }
      })

      if (finalHtml.length > 450000) {
        finalHtml = finalHtml.replace(/src="data:image\/[^"]{100,}"/g, 'src="https://placehold.co/600x400/f3f4f6/999?text=Imagine"')
      }

      const variantId = selectedProduct?.variants?.[0]?.id || data.variantId || null
      const finalCodFormApp = localStorage.getItem('codform_' + shop) || codFormApp || null

      const pid = pageIdRef.current || data.id
      const body = pid
        ? { action: 'update', shop, token, pageId: pid, title: pageTitle, html: finalHtml, hideHeaderFooter, codFormApp: finalCodFormApp, variantId }
        : { shop, token, title: pageTitle, html: finalHtml, productId: selectedProduct?.id, hideHeaderFooter, codFormApp: finalCodFormApp, variantId }

      const res = await apiFetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      if (json.pageUrl) {
        if (json.pageId) pageIdRef.current = json.pageId
        setLastSaved(new Date())
        dirtyRef.current = false
        setPublishedUrl(json.pageUrl)
        setPublished(true)
      }
    } catch(e) {
      setError('Eroare: ' + e.message)
    }
    setPublishing(false)
  }

  if (published) return (
    <div className="ue-published-shell">
      <EditorStyles />
      <div className="ue-hero-gradient" />
      <div className="ue-mesh" />
      <div className="ue-published-card fade-up">
        <div className="ue-published-orb">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div className="ue-orb-glow" />
        </div>
        <div className="ue-eyebrow">Publicat cu succes</div>
        <h2 className="ue-h1">Pagina ta e <span className="ue-h1-italic">live</span></h2>
        <p className="ue-published-text">Pagina COD a fost publicată în magazinul tău. O poți vedea acum sau te poți întoarce la dashboard.</p>
        <div className="ue-published-actions">
          <a href={publishedUrl} target="_blank" rel="noreferrer" className="ue-cta-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Vezi pagina live</span>
          </a>
          <button onClick={() => { setPublished(false); if(onPublished) onPublished(); else if(onBack) onBack() }} className="ue-cta-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Înapoi la dashboard</span>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="ue-shell">
      <EditorStyles />
      {/* TOOLBAR */}
      <div className="ue-toolbar">
        <button onClick={onBack} className="ue-tb-back" title="Înapoi la dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Înapoi</span>
        </button>

        <div className="ue-tb-divider" />

        <input
          value={pageTitle}
          onChange={e => setPageTitle(e.target.value)}
          className="ue-tb-title"
          placeholder="Numele paginii..."
        />

        <div className="ue-tb-device">
          {[
            ['desktop','Desktop', <svg key="d" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>],
            ['tablet','Tablet', <svg key="t" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>],
            ['mobile','Mobil', <svg key="m" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>]
          ].map(([d,lbl,ic]) => (
            <button key={d} onClick={() => switchDevice(d)} title={lbl}
              className={`ue-tb-device-btn ${device===d ? 'active' : ''}`}>
              {ic}
            </button>
          ))}
        </div>

        <button onClick={() => setHideHeaderFooter(!hideHeaderFooter)}
          title={hideHeaderFooter ? 'Header/footer Shopify ascuns' : 'Header/footer Shopify afișat'}
          className={`ue-tb-toggle ${hideHeaderFooter ? 'on' : 'off'}`}>
          <span className="ue-tb-toggle-dot" />
          <span>{hideHeaderFooter ? 'H/F ascuns' : 'H/F vizibil'}</span>
        </button>

        {(saving || lastSaved) && (
          <div className="ue-tb-save">
            <span className={`ue-tb-save-dot ${saving ? 'saving' : 'saved'}`} />
            <span>{saving ? 'Se salvează...' : `Salvat ${lastSaved.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' })}`}</span>
          </div>
        )}

        <div className="ue-tb-undo">
          <button onClick={() => gjsRef.current?.UndoManager.undo()} className="ue-tb-icon-btn" title="Undo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          </button>
          <button onClick={() => gjsRef.current?.UndoManager.redo()} className="ue-tb-icon-btn" title="Redo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
        </div>

        <ThemeToggle size="sm" />

        {error && (
          <div className="ue-tb-error">
            <span>{error}</span>
            {error.includes('limita') && onUpgrade && (
              <button onClick={onUpgrade} className="ue-tb-upgrade">Upgrade →</button>
            )}
          </div>
        )}

        <button onClick={() => {
          if (isEditing) {
            publish()
          } else {
            setSelectedProduct(null)
            setShowProductModal(true)
            if (products.length === 0) loadProducts()
          }
        }} disabled={publishing} className="ue-tb-publish">
          {publishing ? (
            <><span className="ue-spinner-sm" /> Se procesează...</>
          ) : isEditing ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Salvează</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              <span>Publică</span>
            </>
          )}
        </button>
      </div>

      {/* EDITOR LAYOUT */}
      <div className="ue-layout">
        <div className="ue-panel ue-panel-left">
          <div className="ue-panel-title">Blocuri</div>
          <div id="blocks-panel" />
        </div>

        <div className="ue-canvas">
          <div ref={editorRef} style={{ width:'100%', height:'100%' }} />
        </div>

        <div className="ue-panel ue-panel-right">
          <div className="ue-panel-title">Stiluri</div>
          <div id="styles-panel" />
          <div className="ue-panel-title" style={{ marginTop: 8 }}>Proprietăți</div>
          <div id="traits-panel" />
        </div>
      </div>

      {/* Modal selectare produs */}
      {showProductModal && (
        <div className="ue-modal-backdrop" onClick={() => setShowProductModal(false)}>
          <div className="ue-modal" onClick={e => e.stopPropagation()}>
            <div className="ue-modal-header">
              <div>
                <div className="ue-eyebrow">Pas final</div>
                <h3 className="ue-modal-title">Asociază produsul</h3>
              </div>
              <button onClick={() => setShowProductModal(false)} className="ue-modal-close" title="Închide">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="ue-modal-lede">Selectează produsul din magazin căruia îi atașezi acest landing page.</p>

            <div className="ue-modal-list">
              {loadingProducts ? (
                <div className="ue-modal-empty">
                  <div className="ue-spinner" />
                  <span>Se încarcă produsele...</span>
                </div>
              ) : productsError ? (
                <div className="ue-modal-empty">
                  <div className="ue-modal-error">{productsError}</div>
                  <button onClick={loadProducts} className="ue-cta-secondary">Încearcă din nou</button>
                </div>
              ) : products.length === 0 ? (
                <div className="ue-modal-empty">
                  <span>Niciun produs găsit în magazin.</span>
                </div>
              ) : products.map(p => (
                <button key={p.id} onClick={() => setSelectedProduct(p)}
                  className={`ue-product ${selectedProduct?.id === p.id ? 'active' : ''}`}>
                  {p.images?.[0] ? (
                    <img src={p.images[0].src} alt={p.title} className="ue-product-img" />
                  ) : (
                    <div className="ue-product-img-fallback">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                  )}
                  <div className="ue-product-meta">
                    <div className="ue-product-title">{p.title}</div>
                    <div className="ue-product-handle">/{p.handle}</div>
                  </div>
                  <div className="ue-product-check">
                    {selectedProduct?.id === p.id && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="ue-modal-actions">
              <button onClick={() => setShowProductModal(false)} className="ue-cta-secondary">Anulează</button>
              <button onClick={() => { setShowProductModal(false); publish() }} disabled={!selectedProduct}
                className="ue-cta-primary ue-cta-block">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                <span>{selectedProduct ? `Publică pe "${selectedProduct.title.substring(0,18)}${selectedProduct.title.length > 18 ? '...' : ''}"` : 'Selectează un produs'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CSS de baza (responsive) ────────────────────────────────────────────────
function buildCSS(data) {
  const primary = data.style?.primaryColor || '#dc2626'
  const font = data.style?.fontFamily || 'Inter, system-ui, sans-serif'
  const radius = data.style?.borderRadius || '12px'
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${font}; background: #fff; color: #111; max-width: 650px; margin: 0 auto; width: 100%; }
    img { max-width: 100%; height: auto; display: block; }
    .btn-main { width: 100%; padding: 17px; border-radius: ${radius}; background: ${primary}; color: #fff; border: none; font-size: 18px; font-weight: 900; cursor: pointer; font-family: inherit; }
    .inp { padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 15px; outline: none; width: 100%; font-family: inherit; box-sizing: border-box; }
    /* Tablet */
    @media (max-width: 992px) {
      body { max-width: 100%; padding: 0; }
    }
    /* Mobile */
    @media (max-width: 600px) {
      body { font-size: 14px; }
      h1 { font-size: 20px !important; line-height: 1.25 !important; }
      h2 { font-size: 18px !important; }
      h3 { font-size: 16px !important; }
      .btn-main { padding: 14px; font-size: 16px; }
    }
  `
}

// ─── buildHTML ────────────────────────────────────────────────────────────────
function buildHTML(data, codFormApp) {
  const price = data.price || 149
  const oldPrice = data.oldPrice || Math.round(price * 1.6)
  const disc = Math.round((1 - price / oldPrice) * 100)
  const imgs = data.images || []
  const primary = data.style?.primaryColor || '#e8000d'
  const JUDETE = ['Alba','Arad','Arges','Bacau','Bihor','Bistrita-Nasaud','Botosani','Braila','Brasov','Bucuresti','Buzau','Calarasi','Caras-Severin','Cluj','Constanta','Covasna','Dambovita','Dolj','Galati','Giurgiu','Gorj','Harghita','Hunedoara','Ialomita','Iasi','Ilfov','Maramures','Mehedinti','Mures','Neamt','Olt','Prahova','Salaj','Satu Mare','Sibiu','Suceava','Teleorman','Timis','Tulcea','Valcea','Vaslui','Vrancea']
  const jOpts = JUDETE.map(j => `<option value="${j}">${j}</option>`).join('')
  const imgTag = (src, style) => src ? `<img src="${src}" style="${style || 'width:100%;display:block'}" />` : ''
  const benefits = (data.benefits || []).slice(0, 5)

  // Placeholder vizibil pentru butonul Releasit (rsi-cod-form-gempages-button = clasa recunoscuta de Releasit in GemPages mode)
  const relBtn = `<div class="unitone-releasit-btn rsi-cod-form-gempages-button" style="min-height:54px;display:block;border:2px dashed ${primary};border-radius:6px;padding:6px;text-align:center;margin:8px 0"><span class="unitone-placeholder-text" style="color:${primary};font-size:12px;pointer-events:none;line-height:42px">&#128722; Buton COD Releasit - apare automat aici</span></div>`

  const tCards = (data.testimonials || []).map((t, i) => [
    `<div style="margin-bottom:32px">`,
    imgs[i] ? `<div style="margin-bottom:12px">${imgTag(imgs[i], 'width:100%;max-width:400px;display:block;margin:0 auto;border-radius:8px')}</div>` : '',
    `<p style="font-size:13px;color:#555;margin-bottom:6px">Recenzie de la ${t.name}: ${'⭐'.repeat(t.stars || 5)}</p>`,
    `<p style="font-size:15px;color:#222;line-height:1.6;font-style:italic">"${t.text}"</p>`,
    `</div>`
  ].join('')).join('')

  const faqHtml = (data.faq || []).map(f => [
    `<details style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">`,
    `<summary style="padding:14px 16px;font-size:15px;font-weight:600;cursor:pointer;background:#f9fafb">${f.q}</summary>`,
    `<div style="padding:12px 16px;font-size:14px;color:#555;line-height:1.7">${f.a}</div>`,
    `</details>`
  ].join('')).join('')

  const howItWorksHtml = (data.howItWorks || []).map((s, i) => [
    `<div style="display:flex;gap:14px;margin-bottom:16px;align-items:flex-start">`,
    `<div style="width:32px;height:32px;background:${primary};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;flex-shrink:0">${i + 1}</div>`,
    `<div><strong style="font-size:15px;display:block;margin-bottom:3px">${s.title}</strong><span style="font-size:14px;color:#555;line-height:1.6">${s.desc}</span></div>`,
    `</div>`
  ].join('')).join('')

  return [
    `<div class="_rsi-cod-form-is-gempage" style="display:none"></div>`,
    `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;background:#fff;color:#111">`,

    `<div style="background:#111;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:600">`,
    `&#128222; 0700 000 000 &nbsp;&middot;&nbsp; &#128666; LIVRARE RAPIDA IN TOATA ROMANIA`,
    `</div>`,

    `<div style="padding:24px 20px 16px;text-align:center;border-bottom:2px solid ${primary}">`,
    `<h1 style="font-size:22px;font-weight:900;line-height:1.3;margin:0;color:#111">${data.headline || data.productName}</h1>`,
    `</div>`,

    `<div style="padding:0">`,
    imgs[0] ? `<div style="background:#f8f8f8">${imgTag(imgs[0], 'width:100%;max-height:420px;object-fit:contain;display:block;margin:0 auto')}</div>` : '',
    imgs.length > 1 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#e5e7eb">${imgs.slice(1, 5).map(s => imgTag(s, 'width:100%;height:200px;object-fit:cover;display:block')).join('')}</div>` : '',
    `</div>`,

    `<div style="padding:16px 20px;text-align:center;background:#fff8f0;border-bottom:1px solid #ffe0b2">`,
    `<span style="font-size:18px">&#11088;&#11088;&#11088;&#11088;&#11088;</span>`,
    `<span style="font-size:14px;font-weight:700;color:#e65c00;margin-left:8px">${(data.reviewCount || 1247).toLocaleString()}+ Clienti Multumiti!</span>`,
    `</div>`,

    `<div style="padding:24px 20px;background:#fff">`,
    `<div style="background:${primary};color:#fff;text-align:center;padding:8px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:16px">TOP ${benefits.length} MOTIVE SA COMANZI ACUM:</div>`,
    `<ul style="margin:0;padding:0;list-style:none">`,
    benefits.map(b => `<li style="margin-bottom:10px;font-size:15px;line-height:1.5;color:#222;display:flex;gap:10px;align-items:flex-start"><span style="color:${primary};font-weight:900;flex-shrink:0">&#10003;</span><span>${b}</span></li>`).join(''),
    `</ul></div>`,

    `<div style="padding:20px;background:#fff;border-top:1px solid #f3f4f6;border-bottom:3px solid ${primary};text-align:center">`,
    `<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:16px">`,
    `<span style="font-size:20px;color:#999;text-decoration:line-through">${oldPrice} LEI</span>`,
    `<span style="font-size:42px;font-weight:900;color:${primary}">${price} LEI</span>`,
    `<span style="background:${primary};color:#fff;padding:4px 10px;border-radius:4px;font-size:14px;font-weight:700">-${disc}%</span>`,
    `</div>`,
    relBtn,
    `<p style="font-size:13px;color:#666;margin:8px 0 0">&#10003; Plata la livrare &nbsp;&middot;&nbsp; &#128666; Livrare 2-4 zile &nbsp;&middot;&nbsp; &#8617; Retur 30 zile</p>`,
    `</div>`,

    `<div style="padding:28px 20px;background:#f9fafb">`,
    `<div style="text-align:center;background:${primary};color:#fff;padding:6px;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:16px">${data.subheadline || 'DE CE SA COMANZI DE LA NOI?'}</div>`,
    imgs[1] ? `<div style="margin-bottom:20px">${imgTag(imgs[1], 'width:100%;border-radius:8px;display:block')}</div>` : '',
    howItWorksHtml,
    relBtn,
    `</div>`,

    imgs[2] ? `<div style="background:#fff">${imgTag(imgs[2], 'width:100%;display:block')}</div>` : '',

    `<div style="padding:20px;background:#fff;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;text-align:center">`,
    `<div style="font-size:13px;color:#444"><div style="font-size:28px">&#128179;</div>Plata ramburs</div>`,
    `<div style="font-size:13px;color:#444"><div style="font-size:28px">&#10003;</div>Satisfactie garantata</div>`,
    `<div style="font-size:13px;color:#444"><div style="font-size:28px">&#8617;</div>Banii inapoi 30 zile</div>`,
    `</div>`,

    `<div style="padding:28px 20px;background:#f9fafb">`,
    `<div style="text-align:center;background:#111;color:#fff;padding:8px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:24px">PARERILE CLIENTILOR NOSTRI:</div>`,
    tCards,
    `</div>`,

    `<div style="padding:24px 20px;background:#fff">`,
    `<h3 style="font-size:18px;font-weight:800;margin:0 0 16px;text-align:center">Intrebari frecvente</h3>`,
    faqHtml,
    `</div>`,

    codFormApp && codFormApp !== 'none' ? '' : [
      `<div id="formular" style="padding:28px 20px;background:#fff3f3;border-top:4px solid ${primary}">`,
      `<h2 style="font-size:22px;font-weight:900;text-align:center;margin:0 0 24px">COMANDA ACUM CU ${disc}% REDUCERE</h2>`,
      `<div id="form-fields" style="display:flex;flex-direction:column;gap:12px">`,
      `<input id="f-name" placeholder="Nume si Prenume" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<input id="f-phone" placeholder="Numar de telefon" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<input id="f-address" placeholder="Adresa completa" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<input id="f-city" placeholder="Localitate" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<select id="f-county" style="padding:13px 14px;border:1px solid #ddd;border-radius:6px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif;color:#555;background:#fff"><option value="">Judet</option>${jOpts}</select>`,
      `<button onclick="submitOrder()" style="background:${primary};color:#fff;border:none;padding:18px;border-radius:6px;font-size:18px;font-weight:900;cursor:pointer;width:100%;font-family:Arial,sans-serif">FINALIZEAZA COMANDA - PLATA LA LIVRARE</button>`,
      `</div>`,
      `<div id="form-success" style="display:none;text-align:center;padding:40px 20px"><div style="font-size:56px;margin-bottom:12px">&#10003;</div><h3 style="font-size:22px;font-weight:800;color:#16a34a">Comanda plasata cu succes!</h3></div>`,
      `</div>`
    ].join(''),

    `<div style="background:#111;color:#888;padding:20px;text-align:center;font-size:12px">`,
    `<p style="margin:0 0 4px;color:#ccc;font-weight:600">&copy; 2025 ${data.productName}</p>`,
    `<p style="margin:0">Termeni si Conditii &middot; Politica de Confidentialitate &middot; ANPC</p>`,
    `</div>`,

    `<script>`,
    `function submitOrder(){`,
    `var n=document.getElementById('f-name').value.trim(),`,
    `p=document.getElementById('f-phone').value.trim(),`,
    `a=document.getElementById('f-address').value.trim(),`,
    `c=document.getElementById('f-city').value.trim(),`,
    `j=document.getElementById('f-county').value;`,
    `if(!n||!p||!a||!c||!j){alert('Completeaza toate campurile!');return;}`,
    `document.getElementById('form-fields').style.display='none';`,
    `document.getElementById('form-success').style.display='block';`,
    `}`,
    `<\/script>`,

    `</div>`
  ].join('\n')
}

// ─── addBlocks ────────────────────────────────────────────────────────────────
function addBlocks(editor, data) {
  const p = data?.style?.primaryColor || '#e8000d'

  // Helper - placeholder vizibil cu border rosu dashed (rsi-cod-form-gempages-button = clasa recunoscuta de Releasit)
  function relBtn(extra) {
    return `<div class="unitone-releasit-btn rsi-cod-form-gempages-button" style="min-height:54px;display:block;border:2px dashed ${p};border-radius:6px;padding:6px;text-align:center;${extra || ''}"><span class="unitone-placeholder-text" style="color:${p};font-size:12px;pointer-events:none;line-height:42px">&#128722; Buton COD - trage-ma unde vrei</span></div>`
  }

  const blocks = [
    // COD FORM
    { id:'releasit-btn', label:'🛒 Buton COD Form', cat:'COD Form',
      content: relBtn('margin:10px 0;') },
    { id:'releasit-btn-full', label:'🛒 Buton COD Full Width', cat:'COD Form',
      content: `<div style="padding:10px 20px">${relBtn('width:100%;box-sizing:border-box;')}</div>` },
    { id:'releasit-btn-center', label:'🛒 Buton COD Centrat', cat:'COD Form',
      content: `<div style="text-align:center;padding:16px 20px">${relBtn('display:inline-block;min-width:240px;')}</div>` },

    // LAYOUT
    { id:'row-2col', label:'2 Coloane', cat:'Layout',
      content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px"><div style="padding:16px;background:#f9fafb;border-radius:8px;min-height:60px">Coloana 1</div><div style="padding:16px;background:#f9fafb;border-radius:8px;min-height:60px">Coloana 2</div></div>` },
    { id:'row-3col', label:'3 Coloane', cat:'Layout',
      content: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:20px"><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 1</div><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 2</div><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 3</div></div>` },
    { id:'spacer', label:'Spatiu', cat:'Layout',
      content: `<div style="height:40px"></div>` },
    { id:'line', label:'Separator', cat:'Layout',
      content: `<hr style="border:none;border-top:2px solid #e5e7eb;margin:8px 20px"/>` },

    // TEXT
    { id:'heading', label:'Heading H2', cat:'Text',
      content: `<h2 style="font-size:28px;font-weight:900;color:#111;padding:16px 20px;margin:0;line-height:1.2">Titlul tau aici</h2>` },
    { id:'heading-h3', label:'Heading H3', cat:'Text',
      content: `<h3 style="font-size:20px;font-weight:800;color:#111;padding:12px 20px;margin:0">Subtitlu</h3>` },
    { id:'text-block', label:'Paragraf', cat:'Text',
      content: `<p style="font-size:15px;color:#444;line-height:1.7;padding:12px 20px;margin:0">Textul tau aici. Click pentru a edita.</p>` },
    { id:'button-cta', label:'Buton CTA', cat:'Text',
      content: `<div style="padding:16px 20px;text-align:center"><a href="#formular" style="display:inline-block;background:${p};color:#fff;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:800;text-decoration:none">COMANDA ACUM!</a></div>` },

    // MEDIA
    { id:'image', label:'Imagine', cat:'Media',
      content: `<div><img src="https://placehold.co/650x400/f3f4f6/999?text=Imagine" style="width:100%;display:block"/></div>` },
    { id:'video', label:'Video YouTube', cat:'Media',
      content: `<div style="padding:20px"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div></div>` },
    { id:'img-comparison', label:'Inainte / Dupa', cat:'Media',
      content: `<div style="padding:20px"><div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="display:grid;grid-template-columns:1fr 1fr"><div style="text-align:center;padding:12px;background:#fef2f2"><div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px">INAINTE</div><img src="https://placehold.co/300x250/fee2e2/dc2626?text=Inainte" style="width:100%;display:block;border-radius:4px"/></div><div style="text-align:center;padding:12px;background:#f0fdf4"><div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:8px">DUPA</div><img src="https://placehold.co/300x250/dcfce7/16a34a?text=Dupa" style="width:100%;display:block;border-radius:4px"/></div></div></div></div>` },
    { id:'carousel', label:'Carousel', cat:'Media',
      content: `<div style="padding:20px;overflow:hidden"><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory"><div style="min-width:280px;scroll-snap-align:start;background:#f9fafb;border-radius:10px;overflow:hidden"><img src="https://placehold.co/280x200/f3f4f6/999?text=1" style="width:100%;display:block"/><div style="padding:12px;font-size:14px;font-weight:600">Produs 1</div></div><div style="min-width:280px;scroll-snap-align:start;background:#f9fafb;border-radius:10px;overflow:hidden"><img src="https://placehold.co/280x200/f3f4f6/999?text=2" style="width:100%;display:block"/><div style="padding:12px;font-size:14px;font-weight:600">Produs 2</div></div></div></div>` },

    // HERO
    { id:'hero-dark', label:'Hero Banner Inchis', cat:'Hero',
      content: `<div style="background:linear-gradient(135deg,#111 0%,#333 100%);padding:60px 20px;text-align:center"><h1 style="color:#fff;font-size:32px;font-weight:900;margin:0 0 14px">Titlu Principal</h1><p style="color:rgba(255,255,255,0.7);font-size:16px;margin:0 0 28px">Subtitlul ofertei tale</p>${relBtn('display:inline-block;min-width:240px;')}</div>` },
    { id:'hero-red', label:'Hero Banner Rosu', cat:'Hero',
      content: `<div style="background:${p};padding:50px 20px;text-align:center"><h1 style="color:#fff;font-size:30px;font-weight:900;margin:0 0 12px">Titlu Promo</h1><p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0 0 24px">Oferta limitata!</p>${relBtn('display:inline-block;min-width:240px;')}</div>` },

    // ELEMENTE
    { id:'icon-list', label:'Lista Beneficii', cat:'Elemente',
      content: `<div style="padding:20px"><div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:${p};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#10003;</span><span style="font-size:14px;color:#222">Livrare rapida in toata Romania</span></div><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:${p};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#10003;</span><span style="font-size:14px;color:#222">Plata la livrare, fara risc</span></div><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:${p};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#10003;</span><span style="font-size:14px;color:#222">Garantie 30 zile retur</span></div></div></div>` },
    { id:'accordion', label:'FAQ Accordion', cat:'Elemente',
      content: `<div style="padding:20px"><details style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">Cum functioneaza plata la livrare?</summary><div style="padding:14px 16px;font-size:14px;color:#555;line-height:1.7">Platesti curierului in momentul in care primesti coletul.</div></details><details style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">Cat dureaza livrarea?</summary><div style="padding:14px 16px;font-size:14px;color:#555;line-height:1.7">2-5 zile lucratoare.</div></details></div>` },
    { id:'marquee', label:'Marquee Banner', cat:'Elemente',
      content: `<div style="overflow:hidden;background:#111;padding:12px 0"><div style="display:flex;animation:unitone-marquee 15s linear infinite;white-space:nowrap"><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#128666; Livrare GRATUITA</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#10003; Plata la livrare</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#8617; Retur 30 zile</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#128666; Livrare GRATUITA</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#10003; Plata la livrare</span></div></div><style>@keyframes unitone-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>` },

    // TRUST
    { id:'trust-badges', label:'Trust Badges', cat:'Trust',
      content: `<div style="padding:20px;background:#fff;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;text-align:center"><div style="font-size:13px;color:#444"><div style="font-size:28px">&#128179;</div>Plata ramburs</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#10003;</div>Satisfactie garantata</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#8617;</div>Banii inapoi 30 zile</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#128666;</div>Livrare rapida</div></div>` },
    { id:'testimonial', label:'Testimonial Card', cat:'Trust',
      content: `<div style="padding:20px 20px 0"><div style="padding:20px;background:#f9fafb;border-radius:12px;border-left:4px solid ${p};margin-bottom:12px"><div style="color:#f39c12;margin-bottom:8px;font-size:16px">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p style="color:#333;margin-bottom:12px;font-style:italic;font-size:15px;line-height:1.6">"Produs excelent! L-am primit in 5 zile."</p><strong style="color:#111;font-size:14px">— Maria D., Bucuresti</strong></div></div>` },

    // PRODUS
    { id:'product-card', label:'Product Card', cat:'Produs',
      content: `<div style="padding:20px;border:1px solid #e5e7eb;border-radius:10px;margin:16px 20px"><img src="https://placehold.co/400x300/f9fafb/999?text=Produs" style="width:100%;border-radius:8px;display:block;margin-bottom:14px"/><h3 style="font-size:18px;font-weight:800;margin:0 0 6px">Numele Produsului</h3><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:26px;font-weight:900;color:${p}">149 RON</span><span style="text-decoration:line-through;color:#999;font-size:16px">249 RON</span></div>${relBtn()}</div>` },
    { id:'bundle', label:'Bundle Discount', cat:'Produs',
      content: `<div style="padding:20px;background:#fff8f0;border:2px solid #fed7aa;border-radius:10px;margin:16px 20px"><div style="text-align:center;font-size:12px;font-weight:700;color:#c2410c;letter-spacing:1px;margin-bottom:14px">&#128293; BUNDLE SPECIAL</div><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"><div style="display:flex;align-items:center;justify-content:space-between;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb"><div style="font-size:14px;font-weight:600">Produs Principal</div><div style="font-size:15px;font-weight:900;color:${p}">149 RON</div></div><div style="text-align:center;font-size:18px;color:#666">+</div><div style="display:flex;align-items:center;justify-content:space-between;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb"><div><div style="font-size:14px;font-weight:600">Produs Bonus</div><div style="font-size:11px;color:#16a34a;font-weight:600">GRATUIT la bundle</div></div><div style="font-size:15px;font-weight:900;text-decoration:line-through;color:#999">29 RON</div></div></div>${relBtn()}</div>` },

    // URGENTA
    { id:'stock-counter', label:'Stoc Limitat', cat:'Urgenta',
      content: `<div style="padding:12px 20px;background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;margin:0 20px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">&#128230;</span><div><div style="font-size:13px;font-weight:700;color:#c2410c">Stoc limitat!</div><div style="font-size:12px;color:#ea580c">Au mai ramas doar <strong>7 bucati</strong> la acest pret</div></div><div style="margin-left:auto;background:#fef3c7;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:700;color:#d97706">7 / 50</div></div>` },
    { id:'urgency-strip', label:'Strip Urgenta', cat:'Urgenta',
      content: `<div style="background:${p};color:#fff;text-align:center;padding:12px 20px;font-size:14px;font-weight:700">&#9888; STOC LIMITAT - Comanda acum!</div>` },
    { id:'countdown', label:'Countdown Timer', cat:'Urgenta',
      content: `<div style="background:${p};color:#fff;padding:14px 20px;text-align:center"><div style="font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px">&#9889; OFERTA EXPIRA IN:</div><div style="display:flex;justify-content:center;gap:10px"><div style="text-align:center"><span id="cd-h" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">00</span><div style="font-size:10px;margin-top:3px;opacity:0.8">ORE</div></div><span style="font-size:24px;font-weight:900;padding-top:8px">:</span><div style="text-align:center"><span id="cd-m" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">14</span><div style="font-size:10px;margin-top:3px;opacity:0.8">MIN</div></div><span style="font-size:24px;font-weight:900;padding-top:8px">:</span><div style="text-align:center"><span id="cd-s" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">00</span><div style="font-size:10px;margin-top:3px;opacity:0.8">SEC</div></div></div></div><script>(function(){var t=14*60;function r(){var h=String(Math.floor(t/3600)).padStart(2,'0'),m=String(Math.floor((t%3600)/60)).padStart(2,'0'),s=String(t%60).padStart(2,'0');var eh=document.getElementById('cd-h'),em=document.getElementById('cd-m'),es=document.getElementById('cd-s');if(eh)eh.textContent=h;if(em)em.textContent=m;if(es)es.textContent=s;}setInterval(function(){if(t>0)t--;r();},1000);r();})();<\/script>` },

    // CONVERSIE
    { id:'delivery-date', label:'Data Livrare', cat:'Conversie',
      content: `<div style="padding:12px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 20px;display:flex;align-items:center;gap:12px"><span style="font-size:24px">&#128666;</span><div><div style="font-size:14px;font-weight:700;color:#15803d">Livrare estimata: 3-5 zile lucratoare</div><div style="font-size:12px;color:#16a34a">Comanda acum!</div></div></div>` },
    { id:'coupon', label:'Cod Reducere', cat:'Conversie',
      content: `<div style="padding:16px 20px;background:#f0fdf4;border:2px dashed #86efac;border-radius:8px;margin:0 20px;text-align:center"><div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px">&#127999; COD REDUCERE</div><div style="display:flex;align-items:center;justify-content:center;gap:10px"><code style="background:#fff;border:1px solid #86efac;border-radius:6px;padding:8px 16px;font-size:18px;font-weight:900;letter-spacing:2px;color:#15803d">COD20</code><button onclick="navigator.clipboard.writeText('COD20');this.textContent='OK!';setTimeout(function(){this.textContent='Copy'},2000)" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Copy</button></div></div>` },

    // FORMULARE
    { id:'newsletter', label:'Newsletter', cat:'Formulare',
      content: `<div style="padding:32px 20px;background:#f9fafb;text-align:center"><h3 style="font-size:20px;font-weight:800;margin:0 0 8px">Aboneaza-te si primesti -10%</h3><div style="display:flex;gap:10px;max-width:400px;margin:0 auto"><input placeholder="Email" type="email" style="flex:1;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;font-family:inherit"/><button style="background:${p};color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Abonare</button></div></div>` },

    // NAVIGARE
    { id:'back-to-top', label:'Back to Top', cat:'Navigare',
      content: `<div style="position:fixed;bottom:24px;right:20px;z-index:998"><button onclick="window.scrollTo({top:0,behavior:'smooth'})" style="width:44px;height:44px;background:${p};color:#fff;border:none;border-radius:50%;font-size:18px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25)">&#8593;</button></div>` },

    // AVANSAT
    { id:'custom-code', label:'Custom HTML', cat:'Avansat',
      content: `<div style="padding:16px 20px;background:#1e1e2e;border-radius:8px;margin:16px 20px"><code style="font-size:13px;color:#a5f3fc;font-family:monospace;display:block">&lt;div&gt;Codul tau HTML&lt;/div&gt;</code></div>` },
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

/* ─── Editor outer UI styles (theme-adaptive) ─────────────────────────────── */
function EditorStyles() {
  return (
    <style>{`
      .ue-shell {
        height: 100vh; display: flex; flex-direction: column;
        background: var(--bg); color: var(--text);
        font-family: var(--font-sans);
      }

      /* ── Toolbar ── */
      .ue-toolbar {
        height: 60px; flex-shrink: 0; z-index: 100;
        padding: 0 16px; gap: 10px;
        display: flex; align-items: center;
        background: color-mix(in srgb, var(--bg-elev) 90%, transparent);
        backdrop-filter: blur(16px) saturate(120%);
        -webkit-backdrop-filter: blur(16px) saturate(120%);
        border-bottom: 1px solid var(--divider);
      }
      .ue-tb-back {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 11px; border-radius: 9px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 13px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        transition: all 0.15s ease;
      }
      .ue-tb-back:hover {
        background: var(--bg-3); color: var(--text);
        border-color: var(--border-strong);
      }
      .ue-tb-divider {
        width: 1px; height: 22px;
        background: var(--divider);
      }
      .ue-tb-title {
        flex: 1; min-width: 0;
        padding: 7px 11px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 9px;
        color: var(--text);
        font-size: 14px; font-weight: 600;
        font-family: inherit; outline: none;
        letter-spacing: -0.01em;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .ue-tb-title:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-soft);
      }
      .ue-tb-device {
        display: flex; gap: 2px; padding: 3px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .ue-tb-device-btn {
        padding: 6px 10px; border-radius: 7px;
        background: transparent; border: none;
        color: var(--text-muted);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.15s ease;
      }
      .ue-tb-device-btn:hover { color: var(--text); }
      .ue-tb-device-btn.active {
        background: var(--bg-elev);
        color: var(--text);
        box-shadow: var(--shadow-sm);
      }
      .ue-tb-toggle {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 11px; border-radius: 9px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 12px; font-weight: 600; font-family: inherit;
        cursor: pointer; white-space: nowrap;
        letter-spacing: -0.01em;
        transition: all 0.15s ease;
      }
      .ue-tb-toggle.on {
        background: var(--success-soft);
        border-color: color-mix(in srgb, var(--success) 25%, transparent);
        color: var(--success);
      }
      .ue-tb-toggle.off {
        background: var(--warning-soft);
        border-color: color-mix(in srgb, var(--warning) 25%, transparent);
        color: var(--warning);
      }
      .ue-tb-toggle-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
      }
      .ue-tb-save {
        display: flex; align-items: center; gap: 7px;
        padding: 6px 11px; border-radius: 9px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        font-size: 11.5px; color: var(--text-muted);
        white-space: nowrap; letter-spacing: -0.005em;
      }
      .ue-tb-save-dot {
        width: 6px; height: 6px; border-radius: 50%;
      }
      .ue-tb-save-dot.saving {
        background: var(--warning);
        animation: pulse 1.2s ease-in-out infinite;
      }
      .ue-tb-save-dot.saved {
        background: var(--success);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 18%, transparent);
      }
      .ue-tb-undo { display: flex; gap: 3px; }
      .ue-tb-icon-btn {
        padding: 7px 9px; border-radius: 8px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text-muted);
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        transition: all 0.15s ease;
      }
      .ue-tb-icon-btn:hover {
        background: var(--bg-3); color: var(--text);
        border-color: var(--border-strong);
      }
      .ue-tb-error {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 11px; border-radius: 8px;
        background: var(--danger-soft);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
        color: var(--danger);
        font-size: 12px;
        max-width: 280px;
      }
      .ue-tb-upgrade {
        font-size: 11px; font-weight: 700;
        color: var(--brand);
        background: var(--brand-soft);
        border: 1px solid var(--brand-border);
        border-radius: 6px;
        padding: 3px 8px;
        cursor: pointer; font-family: inherit;
        white-space: nowrap;
      }
      .ue-tb-publish {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 18px; border-radius: 10px;
        background: var(--accent); color: var(--accent-fg);
        border: 1px solid var(--accent);
        font-size: 13.5px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        white-space: nowrap;
        box-shadow: var(--shadow-sm);
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ue-tb-publish:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
        box-shadow: var(--shadow);
      }
      .ue-tb-publish:disabled {
        opacity: 0.6; cursor: not-allowed;
        box-shadow: none;
      }
      .ue-spinner-sm {
        width: 12px; height: 12px;
        border: 2px solid color-mix(in srgb, var(--accent-fg) 25%, transparent);
        border-top-color: var(--accent-fg);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @media (max-width: 1100px) {
        .ue-tb-save { display: none; }
      }
      @media (max-width: 900px) {
        .ue-tb-toggle { display: none; }
        .ue-tb-back span, .ue-tb-publish span { display: inline; }
      }
      @media (max-width: 720px) {
        .ue-tb-undo { display: none; }
      }

      /* ── Layout ── */
      .ue-layout {
        flex: 1; display: flex; overflow: hidden;
      }
      .ue-panel {
        width: 240px; flex-shrink: 0;
        background: var(--bg-2);
        overflow: auto;
      }
      .ue-panel-left { border-right: 1px solid var(--divider); }
      .ue-panel-right { border-left: 1px solid var(--divider); width: 270px; }
      .ue-panel-title {
        padding: 14px 16px 8px;
        font-size: 10.5px; font-weight: 700;
        color: var(--text-subtle);
        text-transform: uppercase; letter-spacing: 0.12em;
      }
      .ue-canvas {
        flex: 1; overflow: hidden; position: relative;
        background: var(--bg-3);
      }

      /* ── Published screen ── */
      .ue-published-shell {
        min-height: 100vh; position: relative;
        background: var(--bg); color: var(--text);
        font-family: var(--font-sans);
        display: flex; align-items: center; justify-content: center;
        padding: 32px;
      }
      .ue-hero-gradient {
        position: absolute; top: 0; left: 0; right: 0; height: 520px;
        background: var(--hero-gradient);
        pointer-events: none; z-index: 0;
      }
      .ue-mesh {
        position: absolute; inset: 0;
        background: var(--mesh); opacity: 0.6;
        pointer-events: none; z-index: 0;
      }
      .ue-published-card {
        position: relative; z-index: 1;
        max-width: 480px; width: 100%;
        text-align: center;
      }
      .ue-published-orb {
        width: 78px; height: 78px; border-radius: 22px;
        background: linear-gradient(135deg, var(--success) 0%, color-mix(in srgb, var(--success) 70%, var(--brand)) 100%);
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 28px;
        position: relative;
        box-shadow: 0 12px 32px color-mix(in srgb, var(--success) 40%, transparent);
      }
      .ue-orb-glow {
        position: absolute; inset: -3px; border-radius: 22px;
        background: linear-gradient(135deg, var(--success), color-mix(in srgb, var(--success) 60%, var(--brand)));
        opacity: 0.4; filter: blur(14px);
        animation: orbPulse 2.5s ease-in-out infinite;
        z-index: -1;
      }
      @keyframes orbPulse {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.05); }
      }
      .ue-eyebrow {
        font-size: 11.5px; font-weight: 700;
        color: var(--brand);
        text-transform: uppercase; letter-spacing: 0.16em;
        margin-bottom: 12px;
      }
      .ue-h1 {
        font-family: var(--font-display);
        font-size: clamp(32px, 5vw, 44px);
        font-weight: 400; letter-spacing: -0.035em;
        line-height: 1.1; color: var(--text);
      }
      .ue-h1-italic { font-style: italic; color: var(--text-muted); }
      .ue-published-text {
        margin-top: 14px;
        font-size: 15px; line-height: 1.55;
        color: var(--text-muted);
      }
      .ue-published-actions {
        margin-top: 28px;
        display: flex; gap: 10px; justify-content: center;
        flex-wrap: wrap;
      }

      .ue-cta-primary {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 12px 20px; border-radius: 11px;
        background: var(--accent); color: var(--accent-fg);
        border: 1px solid var(--accent);
        font-size: 14px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        text-decoration: none;
        box-shadow: var(--shadow-sm);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ue-cta-primary:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
        box-shadow: var(--shadow);
      }
      .ue-cta-primary:disabled {
        opacity: 0.5; cursor: not-allowed;
        box-shadow: none;
      }
      .ue-cta-block { flex: 1; justify-content: center; }
      .ue-cta-secondary {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 12px 20px; border-radius: 11px;
        background: var(--bg-elev); color: var(--text);
        border: 1px solid var(--border-strong);
        font-size: 14px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .ue-cta-secondary:hover { background: var(--bg-3); }

      /* ── Modal ── */
      .ue-modal-backdrop {
        position: fixed; inset: 0;
        z-index: 1000;
        background: color-mix(in srgb, var(--text) 35%, transparent);
        backdrop-filter: blur(8px) saturate(80%);
        -webkit-backdrop-filter: blur(8px) saturate(80%);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        animation: fadeIn 0.2s ease;
      }
      .ue-modal {
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 26px;
        width: 480px; max-width: 100%; max-height: 82vh;
        display: flex; flex-direction: column;
        box-shadow: var(--shadow-lg);
        animation: fadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ue-modal-header {
        display: flex; justify-content: space-between; align-items: flex-start;
        margin-bottom: 6px;
      }
      .ue-modal-title {
        font-family: var(--font-display);
        font-size: 24px; font-weight: 400;
        letter-spacing: -0.025em;
        color: var(--text);
        margin: 4px 0 0;
      }
      .ue-modal-close {
        width: 30px; height: 30px; border-radius: 8px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text-muted);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.15s ease;
        flex-shrink: 0;
      }
      .ue-modal-close:hover {
        background: var(--bg-3); color: var(--text);
      }
      .ue-modal-lede {
        font-size: 13.5px; color: var(--text-muted);
        line-height: 1.55; margin: 14px 0 18px;
      }
      .ue-modal-list {
        flex: 1; overflow-y: auto;
        display: flex; flex-direction: column; gap: 6px;
        margin-bottom: 18px;
        min-height: 100px;
        max-height: 380px;
      }
      .ue-modal-empty {
        text-align: center; padding: 40px 16px;
        color: var(--text-muted);
        font-size: 13px;
        display: flex; flex-direction: column; align-items: center; gap: 14px;
      }
      .ue-modal-error {
        color: var(--danger);
        font-size: 13px;
        padding: 10px 14px;
        background: var(--danger-soft);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
        border-radius: 9px;
      }
      .ue-spinner {
        width: 28px; height: 28px;
        border: 2.5px solid var(--bg-3);
        border-top-color: var(--brand);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      .ue-product {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 12px; border-radius: 11px;
        background: var(--bg-2);
        border: 1.5px solid var(--border);
        cursor: pointer; font-family: inherit; text-align: left;
        transition: all 0.15s ease;
        width: 100%;
      }
      .ue-product:hover {
        background: var(--bg-3);
        border-color: var(--border-strong);
      }
      .ue-product.active {
        background: var(--brand-soft);
        border-color: var(--brand);
      }
      .ue-product-img {
        width: 44px; height: 44px; border-radius: 9px;
        object-fit: cover; flex-shrink: 0;
        border: 1px solid var(--border);
      }
      .ue-product-img-fallback {
        width: 44px; height: 44px; border-radius: 9px;
        background: var(--bg-3);
        border: 1px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        color: var(--text-subtle);
        flex-shrink: 0;
      }
      .ue-product-meta { flex: 1; min-width: 0; }
      .ue-product-title {
        font-size: 13.5px; font-weight: 600;
        color: var(--text); letter-spacing: -0.01em;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ue-product-handle {
        font-size: 11.5px;
        color: var(--text-subtle);
        font-family: var(--font-mono);
        margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ue-product-check {
        width: 22px; height: 22px; border-radius: 50%;
        background: transparent;
        border: 1.5px solid var(--border-strong);
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        color: transparent;
      }
      .ue-product.active .ue-product-check {
        background: var(--brand);
        border-color: var(--brand);
        color: #fff;
      }
      .ue-modal-actions {
        display: flex; gap: 10px;
      }
    `}</style>
  )
}
