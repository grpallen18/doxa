'use client'

import { useTheme } from '@/components/ThemeProvider'

export function ThemeToggle() {
  const ctx = useTheme()
  if (!ctx) return null

  const { theme, setTheme, mounted } = ctx
  const isLight = theme === 'light'

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTheme(e.target.checked ? 'light' : 'dark')
  }

  // Avoid hydration mismatch: server has no localStorage so theme is "light"; client
  // may have "dark" from the inline script. Render neutral label until after mount.
  const srOnlyText = mounted ? `Switch to ${isLight ? 'dark' : 'light'} mode` : 'Switch theme'

  return (
    <div className="theme-toggle-switch" role="group" aria-label="Theme">
      <label className="switch-label" htmlFor="theme-toggle">
        <span className="sr-only">{srOnlyText}</span>
        <input
          id="theme-toggle"
          type="checkbox"
          className="checkbox"
          checked={mounted ? isLight : false}
          onChange={handleChange}
          aria-label="Switch to light or dark mode"
        />
        <span className="slider" aria-hidden />
      </label>
    </div>
  )
}
