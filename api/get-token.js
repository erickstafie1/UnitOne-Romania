module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const cookie = req.headers.cookie || ''
  const match = cookie.match(/unitone_token=([^;]+)/)
  if (match) {
    res.setHeader('Set-Cookie', 'unitone_token=; Max-Age=0; Path=/; SameSite=None; Secure')
    return res.status(200).json({ token: match[1] })
  }
  return res.status(200).json({ token: null })
}
