'use client'

import { useEffect } from 'react'

const STORAGE_PREFIX = 'doxa:scroll:'
const RESTORE_TIMEOUT_MS = 4000

function pageKey(): string {
  return `${STORAGE_PREFIX}${window.location.pathname}${window.location.search}`
}

function readSavedY(): number | null {
  try {
    const raw = sessionStorage.getItem(pageKey())
    if (raw == null) return null
    const y = Number.parseInt(raw, 10)
    return Number.isFinite(y) && y > 0 ? y : null
  } catch {
    return null
  }
}

function saveScrollY(): void {
  try {
    sessionStorage.setItem(pageKey(), String(Math.round(window.scrollY)))
  } catch {
    // ignore quota / private mode
  }
}

function isHardReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    if (nav?.type === 'reload') return true
    // Legacy Fallback
    const legacy = (performance as Performance & {
      navigation?: { type?: number }
    }).navigation
    return legacy?.type === 1
  } catch {
    return false
  }
}

function restoreScroll(targetY: number): () => void {
  let done = false
  let raf = 0
  let timeoutId = 0

  const apply = () => {
    if (done) return true
    window.scrollTo(0, targetY)
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    )
    if (maxScroll >= targetY - 1 && Math.abs(window.scrollY - targetY) < 4) {
      done = true
      return true
    }
    // Document still growing; keep trying until tall enough or timeout.
    return false
  }

  apply()

  const ro = new ResizeObserver(() => {
    if (apply()) cleanup()
  })
  ro.observe(document.documentElement)

  const onLoad = () => {
    if (apply()) cleanup()
  }
  window.addEventListener('load', onLoad)

  const tick = () => {
    if (apply()) {
      cleanup()
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  timeoutId = window.setTimeout(() => {
    apply()
    cleanup()
  }, RESTORE_TIMEOUT_MS)

  function cleanup() {
    done = true
    ro.disconnect()
    window.removeEventListener('load', onLoad)
    if (raf) cancelAnimationFrame(raf)
    if (timeoutId) window.clearTimeout(timeoutId)
  }

  return cleanup
}

/**
 * Persists window scroll across hard refresh for every route.
 * Client navigations still use Next.js default (scroll to top).
 */
export function ScrollRestoration() {
  useEffect(() => {
    try {
      history.scrollRestoration = 'manual'
    } catch {
      // ignore
    }

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        saveScrollY()
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', saveScrollY)
    window.addEventListener('beforeunload', saveScrollY)

    let cancelRestore: (() => void) | undefined
    if (isHardReload()) {
      const y = readSavedY()
      if (y != null) {
        cancelRestore = restoreScroll(y)
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', saveScrollY)
      window.removeEventListener('beforeunload', saveScrollY)
      cancelRestore?.()
    }
  }, [])

  return null
}

/** Inline head script: restore scroll before paint on hard reload to avoid a top flash. */
export const SCROLL_RESTORATION_BOOT_SCRIPT = `
(function () {
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var isReload = (nav && nav.type === 'reload') || (performance.navigation && performance.navigation.type === 1);
    if (!isReload) return;
    var key = 'doxa:scroll:' + location.pathname + location.search;
    var raw = sessionStorage.getItem(key);
    if (raw == null) return;
    var y = parseInt(raw, 10);
    if (!isFinite(y) || y <= 0) return;
    if (history.scrollRestoration) history.scrollRestoration = 'manual';
    var apply = function () { window.scrollTo(0, y); };
    apply();
    document.addEventListener('DOMContentLoaded', apply);
    window.addEventListener('load', apply);
  } catch (e) {}
})();
`
