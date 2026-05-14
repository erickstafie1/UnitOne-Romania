// api/debug-env.js
// Quick visibility into what Vercel actually sees for the Shopify env vars.
// CLIENT_ID is public (used in the frontend bundle) — exposed in full so we
// can verify it matches the Partners dashboard. CLIENT_SECRET stays redacted.

module.exports = function handler(req, res) {
  const cid = process.env.SHOPIFY_CLIENT_ID || ''
  const sec = process.env.SHOPIFY_CLIENT_SECRET || ''
  const appUrl = process.env.APP_URL || ''
  const expected = 'd57ef78d7ee691f06fa08912ddeda263'

  res.setHeader('Content-Type', 'application/json')
  res.status(200).json({
    SHOPIFY_CLIENT_ID: {
      present: !!cid,
      length: cid.length,
      value: cid,  // Public — same value as VITE_SHOPIFY_CLIENT_ID in the bundle
      matches_partners: cid === expected
    },
    SHOPIFY_CLIENT_SECRET: {
      present: !!sec,
      length: sec.length,
      prefix: sec.slice(0, 6)
    },
    APP_URL: appUrl || '(not set)',
    expected_client_id_per_partners: expected
  })
}
