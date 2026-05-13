// Helpers care primesc o functie `call` (de la prepareShopifyAuth) pentru a face
// apeluri Shopify cu auto-refresh de token la fiecare cerere.

async function getPlan(call) {
  try {
    const data = await call('/recurring_application_charges.json')
    const charges = data.recurring_application_charges || []
    const active = charges.find(c => c.status === 'active')
    if (!active) return { plan: 'free', limit: 3, publishLimit: 1 }
    const price = parseFloat(active.price)
    if (price === 50)  return { plan: 'basic', limit: 9999, publishLimit: 9999 }
    if (price === 150) return { plan: 'pro',   limit: 9999, publishLimit: 9999 }
    return { plan: 'free', limit: 3, publishLimit: 1 }
  } catch {
    return { plan: 'free', limit: 3, publishLimit: 1 }
  }
}

async function countLPs(call) {
  const isLP = p => p.template_suffix === 'pagecod' || (p.tags || '').includes('unitone-cod-page')
  try {
    const [activeRes, draftRes] = await Promise.all([
      call('/products.json?limit=250&status=active&fields=id,template_suffix,tags'),
      call('/products.json?limit=250&status=draft&fields=id,template_suffix,tags')
    ])
    const totalActive = (activeRes.products || []).filter(isLP).length
    const totalDraft = (draftRes.products || []).filter(isLP).length
    return { total: totalActive + totalDraft, active: totalActive }
  } catch {
    return { total: 0, active: 0 }
  }
}

module.exports = { getPlan, countLPs }
