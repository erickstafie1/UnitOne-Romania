import { useState, useRef } from 'react'
import ThemeToggle from './ThemeToggle.jsx'

const STEPS = [
  { pct: 12, msg: 'Conectare la AliExpress', delay: 700 },
  { pct: 28, msg: 'Extragere imagini produs', delay: 900 },
  { pct: 46, msg: 'Generare copywriting în română', delay: 1100 },
  { pct: 62, msg: 'Imagini AI · Studio', delay: 1100 },
  { pct: 78, msg: 'Imagini AI · Lifestyle', delay: 1200 },
  { pct: 86, msg: 'Imagini AI · Detaliu', delay: 6500 },
  { pct: 92, msg: 'Imagini AI · Social proof', delay: 8500 },
  { pct: 97, msg: 'Finalizare pagină', delay: 14000 },
]

export default function Generator({ shop, token, onGenerated, onBack }) {
  const [aliUrl, setAliUrl] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState('')
  const cancelRef = useRef(false)

  async function generate() {
    if (!aliUrl.trim()) return
    setError(''); setLoading(true); setLoadPct(STEPS[0].pct); setLoadMsg(STEPS[0].msg)
    cancelRef.current = false

    let i = 1
    const advance = () => {
      if (cancelRef.current || i >= STEPS.length) return
      const s = STEPS[i]
      setLoadPct(s.pct); setLoadMsg(s.msg)
      i++
      setTimeout(advance, s.delay)
    }
    setTimeout(advance, STEPS[0].delay)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliUrl: aliUrl.trim(), styleDesc: styleDesc.trim() })
      })
      cancelRef.current = true
      if (!res.ok) throw new Error('Server error ' + res.status)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Eroare')
      setLoadPct(100); setLoadMsg('Pagina ta este gata')
      await new Promise(r => setTimeout(r, 700))
      onGenerated(json.data)
    } catch(e) {
      cancelRef.current = true
      setError(e.message); setLoading(false)
    }
  }

  if (loading) return (
    <div className="ug-shell">
      <Styles />
      <div className="ug-hero-gradient" />
      <div className="ug-loading">
        <div className="ug-loading-orb">
          <div className="ug-orb-glow" />
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div className="ug-eyebrow">Generare în curs</div>
        <h2 className="ug-h1-loading">Pregătim pagina ta</h2>
        <p className="ug-loading-step">{loadMsg}</p>
        <p className="ug-loading-hint">Imaginile AI durează ~1 minut · Calitate maximă</p>
        <div className="ug-progress">
          <div className="ug-progress-fill" style={{ width: `${loadPct}%` }} />
        </div>
        <div className="ug-progress-meta">
          <span>{loadPct}%</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="ug-shell">
      <Styles />
      <div className="ug-hero-gradient" />
      <div className="ug-mesh" />

      <header className="ug-topbar">
        <button onClick={onBack} className="ug-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>Înapoi</span>
        </button>
        <div className="ug-breadcrumb">
          <span className="ug-bc-dot" />
          <span>Pagină nouă</span>
        </div>
        <div className="ug-spacer" />
        <ThemeToggle />
      </header>

      <main className="ug-container">
        <div className="ug-page-header">
          <div className="ug-eyebrow">Generator AI</div>
          <h1 className="ug-h1">
            Generează landing page <span className="ug-h1-italic">COD</span>
          </h1>
        </div>

        <div className="ug-card">
          <div className="ug-field">
            <label className="ug-label" htmlFor="ali-url">Link AliExpress</label>
            <input id="ali-url" value={aliUrl} onChange={e => setAliUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aliUrl.trim() && generate()}
              placeholder="https://www.aliexpress.com/item/..."
              className="ug-input" />
          </div>

          <div className="ug-field">
            <label className="ug-label" htmlFor="style-desc">
              Descriere stil <span className="ug-label-opt">opțional</span>
            </label>
            <textarea id="style-desc" value={styleDesc} onChange={e => setStyleDesc(e.target.value)}
              rows={3}
              placeholder="Ex: Pagină pentru bărbați 25-45 ani, culori negru și roșu, ton direct, accent pe durabilitate..."
              className="ug-input" />
          </div>

          {error && (
            <div className="ug-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          <button onClick={generate} disabled={!aliUrl.trim()} className="ug-cta">
            <span>Generează pagina</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>

          <p className="ug-fine">≈ 1 minut de procesare</p>
        </div>
      </main>
    </div>
  )
}

function Styles() {
  return (
    <style>{`
      .ug-shell {
        min-height: 100vh; position: relative;
        background: var(--bg); color: var(--text);
        font-family: var(--font-sans);
      }
      .ug-hero-gradient {
        position: absolute; top: 0; left: 0; right: 0; height: 520px;
        background: var(--hero-gradient);
        pointer-events: none; z-index: 0;
      }
      .ug-mesh {
        position: absolute; inset: 0;
        background: var(--mesh); opacity: 0.6;
        pointer-events: none; z-index: 0;
      }
      .ug-topbar {
        position: sticky; top: 0; z-index: 10;
        background: color-mix(in srgb, var(--bg) 75%, transparent);
        backdrop-filter: blur(16px) saturate(120%);
        -webkit-backdrop-filter: blur(16px) saturate(120%);
        border-bottom: 1px solid var(--divider);
        padding: 14px 24px;
        display: flex; align-items: center; gap: 14px;
      }
      .ug-spacer { flex: 1; }
      .ug-back {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 12px; border-radius: 9px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 13px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        transition: all 0.15s ease;
      }
      .ug-back:hover {
        background: var(--bg-3);
        color: var(--text);
        border-color: var(--border-strong);
      }
      .ug-breadcrumb {
        display: flex; align-items: center; gap: 9px;
        font-size: 13.5px; font-weight: 600;
        color: var(--text); letter-spacing: -0.01em;
      }
      .ug-bc-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--brand);
        box-shadow: 0 0 0 4px var(--brand-soft);
      }

      .ug-container {
        position: relative; z-index: 1;
        max-width: 560px; margin: 0 auto;
        padding: clamp(48px, 8vw, 80px) 32px clamp(40px, 6vw, 64px);
        animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .ug-page-header { text-align: center; margin-bottom: 36px; }
      .ug-eyebrow {
        font-size: 11.5px; font-weight: 700;
        color: var(--brand);
        text-transform: uppercase; letter-spacing: 0.16em;
        margin-bottom: 14px;
      }
      .ug-h1 {
        font-family: var(--font-display);
        font-size: clamp(32px, 5vw, 44px);
        font-weight: 400; letter-spacing: -0.035em;
        line-height: 1.08;
        color: var(--text);
      }
      .ug-h1-italic { font-style: italic; color: var(--text-muted); }

      .ug-card {
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 28px;
        display: flex; flex-direction: column; gap: 18px;
        box-shadow: var(--shadow-sm);
      }
      .ug-field { display: flex; flex-direction: column; gap: 8px; }
      .ug-label {
        font-size: 12px; font-weight: 700;
        color: var(--text);
        text-transform: uppercase; letter-spacing: 0.08em;
      }
      .ug-label-opt {
        font-weight: 500; color: var(--text-subtle);
        text-transform: none; letter-spacing: 0;
      }
      .ug-input {
        width: 100%; padding: 12px 14px;
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text);
        font-size: 14.5px; font-family: inherit;
        outline: none; resize: vertical;
        line-height: 1.55; letter-spacing: -0.01em;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .ug-input:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-soft);
      }

      .ug-error {
        display: flex; gap: 9px; align-items: center;
        padding: 11px 14px; border-radius: 10px;
        background: var(--danger-soft);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
        color: var(--danger);
        font-size: 13px;
      }

      .ug-cta {
        display: flex; align-items: center; justify-content: center; gap: 9px;
        padding: 13px 20px; border-radius: 11px;
        background: var(--accent); color: var(--accent-fg);
        border: 1px solid var(--accent);
        font-size: 15px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        box-shadow: var(--shadow-sm);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ug-cta:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
        box-shadow: var(--shadow);
      }
      .ug-cta:disabled {
        opacity: 0.45; cursor: not-allowed;
        box-shadow: none;
      }
      .ug-fine {
        font-size: 12px; color: var(--text-subtle);
        text-align: center; font-weight: 500;
      }

      /* Loading screen */
      .ug-loading {
        position: relative; z-index: 1;
        max-width: 440px; margin: 0 auto;
        padding: clamp(80px, 14vh, 140px) 32px;
        text-align: center;
        animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .ug-loading-orb {
        width: 74px; height: 74px; border-radius: 20px;
        background: linear-gradient(135deg, var(--brand), var(--brand-2));
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 32px;
        position: relative;
        box-shadow: 0 12px 32px color-mix(in srgb, var(--brand) 40%, transparent);
      }
      .ug-orb-glow {
        position: absolute; inset: -3px; border-radius: 20px;
        background: linear-gradient(135deg, var(--brand), var(--brand-2));
        opacity: 0.5; filter: blur(14px);
        animation: orbPulse 2.5s ease-in-out infinite;
        z-index: -1;
      }
      @keyframes orbPulse {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 0.75; transform: scale(1.05); }
      }
      .ug-h1-loading {
        font-family: var(--font-display);
        font-size: 28px; font-weight: 400;
        letter-spacing: -0.03em;
        color: var(--text);
        margin-bottom: 8px;
      }
      .ug-loading-step {
        font-size: 14px; font-weight: 500;
        color: var(--text);
        margin-bottom: 6px;
        animation: fadeIn 0.3s ease;
      }
      .ug-loading-hint {
        font-size: 12.5px; color: var(--text-subtle);
        margin-bottom: 32px;
      }
      .ug-progress {
        height: 5px; border-radius: 999px;
        background: var(--bg-3);
        overflow: hidden;
        margin-bottom: 10px;
      }
      .ug-progress-fill {
        height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, var(--brand), var(--brand-2));
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 12px color-mix(in srgb, var(--brand) 40%, transparent);
      }
      .ug-progress-meta {
        font-size: 11px; font-weight: 700;
        color: var(--text-subtle);
        letter-spacing: 0.1em;
      }

    `}</style>
  )
}
