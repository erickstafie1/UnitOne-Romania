import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '@shopify/polaris/build/esm/styles.css'
import './styles/global.css'
import { initThemeOnce } from './theme.js'

// App Bridge CDN script is loaded directly in index.html (synchronously, before
// this module runs) so the <ui-nav-menu> web component is defined by the time
// React mounts. That's what lets NavMenu render in Shopify Admin's left rail.
initThemeOnce()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
