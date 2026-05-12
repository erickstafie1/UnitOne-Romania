import { useState } from 'react'
import ThemeToggle from './ThemeToggle.jsx'

export default function Setup({ shop, onComplete, isReconfigure }) {
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState(null)

  function confirm() {
    localStorage.setItem(`codform_${shop}`, selected)
    onComplete(selected)
  }

  const apps = [
    {
      id: 'releasit',
      name: 'Releasit COD Form',
      desc: 'Cel mai popular formular COD pentru Shopify',
      accent: 'var(--brand)',
      link: 'https://apps.shopify.com/releasit-cod-order-form'
    },
    {
      id: 'easysell',
      name: 'EasySell COD Form',
      desc: 'Simplu și rapid de configurat',
      accent: 'var(--warning)',
      link: 'https://apps.shopify.com/easy-order-form'
    },
    {
      id: 'none',
      name: 'Formular propriu',
      desc: 'Folosesc formularul COD inclus în LP',
      accent: 'var(--text-muted)'
    }
  ]

  const instructions = {
    releasit: {
      steps: [
        { n: 1, title: 'Instalează Releasit', desc: 'Dacă nu ai instalat deja, mergi la link-ul de mai jos și instalează aplicația în magazinul tău Shopify.', link: 'https://apps.shopify.com/releasit-cod-order-form', linkText: 'Instalează Releasit →' },
        { n: 2, title: 'Activează pe toate paginile', desc: 'În Releasit → Settings → General → asigură-te că aplicația este activată pentru magazinul tău.' },
        { n: 3, title: 'Gata!', desc: 'Butonul din LP-ul tău va deschide automat formularul Releasit când clientul apasă "Comandă acum". Nu trebuie să faci nimic altceva.' }
      ]
    },
    easysell: {
      steps: [
        { n: 1, title: 'Instalează EasySell', desc: 'Dacă nu ai instalat deja, mergi la link-ul de mai jos și instalează aplicația în magazinul tău Shopify.', link: 'https://apps.shopify.com/easy-order-form', linkText: 'Instalează EasySell →' },
        { n: 2, title: 'Activează pe toate paginile', desc: 'În EasySell → Settings → asigură-te că aplicația este activată și funcționează pe paginile magazinului tău.' },
        { n: 3, title: 'Gata!', desc: 'Butonul din LP-ul tău va deschide automat formularul EasySell când clientul apasă "Comandă acum".' }
      ]
    }
  }

  return (
    <div className="us-shell">
      <Styles />
      <div className="us-hero-gradient" />
      <div className="us-mesh" />

      <div className="us-theme-corner">
        <ThemeToggle size="sm" />
      </div>

      <main className="us-container">
        {step === 1 && (
          <div className="us-step fade-up">
            <div className="us-page-header">
              <div className="us-eyebrow">{isReconfigure ? 'Reconfigurare' : 'Configurare rapidă'}</div>
              <h1 className="us-h1">
                {isReconfigure ? 'Schimbă formularul COD' : (
                  <>Ce <span className="us-h1-italic">formular COD</span> folosești?</>
                )}
              </h1>
              <p className="us-lede">
                {isReconfigure
                  ? 'Alege o altă aplicație de formular COD pentru butoanele din LP-urile tale.'
                  : 'Conectează aplicația ta de formular COD ca să apară automat în paginile generate.'}
              </p>
            </div>

            <div className="us-apps">
              {apps.map(app => (
                <button key={app.id} onClick={() => setSelected(app.id)}
                  className={`us-app ${selected === app.id ? 'active' : ''}`}>
                  <div className="us-app-icon" style={{ color: app.accent, borderColor: selected === app.id ? app.accent : 'var(--border)' }}>
                    <span className="us-app-dot" style={{ background: app.accent }} />
                  </div>
                  <div className="us-app-meta">
                    <div className="us-app-name">{app.name}</div>
                    <div className="us-app-desc">{app.desc}</div>
                  </div>
                  <div className="us-app-radio">
                    {selected === app.id && <div className="us-app-radio-inner" style={{ background: app.accent }} />}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => selected === 'none' ? confirm() : setStep(2)}
              disabled={!selected}
              className="us-cta">
              {selected === 'none' ? 'Continuă cu formular propriu' : 'Continuă'}
              {selected && selected !== 'none' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              )}
            </button>
          </div>
        )}

        {step === 2 && selected && selected !== 'none' && (
          <div className="us-step fade-up">
            <button onClick={() => setStep(1)} className="us-back">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span>Înapoi</span>
            </button>

            <div className="us-page-header">
              <div className="us-eyebrow">Pas 2 din 2</div>
              <h1 className="us-h1">
                Cum conectezi <span className="us-h1-italic">{apps.find(a => a.id === selected)?.name}</span>
              </h1>
              <p className="us-lede">Urmează pașii de mai jos — durează 2 minute.</p>
            </div>

            <div className="us-steps">
              {instructions[selected].steps.map(s => (
                <div key={s.n} className="us-step-card">
                  <div className="us-step-num">{s.n}</div>
                  <div className="us-step-body">
                    <div className="us-step-title">{s.title}</div>
                    <div className="us-step-desc">{s.desc}</div>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noreferrer" className="us-step-link">
                        {s.linkText}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="us-note">
              <span className="us-note-icon">✦</span>
              <div>
                <strong>Cum funcționează: </strong>
                Butonul "Comandă acum" din LP-ul generat deschide automat formularul {apps.find(a => a.id === selected)?.name} cu produsul și prețul pre-completat.
              </div>
            </div>

            <button onClick={confirm} className="us-cta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Am configurat — continuă</span>
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function Styles() {
  return (
    <style>{`
      .us-shell {
        min-height: 100vh; position: relative;
        background: var(--bg); color: var(--text);
        font-family: var(--font-sans);
      }
      .us-theme-corner {
        position: fixed;
        top: 20px; right: 20px;
        z-index: 20;
      }
      .us-hero-gradient {
        position: absolute; top: 0; left: 0; right: 0; height: 540px;
        background: var(--hero-gradient);
        pointer-events: none; z-index: 0;
      }
      .us-mesh {
        position: absolute; inset: 0;
        background: var(--mesh); opacity: 0.55;
        pointer-events: none; z-index: 0;
      }
      .us-container {
        position: relative; z-index: 1;
        max-width: 580px; margin: 0 auto;
        padding: clamp(48px, 8vw, 96px) 32px clamp(40px, 6vw, 64px);
      }
      .us-step { display: flex; flex-direction: column; }
      .us-page-header { margin-bottom: 32px; }
      .us-eyebrow {
        font-size: 11.5px; font-weight: 700;
        color: var(--brand);
        text-transform: uppercase; letter-spacing: 0.16em;
        margin-bottom: 14px;
      }
      .us-h1 {
        font-family: var(--font-display);
        font-size: clamp(30px, 4.5vw, 40px);
        font-weight: 400; letter-spacing: -0.035em;
        line-height: 1.1;
        color: var(--text);
      }
      .us-h1-italic { font-style: italic; color: var(--text-muted); }
      .us-lede {
        margin-top: 14px;
        font-size: 15px; line-height: 1.55;
        color: var(--text-muted);
      }
      .us-back {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 12px; border-radius: 9px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 13px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        margin-bottom: 26px;
        align-self: flex-start;
        transition: all 0.15s ease;
      }
      .us-back:hover {
        background: var(--bg-3);
        color: var(--text);
        border-color: var(--border-strong);
      }

      /* App selector */
      .us-apps {
        display: flex; flex-direction: column; gap: 10px;
        margin-bottom: 28px;
      }
      .us-app {
        display: flex; align-items: center; gap: 16px;
        padding: 18px 20px; border-radius: 14px;
        background: var(--bg-elev);
        border: 1.5px solid var(--border);
        cursor: pointer; font-family: inherit; text-align: left;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .us-app:hover {
        background: var(--bg-3);
        border-color: var(--border-strong);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
      }
      .us-app.active {
        background: var(--brand-soft);
        border-color: var(--brand-border);
        box-shadow: 0 0 0 3px var(--brand-soft), var(--shadow-sm);
      }
      .us-app-icon {
        width: 44px; height: 44px; border-radius: 12px;
        background: var(--bg-2);
        border: 1.5px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        transition: border-color 0.18s ease;
      }
      .us-app-dot {
        width: 16px; height: 16px; border-radius: 50%;
        box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent);
      }
      .us-app-meta { flex: 1; min-width: 0; }
      .us-app-name {
        font-size: 15px; font-weight: 700;
        color: var(--text); letter-spacing: -0.015em;
        margin-bottom: 3px;
      }
      .us-app-desc {
        font-size: 13px; color: var(--text-muted);
        line-height: 1.45;
      }
      .us-app-radio {
        width: 20px; height: 20px; border-radius: 50%;
        border: 2px solid var(--border-strong);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        transition: border-color 0.15s ease;
      }
      .us-app.active .us-app-radio {
        border-color: var(--brand);
      }
      .us-app-radio-inner {
        width: 10px; height: 10px; border-radius: 50%;
      }

      .us-cta {
        display: flex; align-items: center; justify-content: center; gap: 9px;
        padding: 14px 22px; border-radius: 12px;
        background: var(--accent); color: var(--accent-fg);
        border: 1px solid var(--accent);
        font-size: 15px; font-weight: 600; font-family: inherit;
        cursor: pointer; letter-spacing: -0.01em;
        box-shadow: var(--shadow-sm);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .us-cta:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
        box-shadow: var(--shadow);
      }
      .us-cta:disabled {
        opacity: 0.45; cursor: not-allowed;
        box-shadow: none;
      }

      /* Step instructions */
      .us-steps {
        display: flex; flex-direction: column; gap: 12px;
        margin-bottom: 22px;
      }
      .us-step-card {
        display: flex; gap: 16px;
        padding: 20px 22px; border-radius: 14px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
      }
      .us-step-num {
        width: 32px; height: 32px; border-radius: 9px;
        background: var(--accent); color: var(--accent-fg);
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 14px;
        font-family: var(--font-display); font-style: italic;
        flex-shrink: 0;
      }
      .us-step-body { flex: 1; }
      .us-step-title {
        font-size: 15px; font-weight: 700;
        color: var(--text); letter-spacing: -0.01em;
        margin-bottom: 5px;
      }
      .us-step-desc {
        font-size: 13.5px; color: var(--text-muted);
        line-height: 1.6;
      }
      .us-step-link {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 12px;
        padding: 7px 14px; border-radius: 9px;
        background: var(--brand-soft);
        border: 1px solid var(--brand-border);
        color: var(--brand);
        font-size: 13px; font-weight: 600;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .us-step-link:hover {
        background: var(--brand); color: #fff;
      }

      .us-note {
        display: flex; gap: 12px; align-items: flex-start;
        padding: 16px 18px;
        background: var(--brand-soft);
        border: 1px solid var(--brand-border);
        border-radius: 12px;
        margin-bottom: 22px;
        color: var(--text);
        font-size: 13.5px; line-height: 1.6;
      }
      .us-note strong { color: var(--text); font-weight: 700; }
      .us-note-icon {
        width: 22px; height: 22px; border-radius: 50%;
        background: linear-gradient(135deg, var(--brand), var(--brand-2));
        color: #fff; font-size: 11px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 0 14px color-mix(in srgb, var(--brand) 35%, transparent);
      }
    `}</style>
  )
}
