// api/_debug.js
// Quick check whether SHOPIFY_CLIENT_ID / _SECRET are actually present in Vercel
// env vars and what prefix they have. Open in browser:
//   https://unit-one-romania.vercel.app/api/_debug
// Returns nothing sensitive — only first/last chars + lengths.

module.exports = function handler(req, res) {
  const cid = process.env.SHOPIFY_CLIENT_ID || ''
  const sec = process.env.SHOPIFY_CLIENT_SECRET || ''
  const viteHint = process.env.VITE_SHOPIFY_CLIENT_ID || ''
  const appUrl = process.env.APP_URL || ''

  res.setHeader('Content-Type', 'application/json')
  res.status(200).json({
    SHOPIFY_CLIENT_ID: {
      present: !!cid,
      length: cid.length,
      prefix: cid.slice(0, 6),
      suffix: cid.slice(-4)
    },
    SHOPIFY_CLIENT_SECRET: {
      present: !!sec,
      length: sec.length,
      prefix: sec.slice(0, 4)
    },
    VITE_SHOPIFY_CLIENT_ID_runtime: {
      // VITE_ is only inlined at build time in the frontend bundle.
      // If this is empty on the server it's NORMAL — it doesn't mean it's missing in the build.
      presentAtRuntime: !!viteHint
    },
    APP_URL: appUrl || '(not set, defaults to https://unit-one-romania.vercel.app)',
    expected_for_token_exchange: 'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must match the app installed in Shopify Partners.',
    hint: 'Compare prefix/suffix above with the Client ID shown in partners.shopify.com -> Apps -> UnitOne Landings -> Client credentials.'
  })
}
