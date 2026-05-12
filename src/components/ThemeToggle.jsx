import { useTheme } from '../theme.js'

export default function ThemeToggle({ size = 'md' }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <>
      <button onClick={toggleTheme}
        className={`u-theme-toggle u-tt-${size}`}
        title={isDark ? 'Comută la temă deschisă' : 'Comută la temă întunecată'}
        aria-label="Toggle theme">
        <span className={`u-tt-knob ${isDark ? 'right' : 'left'}`}>
          {isDark ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          )}
        </span>
      </button>
      <style>{`
        .u-theme-toggle {
          position: relative;
          padding: 0; border-radius: 999px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .u-theme-toggle:hover {
          border-color: var(--border-strong);
          background: var(--bg-3);
        }
        .u-tt-md { width: 54px; height: 28px; }
        .u-tt-sm { width: 46px; height: 24px; }
        .u-tt-knob {
          position: absolute;
          top: 50%;
          border-radius: 50%;
          background: var(--accent);
          color: var(--accent-fg);
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow-sm);
          transform: translateY(-50%);
          transition: left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .u-tt-md .u-tt-knob { width: 22px; height: 22px; }
        .u-tt-md .u-tt-knob.left { left: 2px; }
        .u-tt-md .u-tt-knob.right { left: 28px; }
        .u-tt-sm .u-tt-knob { width: 18px; height: 18px; }
        .u-tt-sm .u-tt-knob.left { left: 2px; }
        .u-tt-sm .u-tt-knob.right { left: 24px; }
      `}</style>
    </>
  )
}
