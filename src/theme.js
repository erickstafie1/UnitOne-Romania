import { useState, useEffect } from 'react'

const STORAGE_KEY = 'unitone_theme'
const EVENT = 'unitone-theme-change'

function systemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return systemTheme()
}

export function initThemeOnce() {
  if (typeof window === 'undefined') return
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored)
  }
}

export function useTheme() {
  const [theme, setLocalTheme] = useState(readTheme)

  useEffect(() => {
    const onChange = (e) => setLocalTheme(e.detail)
    const onSystem = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== 'light' && stored !== 'dark') setLocalTheme(systemTheme())
    }
    window.addEventListener(EVENT, onChange)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener?.('change', onSystem)
    return () => {
      window.removeEventListener(EVENT, onChange)
      mq.removeEventListener?.('change', onSystem)
    }
  }, [])

  function setTheme(next) {
    if (next !== 'light' && next !== 'dark') return
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.setAttribute('data-theme', next)
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme }
}
