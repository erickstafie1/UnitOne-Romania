const { prepareShopifyAuth } = require('./_shopifyAuth')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const auth = await prepareShopifyAuth(req, res)
    const [active, draft] = await Promise.all([
      auth.call('/products.json?limit=250&status=active&fields=id,title,handle,status,images,variants'),
      auth.call('/products.json?limit=250&status=draft&fields=id,title,handle,status,images,variants')
    ])
    if (active.errors) return res.status(401).json({ success: false, error: 'Acces refuzat: ' + JSON.stringify(active.errors) })
    const products = [...(active.products || []), ...(draft.products || [])]
    console.log('get-products shop:', auth.shop, 'active:', active.products?.length, 'draft:', draft.products?.length)
    res.status(200).json({ success: true, products })
  } catch(e) {
    const code = /Missing shop|No token/i.test(e.message) ? 401 : 500
    res.status(code).json({ success: false, error: e.message })
  }
}
