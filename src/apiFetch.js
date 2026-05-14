// Adds the App Bridge session JWT as a Bearer token to every request.
// window.shopify is provided by the App Bridge CDN script in index.html.

async function getSessionToken() {
  for (let i = 0; i < 60; i++) {
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      try { return await window.shopify.idToken() } catch { return null }
    }
    await new Promise(r => setTimeout(r, 50))
  }
  return null
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const st = await getSessionToken()
  if (st) headers['Authorization'] = 'Bearer ' + st
  return fetch(path, { ...options, headers })
}
