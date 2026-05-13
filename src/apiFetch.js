async function getSessionToken() {
  // Wait up to 2s for App Bridge to be ready
  for (let i = 0; i < 40; i++) {
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      try { return await window.shopify.idToken() } catch { return null }
    }
    if (!window.__shopifyHost && i > 4) return null
    await new Promise(r => setTimeout(r, 50))
  }
  return null
}

function getReauthCookie() {
  const m = document.cookie.match(/(?:^|;\s*)unitone_reauth_ts=([^;]+)/)
  return m ? parseInt(m[1], 10) : 0
}

function setReauthCookie() {
  // 60s TTL — persists across iframe re-creations unlike sessionStorage
  const exp = new Date(Date.now() + 60000).toUTCString()
  document.cookie = `unitone_reauth_ts=${Date.now()}; path=/; expires=${exp}; SameSite=None; Secure`
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const st = await getSessionToken()
  if (st) headers['Authorization'] = 'Bearer ' + st
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) {
    try {
      const clone = res.clone()
      const data = await clone.json()
      if (data?.error === 'reauth_required' && data.authUrl) {
        // Use a cookie (not sessionStorage) so the flag survives iframe re-creation
        const now = Date.now()
        const last = getReauthCookie()
        if (now - last < 60000) {
          console.error('[apiFetch] reauth_required loop prevented (cookie)')
          return res
        }
        setReauthCookie()
        const url = data.authUrl
        try { (window.top || window).location.href = url }
        catch { window.location.href = url }
        return new Promise(() => {})
      }
    } catch {}
  }
  return res
}
