'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const STORAGE_KEY = 'smartdesk_theme'

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/** Applies the theme class to <html> so CSS overrides take effect. */
function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('light', t === 'light')
  root.classList.toggle('dark', t === 'dark')
  // Inform the browser (form controls, scrollbar) about the actual scheme.
  root.style.colorScheme = t
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to dark to match the existing design; rehydrate from localStorage on mount.
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored)
        applyTheme(stored)
      } else {
        applyTheme('dark')
      }
    } catch {
      applyTheme('dark')
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
