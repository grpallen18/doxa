'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  shouldForceLightTheme,
  updateThemeStyleElement,
  type ThemeColorsByMode,
  type ThemeMode,
  type ThemePreferenceMode,
  type ThemePresetRecord,
  type ThemePresetSelection,
} from '@/lib/admin/global-layout-theme'

const STORAGE_KEY = 'doxa-theme'

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  selections: Record<ThemeMode, ThemePresetSelection | null>
  applyPreset: (preset: ThemePresetRecord) => Promise<void>
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) return null
  return ctx
}

export function ThemeProvider({
  children,
  signedIn = false,
  initialPreferenceMode = 'system',
  initialColors,
  initialSelections,
}: {
  children: React.ReactNode
  signedIn?: boolean
  initialPreferenceMode?: ThemePreferenceMode
  initialColors: ThemeColorsByMode
  initialSelections: Record<ThemeMode, ThemePresetSelection | null>
}) {
  const pathname = usePathname()
  const [theme, setThemeState] = useState<ThemeMode>(
    initialPreferenceMode === 'dark' ? 'dark' : 'light'
  )
  const [colors, setColors] = useState<ThemeColorsByMode>(initialColors)
  const [selections, setSelections] =
    useState<Record<ThemeMode, ThemePresetSelection | null>>(initialSelections)
  const [mounted, setMounted] = useState(false)
  const modeRequestId = useRef(0)

  useEffect(() => {
    setMounted(true)
    setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    if (!mounted || typeof document === 'undefined') return
    if (shouldForceLightTheme(pathname, signedIn)) {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
    document.documentElement.setAttribute('data-theme-mode', theme)
  }, [mounted, theme, pathname, signedIn])

  function setTheme(next: ThemeMode) {
    const previous = theme
    setThemeState(next)
    if (signedIn) {
      const requestId = ++modeRequestId.current
      void fetch('/api/theme-preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_mode: next }),
      })
        .then((response) => {
          if (!response.ok && requestId === modeRequestId.current) {
            setThemeState(previous)
          }
        })
        .catch(() => {
          if (requestId === modeRequestId.current) setThemeState(previous)
        })
    } else {
      localStorage.setItem(STORAGE_KEY, next)
    }
  }

  async function applyPreset(preset: ThemePresetRecord) {
    const previousColors = colors[preset.mode]
    const previousSelection = selections[preset.mode]
    const previousTheme = theme

    updateThemeStyleElement(preset.mode, preset.colors)
    setColors((current) => ({ ...current, [preset.mode]: preset.colors }))
    setSelections((current) => ({
      ...current,
      [preset.mode]: { id: preset.id, name: preset.name },
    }))
    setThemeState(preset.mode)

    if (!signedIn) return

    const response = await fetch('/api/theme-preference', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme_mode: preset.mode,
        preset_mode: preset.mode,
        preset_id: preset.id,
      }),
    })
    if (!response.ok) {
      updateThemeStyleElement(preset.mode, previousColors)
      setColors((current) => ({ ...current, [preset.mode]: previousColors }))
      setSelections((current) => ({
        ...current,
        [preset.mode]: previousSelection,
      }))
      setThemeState(previousTheme)
      throw new Error('Failed to save theme preference')
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, selections, applyPreset, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}
