import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '@shopify/polaris/build/esm/styles.css'
import './styles/global.css'
import { initThemeOnce } from './theme.js'

// Inject App Bridge CDN script BEFORE React renders so window.shopify is
// available as early as possible. App Bridge React 4.x relies on this global.
const params = new URLSearchParams(window.location.search)
const host = params.get('host')
const apiKey = import.meta.env.VITE_SHOPIFY_CLIENT_ID
if (host && apiKey && !document.getElementById('shopify-app-bridge')) {
  const script = document.createElement('script')
  script.id = 'shopify-app-bridge'
  script.src = 'https://cdn.shopify.com/shopifycloud/app-bridge.js'
  script.setAttribute('data-api-key', apiKey)
  document.head.appendChild(script)
}

initThemeOnce()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
