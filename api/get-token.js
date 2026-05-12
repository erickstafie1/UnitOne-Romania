module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const cookie = req.headers.cookie || ''
  const shop = req.query.shop || ''

  // Cookie de sesiune persistent (keyed by shop)
  if (shop) {
    const key = 'unitone_sess_' + shop.replace(/[^a-zA-Z0-9]/g, '_')
    const m = cookie.match(new RegExp('(?:^|;\\s*)' + key + '=([^;]+)'))
    if (m) return res.status(200).json({ token: decodeURIComponent(m[1]) })
  }

  // Cookie one-time legacy (OAuth proaspat, fara shop param)
  const legacy = cookie.match(/unitone_token=([^;]+)/)
  if (legacy) {
    res.setHeader('Set-Cookie', 'unitone_token=; Max-Age=0; Path=/; SameSite=None; Secure')
    return res.status(200).json({ token: legacy[1] })
  }

  return res.status(200).json({ token: null })
}
