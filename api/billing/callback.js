module.exports = function handler(req, res) {
  const { charge_id, shop } = req.query
  if (!charge_id || !shop) return res.status(400).send('Parametri lipsa')
  const appUrl = process.env.APP_URL || 'https://unit-one-romania.vercel.app'
  const host = Buffer.from('admin.shopify.com/store/' + shop.replace('.myshopify.com', '')).toString('base64')
  res.redirect(`${appUrl}?shop=${shop}&host=${host}&charge_id=${charge_id}`)
}
