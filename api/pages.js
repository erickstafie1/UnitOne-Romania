// api/pages.js
const { prepareShopifyAuth } = require('./_shopifyAuth')
const { getPlan, countLPs } = require('./_plan')
const { installTemplates } = require('./_templates')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { action, pageId, published } = req.body || {}
    const auth = await prepareShopifyAuth(req, res)

    if (action === 'list') {
      const [active, draft] = await Promise.all([
        auth.call('/products.json?limit=250&status=active&fields=id,title,handle,status,created_at,updated_at,template_suffix,tags'),
        auth.call('/products.json?limit=250&status=draft&fields=id,title,handle,status,created_at,updated_at,template_suffix,tags')
      ])
      const all = [...(active.products || []), ...(draft.products || [])]
      const pages = all
        .filter(p => p.template_suffix === 'pagecod' || p.template_suffix === 'pagecodfull' || (p.tags || '').includes('unitone-cod-page'))
        .map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          published: p.status === 'active',
          created_at: p.created_at,
          updated_at: p.updated_at,
          template_suffix: p.template_suffix,
          isProduct: true
        }))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      return res.status(200).json({ success: true, pages })
    }

    if (action === 'shop_info') {
      const data = await auth.call('/shop.json')
      const s = data.shop || {}
      return res.status(200).json({ success: true, shopOwner: s.shop_owner, name: s.name, email: s.email })
    }

    if (action === 'delete') {
      await auth.call('/products/' + pageId + '.json', 'DELETE')
      return res.status(200).json({ success: true })
    }

    if (action === 'unmark') {
      const current = await auth.call('/products/' + pageId + '.json')
      const currentTags = (current.product?.tags || '').split(',').map(t => t.trim()).filter(t => t && t !== 'unitone-cod-page').join(', ')
      await auth.call('/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, template_suffix: null, tags: currentTags }
      })
      return res.status(200).json({ success: true })
    }

    if (action === 'toggle') {
      if (published) {
        const plan = await getPlan(auth.call)
        if (plan.publishLimit < 9999) {
          const counts = await countLPs(auth.call)
          if (counts.active >= plan.publishLimit) {
            return res.status(402).json({ error: 'publish_limit_reached', plan: plan.plan, publishLimit: plan.publishLimit })
          }
        }
      }
      const data = await auth.call('/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, status: published ? 'active' : 'draft' }
      })
      return res.status(200).json({ success: true, page: data.product })
    }

    if (action === 'get') {
      const data = await auth.call('/products/' + pageId + '.json')
      const p = data.product
      return res.status(200).json({
        success: true,
        page: {
          id: p.id, title: p.title, handle: p.handle,
          body_html: p.body_html, published: p.status === 'active',
          template_suffix: p.template_suffix,
          isProduct: true
        }
      })
    }

    if (action === 'reinstall') {
      await installTemplates(auth.call)
      return res.status(200).json({ success: true })
    }

    res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('Pages error:', err.message)
    if (err.message === 'REAUTH_REQUIRED') {
      const shop = err.shop || ''
      return res.status(401).json({ success: false, error: 'reauth_required', shop, authUrl: '/api/auth?shop=' + shop })
    }
    const code = /Missing shop|No token/i.test(err.message) ? 401 : 500
    res.status(code).json({ success: false, error: err.message })
  }
}
