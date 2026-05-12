import { useState } from 'react'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    limit: 3,
    features: ['3 landing pages', 'Editor complet GrapesJS', 'Templates de baza', 'Publicare directa Shopify'],
    cta: null,
    color: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.1)'
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 50,
    limit: 200,
    features: ['200 landing pages', 'Editor complet GrapesJS', 'Toate templateurile', 'AI generator', 'Autosave', 'Suport email'],
    cta: 'Activeaza Basic',
    color: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.35)',
    highlight: true
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 150,
    limit: 1000,
    features: ['1000 landing pages', 'Editor complet GrapesJS', 'Toate templateurile', 'AI generator', 'Autosave', 'Suport prioritar', 'Acces beta features'],
    cta: 'Activeaza Pro',
    color: 'rgba(168,85,247,0.08)',
    border: 'rgba(168,85,247,0.35)'
  }
]

export default function Pricing({ currentPlan, shop, token, onBack }) {
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')

  async function selectPlan(planId) {
    if (planId === 'free' || planId === currentPlan) return
    setLoading(planId)
    setError('')
    try {
      const r = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_charge', shop, token, plan: planId })
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl
      }
    } catch(e) {
      setError(e.message)
      setLoading(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#08090d',
      color: '#fff',
      fontFamily: "'Inter','SF Pro Display',-apple-system,system-ui,sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px'
    }}>
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at top, rgba(59,130,246,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 960 }}>
        <button onClick={onBack} style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          padding: '7px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          marginBottom: 40, display: 'flex', alignItems: 'center', gap: 6
        }}>
          ← Inapoi
        </button>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: '#60a5fa', textTransform: 'uppercase', marginBottom: 12 }}>Planuri</div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,40px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 14px' }}>
            Alege planul potrivit
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0 }}>
            Billing gestionat 100% de Shopify. Anulezi oricand.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 18px', fontSize: 13, color: '#f87171', marginBottom: 24, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
          {PLANS.map(plan => {
            const isCurrent = plan.id === currentPlan
            const isLoading = loading === plan.id
            return (
              <div key={plan.id} style={{
                background: isCurrent ? (plan.color || 'rgba(255,255,255,0.06)') : plan.color,
                border: `1px solid ${isCurrent ? plan.border : plan.highlight ? plan.border : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 16,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                position: 'relative',
                transition: 'border-color 0.2s'
              }}>
                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: plan.id === 'pro' ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : plan.id === 'basic' ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'rgba(255,255,255,0.15)',
                    borderRadius: 999, padding: '3px 14px',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    whiteSpace: 'nowrap', color: '#fff'
                  }}>PLANUL TAU</div>
                )}

                {plan.highlight && !isCurrent && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                    borderRadius: 999, padding: '3px 14px',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    whiteSpace: 'nowrap', color: '#fff'
                  }}>POPULAR</div>
                )}

                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{plan.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em' }}>
                      {plan.price === 0 ? 'Gratuit' : `$${plan.price}`}
                    </span>
                    {plan.price > 0 && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>/luna</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                    {plan.limit === 3 ? '3 landing pages' : `Pana la ${plan.limit} landing pages`}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                      <span style={{ color: plan.id === 'pro' ? '#c084fc' : plan.id === 'basic' ? '#60a5fa' : '#4ade80', flexShrink: 0, fontSize: 15 }}>✓</span>
                      <span style={{ color: 'rgba(255,255,255,0.75)' }}>{f}</span>
                    </div>
                  ))}
                </div>

                {plan.cta && (
                  <button
                    onClick={() => selectPlan(plan.id)}
                    disabled={isCurrent || isLoading}
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      border: 'none',
                      background: isCurrent ? 'rgba(255,255,255,0.06)' : plan.id === 'pro'
                        ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
                        : 'linear-gradient(135deg,#3b82f6,#2563eb)',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: isCurrent ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      letterSpacing: '-0.01em',
                      opacity: isLoading ? 0.7 : 1,
                      transition: 'opacity 0.15s'
                    }}
                  >
                    {isLoading ? 'Se incarca...' : isCurrent ? 'Plan activ' : plan.cta}
                  </button>
                )}

                {!plan.cta && (
                  <div style={{ padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                    {isCurrent ? 'Plan activ' : 'Gratuit intotdeauna'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 32 }}>
          Plata si facturarea sunt gestionate exclusiv de Shopify. Poti anula oricand din Shopify Admin.
        </p>
      </div>
    </div>
  )
}
