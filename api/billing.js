const { prepareShopifyAuth } = require('./_shopifyAuth')

const PLANS = {
  basic: { name: 'UnitOne Basic', price: 50.00, limit: 9999, publishLimit: 9999 },
  pro: { name: 'UnitOne Pro', price: 150.00, limit: 9999, publishLimit: 9999 }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
    const { action, plan, chargeId } = req.body || {}
    const auth = await prepareShopifyAuth(req, res)

    if (action === 'get_status') {
      const data = await auth.call('/recurring_application_charges.json')
      const charges = data.recurring_application_charges || []
      const active = charges.find(c => c.status === 'active')
      if (!active) return res.status(200).json({ plan: 'free', limit: 3, publishLimit: 1 })
      const price = parseFloat(active.price)
      if (price === 50)  return res.status(200).json({ plan: 'basic', limit: 9999, publishLimit: 9999, chargeId: active.id })
      if (price === 150) return res.status(200).json({ plan: 'pro',   limit: 9999, publishLimit: 9999, chargeId: active.id })
      return res.status(200).json({ plan: 'free', limit: 3, publishLimit: 1 })
    }

    if (action === 'create_charge') {
      if (!plan || !PLANS[plan]) return res.status(400).json({ error: 'Plan invalid' })
      const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
      const { name, price } = PLANS[plan]
      const result = await auth.call('/recurring_application_charges.json', 'POST', {
        recurring_application_charge: {
          name, price,
          return_url: `${appUrl}/api/billing?shop=${auth.shop}`,
          test: process.env.BILLING_TEST === 'true'
        }
      })
      const charge = result.recurring_application_charge
      if (!charge) throw new Error('Nu am putut crea abonamentul')
      return res.status(200).json({ confirmationUrl: charge.confirmation_url })
    }

    if (action === 'activate_charge') {
      if (!chargeId) return res.status(400).json({ error: 'chargeId lipsa' })
      const existing = await auth.call(`/recurring_application_charges/${chargeId}.json`)
      const charge = existing.recurring_application_charge
      if (!charge) throw new Error('Charge negasit')
      if (charge.status === 'active') {
        const price = parseFloat(charge.price)
        return res.status(200).json({ success: true, plan: price === 50 ? 'basic' : 'pro', limit: 9999, publishLimit: 9999 })
      }
      if (charge.status !== 'pending') throw new Error(`Status charge: ${charge.status}`)
      await auth.call(`/recurring_application_charges/${chargeId}/activate.json`, 'POST', {
        recurring_application_charge: { id: chargeId }
      })
      const price = parseFloat(charge.price)
      return res.status(200).json({ success: true, plan: price === 50 ? 'basic' : 'pro', limit: 9999, publishLimit: 9999 })
    }

    res.status(400).json({ error: 'Actiune necunoscuta' })
  } catch(err) {
    console.error('Billing error:', err.message)
    if (err.message === 'REAUTH_REQUIRED') {
      const shop = err.shop || ''
      return res.status(401).json({ error: 'reauth_required', shop, authUrl: '/api/auth?shop=' + shop })
    }
    const code = /Missing shop|No token/i.test(err.message) ? 401 : 500
    res.status(code).json({ error: err.message })
  }
}
