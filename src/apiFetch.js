async function getSessionToken() {
  // Wait up to 2s for App Bridge to be ready (handles race when first API call
  // fires before the CDN script finishes loading)
  for (let i = 0; i < 40; i++) {
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      try { return await window.shopify.idToken() } catch { return null }
    }
    if (!window.__shopifyHost && i > 4) return null
    await new Promise(r => setTimeout(r, 50))
  }
  return null
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const st = await getSessionToken()
  if (st) headers['Authorization'] = 'Bearer ' + st
  const res = await fetch(path, { ...options, headers })
  // Auto-handle reauth_required: token-ul vechi e mort si Token Exchange nu e disponibil
  if (res.status === 401) {
    try {
      const clone = res.clone()
      const data = await clone.json()
      if (data?.error === 'reauth_required' && data.authUrl) {
        const url = data.authUrl
        try { (window.top || window).location.href = url }
        catch { window.location.href = url }
        // Block caller execution until redirect
        return new Promise(() => {})
      }
    } catch {}
  }
  return res
}
