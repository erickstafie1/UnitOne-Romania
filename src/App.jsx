import { useState, useEffect } from 'react'
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react'
import Generator from './components/Generator.jsx'
import Editor from './components/Editor.jsx'

const API_KEY = '739d96177faa9260522a4477f7153dec'

export default function App() {
  const [screen, setScreen] = useState('generator') // generator | editor
  const [generatedData, setGeneratedData] = useState(null)
  const [shopifyConfig, setShopifyConfig] = useState(null)
  const [sessionToken, setSessionToken] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shop = params.get('shop')
    const host = params.get('host')
    const token = params.get('token')

    if (shop && host) {
      setShopifyConfig({ shop, host })
    } else if (token) {
      // Venit de la OAuth callback
      setSessionToken(token)
      const s = params.get('shop')
      if (s) setShopifyConfig({ shop: s, host: btoa(`admin.shopify.com/store/${s.replace('.myshopify.com', '')}`) })
    } else {
      setError('Accesează aplicația din Shopify Admin.')
    }
  }, [])

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🛒</div>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>UnitOne Romania</h2>
        <p style={{ color:'#666', fontSize:15 }}>{error}</p>
      </div>
    </div>
  )

  if (!shopifyConfig) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ width:36, height:36, border:'3px solid #e53e3e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const appBridgeConfig = {
    apiKey: API_KEY,
    host: shopifyConfig.host,
    forceRedirect: true
  }

  return (
    <AppBridgeProvider config={appBridgeConfig}>
      <div style={{ minHeight:'100vh', background:'#f6f6f7' }}>
        {screen === 'generator' && (
          <Generator
            shop={shopifyConfig.shop}
            onGenerated={(data) => {
              setGeneratedData(data)
              setScreen('editor')
            }}
          />
        )}
        {screen === 'editor' && generatedData && (
          <Editor
            data={generatedData}
            shop={shopifyConfig.shop}
            onBack={() => setScreen('generator')}
          />
        )}
      </div>
    </AppBridgeProvider>
  )
}
