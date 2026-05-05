import { useEffect, useRef, useState } from 'react'

export default function Editor({ data, shop, onBack }) {
  const editorRef = useRef(null)
  const gjsRef = useRef(null)
  const [device, setDevice] = useState('desktop')
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState('')
  const [error, setError] = useState('')

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

      // Seteaza HTML-ul generat
      const html = buildHTML(data)
      const css = buildCSS(data)
      editor.setComponents(html)
      editor.setStyle(css)

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

  async function publish() {
    if (!gjsRef.current) return
    setPublishing(true)
    setError('')
    try {
      const html = gjsRef.current.getHtml()
      const css = gjsRef.current.getCss()
      const fullHtml = `<style>${css}</style>${html}`

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          title: data.productName || 'Pagina COD',
          html: fullHtml,
          images: data.images || [],
          pageData: data
        })
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

        <span style={{ fontSize:14, fontWeight:600, color:'#fff', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {data.productName || 'Pagina COD'}
        </span>

        {/* Device selector */}
        <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:10, padding:3, gap:2 }}>
          {[['desktop','🖥️'],['mobile','📱']].map(([d, ic]) => (
            <button key={d} onClick={() => switchDevice(d)}
              style={{ padding:'5px 12px', borderRadius:8, border:'none', background: device===d ? 'rgba(229,62,62,0.8)' : 'transparent', color:'#fff', fontSize:14, cursor:'pointer' }}>
              {ic}
            </button>
          ))}
        </div>

        {/* Undo/Redo */}
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => gjsRef.current?.UndoManager.undo()}
            style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:13 }}>↩️</button>
          <button onClick={() => gjsRef.current?.UndoManager.redo()}
            style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:13 }}>↪️</button>
        </div>

        {error && <span style={{ fontSize:12, color:'#fc8181' }}>⚠️ {error}</span>}

        <button onClick={publish} disabled={publishing}
          style={{ padding:'8px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#e53e3e,#c53030)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity: publishing ? 0.6 : 1, boxShadow:'0 2px 8px rgba(229,62,62,0.3)', whiteSpace:'nowrap' }}>
          {publishing ? '⏳ Se publică...' : '🚀 Publică — 40 RON'}
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

function buildHTML(data) {
  const price = data.price || 149
  const oldPrice = data.oldPrice || Math.round(price * 1.6)
  const disc = Math.round((1 - price / oldPrice) * 100)
  const imgs = data.images || []
  const primary = data.style?.primaryColor || '#dc2626'

  const JUDETE = ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brăila","Brașov","București","Buzău","Călărași","Caraș-Severin","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Sălaj","Satu Mare","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vâlcea","Vaslui","Vrancea"]
  const jOpts = JUDETE.map(j => `<option value="${j}">${j}</option>`).join('')

  const imgTag = (src, alt) => src ? `<img src="${src}" alt="${alt || ''}" style="width:100%;display:block;object-fit:cover;max-height:350px" />` : ''

  const benefitRows = (data.benefits || []).map(b => `
    <div class="benefit-row">
      <span style="color:#16a34a;font-weight:900;font-size:17px;flex-shrink:0">✓</span>
      <span style="font-size:14px;color:#166534;line-height:1.6">${b}</span>
    </div>`).join('')

  const testimonialCards = (data.testimonials || []).map(t => `
    <div style="background:#fff;border:1px solid #f3f4f6;border-radius:14px;padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <strong style="font-size:14px;display:block">${t.name}</strong>
          <span style="font-size:12px;color:#9ca3af">${t.city}</span>
        </div>
        <span style="color:#fbbf24;font-size:16px">${'★'.repeat(t.stars || 5)}</span>
      </div>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0">"${t.text}"</p>
    </div>`).join('')

  const faqItems = (data.faq || []).map(f => `
    <details style="margin-bottom:10px;border:1.5px solid #f3f4f6;border-radius:12px;overflow:hidden">
      <summary style="padding:14px 16px;font-size:14px;font-weight:700;cursor:pointer;background:#fafafa;list-style:none;display:flex;justify-content:space-between">
        ${f.q} <span style="color:${primary};font-size:20px">+</span>
      </summary>
      <div style="padding:12px 16px">
        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0">${f.a}</p>
      </div>
    </details>`).join('')

  const howItWorks = (data.howItWorks || []).map((s, i) => `
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
      <div style="min-width:36px;height:36px;border-radius:50%;background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0">${i + 1}</div>
      <div>
        <strong style="font-size:15px;font-weight:700;display:block;margin-bottom:3px">${s.title}</strong>
        <span style="font-size:13px;color:#6b7280;line-height:1.6">${s.desc}</span>
      </div>
    </div>`).join('')

  return `
<div data-gjs-type="wrapper">

  <!-- URGENTA -->
  <div data-gjs-type="section" style="background:#111;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:600">
    🚚 LIVRARE GRATUITĂ peste 200 lei · ☎ 0700 000 000
  </div>

  <div data-gjs-type="section" style="background:${primary};color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div style="font-size:13px;font-weight:700">⚡ Doar <strong>${data.stock || 7} bucăți</strong> rămase!</div>
    <div class="timer-block" id="timer-top">
      <div><span class="timer-val" id="tm">14</span><span class="timer-lbl">MIN</span></div>
      <div><span class="timer-val" id="ts">00</span><span class="timer-lbl">SEC</span></div>
    </div>
  </div>

  <!-- HERO IMAGE -->
  ${imgTag(imgs[0], data.productName)}

  <!-- TITLU + PRET -->
  <div data-gjs-type="section" style="padding:24px 20px 16px">
    <div style="display:inline-block;background:#fef2f2;color:${primary};border:1px solid #fecaca;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;margin-bottom:12px">
      OFERTĂ SPECIALĂ · -${disc}% REDUCERE
    </div>
    <h1 style="font-size:24px;font-weight:900;line-height:1.25;margin:0 0 10px">${data.headline}</h1>
    <p style="font-size:15px;color:#555;line-height:1.7;margin:0 0 20px">${data.subheadline}</p>

    <div style="background:#fafafa;border:1.5px solid #e5e7eb;border-radius:16px;padding:20px;margin-bottom:16px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px">
        <span style="font-size:38px;font-weight:900;color:${primary}">${price} lei</span>
        <span style="font-size:20px;color:#d1d5db;text-decoration:line-through">${oldPrice} lei</span>
        <span style="background:${primary};color:#fff;border-radius:8px;padding:3px 10px;font-size:13px;font-weight:800">-${disc}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:14px;color:#6b7280">Cantitate:</span>
        <div style="display:flex;align-items:center;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <button onclick="cqty(-1)" style="width:38px;height:38px;border:none;background:#f9fafb;font-size:18px;cursor:pointer">−</button>
          <span id="qty-disp" style="width:40px;text-align:center;font-size:17px;font-weight:800">1</span>
          <button onclick="cqty(1)" style="width:38px;height:38px;border:none;background:#f9fafb;font-size:18px;cursor:pointer">+</button>
        </div>
      </div>
    </div>

    <button class="btn-main" onclick="document.getElementById('cod-form').scrollIntoView({behavior:'smooth'})">
      🛒 COMANDĂ ACUM — PLATĂ LA LIVRARE
    </button>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:8px">
      Nu plătești nimic acum · Livrare 2–4 zile · Ramburs curier
    </p>
  </div>

  <!-- TRUST BADGES -->
  <div data-gjs-type="section" style="background:#f9fafb;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;padding:16px 20px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">🔒</span><div><div style="font-size:13px;font-weight:700">Plată securizată</div><div style="font-size:12px;color:#9ca3af">100% sigur</div></div></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">🚚</span><div><div style="font-size:13px;font-weight:700">Livrare rapidă</div><div style="font-size:12px;color:#9ca3af">2–4 zile</div></div></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">↩️</span><div><div style="font-size:13px;font-weight:700">Retur gratuit</div><div style="font-size:12px;color:#9ca3af">30 de zile</div></div></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">⭐</span><div><div style="font-size:13px;font-weight:700">Clienți mulțumiți</div><div style="font-size:12px;color:#9ca3af">4.9/5 stele</div></div></div>
    </div>
  </div>

  <!-- IMAGINE 1 + BENEFICII 1-3 -->
  ${imgTag(imgs[1], 'lifestyle')}
  <div data-gjs-type="section" style="padding:24px 20px">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 16px">De ce să alegi ${data.productName}?</h2>
    ${benefitRows}
  </div>

  <!-- CUM FUNCTIONEAZA -->
  <div data-gjs-type="section" style="padding:24px 20px;background:#f9fafb">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 18px">Cum funcționează?</h2>
    ${howItWorks}
  </div>

  <!-- IMAGINE 2 -->
  ${imgTag(imgs[2], 'detaliu')}

  <!-- TESTIMONIALE -->
  ${imgTag(imgs[3], 'clienti')}
  <div data-gjs-type="section" style="padding:24px 20px">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 6px">Ce spun clienții noștri</h2>
    <p style="font-size:13px;color:#9ca3af;margin-bottom:18px">Peste ${(data.reviewCount || 1200).toLocaleString()} recenzii ⭐⭐⭐⭐⭐</p>
    ${testimonialCards}
  </div>

  <!-- FAQ -->
  <div data-gjs-type="section" style="padding:24px 20px;background:#f9fafb">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 16px">Întrebări frecvente</h2>
    ${faqItems}
  </div>

  <!-- FORMULAR COD -->
  <div id="cod-form" data-gjs-type="section" style="background:linear-gradient(180deg,#fef2f2,#fff);border-top:3px solid ${primary};padding:24px 20px">
    <h2 style="font-size:22px;font-weight:900;margin:0 0 6px">Comandă acum — Plată la livrare</h2>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6">Nu plătești nimic acum — curierul îți aduce produsul și plătești la ușă.</p>

    <div id="form-fields" style="display:flex;flex-direction:column;gap:12px">
      <input class="inp" id="f-name" placeholder="Nume și prenume *" />
      <input class="inp" id="f-phone" placeholder="Număr de telefon *" />
      <select class="inp" id="f-county" style="color:#9ca3af">
        <option value="">Selectează județul *</option>
        ${jOpts}
      </select>
      <input class="inp" id="f-city" placeholder="Localitatea *" />
      <textarea class="inp" id="f-address" rows="2" placeholder="Strada, număr, bloc, apartament *" style="resize:none"></textarea>

      <div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:14px;padding:16px;font-size:14px">
        <div style="font-weight:700;font-size:12px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Sumar comandă</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#374151">
          <span id="prod-name-summary">${data.productName} <span id="qty-summary">×1</span></span>
          <span id="price-summary" style="font-weight:600">${price} lei</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#374151">
          <span>Livrare</span><span style="color:#16a34a;font-weight:700">GRATUITĂ</span>
        </div>
        <div style="border-top:1.5px solid #f3f4f6;padding-top:10px;display:flex;justify-content:space-between;font-weight:900;font-size:18px">
          <span>Total la livrare</span>
          <span id="total-summary" style="color:${primary}">${price} lei</span>
        </div>
      </div>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;font-size:13px;color:#15803d;display:flex;gap:8px;align-items:center">
        <span>🔒</span><span>Plata se face <strong>doar la livrare</strong>. Datele tale sunt în siguranță.</span>
      </div>

      <div id="form-success" style="display:none;text-align:center;padding:40px 20px">
        <div style="font-size:56px;margin-bottom:12px">✅</div>
        <h3 style="color:#16a34a;font-size:22px;font-weight:800">Comandă plasată!</h3>
        <p style="color:#555;margin-top:8px">Te vom contacta în maxim 24 ore. Plata la livrare.</p>
      </div>

      <button class="btn-main" onclick="submitOrder()">
        🛒 FINALIZEAZĂ — <span id="btn-total">${price}</span> LEI LA LIVRARE
      </button>
      <p style="font-size:12px;color:#9ca3af;text-align:center">Prin plasarea comenzii ești de acord cu Termenii și Condițiile</p>
    </div>
  </div>

  <!-- FOOTER -->
  <div data-gjs-type="section" style="background:#111;color:#6b7280;padding:20px;text-align:center;font-size:12px">
    <p style="margin:0 0 4px;color:#9ca3af;font-weight:600">© 2025 ${data.productName}</p>
    <p style="margin:0">Termeni · Confidențialitate · ANPC</p>
  </div>

</div>

<script>
(function(){
  var PRICE = ${price};
  var qty = 1;
  var ts = ${(data.timerMinutes || 14) * 60};

  function updateTimer() {
    var m = String(Math.floor(ts/60)).padStart(2,'0');
    var s = String(ts%60).padStart(2,'0');
    var tm = document.getElementById('tm');
    var tss = document.getElementById('ts');
    if(tm) tm.textContent = m;
    if(tss) tss.textContent = s;
  }
  setInterval(function(){ if(ts>0) ts--; updateTimer(); }, 1000);
  updateTimer();

  window.cqty = function(d) {
    qty = Math.max(1, qty + d);
    var qd = document.getElementById('qty-disp');
    var qs = document.getElementById('qty-summary');
    var ps = document.getElementById('price-summary');
    var tot = document.getElementById('total-summary');
    var btn = document.getElementById('btn-total');
    if(qd) qd.textContent = qty;
    if(qs) qs.textContent = '×' + qty;
    var total = PRICE * qty;
    if(ps) ps.textContent = total + ' lei';
    if(tot) tot.textContent = total + ' lei';
    if(btn) btn.textContent = total;
  };

  window.submitOrder = function() {
    var n = document.getElementById('f-name')?.value.trim();
    var p = document.getElementById('f-phone')?.value.trim();
    var c = document.getElementById('f-county')?.value;
    var a = document.getElementById('f-address')?.value.trim();
    if(!n||!p||!c||!a){ alert('Completează toate câmpurile *'); return; }
    var ff = document.getElementById('form-fields');
    var fs = document.getElementById('form-success');
    if(ff) ff.style.display = 'none';
    if(fs) fs.style.display = 'block';
  };
})();
</script>
`
}

function addBlocks(editor, data) {
  const primary = data.style?.primaryColor || '#dc2626'

  const blocks = [
    {
      id: 'section-text',
      label: '📝 Secțiune text',
      category: 'Layout',
      content: `<div style="padding:24px 20px"><h2 style="font-size:20px;font-weight:800;margin:0 0 12px">Titlu secțiune</h2><p style="font-size:15px;color:#555;line-height:1.7">Textul tău aici...</p></div>`
    },
    {
      id: 'benefit-block',
      label: '✅ Beneficiu',
      category: 'Elemente',
      content: `<div class="benefit-row"><span style="color:#16a34a;font-weight:900;font-size:17px;flex-shrink:0">✓</span><span style="font-size:14px;color:#166534;line-height:1.6">Beneficiul tău aici</span></div>`
    },
    {
      id: 'testimonial-block',
      label: '⭐ Testimonial',
      category: 'Elemente',
      content: `<div style="background:#fff;border:1px solid #f3f4f6;border-radius:14px;padding:16px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><strong style="font-size:14px;display:block">Nume Client</strong><span style="font-size:12px;color:#9ca3af">Oraș</span></div><span style="color:#fbbf24;font-size:16px">⭐⭐⭐⭐⭐</span></div><p style="font-size:14px;color:#374151;line-height:1.6;margin:0">"Testimonialul tău aici."</p></div>`
    },
    {
      id: 'urgency-bar',
      label: '⚡ Bar urgență',
      category: 'Elemente',
      content: `<div style="background:${primary};color:#fff;padding:10px 20px;text-align:center;font-size:14px;font-weight:700">⚡ Ofertă limitată — Mai sunt doar câteva bucăți!</div>`
    },
    {
      id: 'cta-button',
      label: '🛒 Buton CTA',
      category: 'Elemente',
      content: `<div style="padding:0 20px 20px"><button class="btn-main">🛒 COMANDĂ ACUM — PLATĂ LA LIVRARE</button></div>`
    },
    {
      id: 'divider',
      label: '➖ Separator',
      category: 'Layout',
      content: `<hr style="border:none;border-top:1px solid #f3f4f6;margin:0">`
    },
    {
      id: 'spacer',
      label: '⬜ Spațiu',
      category: 'Layout',
      content: `<div style="height:32px"></div>`
    },
    {
      id: 'image-block',
      label: '🖼️ Imagine',
      category: 'Media',
      content: `<img src="https://placehold.co/600x300/f3f4f6/999?text=Imaginea+ta" style="width:100%;display:block" />`
    },
  ]

  blocks.forEach(b => editor.Blocks.add(b.id, b))
}
