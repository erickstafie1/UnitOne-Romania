const https = require('https')

const PLANS = {
  basic: { name: 'UnitOne Basic', price: 50.00, limit: 200 },
  pro: { name: 'UnitOne Pro', price: 150.00, limit: 1000 }
}

function shopifyRequest(shop, token, path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: shop,
      path: '/admin/api/2024-01' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      },
      timeout: 30000
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(e) { reject(new Error(Buffer.concat(chunks).toString().substring(0, 200))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Billing callback - Shopify redirects here after merchant approves charge
  if (req.method === 'GET') {
    const { charge_id, shop } = req.query
    if (!charge_id || !shop) return res.status(400).send('Parametri lipsa')
    const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
    const host = Buffer.from('admin.shopify.com/store/' + shop.replace('.myshopify.com', '')).toString('base64')
    return res.redirect(`${appUrl}?shop=${shop}&host=${host}&charge_id=${charge_id}`)
  }

  try {
    const { action, shop, token, plan, chargeId } = req.body || {}
    if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' })

    if (action === 'get_status') {
      const data = await shopifyRequest(shop, token, '/recurring_application_charges.json', 'GET', null)
      const charges = data.recurring_application_charges || []
      const active = charges.find(c => c.status === 'active')
      if (!active) return res.status(200).json({ plan: 'free', limit: 3 })
      const price = parseFloat(active.price)
      if (price === 50)  return res.status(200).json({ plan: 'basic', limit: 200, chargeId: active.id })
      if (price === 150) return res.status(200).json({ plan: 'pro',   limit: 1000, chargeId: active.id })
      return res.status(200).json({ plan: 'free', limit: 3 })
    }

    if (action === 'create_charge') {
      if (!plan || !PLANS[plan]) return res.status(400).json({ error: 'Plan invalid' })
      const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
      const { name, price } = PLANS[plan]
      const result = await shopifyRequest(shop, token, '/recurring_application_charges.json', 'POST', {
        recurring_application_charge: {
          name, price,
          return_url: `${appUrl}/api/billing?shop=${shop}`,
          test: process.env.BILLING_TEST === 'true'
        }
      })
      const charge = result.recurring_application_charge
      if (!charge) throw new Error('Nu am putut crea abonamentul')
      return res.status(200).json({ confirmationUrl: charge.confirmation_url })
    }

    if (action === 'activate_charge') {
      if (!chargeId) return res.status(400).json({ error: 'chargeId lipsa' })
      const existing = await shopifyRequest(shop, token, `/recurring_application_charges/${chargeId}.json`, 'GET', null)
      const charge = existing.recurring_application_charge
      if (!charge) throw new Error('Charge negasit')
      if (charge.status === 'active') {
        const price = parseFloat(charge.price)
        return res.status(200).json({ success: true, plan: price === 50 ? 'basic' : 'pro', limit: price === 50 ? 200 : 1000 })
      }
      if (charge.status !== 'pending') throw new Error(`Status charge: ${charge.status}`)
      await shopifyRequest(shop, token, `/recurring_application_charges/${chargeId}/activate.json`, 'POST', {
        recurring_application_charge: { id: chargeId }
      })
      const price = parseFloat(charge.price)
      return res.status(200).json({ success: true, plan: price === 50 ? 'basic' : 'pro', limit: price === 50 ? 200 : 1000 })
    }

    res.status(400).json({ error: 'Actiune necunoscuta' })
  } catch(err) {
    console.error('Billing error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
