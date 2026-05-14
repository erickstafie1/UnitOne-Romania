// Modern App Bridge auth: window.shopify is provided by the App Bridge CDN script
// loaded in main.jsx before React mounts. By the time components call apiFetch,
// it should be ready. We still poll briefly to handle the load race.

async function getSessionToken() {
  for (let i = 0; i < 60; i++) {
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      try { return await window.shopify.idToken() } catch { return null }
    }
    await new Promise(r => setTimeout(r, 50))
  }
  return null
}

function getReauthCookie() {
  const m = document.cookie.match(/(?:^|;\s*)unitone_reauth_ts=([^;]+)/)
  return m ? parseInt(m[1], 10) : 0
}

function setReauthCookie() {
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
        const now = Date.now()
        if (now - getReauthCookie() < 60000) {
          console.error('[apiFetch] reauth_required loop prevented')
          return res
        }
        setReauthCookie()
        try { (window.top || window).location.href = data.authUrl }
        catch { window.location.href = data.authUrl }
        return new Promise(() => {})
      }
    } catch {}
  }
  return res
}
