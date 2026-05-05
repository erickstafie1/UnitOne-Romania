const https = require('https')

const PRICE_RON = 40

function shopifyGraphQL(shop, token, query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables })
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2024-01/graphql.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function shopifyREST(shop, token, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: `/admin/api/2024-01${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function uploadImageToShopify(shop, token, base64Data, filename) {
  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const [, mimeType, data] = match

  const result = await shopifyGraphQL(shop, token, `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage { image { url } }
        }
        userErrors { field message }
      }
    }
  `, {
    files: [{ filename, mimeType, originalSource: `data:${mimeType};base64,${data}` }]
  })

  const url = result?.data?.fileCreate?.files?.[0]?.image?.url
  console.log('Upload image:', url ? 'OK' : 'FAILED', result?.data?.fileCreate?.userErrors)
  return url || null
}

async function createShopifyPage(shop, token, title, html) {
  const result = await shopifyREST(shop, token, '/pages.json', 'POST', {
    page: { title, body_html: html, published: true }
  })
  if (result.page) {
    return { success: true, page: result.page, url: `https://${shop}/pages/${result.page.handle}` }
  }
  throw new Error(JSON.stringify(result.errors || 'Unknown error'))
}

async function createBillingCharge(shop, token, appUrl) {
  // Shopify one-time charge via API
  const result = await shopifyREST(shop, token, '/application_charges.json', 'POST', {
    application_charge: {
      name: 'Pagina COD — UnitOne Romania',
      price: PRICE_RON,
      return_url: `${appUrl}/api/billing/confirm?shop=${shop}`,
      test: process.env.NODE_ENV !== 'production'
    }
  })
  return result.application_charge
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { shop, token, title, html, images, pageData } = req.body || {}
  if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

  try {
    console.log('Publishing for shop:', shop)

    // 1. Upload imagini Gemini (base64) in Shopify Files
    let finalImages = []
    if (images && images.length > 0) {
      const uploadPromises = images.map(async (img, i) => {
        if (!img) return null
        if (img.startsWith('data:')) {
          return uploadImageToShopify(shop, token, img, `pagecod-img-${i + 1}-${Date.now()}.jpg`)
        }
        return img // URL normal AliExpress
      })
      finalImages = (await Promise.all(uploadPromises)).filter(Boolean)
    }
    console.log('Final images after upload:', finalImages.length)

    // 2. Construieste HTML final cu URL-uri reale
    let finalHtml = html
    if (pageData && finalImages.length > 0) {
      // Inlocuieste imaginile base64 cu URL-uri reale in HTML
      pageData.images = finalImages
      // Rebuildeaza HTML cu imaginile noi (serverul regenereaza din pageData)
      finalHtml = buildPageHTML(pageData)
    }

    // 3. Creeaza pagina in Shopify
    const result = await createShopifyPage(shop, token, title || 'Pagina COD', finalHtml)

    // 4. Initializeaza billing (40 RON)
    const appUrl = process.env.APP_URL || 'https://unitone-romania.vercel.app'
    let billingUrl = null
    try {
      const charge = await createBillingCharge(shop, token, appUrl)
      billingUrl = charge?.confirmation_url
      console.log('Billing charge created:', charge?.id)
    } catch(e) {
      console.error('Billing error (non-fatal):', e.message)
      // Continuam chiar daca billing-ul esueaza (dev mode)
    }

    res.status(200).json({
      success: true,
      pageUrl: result.url,
      pageId: result.page?.id,
      billingUrl
    })
  } catch(err) {
    console.error('Publish error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

function buildPageHTML(data) {
  const price = data.price || 149
  const oldPrice = data.oldPrice || Math.round(price * 1.6)
  const disc = Math.round((1 - price / oldPrice) * 100)
  const imgs = data.images || []
  const primary = data.style?.primaryColor || '#dc2626'
  const JUDETE = ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brăila","Brașov","București","Buzău","Călărași","Caraș-Severin","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Sălaj","Satu Mare","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vâlcea","Vaslui","Vrancea"]
  const jOpts = JUDETE.map(j => `<option value="${j}">${j}</option>`).join('')
  const imgTag = (src, alt) => src ? `<img src="${src}" alt="${alt || ''}" style="width:100%;display:block;object-fit:cover;max-height:350px">` : ''
  const benefitRows = (data.benefits || []).map(b => `<div style="display:flex;gap:12px;align-items:flex-start;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px;margin-bottom:10px"><span style="color:#16a34a;font-weight:900;font-size:17px;flex-shrink:0">✓</span><span style="font-size:14px;color:#166534;line-height:1.6">${b}</span></div>`).join('')
  const tCards = (data.testimonials || []).map(t => `<div style="background:#fff;border:1px solid #f3f4f6;border-radius:14px;padding:16px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><strong style="font-size:14px;display:block">${t.name}</strong><span style="font-size:12px;color:#9ca3af">${t.city}</span></div><span style="color:#fbbf24;font-size:16px">${'★'.repeat(t.stars||5)}</span></div><p style="font-size:14px;color:#374151;line-height:1.6;margin:0">"${t.text}"</p></div>`).join('')
  const faqHtml = (data.faq || []).map(f => `<details style="margin-bottom:10px;border:1.5px solid #f3f4f6;border-radius:12px;overflow:hidden"><summary style="padding:14px 16px;font-size:14px;font-weight:700;cursor:pointer;background:#fafafa;list-style:none;display:flex;justify-content:space-between">${f.q}<span style="color:${primary};font-size:20px">+</span></summary><div style="padding:12px 16px"><p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0">${f.a}</p></div></details>`).join('')
  const howHtml = (data.howItWorks || []).map((s, i) => `<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px"><div style="min-width:36px;height:36px;border-radius:50%;background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;flex-shrink:0">${i+1}</div><div><strong style="font-size:15px;font-weight:700;display:block;margin-bottom:3px">${s.title}</strong><span style="font-size:13px;color:#6b7280;line-height:1.6">${s.desc}</span></div></div>`).join('')

  return `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;background:#fff;color:#111;max-width:600px;margin:0 auto}.inp{padding:12px 14px;border-radius:8px;border:1px solid #e2e8f0;font-size:15px;outline:none;width:100%;font-family:inherit;box-sizing:border-box}.btn-main{width:100%;padding:17px;border-radius:12px;background:linear-gradient(135deg,${primary},${primary}cc);color:#fff;border:none;font-size:18px;font-weight:900;cursor:pointer;font-family:inherit}</style>
<div style="background:#111;color:#fff;text-align:center;padding:10px;font-size:13px;font-weight:600">🚚 LIVRARE GRATUITĂ peste 200 lei · ☎ 0700 000 000</div>
<div style="background:${primary};color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px"><div style="font-size:13px;font-weight:700">⚡ Doar <strong>${data.stock||7} bucăți</strong> rămase!</div><div id="tc"></div></div>
${imgTag(imgs[0], data.productName)}
<div style="padding:24px 20px 16px"><div style="display:inline-block;background:#fef2f2;color:${primary};border:1px solid #fecaca;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;margin-bottom:12px">OFERTĂ SPECIALĂ · -${disc}% REDUCERE</div><h1 style="font-size:24px;font-weight:900;line-height:1.25;margin:0 0 10px">${data.headline}</h1><p style="font-size:15px;color:#555;line-height:1.7;margin:0 0 20px">${data.subheadline}</p><div style="background:#fafafa;border:1.5px solid #e5e7eb;border-radius:16px;padding:20px;margin-bottom:16px"><div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px"><span id="pd" style="font-size:38px;font-weight:900;color:${primary}">${price} lei</span><span style="font-size:20px;color:#d1d5db;text-decoration:line-through">${oldPrice} lei</span><span style="background:${primary};color:#fff;border-radius:8px;padding:3px 10px;font-size:13px;font-weight:800">-${disc}%</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:14px;color:#6b7280">Cantitate:</span><div style="display:flex;align-items:center;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden"><button onclick="cq(-1)" style="width:38px;height:38px;border:none;background:#f9fafb;font-size:18px;cursor:pointer">−</button><span id="qd" style="width:40px;text-align:center;font-size:17px;font-weight:800">1</span><button onclick="cq(1)" style="width:38px;height:38px;border:none;background:#f9fafb;font-size:18px;cursor:pointer">+</button></div></div></div><button class="btn-main" onclick="document.getElementById('cf').scrollIntoView({behavior:'smooth'})">🛒 COMANDĂ ACUM — PLATĂ LA LIVRARE</button><p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:8px">Nu plătești nimic acum · Livrare 2–4 zile · Ramburs curier</p></div>
<div style="background:#f9fafb;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;padding:16px 20px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">🔒</span><div><div style="font-size:13px;font-weight:700">Plată securizată</div><div style="font-size:12px;color:#9ca3af">100% sigur</div></div></div><div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">🚚</span><div><div style="font-size:13px;font-weight:700">Livrare rapidă</div><div style="font-size:12px;color:#9ca3af">2–4 zile</div></div></div><div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">↩️</span><div><div style="font-size:13px;font-weight:700">Retur gratuit</div><div style="font-size:12px;color:#9ca3af">30 de zile</div></div></div><div style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">⭐</span><div><div style="font-size:13px;font-weight:700">Clienți mulțumiți</div><div style="font-size:12px;color:#9ca3af">4.9/5 stele</div></div></div></div></div>
${imgTag(imgs[1], 'lifestyle')}
<div style="padding:24px 20px"><h2 style="font-size:20px;font-weight:800;margin:0 0 16px">De ce să alegi ${data.productName}?</h2>${benefitRows}</div>
<div style="padding:24px 20px;background:#f9fafb"><h2 style="font-size:20px;font-weight:800;margin:0 0 18px">Cum funcționează?</h2>${howHtml}</div>
${imgTag(imgs[2], 'detaliu')}
${imgTag(imgs[3], 'clienti')}
<div style="padding:24px 20px"><h2 style="font-size:20px;font-weight:800;margin:0 0 6px">Ce spun clienții noștri</h2><p style="font-size:13px;color:#9ca3af;margin-bottom:18px">Peste ${(data.reviewCount||1200).toLocaleString()} recenzii ⭐⭐⭐⭐⭐</p>${tCards}</div>
<div style="padding:24px 20px;background:#f9fafb"><h2 style="font-size:20px;font-weight:800;margin:0 0 16px">Întrebări frecvente</h2>${faqHtml}</div>
<div id="cf" style="background:linear-gradient(180deg,#fef2f2,#fff);border-top:3px solid ${primary};padding:24px 20px"><h2 style="font-size:22px;font-weight:900;margin:0 0 20px">Comandă acum — Plată la livrare</h2><div id="ff" style="display:flex;flex-direction:column;gap:12px"><input class="inp" id="fn" placeholder="Nume și prenume *"><input class="inp" id="ft" placeholder="Telefon *"><select class="inp" id="fj" style="color:#9ca3af"><option value="">Județ *</option>${jOpts}</select><input class="inp" id="fl" placeholder="Localitatea *"><textarea class="inp" id="fa" rows="2" placeholder="Adresa *" style="resize:none"></textarea><div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:14px;padding:16px;font-size:14px"><div style="font-weight:700;font-size:12px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Sumar</div><div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#374151"><span>${data.productName} <span id="qs">×1</span></span><span id="ps" style="font-weight:600">${price} lei</span></div><div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#374151"><span>Livrare</span><span style="color:#16a34a;font-weight:700">GRATUITĂ</span></div><div style="border-top:1.5px solid #f3f4f6;padding-top:10px;display:flex;justify-content:space-between;font-weight:900;font-size:18px"><span>Total</span><span id="ts2" style="color:${primary}">${price} lei</span></div></div><div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;font-size:13px;color:#15803d;display:flex;gap:8px;align-items:center"><span>🔒</span><span>Plata <strong>doar la livrare</strong>.</span></div><button class="btn-main" onclick="sub()">🛒 FINALIZEAZĂ — <span id="bt">${price}</span> LEI LA LIVRARE</button><p style="font-size:12px;color:#9ca3af;text-align:center">Prin plasarea comenzii ești de acord cu T&C</p></div><div id="fs" style="display:none;text-align:center;padding:40px 0"><div style="font-size:56px;margin-bottom:12px">✅</div><h3 style="color:#16a34a;font-size:22px;font-weight:800">Comandă plasată!</h3><p style="color:#555;margin-top:8px">Te contactăm în 24 ore.</p></div></div>
<div style="background:#111;color:#6b7280;padding:20px;text-align:center;font-size:12px"><p style="margin:0 0 4px;color:#9ca3af;font-weight:600">© 2025 ${data.productName}</p><p style="margin:0">Termeni · Confidențialitate · ANPC</p></div>
<script>(function(){var P=${price},q=1,ts=${(data.timerMinutes||14)*60};function r(){var m=String(Math.floor(ts/60)).padStart(2,'0'),s=String(ts%60).padStart(2,'0');var el=document.getElementById('tc');if(el)el.innerHTML='<div style="display:flex;gap:6px"><div style="text-align:center"><span style="background:#111;color:#fff;border-radius:6px;padding:6px 12px;font-size:20px;font-weight:900;font-family:monospace">'+m+'</span><div style="font-size:9px;color:rgba(255,255,255,0.7);margin-top:2px">MIN</div></div><div style="text-align:center"><span style="background:#111;color:#fff;border-radius:6px;padding:6px 12px;font-size:20px;font-weight:900;font-family:monospace">'+s+'</span><div style="font-size:9px;color:rgba(255,255,255,0.7);margin-top:2px">SEC</div></div></div>';}setInterval(function(){if(ts>0)ts--;r();},1000);r();window.cq=function(d){q=Math.max(1,q+d);var t=P*q;['qd'].forEach(id=>{var el=document.getElementById(id);if(el)el.textContent=q;});['qs'].forEach(id=>{var el=document.getElementById(id);if(el)el.textContent='×'+q;});['pd','ps','ts2'].forEach(id=>{var el=document.getElementById(id);if(el)el.textContent=t+' lei';});var bt=document.getElementById('bt');if(bt)bt.textContent=t;};window.sub=function(){var n=document.getElementById('fn')?.value.trim(),t=document.getElementById('ft')?.value.trim(),j=document.getElementById('fj')?.value,a=document.getElementById('fa')?.value.trim();if(!n||!t||!j||!a){alert('Completează toate câmpurile *');return;}var ff=document.getElementById('ff'),fs=document.getElementById('fs');if(ff)ff.style.display='none';if(fs)fs.style.display='block';};})();</script>`
}
