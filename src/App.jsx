import { useState, useEffect } from 'react'
import Generator from './components/Generator.jsx'
import Editor from './components/Editor.jsx'
import Dashboard from './components/Dashboard.jsx'

export default function App() {
  const [screen, setScreen] = useState('dashboard') // dashboard | generator | editor
  const [generatedData, setGeneratedData] = useState(null)
  const [editingPage, setEditingPage] = useState(null) // pagina din dashboard de editat
  const [shop, setShop] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('shop')
    const t = params.get('token')
    if (s && t) { setShop(s); setToken(t); setLoading(false) }
    else if (s) { window.location.href = `/api/auth?shop=${s}` }
    else { setError('Accesează aplicația din Shopify Admin.'); setLoading(false) }
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f' }}>
      <div style={{ width:36, height:36, border:'3px solid #e53e3e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Inter,system-ui,sans-serif', background:'#0a0a0f', color:'#fff' }}>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🛒</div>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>UnitOne Romania</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, marginBottom:20 }}>{error}</p>
        <input placeholder="magazinul-tau.myshopify.com"
          style={{ padding:'10px 16px', borderRadius:10, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'#fff', fontSize:14, outline:'none', width:280, textAlign:'center' }}
          onKeyDown={e => { if (e.key==='Enter') { let s=e.target.value.trim(); if(!s.includes('.myshopify.com')) s+='.myshopify.com'; window.location.href=`/api/auth?shop=${s}` } }}
        />
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f' }}>
      {screen === 'dashboard' && (
        <Dashboard shop={shop} token={token}
          onNew={() => setScreen('generator')}
          onEdit={(pageData) => { setEditingPage(pageData); setScreen('editor') }}
        />
      )}
      {screen === 'generator' && (
        <Generator shop={shop} token={token}
          onGenerated={(data) => { setGeneratedData(data); setEditingPage(null); setScreen('editor') }}
          onBack={() => setScreen('dashboard')}
        />
      )}
      {screen === 'editor' && (generatedData || editingPage) && (
        <Editor
          data={editingPage || generatedData}
          shop={shop}
          token={token}
          onBack={() => { setGeneratedData(null); setEditingPage(null); setScreen('dashboard') }}
          onPublished={() => { setGeneratedData(null); setEditingPage(null); setScreen('dashboard') }}
        />
      )}
    </div>
  )
}
