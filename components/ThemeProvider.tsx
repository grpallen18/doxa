'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { applyThemeColorOverrides, FORCED_LIGHT_PATHS } from '@/lib/admin/global-layout-theme'

const STORAGE_KEY = 'doxa-theme'

type Theme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) return null
  return ctx
}

function getInitialTheme(): Theme {
  // Always start as light so SSR and the first client render match.
  // The boot script still applies `.dark` for CSS; React state syncs in useEffect.
  return 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored)
    } else if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      setThemeState('dark')
    }
  }, [])

  useEffect(() => {
    if (!mounted || typeof document === 'undefined') return
    if (FORCED_LIGHT_PATHS.includes(pathname)) {
      document.documentElement.classList.remove('dark')
      applyThemeColorOverrides('light')
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      localStorage.setItem(STORAGE_KEY, theme)
      applyThemeColorOverrides(theme)
    }
  }, [mounted, theme, pathname])

  function setTheme(next: Theme) {
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}
