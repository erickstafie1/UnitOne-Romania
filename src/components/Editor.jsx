import { useEffect, useRef, useState } from 'react'
import {
  Page, Card, Button, TextField, ButtonGroup, Banner, Badge, Modal,
  ResourceList, ResourceItem, BlockStack, InlineStack, Text, Box, Spinner,
  Icon, Thumbnail, EmptyState, Toast
} from '@shopify/polaris'
import {
  ArrowLeftIcon, DesktopIcon, MobileIcon, SaveIcon, ExternalIcon,
  CheckIcon, ImageIcon, ViewIcon, RefreshIcon, UndoIcon, RedoIcon, SendIcon
} from '@shopify/polaris-icons'
import { apiFetch } from '../apiFetch.js'

export default function Editor({ data, shop, planLimit, onBack, onPublished, onUpgrade }) {
  // COD form is always handled by external Releasit hooks dropped from the
  // editor's block panel. No built-in form rendered.
  const codFormApp = 'releasit'
  const editorRef = useRef(null)
  const gjsRef = useRef(null)
  const [device, setDevice] = useState('desktop')
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState('')
  const [publishedDemoted, setPublishedDemoted] = useState(false)
  const [error, setError] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productsError, setProductsError] = useState('')
  const [hideHeaderFooter, setHideHeaderFooter] = useState(data.template_suffix !== 'pagecodfull')
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
          // Desktop fills the canvas. Tablet/Mobile lock to real device widths so
          // the LP renders exactly as it would on those devices (centered card-style).
          // `widthMedia` is what triggers our LP's @media queries inside buildCSS.
          devices: [
            { name: 'Desktop', width: '100%', widthMedia: '1200px' },
            { name: 'Tablet', width: '820px', widthMedia: '820px' },
            { name: 'Mobile', width: '390px', widthMedia: '390px' }
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

      if (data.fromDashboard && data.editorHtml) {
        // BEST PATH: the page was published with the metafield-source pipeline
        // (post-2025-05). We have the raw GrapesJS html + css — restore it
        // verbatim, no parsing needed.
        editor.setComponents(data.editorHtml)
        editor.setStyle(data.editorCss || buildCSS(data))
      } else if (data.fromDashboard && data.body_html) {
        // FALLBACK: legacy page (published before metafield support). Parse
        // body_html with DOMParser — bulletproof vs. regex extraction.
        // After the first save from the editor, the next reopen will hit
        // the BEST PATH above instead.
        const doc = new DOMParser().parseFromString(`<!doctype html><body>${data.body_html}</body>`, 'text/html')

        // Strip publish-injected noise that has no place in the editor
        doc.querySelectorAll('script').forEach(n => n.remove())
        doc.querySelectorAll('._rsi-cod-form-is-gempage').forEach(n => n.remove())

        // Collect any saved scoped CSS (GrapesJS-emitted) — these target #unitone-lp
        // or .unitone-* classes. Skip the publish-only Releasit override styles.
        const savedCss = [...doc.querySelectorAll('style')]
          .map(s => s.textContent || '')
          .filter(css => css.includes('#unitone-lp') || css.includes('.unitone-'))
          .join('\n')

        // Find the LP wrapper. Editor needs ONLY the inside content, with NO
        // overlay/embed style attached to the wrapper.
        const wrapper = doc.querySelector('#unitone-lp')
        if (wrapper) {
          // Remove inline style on the wrapper (overlay positioning, z-index, etc.)
          wrapper.removeAttribute('style')
          // Remove all <style> tags from inside — we apply CSS via setStyle()
          wrapper.querySelectorAll('style').forEach(s => s.remove())
        } else {
          // No wrapper found — strip top-level styles directly
          doc.body.querySelectorAll('style').forEach(s => s.remove())
        }

        const innerHtml = wrapper ? wrapper.innerHTML : doc.body.innerHTML
        editor.setComponents(`<div id="unitone-lp">${innerHtml.trim()}</div>`)
        const baseCss = buildCSS(data)
        editor.setStyle(baseCss + (savedCss ? '\n' + savedCss : ''))
      } else {
        const html = buildHTML(data)
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

  // ─── Validare + auto-rename pe duplicat ─────────────────────────────────────
  async function validateName() {
    if (!pageTitle || pageTitle.trim().length < 2) {
      throw new Error('Numele paginii trebuie să aibă cel puțin 2 caractere')
    }
    if (isEditing || pageIdRef.current) return pageTitle  // editare aceeași pagina = OK
    const r = await apiFetch('/api/pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', shop })
    })
    const d = await r.json()
    const existing = (d.pages || []).map(p => (p.title || '').trim().toLowerCase())
    const base = pageTitle.trim()
    if (!existing.includes(base.toLowerCase())) return base  // unic deja
    let n = 2, candidate
    do { candidate = `${base} (${n++})` } while (existing.includes(candidate.toLowerCase()))
    setPageTitle(candidate)
    return candidate  // returnez noul titlu, ca să fie folosit imediat la PUT
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
      const finalCodFormApp = 'releasit'
      const pid = pageIdRef.current || data.id
      const body = {
        action: 'update', shop, pageId: pid,
        title: pageTitle, html: fullHtml, hideHeaderFooter,
        codFormApp: finalCodFormApp, variantId,
        editorHtml: html, editorCss: css  // pure source -> Shopify metafield -> lossless re-edit
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
      // apiFetch attaches the App Bridge session JWT so the backend can refresh
      // a stale cookie token via Token Exchange before failing.
      const res = await apiFetch('/api/get-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop })
      })
      const d = await res.json()
      if (d.error === 'reauth_required') {
        setProductsError('REAUTH')
      } else if (!res.ok || d.error) {
        throw new Error(d.error || 'Eroare server')
      } else if ((d.products || []).length === 0) {
        setProductsError('Niciun produs găsit în magazin.')
      } else {
        setProducts(d.products)
      }
    } catch(e) {
      if (e.message !== 'REAUTH') setProductsError('Eroare: ' + e.message)
    }
    setLoadingProducts(false)
  }

  async function publish() {
    if (!gjsRef.current) return
    setPublishing(true)
    setError('')
    try {
      const finalTitle = await validateName()

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
      const finalCodFormApp = 'releasit'

      const pid = pageIdRef.current || data.id
      // Pure GrapesJS source (html + css) for lossless re-edit. Saved on the
      // product as a metafield by the backend so re-opening this page in the
      // editor restores it verbatim.
      const editorSource = { editorHtml: html, editorCss: css }
      const body = pid
        ? { action: 'update', shop, pageId: pid, title: finalTitle, html: finalHtml, hideHeaderFooter, codFormApp: finalCodFormApp, variantId, ...editorSource }
        : { shop, title: finalTitle, html: finalHtml, productId: selectedProduct?.id, hideHeaderFooter, codFormApp: finalCodFormApp, variantId, ...editorSource }

      const res = await apiFetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.status === 401) {
        setError('Sesiune Shopify invalidă. Reîncarcă pagina din admin-ul Shopify.')
        setPublishing(false)
        return
      }
      if (res.status === 402) {
        const d = await res.json()
        setPublishing(false)
        const msg = d.error === 'limit_reached'
          ? `Plan ${d.plan} permite ${d.limit} landing pages. Fă upgrade pentru mai multe.`
          : `Plan ${d.plan} permite ${d.publishLimit} pagină publicată simultan. Dezactivează o pagină existentă sau fă upgrade.`
        setError(msg)
        return
      }
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      if (json.pageUrl) {
        if (json.pageId) pageIdRef.current = json.pageId
        setLastSaved(new Date())
        dirtyRef.current = false
        setPublishedUrl(json.pageUrl)
        setPublishedDemoted(!!json.demoted)
        setPublished(true)
      }
    } catch(e) {
      setError('Eroare: ' + e.message)
    }
    setPublishing(false)
  }

  if (published) return (
    <Page narrowWidth>
      <EditorStyles />
      <Card>
        <BlockStack gap="500" inlineAlign="center">
          <Box
            background={publishedDemoted ? 'bg-fill-warning' : 'bg-fill-success'}
            padding="500"
            borderRadius="400"
            minWidth="80px"
            minHeight="80px"
          >
            <InlineStack align="center" blockAlign="center">
              <Icon source={publishedDemoted ? SaveIcon : CheckIcon} tone="text-inverse" />
            </InlineStack>
          </Box>

          <BlockStack gap="200" inlineAlign="center">
            <Badge tone={publishedDemoted ? 'warning' : 'success'}>
              {publishedDemoted ? 'Salvată ca draft' : 'Publicată cu succes'}
            </Badge>
            <Text as="h2" variant="headingXl" alignment="center">
              {publishedDemoted ? 'Pagină salvată' : 'Pagina ta e live'}
            </Text>
            <Text as="p" alignment="center" tone="subdued">
              {publishedDemoted
                ? 'Planul Free permite o singură pagină publicată simultan. Pagina nouă a fost creată ca draft — o poți activa din Dashboard, sau fă upgrade pentru pagini nelimitate.'
                : 'Pagina COD a fost publicată în magazinul tău. O poți vedea acum sau te poți întoarce la dashboard.'}
            </Text>
          </BlockStack>

          <ButtonGroup>
            {!publishedDemoted && (
              <Button variant="primary" url={publishedUrl} external icon={ExternalIcon}>
                Vezi pagina live
              </Button>
            )}
            <Button
              variant={publishedDemoted ? 'primary' : 'secondary'}
              icon={ArrowLeftIcon}
              onClick={() => { setPublished(false); setPublishedDemoted(false); if(onPublished) onPublished(); else if(onBack) onBack() }}
            >
              Înapoi la dashboard
            </Button>
          </ButtonGroup>
        </BlockStack>
      </Card>
    </Page>
  )

  return (
    <div className="ue-shell">
      <EditorStyles />
      {/* TOOLBAR — left: back + title; right: device, H/F, save status, undo/redo, publish */}
      <div className="ue-toolbar">
        <Button icon={ArrowLeftIcon} onClick={onBack} variant="tertiary">Înapoi</Button>

        <div className="ue-tb-title">
          <TextField
            label=""
            labelHidden
            value={pageTitle}
            onChange={setPageTitle}
            placeholder="Numele paginii..."
            autoComplete="off"
          />
        </div>

        {/* spacer pushes everything below to the right edge */}
        <div style={{ flex: 1 }} />

        {(saving || lastSaved) && (
          <div className="ue-tb-save">
            {saving ? (
              <InlineStack gap="100" blockAlign="center">
                <Spinner size="small" />
                <Text as="span" variant="bodySm" tone="subdued">Se salvează...</Text>
              </InlineStack>
            ) : (
              <Text as="span" variant="bodySm" tone="subdued">
                Salvat {lastSaved.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' })}
              </Text>
            )}
          </div>
        )}

        <ButtonGroup variant="segmented">
          <Button pressed={device === 'desktop'} onClick={() => switchDevice('desktop')} icon={DesktopIcon} accessibilityLabel="Desktop" />
          <Button pressed={device === 'tablet'} onClick={() => switchDevice('tablet')} icon={ViewIcon} accessibilityLabel="Tablet" />
          <Button pressed={device === 'mobile'} onClick={() => switchDevice('mobile')} icon={MobileIcon} accessibilityLabel="Mobil" />
        </ButtonGroup>

        <Button
          pressed={hideHeaderFooter}
          onClick={() => setHideHeaderFooter(!hideHeaderFooter)}
        >
          {hideHeaderFooter ? 'H/F ascuns' : 'H/F vizibil'}
        </Button>

        <ButtonGroup>
          <Button icon={UndoIcon} onClick={() => gjsRef.current?.UndoManager.undo()} accessibilityLabel="Undo" />
          <Button icon={RedoIcon} onClick={() => gjsRef.current?.UndoManager.redo()} accessibilityLabel="Redo" />
        </ButtonGroup>

        <Button
          variant="primary"
          icon={isEditing ? SaveIcon : SendIcon}
          loading={publishing}
          disabled={publishing}
          onClick={() => {
            if (isEditing) {
              publish()
            } else {
              setSelectedProduct(null)
              setShowProductModal(true)
              if (products.length === 0) loadProducts()
            }
          }}
        >
          {publishing ? 'Se procesează...' : isEditing ? 'Salvează' : 'Publică'}
        </Button>
      </div>

      {error && (
        <div className="ue-tb-error">
          <Banner
            tone="critical"
            onDismiss={() => setError('')}
            action={error.includes('limita') && onUpgrade ? { content: 'Upgrade', onAction: onUpgrade } : undefined}
          >
            {error}
          </Banner>
        </div>
      )}

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

      {/* Modal Polaris pentru selectare produs */}
      <Modal
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        title="Asociază produsul"
        primaryAction={{
          content: selectedProduct ? `Publică pe "${selectedProduct.title.substring(0, 24)}${selectedProduct.title.length > 24 ? '...' : ''}"` : 'Selectează un produs',
          disabled: !selectedProduct,
          onAction: () => { setShowProductModal(false); publish() }
        }}
        secondaryActions={[{ content: 'Anulează', onAction: () => setShowProductModal(false) }]}
      >
        <Modal.Section>
          <Text as="p" tone="subdued">Selectează produsul din magazin căruia îi atașezi acest landing page.</Text>
        </Modal.Section>

        {loadingProducts ? (
          <Modal.Section>
            <BlockStack gap="300" inlineAlign="center">
              <Spinner />
              <Text as="p" tone="subdued">Se încarcă produsele...</Text>
            </BlockStack>
          </Modal.Section>
        ) : productsError === 'REAUTH' ? (
          <Modal.Section>
            <Banner tone="critical" title="Sesiunea Shopify a expirat" action={{
              content: 'Reconectează Shopify',
              onAction: () => {
                try { (window.top || window).location.href = '/api/auth?shop=' + shop }
                catch { window.location.href = '/api/auth?shop=' + shop }
              }
            }}>
              Trebuie să te autentifici din nou pentru a vedea produsele din magazin.
            </Banner>
          </Modal.Section>
        ) : productsError ? (
          <Modal.Section>
            <Banner tone="warning" action={{ content: 'Încearcă din nou', onAction: loadProducts }}>
              {productsError}
            </Banner>
          </Modal.Section>
        ) : products.length === 0 ? (
          <Modal.Section>
            <Text as="p" alignment="center" tone="subdued">Niciun produs găsit în magazin.</Text>
          </Modal.Section>
        ) : (
          <ResourceList
            resourceName={{ singular: 'produs', plural: 'produse' }}
            items={products}
            selectedItems={selectedProduct ? [String(selectedProduct.id)] : []}
            onSelectionChange={(selected) => {
              const id = selected[0]
              setSelectedProduct(products.find(p => String(p.id) === id) || null)
            }}
            selectable
            renderItem={(p) => (
              <ResourceItem
                id={String(p.id)}
                accessibilityLabel={`Selectează ${p.title}`}
                media={
                  p.images?.[0]
                    ? <Thumbnail source={p.images[0].src} alt={p.title} size="small" />
                    : <Thumbnail source={ImageIcon} alt="" size="small" />
                }
                onClick={() => setSelectedProduct(p)}
              >
                <Text as="h4" variant="bodyMd" fontWeight="semibold">{p.title}</Text>
                <Text as="p" variant="bodySm" tone="subdued">/{p.handle}</Text>
              </ResourceItem>
            )}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── CSS de baza (scoped la #unitone-lp + fullscreen per device) ─────────────
function buildCSS(data) {
  const primary = data.style?.primaryColor || '#dc2626'
  const font = data.style?.fontFamily || 'Inter, system-ui, sans-serif'
  const radius = data.style?.borderRadius || '12px'
  return `
    #unitone-lp, #unitone-lp * { box-sizing: border-box; }
    #unitone-lp {
      font-family: ${font}; background: #fff; color: #111;
      width: 100%; max-width: 100%;
      margin: 0; padding: 0 16px;
    }
    /* Override max-width inline din buildHTML/legacy: forțează full width */
    #unitone-lp > div { max-width: 100% !important; margin: 0 !important; }
    #unitone-lp p, #unitone-lp h1, #unitone-lp h2, #unitone-lp h3, #unitone-lp h4 { margin: 0; padding: 0; }
    #unitone-lp img { width: 100%; max-width: 100%; height: auto; display: block; }
    #unitone-lp .btn-main { width: 100%; padding: 17px; border-radius: ${radius}; background: ${primary}; color: #fff; border: none; font-size: 18px; font-weight: 900; cursor: pointer; font-family: inherit; }
    #unitone-lp .inp { padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 15px; outline: none; width: 100%; font-family: inherit; box-sizing: border-box; }

    /* ── DESKTOP > 992px — content mare, optimizat pt monitor ── */
    @media (min-width: 993px) {
      #unitone-lp {
        font-size: 17px !important;
        padding: 0 56px !important;
      }
      #unitone-lp h1 { font-size: clamp(38px, 4.2vw, 56px) !important; line-height: 1.1 !important; }
      #unitone-lp h2 { font-size: clamp(28px, 3vw, 40px) !important; line-height: 1.18 !important; }
      #unitone-lp h3 { font-size: clamp(22px, 2.2vw, 30px) !important; line-height: 1.25 !important; }
      #unitone-lp p { font-size: 17px !important; line-height: 1.65 !important; }
      #unitone-lp .btn-main { padding: 22px 24px !important; font-size: 20px !important; max-width: 520px; margin: 0 auto !important; display: block; }
      #unitone-lp .inp { padding: 16px 18px !important; font-size: 17px !important; }
      /* Secțiunile capătă mai mult breathing room pe desktop */
      #unitone-lp [style*="padding:20px"] { padding: 56px 40px !important; }
      #unitone-lp [style*="padding: 20px"] { padding: 56px 40px !important; }
      #unitone-lp [style*="padding:32px 20px"] { padding: 64px 40px !important; }
      #unitone-lp [style*="padding:24px"] { padding: 48px 32px !important; }
      #unitone-lp [style*="padding: 24px"] { padding: 48px 32px !important; }
      /* Header bar text mai mare */
      #unitone-lp [style*="font-size:13px"] { font-size: 16px !important; }
      /* Imagini hero / produs — păstrează ratio dar full width canvas */
      #unitone-lp [style*="max-width:400px"] { max-width: 520px !important; }
    }

    /* ── TABLET 601-992px — content mediu ── */
    @media (min-width: 601px) and (max-width: 992px) {
      #unitone-lp {
        font-size: 15.5px !important;
        padding: 0 28px !important;
      }
      #unitone-lp h1 { font-size: 32px !important; line-height: 1.15 !important; }
      #unitone-lp h2 { font-size: 24px !important; line-height: 1.22 !important; }
      #unitone-lp h3 { font-size: 19px !important; line-height: 1.3 !important; }
      #unitone-lp p { font-size: 15.5px !important; line-height: 1.6 !important; }
      #unitone-lp .btn-main { padding: 18px 22px !important; font-size: 18px !important; max-width: 480px; margin: 0 auto !important; display: block; }
      #unitone-lp .inp { padding: 14px 16px !important; font-size: 16px !important; }
      #unitone-lp [style*="padding:20px"] { padding: 36px 24px !important; }
      #unitone-lp [style*="padding: 20px"] { padding: 36px 24px !important; }
      #unitone-lp [style*="padding:32px 20px"] { padding: 44px 28px !important; }
    }

    /* ── MOBILE ≤ 600px — compact, scrollabil ── */
    @media (max-width: 600px) {
      #unitone-lp { font-size: 14px !important; padding: 0 12px !important; }
      #unitone-lp h1 { font-size: 22px !important; line-height: 1.25 !important; }
      #unitone-lp h2 { font-size: 18px !important; line-height: 1.3 !important; }
      #unitone-lp h3 { font-size: 16px !important; line-height: 1.35 !important; }
      #unitone-lp p { font-size: 14px !important; line-height: 1.55 !important; }
      #unitone-lp img { width: 100% !important; max-width: 100% !important; height: auto !important; }
      #unitone-lp .btn-main { padding: 14px !important; font-size: 16px !important; width: 100% !important; max-width: 100% !important; }
      /* Stack flex pe mobile */
      #unitone-lp [style*="display:flex"], #unitone-lp [style*="display: flex"] { flex-direction: column !important; gap: 12px !important; }
      /* Override inline width fix > 100% */
      #unitone-lp [style*="width:"] { max-width: 100% !important; }
      /* Volume tiers — 1 coloana pe mobile */
      #unitone-lp .unitone-vol-grid { grid-template-columns: 1fr !important; }
      /* Stats — font mai mic pe mobile */
      #unitone-lp .unitone-stats-grid > div > div:first-child { font-size: 28px !important; }
    }
  `
}

// ─── buildHTML ────────────────────────────────────────────────────────────────
function buildHTML(data) {
  const price = data.price || 149
  const oldPrice = data.oldPrice || Math.round(price * 1.6)
  const disc = Math.round((1 - price / oldPrice) * 100)
  const imgs = data.images || []
  const primary = data.style?.primaryColor || '#e8000d'
  const reviewCount = data.reviewCount || 1247
  const imgTag = (src, style) => src ? `<img src="${src}" style="${style || 'width:100%;display:block'}" />` : ''
  const benefits = (data.benefits || []).slice(0, 5)
  const testimonials = data.testimonials || []

  const relBtn = `<div id="_rsi-cod-form-gempages-button-hook" class="unitone-rel-hook" style="min-height:54px;border:2px dashed ${primary};border-radius:8px;padding:6px;text-align:center;margin:8px 0"><span class="unitone-placeholder-text" style="color:${primary};font-size:12px;pointer-events:none;line-height:42px">&#128722; Buton COD Releasit - apare automat aici</span></div>`
  const scrollBtn = `<a href="#_rsi-cod-form-gempages-button-hook" style="display:inline-block;background:${primary};color:#fff;padding:16px 36px;border-radius:8px;font-size:17px;font-weight:900;text-decoration:none;letter-spacing:0.5px">&#128722; COMANDĂ ACUM</a>`

  const tCards = testimonials.map(t => [
    `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,0.08);border:1px solid #f0f0f0;margin-bottom:14px">`,
    `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`,
    `<span style="color:#f59e0b;font-size:17px">&#9733;&#9733;&#9733;&#9733;&#9733;</span>`,
    `<span style="font-size:11px;background:#f0fdf4;color:#16a34a;border-radius:20px;padding:3px 10px;font-weight:700">&#10003; Cumpărător verificat</span>`,
    `</div>`,
    `<p style="font-size:14px;color:#333;line-height:1.65;margin:0 0 12px;font-style:italic">"${t.text}"</p>`,
    `<strong style="font-size:13px;color:#555">— ${t.name}</strong>`,
    `</div>`
  ].join('')).join('')

  const faqHtml = (data.faq || []).map(f => [
    `<details style="margin-bottom:8px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">`,
    `<summary style="padding:15px 18px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">${f.q}</summary>`,
    `<div style="padding:14px 18px;font-size:14px;color:#555;line-height:1.7;background:#fff">${f.a}</div>`,
    `</details>`
  ].join('')).join('')

  const howItWorksHtml = (data.howItWorks || []).map((s, i) => [
    `<div style="display:flex;gap:14px;margin-bottom:18px;align-items:flex-start">`,
    `<div style="width:36px;height:36px;background:${primary};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0">${i + 1}</div>`,
    `<div style="padding-top:4px"><strong style="font-size:15px;display:block;margin-bottom:4px;color:#111">${s.title}</strong><span style="font-size:14px;color:#555;line-height:1.6">${s.desc}</span></div>`,
    `</div>`
  ].join('')).join('')

  return [
    `<div id="unitone-lp">`,
    `<div style="font-family:Arial,sans-serif;width:100%;background:#fff;color:#111">`,

    // 1. Topbar
    `<div style="background:#111;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:700;letter-spacing:0.3px">`,
    `&#128222; 0700 000 000 &nbsp;&middot;&nbsp; &#128666; LIVRARE RAPIDĂ &middot; PLATĂ LA LIVRARE`,
    `</div>`,

    // 2. Hero
    `<div style="padding:24px 20px 16px;background:#fff;border-bottom:3px solid ${primary}">`,
    `<div style="display:flex;align-items:center;gap:6px;justify-content:center;margin-bottom:10px">`,
    `<span style="color:#f59e0b;font-size:15px">&#9733;&#9733;&#9733;&#9733;&#9733;</span>`,
    `<span style="font-size:13px;color:#555;font-weight:600">${reviewCount.toLocaleString()}+ clienți mulțumiți</span>`,
    `</div>`,
    `<h1 style="font-size:24px;font-weight:900;line-height:1.25;margin:0 0 10px;color:#111;text-align:center">${data.headline || data.productName}</h1>`,
    `<p style="font-size:15px;color:#555;line-height:1.6;margin:0;text-align:center">${data.subheadline || 'Comandă acum cu livrare rapidă și plată la livrare!'}</p>`,
    `</div>`,

    // 3. Imagine principală
    imgs[0] ? `<div style="background:#f8f8f8">${imgTag(imgs[0], 'width:100%;max-height:500px;object-fit:contain;display:block;margin:0 auto')}</div>` : '',

    // 4. Trust microstrip
    `<div style="background:#f9fafb;border-bottom:2px solid ${primary};padding:10px 16px;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;text-align:center">`,
    `<span style="font-size:12px;color:#333;font-weight:700">&#128666; Livrare 2-4 zile</span>`,
    `<span style="font-size:12px;color:#333;font-weight:700">&#128179; Plată ramburs</span>`,
    `<span style="font-size:12px;color:#333;font-weight:700">&#8617; Retur 30 zile</span>`,
    `<span style="font-size:12px;color:#333;font-weight:700">&#127775; Garanție 24 luni</span>`,
    `</div>`,

    // 5. Beneficii
    benefits.length ? [
      `<div style="padding:28px 20px;background:#fff">`,
      `<div style="background:${primary};color:#fff;text-align:center;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:900;letter-spacing:1px;margin-bottom:20px;text-transform:uppercase">&#128293; Top ${benefits.length} motive să comanzi acum</div>`,
      benefits.map(b => `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #f3f4f6"><span style="width:26px;height:26px;background:${primary};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0;margin-top:1px">&#10003;</span><span style="font-size:15px;color:#222;line-height:1.55;font-weight:500">${b}</span></div>`).join(''),
      `</div>`
    ].join('') : '',

    // 6. Preț + CTA #1
    `<div style="padding:24px 20px;background:#fff8f0;border-top:1px solid #fed7aa;border-bottom:3px solid ${primary};text-align:center">`,
    `<div style="background:${primary};color:#fff;display:inline-block;padding:4px 14px;border-radius:4px;font-size:12px;font-weight:800;letter-spacing:1px;margin-bottom:14px">OFERTĂ SPECIALĂ — ${disc}% REDUCERE</div>`,
    `<div style="display:flex;align-items:baseline;gap:12px;justify-content:center;margin-bottom:6px;flex-wrap:wrap">`,
    `<span style="font-size:16px;color:#aaa;text-decoration:line-through">${oldPrice} LEI</span>`,
    `<span style="font-size:52px;font-weight:900;color:${primary};line-height:1">${price}</span>`,
    `<span style="font-size:20px;font-weight:900;color:${primary}">LEI</span>`,
    `</div>`,
    `<p style="font-size:12px;color:#888;margin:0 0 16px">Preț valabil doar pentru comenzile online</p>`,
    relBtn,
    `<div style="display:flex;justify-content:center;gap:16px;margin-top:12px;flex-wrap:wrap">`,
    `<span style="font-size:12px;color:#555;font-weight:600">&#10003; Plată la livrare</span>`,
    `<span style="font-size:12px;color:#555;font-weight:600">&#128666; Livrare 2-4 zile</span>`,
    `<span style="font-size:12px;color:#555;font-weight:600">&#8617; Retur 30 zile</span>`,
    `</div>`,
    `</div>`,

    // 7. img[1] + How it works intercalat
    imgs[1] ? `<div style="background:#f0f0f0">${imgTag(imgs[1], 'width:100%;display:block')}</div>` : '',

    howItWorksHtml ? [
      `<div style="padding:28px 20px;background:#fff;border-bottom:1px solid #f0f0f0">`,
      `<h2 style="font-size:19px;font-weight:900;color:#111;margin:0 0 20px;text-align:center">Cum funcționează?</h2>`,
      howItWorksHtml,
      `</div>`
    ].join('') : '',

    // 8. img[2] + testimoniale 1-2
    imgs[2] ? `<div style="background:#f8f8f8">${imgTag(imgs[2], 'width:100%;display:block')}</div>` : '',

    testimonials.length >= 1 ? [
      `<div style="padding:24px 20px;background:#fff;border-bottom:1px solid #f0f0f0">`,
      `<div style="font-size:12px;font-weight:800;color:${primary};letter-spacing:1px;text-align:center;margin-bottom:16px;text-transform:uppercase">Ce spun clienții noștri</div>`,
      tCards.split('</div>').slice(0, testimonials.length >= 2 ? 2 : 1).map((c, i) => i < (testimonials.length >= 2 ? 2 : 1) ? c + '</div>' : '').join(''),
      `</div>`
    ].join('') : '',

    // 9. CTA #2 urgenta + img[3]
    `<div style="background:#111;padding:20px;text-align:center">`,
    `<div style="color:#fff;font-size:13px;font-weight:700;margin-bottom:4px">&#9889; STOC LIMITAT — Nu rata oferta!</div>`,
    `<div style="color:${primary};font-size:28px;font-weight:900;margin-bottom:12px">${price} LEI <span style="font-size:14px;color:#888;text-decoration:line-through">${oldPrice} LEI</span></div>`,
    scrollBtn,
    `</div>`,

    imgs[3] ? `<div style="background:#f0f0f0">${imgTag(imgs[3], 'width:100%;display:block')}</div>` : '',

    // 10. Testimoniale 3+
    testimonials.length >= 3 ? [
      `<div style="padding:24px 20px;background:#f9fafb;border-bottom:1px solid #f0f0f0">`,
      `<div style="font-size:12px;font-weight:800;color:${primary};letter-spacing:1px;text-align:center;margin-bottom:16px;text-transform:uppercase">Clienți verificați — recenzii reale</div>`,
      testimonials.slice(2).map(t => [
        `<div style="background:#fff;border-radius:12px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,0.07);border:1px solid #f0f0f0;margin-bottom:12px">`,
        `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">`,
        `<span style="color:#f59e0b;font-size:15px">&#9733;&#9733;&#9733;&#9733;&#9733;</span>`,
        `<span style="font-size:11px;background:#f0fdf4;color:#16a34a;border-radius:20px;padding:3px 10px;font-weight:700">&#10003; Verificat</span>`,
        `</div>`,
        `<p style="font-size:14px;color:#333;line-height:1.65;margin:0 0 10px;font-style:italic">"${t.text}"</p>`,
        `<strong style="font-size:13px;color:#666">— ${t.name}</strong>`,
        `</div>`
      ].join('')).join(''),
      `</div>`
    ].join('') : '',

    // 11. img[4] + trust badges
    imgs[4] ? `<div style="background:#f8f8f8">${imgTag(imgs[4], 'width:100%;display:block')}</div>` : '',

    `<div style="padding:24px 20px;background:#fff;border-top:1px solid #f0f0f0">`,
    `<div style="font-size:13px;font-weight:800;color:#111;text-align:center;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px">De ce aleg clienții să cumpere de la noi?</div>`,
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">`,
    `<div style="display:flex;gap:10px;align-items:flex-start;padding:14px;background:#f9fafb;border-radius:10px"><span style="font-size:22px;flex-shrink:0">&#128179;</span><div><div style="font-size:13px;font-weight:800;color:#111">Plată ramburs</div><div style="font-size:12px;color:#666;margin-top:2px;line-height:1.4">Plătești doar când primești coletul</div></div></div>`,
    `<div style="display:flex;gap:10px;align-items:flex-start;padding:14px;background:#f9fafb;border-radius:10px"><span style="font-size:22px;flex-shrink:0">&#127775;</span><div><div style="font-size:13px;font-weight:800;color:#111">Produs original</div><div style="font-size:12px;color:#666;margin-top:2px;line-height:1.4">Garanție 24 luni inclusă</div></div></div>`,
    `<div style="display:flex;gap:10px;align-items:flex-start;padding:14px;background:#f9fafb;border-radius:10px"><span style="font-size:22px;flex-shrink:0">&#128666;</span><div><div style="font-size:13px;font-weight:800;color:#111">Livrare rapidă</div><div style="font-size:12px;color:#666;margin-top:2px;line-height:1.4">Fan Courier / Sameday 2-4 zile</div></div></div>`,
    `<div style="display:flex;gap:10px;align-items:flex-start;padding:14px;background:#f9fafb;border-radius:10px"><span style="font-size:22px;flex-shrink:0">&#8617;</span><div><div style="font-size:13px;font-weight:800;color:#111">Retur 30 zile</div><div style="font-size:12px;color:#666;margin-top:2px;line-height:1.4">Banii înapoi dacă nu ești mulțumit</div></div></div>`,
    `</div></div>`,

    // 12. FAQ
    (data.faq || []).length ? [
      `<div style="padding:28px 20px;background:#f9fafb;border-top:1px solid #f0f0f0">`,
      `<h3 style="font-size:18px;font-weight:900;margin:0 0 16px;text-align:center;color:#111">Întrebări frecvente</h3>`,
      faqHtml,
      `</div>`
    ].join('') : '',

    // 13. Final CTA
    `<div style="padding:32px 20px;background:${primary};text-align:center">`,
    `<div style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">&#9889; Comandă acum și primești în 2-4 zile</div>`,
    `<div style="color:#fff;font-size:34px;font-weight:900;margin-bottom:4px">${price} LEI</div>`,
    `<div style="color:rgba(255,255,255,0.6);font-size:14px;text-decoration:line-through;margin-bottom:20px">${oldPrice} LEI</div>`,
    `<div style="margin-bottom:14px">${scrollBtn}</div>`,
    `<div style="font-size:12px;color:rgba(255,255,255,0.75)">&#10003; Plată la livrare &nbsp;&middot;&nbsp; &#128666; Livrare rapidă &nbsp;&middot;&nbsp; &#8617; Retur 30 zile gratuit</div>`,
    `</div>`,

    // 14. (Built-in form removed — COD button blocks from the editor handle this via Releasit hook)

    // 15. Footer
    `<div style="background:#111;color:#777;padding:20px;text-align:center;font-size:12px;line-height:1.8">`,
    `<p style="margin:0 0 4px;color:#bbb;font-weight:700;font-size:13px">&copy; 2025 ${data.productName}</p>`,
    `<p style="margin:0">Termeni și Condiții &middot; Politica de Confidențialitate &middot; ANPC</p>`,
    `</div>`,

    `</div>`,
    `</div>`
  ].join('\n')
}

// ─── addBlocks ────────────────────────────────────────────────────────────────
function addBlocks(editor, data) {
  const p = data?.style?.primaryColor || '#e8000d'

  // Helper - placeholder vizibil cu border dashed. ID-ul _rsi-cod-form-gempages-button-hook = hook oficial Releasit GemPages.
  // ID trebuie sa fie unic pe pagina - daca user trage mai multe blocuri, doar primul va fi populat de Releasit.
  function relBtn(extra) {
    return `<div id="_rsi-cod-form-gempages-button-hook" class="unitone-rel-hook" style="min-height:54px;border:2px dashed ${p};border-radius:6px;padding:6px;text-align:center;${extra || ''}"><span class="unitone-placeholder-text" style="color:${p};font-size:12px;pointer-events:none;line-height:42px">&#128722; Buton COD - trage-ma unde vrei</span></div>`
  }

  // Mini visual previews — each is a small SVG that hints at what the block does.
  // GrapesJS renders this as the block thumbnail.
  const T = {
    btn: `<svg viewBox="0 0 60 28"><rect x="6" y="6" width="48" height="16" rx="6" fill="${p}"/></svg>`,
    btnFull: `<svg viewBox="0 0 60 28"><rect x="2" y="6" width="56" height="16" rx="4" fill="${p}"/></svg>`,
    btnCenter: `<svg viewBox="0 0 60 28"><rect x="14" y="6" width="32" height="16" rx="6" fill="${p}"/></svg>`,
    col2: `<svg viewBox="0 0 60 36"><rect x="4" y="4" width="24" height="28" rx="2" fill="#e1e3e5"/><rect x="32" y="4" width="24" height="28" rx="2" fill="#e1e3e5"/></svg>`,
    col3: `<svg viewBox="0 0 60 36"><rect x="4" y="4" width="16" height="28" rx="2" fill="#e1e3e5"/><rect x="22" y="4" width="16" height="28" rx="2" fill="#e1e3e5"/><rect x="40" y="4" width="16" height="28" rx="2" fill="#e1e3e5"/></svg>`,
    spacer: `<svg viewBox="0 0 60 36"><rect x="4" y="14" width="52" height="8" rx="2" fill="#e1e3e5" stroke="#c9cccf" stroke-dasharray="2 2"/></svg>`,
    line: `<svg viewBox="0 0 60 36"><line x1="6" y1="18" x2="54" y2="18" stroke="#898f94" stroke-width="2"/></svg>`,
    h2: `<svg viewBox="0 0 60 36"><rect x="6" y="12" width="48" height="6" rx="1" fill="#202223"/><rect x="6" y="22" width="32" height="3" rx="1" fill="#c9cccf"/></svg>`,
    h3: `<svg viewBox="0 0 60 36"><rect x="6" y="14" width="38" height="5" rx="1" fill="#202223"/><rect x="6" y="22" width="28" height="3" rx="1" fill="#c9cccf"/></svg>`,
    para: `<svg viewBox="0 0 60 36"><rect x="6" y="9" width="48" height="3" rx="1" fill="#898f94"/><rect x="6" y="16" width="48" height="3" rx="1" fill="#898f94"/><rect x="6" y="23" width="36" height="3" rx="1" fill="#898f94"/></svg>`,
    image: `<svg viewBox="0 0 60 36"><rect x="4" y="4" width="52" height="28" rx="3" fill="#e1e3e5"/><circle cx="16" cy="14" r="3" fill="#898f94"/><path d="M4 28 L20 18 L34 26 L56 12 L56 32 L4 32 Z" fill="#898f94"/></svg>`,
    video: `<svg viewBox="0 0 60 36"><rect x="4" y="4" width="52" height="28" rx="3" fill="#202223"/><polygon points="24,12 24,24 36,18" fill="#fff"/></svg>`,
    compare: `<svg viewBox="0 0 60 36"><rect x="4" y="4" width="24" height="28" rx="2" fill="#fee2e2"/><rect x="32" y="4" width="24" height="28" rx="2" fill="#dcfce7"/><line x1="30" y1="4" x2="30" y2="32" stroke="#898f94" stroke-dasharray="2 2"/></svg>`,
    carousel: `<svg viewBox="0 0 60 36"><rect x="4" y="6" width="20" height="24" rx="2" fill="#e1e3e5"/><rect x="26" y="6" width="20" height="24" rx="2" fill="#c9cccf"/><rect x="48" y="6" width="8" height="24" rx="2" fill="#e1e3e5"/></svg>`,
    heroDark: `<svg viewBox="0 0 60 36"><rect x="2" y="2" width="56" height="32" rx="2" fill="#202223"/><rect x="14" y="11" width="32" height="4" rx="1" fill="#fff"/><rect x="20" y="18" width="20" height="2" rx="1" fill="#898f94"/><rect x="22" y="24" width="16" height="6" rx="3" fill="${p}"/></svg>`,
    heroRed: `<svg viewBox="0 0 60 36"><rect x="2" y="2" width="56" height="32" rx="2" fill="${p}"/><rect x="14" y="11" width="32" height="4" rx="1" fill="#fff"/><rect x="20" y="18" width="20" height="2" rx="1" fill="rgba(255,255,255,0.7)"/><rect x="22" y="24" width="16" height="6" rx="3" fill="#fff"/></svg>`,
    list: `<svg viewBox="0 0 60 36"><circle cx="9" cy="10" r="3" fill="${p}"/><rect x="16" y="9" width="38" height="3" rx="1" fill="#898f94"/><circle cx="9" cy="18" r="3" fill="${p}"/><rect x="16" y="17" width="32" height="3" rx="1" fill="#898f94"/><circle cx="9" cy="26" r="3" fill="${p}"/><rect x="16" y="25" width="36" height="3" rx="1" fill="#898f94"/></svg>`,
    faq: `<svg viewBox="0 0 60 36"><rect x="4" y="6" width="52" height="10" rx="2" fill="#f6f6f7" stroke="#e1e3e5"/><polyline points="48,9 51,12 48,15" stroke="#898f94" fill="none" stroke-width="1.5"/><rect x="4" y="20" width="52" height="10" rx="2" fill="#f6f6f7" stroke="#e1e3e5"/><polyline points="48,23 51,26 48,29" stroke="#898f94" fill="none" stroke-width="1.5"/></svg>`,
    marquee: `<svg viewBox="0 0 60 36"><rect x="2" y="13" width="56" height="10" rx="1" fill="#202223"/><text x="6" y="20" font-size="6" fill="#fff" font-family="sans-serif">→ TEXT • TEXT •</text></svg>`,
    badges: `<svg viewBox="0 0 60 36"><circle cx="12" cy="18" r="6" fill="${p}"/><circle cx="30" cy="18" r="6" fill="${p}"/><circle cx="48" cy="18" r="6" fill="${p}"/></svg>`,
    testimonial: `<svg viewBox="0 0 60 36"><rect x="4" y="6" width="52" height="24" rx="3" fill="#f6f6f7" stroke="${p}" stroke-width="2"/><text x="8" y="16" font-size="6" fill="#f59e0b">★★★★★</text><rect x="8" y="20" width="40" height="2" rx="1" fill="#898f94"/><rect x="8" y="24" width="28" height="2" rx="1" fill="#898f94"/></svg>`,
    productCard: `<svg viewBox="0 0 60 36"><rect x="4" y="4" width="52" height="28" rx="3" fill="#fff" stroke="#e1e3e5"/><rect x="6" y="6" width="48" height="14" rx="2" fill="#e1e3e5"/><rect x="6" y="22" width="22" height="3" rx="1" fill="#202223"/><rect x="6" y="27" width="14" height="3" rx="1" fill="${p}"/></svg>`,
    bundle: `<svg viewBox="0 0 60 36"><rect x="6" y="6" width="20" height="10" rx="2" fill="#fff" stroke="#fed7aa" stroke-width="2"/><text x="14" y="13" font-size="6" fill="#666">+</text><rect x="34" y="6" width="20" height="10" rx="2" fill="#fff" stroke="#fed7aa" stroke-width="2"/><rect x="14" y="20" width="32" height="10" rx="2" fill="${p}"/></svg>`,
    stock: `<svg viewBox="0 0 60 36"><rect x="4" y="10" width="52" height="16" rx="2" fill="#fff8f0" stroke="#fed7aa"/><rect x="6" y="13" width="20" height="3" rx="1" fill="#c2410c"/><rect x="6" y="18" width="14" height="2" rx="1" fill="#ea580c"/><rect x="34" y="14" width="18" height="8" rx="4" fill="#fef3c7"/></svg>`,
    strip: `<svg viewBox="0 0 60 36"><rect x="2" y="13" width="56" height="10" rx="1" fill="${p}"/><text x="11" y="20" font-size="6" fill="#fff" font-family="sans-serif">⚠ URGENT</text></svg>`,
    countdown: `<svg viewBox="0 0 60 36"><rect x="2" y="6" width="56" height="24" rx="2" fill="${p}"/><rect x="8" y="14" width="10" height="10" rx="1" fill="rgba(0,0,0,0.3)"/><rect x="22" y="14" width="10" height="10" rx="1" fill="rgba(0,0,0,0.3)"/><rect x="36" y="14" width="10" height="10" rx="1" fill="rgba(0,0,0,0.3)"/><text x="11" y="22" font-size="7" fill="#fff" font-family="monospace">14</text><text x="25" y="22" font-size="7" fill="#fff" font-family="monospace">59</text><text x="39" y="22" font-size="7" fill="#fff" font-family="monospace">00</text></svg>`,
    delivery: `<svg viewBox="0 0 60 36"><rect x="4" y="10" width="52" height="16" rx="2" fill="#f0fdf4" stroke="#bbf7d0"/><circle cx="14" cy="18" r="3" fill="#15803d"/><rect x="22" y="13" width="28" height="3" rx="1" fill="#15803d"/><rect x="22" y="20" width="20" height="2" rx="1" fill="#16a34a"/></svg>`,
    coupon: `<svg viewBox="0 0 60 36"><rect x="4" y="8" width="52" height="20" rx="3" fill="#f0fdf4" stroke="#86efac" stroke-width="2" stroke-dasharray="3 2"/><rect x="14" y="14" width="22" height="8" rx="1" fill="#fff" stroke="#86efac"/><rect x="40" y="14" width="12" height="8" rx="1" fill="#16a34a"/></svg>`,
    newsletter: `<svg viewBox="0 0 60 36"><rect x="4" y="14" width="36" height="10" rx="2" fill="#fff" stroke="#e1e3e5"/><rect x="42" y="14" width="14" height="10" rx="2" fill="${p}"/><rect x="14" y="6" width="32" height="3" rx="1" fill="#202223"/></svg>`,
    arrowUp: `<svg viewBox="0 0 60 36"><circle cx="48" cy="22" r="8" fill="${p}"/><polygon points="48,18 44,24 52,24" fill="#fff"/></svg>`,
    code: `<svg viewBox="0 0 60 36"><rect x="2" y="6" width="56" height="24" rx="2" fill="#1e1e2e"/><text x="10" y="22" font-size="9" fill="#a5f3fc" font-family="monospace">&lt;/&gt;</text></svg>`,
  }

  const blocks = [
    // COD FORM
    { id:'releasit-btn', label:'Buton COD', cat:'COD Form', media: T.btn,
      content: relBtn('margin:10px 0;') },
    { id:'releasit-btn-full', label:'Buton COD Full', cat:'COD Form', media: T.btnFull,
      content: `<div style="padding:10px 20px">${relBtn('width:100%;box-sizing:border-box;')}</div>` },
    { id:'releasit-btn-center', label:'Buton COD Centrat', cat:'COD Form', media: T.btnCenter,
      content: `<div style="text-align:center;padding:16px 20px">${relBtn('display:inline-block;min-width:240px;')}</div>` },

    // LAYOUT
    { id:'row-2col', label:'2 Coloane', cat:'Layout', media: T.col2,
      content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px"><div style="padding:16px;background:#f9fafb;border-radius:8px;min-height:60px">Coloana 1</div><div style="padding:16px;background:#f9fafb;border-radius:8px;min-height:60px">Coloana 2</div></div>` },
    { id:'row-3col', label:'3 Coloane', cat:'Layout', media: T.col3,
      content: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:20px"><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 1</div><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 2</div><div style="padding:14px;background:#f9fafb;border-radius:8px;min-height:60px">Col 3</div></div>` },
    { id:'spacer', label:'Spațiu', cat:'Layout', media: T.spacer,
      content: `<div style="height:40px"></div>` },
    { id:'line', label:'Separator', cat:'Layout', media: T.line,
      content: `<hr style="border:none;border-top:2px solid #e5e7eb;margin:8px 20px"/>` },

    // TEXT
    { id:'heading', label:'Titlu H2', cat:'Text', media: T.h2,
      content: `<h2 style="font-size:28px;font-weight:900;color:#111;padding:16px 20px;margin:0;line-height:1.2">Titlul tău aici</h2>` },
    { id:'heading-h3', label:'Subtitlu H3', cat:'Text', media: T.h3,
      content: `<h3 style="font-size:20px;font-weight:800;color:#111;padding:12px 20px;margin:0">Subtitlu</h3>` },
    { id:'text-block', label:'Paragraf', cat:'Text', media: T.para,
      content: `<p style="font-size:15px;color:#444;line-height:1.7;padding:12px 20px;margin:0">Textul tău aici. Click pentru a edita.</p>` },
    { id:'button-cta', label:'Buton CTA', cat:'Text', media: T.btn,
      content: `<div style="padding:16px 20px;text-align:center"><a href="#formular" style="display:inline-block;background:${p};color:#fff;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:800;text-decoration:none">COMANDĂ ACUM!</a></div>` },

    // MEDIA
    { id:'image', label:'Imagine', cat:'Media', media: T.image,
      content: `<div><img src="https://placehold.co/650x400/f3f4f6/999?text=Imagine" style="width:100%;display:block"/></div>` },
    { id:'video', label:'Video', cat:'Media', media: T.video,
      content: `<div style="padding:20px"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div></div>` },
    { id:'img-comparison', label:'Înainte / După', cat:'Media', media: T.compare,
      content: `<div style="padding:20px"><div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="display:grid;grid-template-columns:1fr 1fr"><div style="text-align:center;padding:12px;background:#fef2f2"><div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px">ÎNAINTE</div><img src="https://placehold.co/300x250/fee2e2/dc2626?text=Inainte" style="width:100%;display:block;border-radius:4px"/></div><div style="text-align:center;padding:12px;background:#f0fdf4"><div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:8px">DUPĂ</div><img src="https://placehold.co/300x250/dcfce7/16a34a?text=Dupa" style="width:100%;display:block;border-radius:4px"/></div></div></div></div>` },
    { id:'carousel', label:'Carousel', cat:'Media', media: T.carousel,
      content: `<div style="padding:20px;overflow:hidden"><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory"><div style="min-width:280px;scroll-snap-align:start;background:#f9fafb;border-radius:10px;overflow:hidden"><img src="https://placehold.co/280x200/f3f4f6/999?text=1" style="width:100%;display:block"/><div style="padding:12px;font-size:14px;font-weight:600">Produs 1</div></div><div style="min-width:280px;scroll-snap-align:start;background:#f9fafb;border-radius:10px;overflow:hidden"><img src="https://placehold.co/280x200/f3f4f6/999?text=2" style="width:100%;display:block"/><div style="padding:12px;font-size:14px;font-weight:600">Produs 2</div></div></div></div>` },

    // HERO
    { id:'hero-dark', label:'Hero Închis', cat:'Hero', media: T.heroDark,
      content: `<div style="background:linear-gradient(135deg,#111 0%,#333 100%);padding:60px 20px;text-align:center"><h1 style="color:#fff;font-size:32px;font-weight:900;margin:0 0 14px">Titlu Principal</h1><p style="color:rgba(255,255,255,0.7);font-size:16px;margin:0 0 28px">Subtitlul ofertei tale</p>${relBtn('display:inline-block;min-width:240px;')}</div>` },
    { id:'hero-red', label:'Hero Color', cat:'Hero', media: T.heroRed,
      content: `<div style="background:${p};padding:50px 20px;text-align:center"><h1 style="color:#fff;font-size:30px;font-weight:900;margin:0 0 12px">Titlu Promo</h1><p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0 0 24px">Ofertă limitată!</p>${relBtn('display:inline-block;min-width:240px;')}</div>` },

    // ELEMENTE
    { id:'icon-list', label:'Listă Beneficii', cat:'Elemente', media: T.list,
      content: `<div style="padding:20px"><div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:${p};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#10003;</span><span style="font-size:14px;color:#222">Livrare rapidă în toată România</span></div><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:${p};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#10003;</span><span style="font-size:14px;color:#222">Plată la livrare, fără risc</span></div><div style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;background:${p};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">&#10003;</span><span style="font-size:14px;color:#222">Garanție 30 zile retur</span></div></div></div>` },
    { id:'accordion', label:'FAQ', cat:'Elemente', media: T.faq,
      content: `<div style="padding:20px"><details style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">Cum funcționează plata la livrare?</summary><div style="padding:14px 16px;font-size:14px;color:#555;line-height:1.7">Plătești curierului în momentul în care primești coletul.</div></details><details style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><summary style="padding:14px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#f9fafb">Cât durează livrarea?</summary><div style="padding:14px 16px;font-size:14px;color:#555;line-height:1.7">2-5 zile lucrătoare.</div></details></div>` },
    { id:'marquee', label:'Marquee', cat:'Elemente', media: T.marquee,
      content: `<div style="overflow:hidden;background:#111;padding:12px 0"><div style="display:flex;animation:unitone-marquee 15s linear infinite;white-space:nowrap"><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#128666; Livrare GRATUITĂ</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#10003; Plată la livrare</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#8617; Retur 30 zile</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#128666; Livrare GRATUITĂ</span><span style="color:${p};padding:0 12px">&#9733;</span><span style="color:#fff;font-size:13px;font-weight:600;padding:0 24px">&#10003; Plată la livrare</span></div></div><style>@keyframes unitone-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>` },

    // TRUST
    { id:'trust-badges', label:'Trust Badges', cat:'Trust', media: T.badges,
      content: `<div style="padding:20px;background:#fff;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;text-align:center"><div style="font-size:13px;color:#444"><div style="font-size:28px">&#128179;</div>Plată ramburs</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#10003;</div>Satisfacție garantată</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#8617;</div>Banii înapoi 30 zile</div><div style="font-size:13px;color:#444"><div style="font-size:28px">&#128666;</div>Livrare rapidă</div></div>` },
    { id:'testimonial', label:'Testimonial', cat:'Trust', media: T.testimonial,
      content: `<div style="padding:20px 20px 0"><div style="padding:20px;background:#f9fafb;border-radius:12px;border-left:4px solid ${p};margin-bottom:12px"><div style="color:#f39c12;margin-bottom:8px;font-size:16px">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p style="color:#333;margin-bottom:12px;font-style:italic;font-size:15px;line-height:1.6">"Produs excelent! L-am primit în 5 zile."</p><strong style="color:#111;font-size:14px">— Maria D., București</strong></div></div>` },

    // PRODUS
    { id:'product-card', label:'Card Produs', cat:'Produs', media: T.productCard,
      content: `<div style="padding:20px;border:1px solid #e5e7eb;border-radius:10px;margin:16px 20px"><img src="https://placehold.co/400x300/f9fafb/999?text=Produs" style="width:100%;border-radius:8px;display:block;margin-bottom:14px"/><h3 style="font-size:18px;font-weight:800;margin:0 0 6px">Numele Produsului</h3><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:26px;font-weight:900;color:${p}">149 RON</span><span style="text-decoration:line-through;color:#999;font-size:16px">249 RON</span></div>${relBtn()}</div>` },
    { id:'bundle', label:'Bundle', cat:'Produs', media: T.bundle,
      content: `<div style="padding:20px;background:#fff8f0;border:2px solid #fed7aa;border-radius:10px;margin:16px 20px"><div style="text-align:center;font-size:12px;font-weight:700;color:#c2410c;letter-spacing:1px;margin-bottom:14px">&#128293; BUNDLE SPECIAL</div><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"><div style="display:flex;align-items:center;justify-content:space-between;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb"><div style="font-size:14px;font-weight:600">Produs Principal</div><div style="font-size:15px;font-weight:900;color:${p}">149 RON</div></div><div style="text-align:center;font-size:18px;color:#666">+</div><div style="display:flex;align-items:center;justify-content:space-between;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb"><div><div style="font-size:14px;font-weight:600">Produs Bonus</div><div style="font-size:11px;color:#16a34a;font-weight:600">GRATUIT la bundle</div></div><div style="font-size:15px;font-weight:900;text-decoration:line-through;color:#999">29 RON</div></div></div>${relBtn()}</div>` },

    // URGENTA
    { id:'stock-counter', label:'Stoc Limitat', cat:'Urgență', media: T.stock,
      content: `<div style="padding:12px 20px;background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;margin:0 20px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">&#128230;</span><div><div style="font-size:13px;font-weight:700;color:#c2410c">Stoc limitat!</div><div style="font-size:12px;color:#ea580c">Au mai rămas doar <strong>7 bucăți</strong> la acest preț</div></div><div style="margin-left:auto;background:#fef3c7;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:700;color:#d97706">7 / 50</div></div>` },
    { id:'urgency-strip', label:'Strip Urgență', cat:'Urgență', media: T.strip,
      content: `<div style="background:${p};color:#fff;text-align:center;padding:12px 20px;font-size:14px;font-weight:700">&#9888; STOC LIMITAT - Comandă acum!</div>` },
    { id:'countdown', label:'Countdown', cat:'Urgență', media: T.countdown,
      content: `<div style="background:${p};color:#fff;padding:14px 20px;text-align:center"><div style="font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px">&#9889; OFERTA EXPIRĂ ÎN:</div><div style="display:flex;justify-content:center;gap:10px"><div style="text-align:center"><span id="cd-h" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">00</span><div style="font-size:10px;margin-top:3px;opacity:0.8">ORE</div></div><span style="font-size:24px;font-weight:900;padding-top:8px">:</span><div style="text-align:center"><span id="cd-m" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">14</span><div style="font-size:10px;margin-top:3px;opacity:0.8">MIN</div></div><span style="font-size:24px;font-weight:900;padding-top:8px">:</span><div style="text-align:center"><span id="cd-s" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 14px;font-size:24px;font-weight:900;font-family:monospace;min-width:52px;display:inline-block">00</span><div style="font-size:10px;margin-top:3px;opacity:0.8">SEC</div></div></div></div><script>(function(){var t=14*60;function r(){var h=String(Math.floor(t/3600)).padStart(2,'0'),m=String(Math.floor((t%3600)/60)).padStart(2,'0'),s=String(t%60).padStart(2,'0');var eh=document.getElementById('cd-h'),em=document.getElementById('cd-m'),es=document.getElementById('cd-s');if(eh)eh.textContent=h;if(em)em.textContent=m;if(es)es.textContent=s;}setInterval(function(){if(t>0)t--;r();},1000);r();})();<\/script>` },

    // CONVERSIE
    { id:'delivery-date', label:'Data Livrare', cat:'Conversie', media: T.delivery,
      content: `<div style="padding:12px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 20px;display:flex;align-items:center;gap:12px"><span style="font-size:24px">&#128666;</span><div><div style="font-size:14px;font-weight:700;color:#15803d">Livrare estimată: 3-5 zile lucrătoare</div><div style="font-size:12px;color:#16a34a">Comandă acum!</div></div></div>` },
    { id:'coupon', label:'Cupon', cat:'Conversie', media: T.coupon,
      content: `<div style="padding:16px 20px;background:#f0fdf4;border:2px dashed #86efac;border-radius:8px;margin:0 20px;text-align:center"><div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px">&#127999; COD REDUCERE</div><div style="display:flex;align-items:center;justify-content:center;gap:10px"><code style="background:#fff;border:1px solid #86efac;border-radius:6px;padding:8px 16px;font-size:18px;font-weight:900;letter-spacing:2px;color:#15803d">COD20</code><button onclick="navigator.clipboard.writeText('COD20');this.textContent='OK!';setTimeout(function(){this.textContent='Copy'},2000)" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Copy</button></div></div>` },

    // FORMULARE
    { id:'newsletter', label:'Newsletter', cat:'Formulare', media: T.newsletter,
      content: `<div style="padding:32px 20px;background:#f9fafb;text-align:center"><h3 style="font-size:20px;font-weight:800;margin:0 0 8px">Abonează-te și primești -10%</h3><div style="display:flex;gap:10px;max-width:400px;margin:0 auto"><input placeholder="Email" type="email" style="flex:1;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;font-family:inherit"/><button style="background:${p};color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Abonare</button></div></div>` },

    // NAVIGARE
    { id:'back-to-top', label:'Sus', cat:'Navigare', media: T.arrowUp,
      content: `<div style="position:fixed;bottom:24px;right:20px;z-index:998"><button onclick="window.scrollTo({top:0,behavior:'smooth'})" style="width:44px;height:44px;background:${p};color:#fff;border:none;border-radius:50%;font-size:18px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25)">&#8593;</button></div>` },

    // AVANSAT
    { id:'custom-code', label:'HTML Custom', cat:'Avansat', media: T.code,
      content: `<div style="padding:16px 20px;background:#1e1e2e;border-radius:8px;margin:16px 20px"><code style="font-size:13px;color:#a5f3fc;font-family:monospace;display:block">&lt;div&gt;Codul tău HTML&lt;/div&gt;</code></div>` },
  ]

  blocks.forEach(b => {
    editor.Blocks.add(b.id, {
      label: b.label,
      category: { id: b.cat, label: b.cat, open: b.cat === 'COD Form' },
      content: b.content,
      media: b.media,
      attributes: { class: 'gjs-block-section' }
    })
  })
}

/* ─── Editor outer UI styles (theme-adaptive) ─────────────────────────────── */
function EditorStyles() {
  return (
    <style>{`
      /* ── Editor shell ────────────────────────────── */
      .ue-shell {
        height: 100vh; display: flex; flex-direction: column;
        background: #f6f6f7;
      }
      .ue-toolbar {
        height: 56px; flex-shrink: 0;
        padding: 8px 16px; gap: 12px;
        display: flex; align-items: center;
        background: #ffffff;
        border-bottom: 1px solid #e1e3e5;
      }
      .ue-tb-title { width: 280px; flex-shrink: 0; }
      .ue-tb-save { padding-right: 8px; white-space: nowrap; }
      @media (max-width: 1100px) {
        .ue-tb-title { width: 200px; }
      }
      .ue-tb-error {
        padding: 12px 16px;
        background: #ffffff;
        border-bottom: 1px solid #e1e3e5;
      }
      .ue-layout {
        flex: 1; display: grid;
        grid-template-columns: 260px 1fr 300px;
        min-height: 0; overflow: hidden;
        background: #f6f6f7;
      }
      .ue-panel {
        background: #ffffff;
        border-right: 1px solid #e1e3e5;
        overflow-y: auto; padding: 16px;
      }
      .ue-panel-right {
        border-right: none;
        border-left: 1px solid #e1e3e5;
      }
      .ue-panel-title {
        font-size: 11px; font-weight: 600;
        color: #6d7175;
        text-transform: uppercase; letter-spacing: 0.06em;
        padding: 6px 0 14px;
      }

      /* ── Canvas: studio-grey stage, LP rendered as a centered "device frame" ─── */
      .ue-canvas {
        background: #e3e5e7;
        overflow: hidden;
        padding: 0;
        position: relative;
      }
      .ue-canvas > div {
        width: 100% !important;
        height: 100% !important;
      }

      .gjs-cv-canvas {
        background-color: #e3e5e7 !important;
        top: 0 !important;
        width: 100% !important;
        height: 100% !important;
        padding: 24px !important;
        box-sizing: border-box !important;
      }
      .gjs-cv-canvas-bg { background-color: #e3e5e7 !important; }

      /* Frame wrapper centers the LP frame horizontally (so tablet/mobile float in the middle) */
      .gjs-frame-wrapper {
        background: transparent !important;
        padding: 0 !important;
        margin: 0 auto !important;
        height: 100% !important;
        display: flex !important;
        align-items: flex-start !important;
        justify-content: center !important;
      }
      .gjs-frames {
        background: transparent !important;
        height: 100% !important;
      }
      /* The LP iframe — white card with shadow, height fills the canvas */
      .gjs-frame {
        background: #ffffff !important;
        border: none !important;
        border-radius: 8px !important;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.10) !important;
        height: 100% !important;
        margin: 0 auto !important;
        transition: width 0.25s cubic-bezier(0.4,0,0.2,1) !important;
      }

      /* Hover/select highlights — softer, Polaris-style */
      .gjs-comp-selected,
      .gjs-selected {
        outline: 2px solid #008060 !important;
        outline-offset: -2px !important;
      }
      .gjs-hovered {
        outline: 1px solid #5C6AC4 !important;
        outline-offset: -1px !important;
      }
      .gjs-toolbar { background: #202223 !important; border-radius: 6px !important; }
      .gjs-toolbar-item { color: #fff !important; }

      /* ── Block panel (left) — kill ALL GrapesJS dark defaults ─── */
      #blocks-panel,
      .gjs-blocks-cs,
      .gjs-block-categories,
      .gjs-block-category,
      .gjs-blocks-no-cs {
        background: transparent !important;
        background-color: transparent !important;
        color: #202223 !important;
      }
      .gjs-block {
        border: 1px solid #e1e3e5 !important;
        border-radius: 8px !important;
        background: #ffffff !important;
        background-color: #ffffff !important;
        color: #202223 !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        margin: 0 0 8px !important;
        padding: 8px 6px !important;
        text-align: center !important;
        cursor: grab !important;
        transition: all 0.12s ease !important;
        min-height: 80px !important;
        width: 100% !important;
        box-shadow: none !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
      }
      .gjs-block__media {
        background: #f6f6f7 !important;
        border-radius: 4px !important;
        padding: 4px !important;
        width: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-bottom: 4px !important;
      }
      .gjs-block svg {
        width: 100% !important;
        max-width: 64px !important;
        height: auto !important;
        max-height: 36px !important;
        display: block !important;
      }
      .gjs-block:hover {
        border-color: #008060 !important;
        box-shadow: 0 0 0 2px rgba(0,128,96,0.12) !important;
        transform: translateY(-1px);
      }
      .gjs-block-label {
        font-size: 11px !important;
        line-height: 1.25 !important;
        color: #202223 !important;
        font-weight: 500 !important;
      }
      .gjs-block-category {
        margin-bottom: 16px !important;
        border: none !important;
      }
      .gjs-block-category > .gjs-title,
      .gjs-block-category .gjs-title {
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #6d7175 !important;
        padding: 12px 4px 8px !important;
        letter-spacing: 0.06em !important;
        text-transform: uppercase !important;
        border: none !important;
        background: transparent !important;
        background-color: transparent !important;
      }
      .gjs-block-category .gjs-title::before {
        color: #6d7175 !important;
      }
      .gjs-blocks-c {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        gap: 8px !important;
        padding: 0 !important;
        background: transparent !important;
      }
      .gjs-one-bg, .gjs-two-bg, .gjs-three-bg, .gjs-four-bg {
        background-color: transparent !important;
      }
      .gjs-one-color, .gjs-two-color, .gjs-three-color, .gjs-four-color {
        color: #202223 !important;
      }

      /* ── Style + Trait panels (right) ───────────────── */
      .gjs-sm-sectors,
      .gjs-trt-traits {
        background: transparent !important;
      }
      .gjs-sm-sector {
        border: none !important;
        border-bottom: 1px solid #e1e3e5 !important;
        padding: 4px 0 12px;
        margin-bottom: 8px;
        background: transparent !important;
      }
      .gjs-sm-sector:last-child { border-bottom: none !important; }
      .gjs-sm-sector-title,
      .gjs-sm-sector .gjs-sm-title {
        font-size: 12px !important;
        font-weight: 600 !important;
        color: #202223 !important;
        padding: 8px 4px !important;
        background: transparent !important;
        border: none !important;
        text-transform: none !important;
        letter-spacing: 0 !important;
      }
      .gjs-sm-properties {
        background: transparent !important;
        padding: 4px 0 !important;
      }
      .gjs-sm-property {
        padding: 6px 4px !important;
      }
      .gjs-sm-label {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #6d7175 !important;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .gjs-field,
      .gjs-input-holder,
      .gjs-sm-input,
      .gjs-clm-tags-field {
        background: #ffffff !important;
        border: 1px solid #c9cccf !important;
        border-radius: 6px !important;
        color: #202223 !important;
        font-size: 13px !important;
        box-shadow: none !important;
      }
      .gjs-field input,
      .gjs-field select,
      .gjs-field textarea {
        background: #ffffff !important;
        color: #202223 !important;
        font-size: 13px !important;
      }
      .gjs-field:focus-within {
        border-color: #008060 !important;
        box-shadow: 0 0 0 2px rgba(0,128,96,0.18) !important;
      }
      .gjs-trt-trait {
        padding: 8px 4px !important;
        border-bottom: 1px solid #f1f1f3;
      }
      .gjs-trt-trait:last-child { border-bottom: none; }
      .gjs-trt-traits .gjs-label-wrp {
        font-size: 11px;
        font-weight: 600;
        color: #6d7175;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* GrapesJS color picker / number arrows — neutral */
      .gjs-radio-item-label,
      .gjs-input-unit {
        color: #6d7175 !important;
      }

      /* Scrollbar polish for panels */
      .ue-panel::-webkit-scrollbar,
      .ue-canvas::-webkit-scrollbar { width: 8px; height: 8px; }
      .ue-panel::-webkit-scrollbar-track,
      .ue-canvas::-webkit-scrollbar-track { background: transparent; }
      .ue-panel::-webkit-scrollbar-thumb,
      .ue-canvas::-webkit-scrollbar-thumb {
        background: #c9cccf;
        border-radius: 4px;
      }
      .ue-panel::-webkit-scrollbar-thumb:hover,
      .ue-canvas::-webkit-scrollbar-thumb:hover { background: #898f94; }

      @media (max-width: 900px) {
        .ue-layout { grid-template-columns: 1fr; }
        .ue-panel { display: none; }
        .gjs-blocks-c { grid-template-columns: 1fr 1fr; }
      }
    `}</style>
  )
}
