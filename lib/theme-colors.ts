/** Read a CSS custom property from :root (canvas / runtime use). */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Theme-aware color: CSS variable in light mode, fixed fallback in dark mode. */
export function themeColor(cssVarName: string, dark: string, lightFallback = ''): string {
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  if (isDark) return dark
  return cssVar(cssVarName) || lightFallback
}
