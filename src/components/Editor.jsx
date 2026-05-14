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

export default function Editor({ data, shop, codFormApp: codFormAppProp, planLimit, onBack, onPublished, onUpgrade }) {
  const codFormApp = codFormAppProp || (typeof window !== 'undefined' ? localStorage.getItem('codform_' + shop) : null) || null
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
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Tablet', width: '768px', widthMedia: '992px' },
            { name: 'Mobile', width: '390px', widthMedia: '600px' }
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
        raw = raw.replace(/<style[^>]*>[\s\S]*?unitone-placeholder-text[\s\S]*?<\/style>/gi, '')
        // Extrage CSS din primul style tag (LP-ul generat de GrapesJS)
        const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        const savedCss = styleMatch ? styleMatch[1] : ''
        const htmlOnly = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Re-wrap în #unitone-lp ca CSS-ul scoped să funcționeze în preview
        editor.setComponents(`<div id="unitone-lp">${htmlOnly.trim()}</div>`)
        // Aplică ÎNTOTDEAUNA buildCSS curent (responsive update) + override cu CSS salvat din GrapesJS
        const baseCss = buildCSS(data)
        editor.setStyle(savedCss ? baseCss + '\n' + savedCss : baseCss)
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
      const finalCodFormApp = localStorage.getItem('codform_' + shop) || codFormApp || null
      const pid = pageIdRef.current || data.id
      const body = {
        action: 'update', shop, pageId: pid,
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
      // Plain fetch — never redirect to OAuth from here (user would lose editor state).
      // Auth errors surface as a reconnect prompt instead.
      const res = await fetch('/api/get-products', {
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
      const finalCodFormApp = localStorage.getItem('codform_' + shop) || codFormApp || null

      const pid = pageIdRef.current || data.id
      const body = pid
        ? { action: 'update', shop, pageId: pid, title: finalTitle, html: finalHtml, hideHeaderFooter, codFormApp: finalCodFormApp, variantId }
        : { shop, title: finalTitle, html: finalHtml, productId: selectedProduct?.id, hideHeaderFooter, codFormApp: finalCodFormApp, variantId }

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
      {/* TOOLBAR — Polaris-styled custom flex layout */}
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
function buildHTML(data, codFormApp) {
  const price = data.price || 149
  const oldPrice = data.oldPrice || Math.round(price * 1.6)
  const disc = Math.round((1 - price / oldPrice) * 100)
  const imgs = data.images || []
  const primary = data.style?.primaryColor || '#e8000d'
  const reviewCount = data.reviewCount || 1247
  const JUDETE = ['Alba','Arad','Arges','Bacau','Bihor','Bistrita-Nasaud','Botosani','Braila','Brasov','Bucuresti','Buzau','Calarasi','Caras-Severin','Cluj','Constanta','Covasna','Dambovita','Dolj','Galati','Giurgiu','Gorj','Harghita','Hunedoara','Ialomita','Iasi','Ilfov','Maramures','Mehedinti','Mures','Neamt','Olt','Prahova','Salaj','Satu Mare','Sibiu','Suceava','Teleorman','Timis','Tulcea','Valcea','Vaslui','Vrancea']
  const jOpts = JUDETE.map(j => `<option value="${j}">${j}</option>`).join('')
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

    // 14. Form propriu (dacă nu e Releasit)
    codFormApp && codFormApp !== 'none' ? '' : [
      `<div id="formular" style="padding:28px 20px;background:#fff3f3;border-top:4px solid ${primary}">`,
      `<h2 style="font-size:20px;font-weight:900;text-align:center;margin:0 0 6px;color:#111">COMANDĂ ACUM CU ${disc}% REDUCERE</h2>`,
      `<p style="text-align:center;font-size:13px;color:#777;margin:0 0 20px">Completează datele de livrare — plătești la primire</p>`,
      `<div id="form-fields" style="display:flex;flex-direction:column;gap:10px">`,
      `<input id="f-name" placeholder="Nume și Prenume *" style="padding:14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<input id="f-phone" placeholder="Număr de telefon *" type="tel" style="padding:14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<input id="f-address" placeholder="Adresă completă *" style="padding:14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<input id="f-city" placeholder="Localitate *" style="padding:14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif"/>`,
      `<select id="f-county" style="padding:14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;outline:none;width:100%;box-sizing:border-box;font-family:Arial,sans-serif;color:#555;background:#fff"><option value="">Selectează județul *</option>${jOpts}</select>`,
      `<button onclick="submitOrder()" style="background:${primary};color:#fff;border:none;padding:18px;border-radius:8px;font-size:18px;font-weight:900;cursor:pointer;width:100%;font-family:Arial,sans-serif;letter-spacing:0.5px">&#128722; COMANDĂ ACUM — PLATĂ LA LIVRARE</button>`,
      `<p style="text-align:center;font-size:12px;color:#aaa;margin:4px 0 0">Prin apăsarea butonului ești de acord cu termenii și condițiile</p>`,
      `</div>`,
      `<div id="form-success" style="display:none;text-align:center;padding:40px 20px">`,
      `<div style="font-size:52px;margin-bottom:12px">&#10003;</div>`,
      `<h3 style="font-size:22px;font-weight:800;color:#16a34a;margin:0 0 8px">Comandă plasată cu succes!</h3>`,
      `<p style="font-size:14px;color:#555;line-height:1.6">Te vom contacta telefonic în cel mai scurt timp pentru confirmare. Livrare în 2-4 zile lucrătoare.</p>`,
      `</div>`,
      `</div>`
    ].join(''),

    // 15. Footer
    `<div style="background:#111;color:#777;padding:20px;text-align:center;font-size:12px;line-height:1.8">`,
    `<p style="margin:0 0 4px;color:#bbb;font-weight:700;font-size:13px">&copy; 2025 ${data.productName}</p>`,
    `<p style="margin:0">Termeni și Condiții &middot; Politica de Confidențialitate &middot; ANPC</p>`,
    `</div>`,

    `<script>`,
    `function submitOrder(){`,
    `var n=document.getElementById('f-name').value.trim(),`,
    `p=document.getElementById('f-phone').value.trim(),`,
    `a=document.getElementById('f-address').value.trim(),`,
    `c=document.getElementById('f-city').value.trim(),`,
    `j=document.getElementById('f-county').value;`,
    `if(!n||!p||!a||!c||!j){alert('Te rugăm să completezi toate câmpurile!');return;}`,
    `document.getElementById('form-fields').style.display='none';`,
    `document.getElementById('form-success').style.display='block';`,
    `}`,
    `<\/script>`,

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
        background: var(--p-color-bg, #f6f6f7);
      }
      .ue-toolbar {
        height: 56px; flex-shrink: 0;
        padding: 8px 16px; gap: 12px;
        display: flex; align-items: center;
        background: var(--p-color-bg-surface, #fff);
        border-bottom: 1px solid var(--p-color-border, #e1e3e5);
      }
      .ue-tb-title { flex: 1; min-width: 200px; max-width: 480px; }
      .ue-tb-save { margin-left: auto; padding-right: 12px; white-space: nowrap; }
      .ue-tb-error {
        padding: 12px 16px;
        background: var(--p-color-bg-surface, #fff);
        border-bottom: 1px solid var(--p-color-border, #e1e3e5);
      }
      .ue-layout {
        flex: 1; display: grid;
        grid-template-columns: 240px 1fr 280px;
        min-height: 0; overflow: hidden;
      }
      .ue-panel {
        background: var(--p-color-bg-surface, #fff);
        border-right: 1px solid var(--p-color-border, #e1e3e5);
        overflow-y: auto; padding: 16px;
      }
      .ue-panel-right {
        border-right: none;
        border-left: 1px solid var(--p-color-border, #e1e3e5);
      }
      .ue-panel-title {
        font-size: 12px; font-weight: 600;
        color: var(--p-color-text-secondary, #6d7175);
        text-transform: uppercase; letter-spacing: 0.04em;
        padding: 4px 0 12px;
      }
      .ue-canvas {
        background: var(--p-color-bg-surface-secondary, #f6f6f7);
        overflow: auto;
      }

      /* GrapesJS Polaris-friendly overrides */
      .gjs-block {
        border: 1px solid var(--p-color-border, #e1e3e5);
        border-radius: 8px;
        background: var(--p-color-bg-surface, #fff);
        font-size: 12px;
        margin-bottom: 6px;
        padding: 10px;
      }
      .gjs-block:hover { border-color: var(--p-color-border-emphasis, #898f94); }
      .gjs-block-category .gjs-title {
        font-size: 11px; font-weight: 700;
        color: var(--p-color-text-secondary, #6d7175);
        padding: 12px 0 8px; letter-spacing: 0.05em;
      }
      .gjs-sm-sector {
        border: none; border-bottom: 1px solid var(--p-color-border, #e1e3e5);
        padding: 8px 0;
      }
      .gjs-sm-sector .gjs-sm-title {
        font-size: 12px; font-weight: 600;
        color: var(--p-color-text, #202223);
        padding: 4px 0;
      }
      .gjs-field {
        background: var(--p-color-bg-surface, #fff);
        border: 1px solid var(--p-color-border, #e1e3e5);
        border-radius: 6px;
      }
      .gjs-trt-trait { padding: 8px 0; }

      @media (max-width: 900px) {
        .ue-layout { grid-template-columns: 1fr; }
        .ue-panel { display: none; }
      }
    `}</style>
  )
}
