'use client'

import { useState, useEffect } from 'react'

const FADE_DURATION_MS = 500
const STORAGE_KEY = 'fromLogoutTransition'

export function LoginFadeWrapper({ children }: { children: React.ReactNode }) {
  const [shouldFadeIn, setShouldFadeIn] = useState(false)
  const [opacityVisible, setOpacityVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const fromLogout = sessionStorage.getItem(STORAGE_KEY)
    if (fromLogout) {
      sessionStorage.removeItem(STORAGE_KEY)
      setShouldFadeIn(true)
    }
  }, [])

  useEffect(() => {
    if (!shouldFadeIn) return
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpacityVisible(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [shouldFadeIn])

  if (!shouldFadeIn) {
    return <>{children}</>
  }

  return (
    <div
      className="transition-opacity duration-500 ease-out"
      style={{
        opacity: opacityVisible ? 1 : 0,
        transitionDuration: `${FADE_DURATION_MS}ms`,
      }}
    >
      {children}
    </div>
  )
}
