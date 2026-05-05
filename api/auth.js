const crypto = require('crypto')

module.exports = async function handler(req, res) {
  const { shop } = req.query
  if (!shop) return res.status(400).send('Missing shop')

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const appUrl = process.env.APP_URL || 'https://unitone-romania.vercel.app'
  const redirectUri = `${appUrl}/api/auth/callback`
  const scopes = 'write_online_store_pages,read_online_store_pages,read_products,write_content'
  const state = crypto.randomBytes(16).toString('hex')

  res.setHeader('Set-Cookie', `shopify_state=${state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`)
  res.redirect(`https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`)
}
