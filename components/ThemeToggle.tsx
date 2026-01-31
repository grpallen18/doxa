'use client'

import { useTheme } from '@/components/ThemeProvider'

export function ThemeToggle() {
  const ctx = useTheme()
  if (!ctx) return null

  const { theme, setTheme } = ctx
  const isLight = theme === 'light'

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTheme(e.target.checked ? 'light' : 'dark')
  }

  return (
    <div className="theme-toggle-switch" role="group" aria-label="Theme">
      <label className="switch-label" htmlFor="theme-toggle">
        <span className="sr-only">Switch to {isLight ? 'dark' : 'light'} mode</span>
        <input
          id="theme-toggle"
          type="checkbox"
          className="checkbox"
          checked={isLight}
          onChange={handleChange}
          aria-label="Switch to light or dark mode"
        />
        <span className="slider" aria-hidden />
      </label>
    </div>
  )
}
