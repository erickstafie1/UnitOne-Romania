export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (window.__shopifyHost && window.shopify?.idToken) {
    try {
      const st = await window.shopify.idToken()
      if (st) headers['Authorization'] = 'Bearer ' + st
    } catch (e) {}
  }
  return fetch(path, { ...options, headers })
}
