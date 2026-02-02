'use client'

import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { PostLoginLoader } from '@/components/auth/PostLoginLoader'

type NavigationOverlayContextValue = {
  show: boolean
  targetPath: string | null
  showOverlayFor: (path: string) => void
  clearOverlay: () => void
}

const NavigationOverlayContext = createContext<NavigationOverlayContextValue | null>(null)

export function useNavigationOverlay() {
  const ctx = useContext(NavigationOverlayContext)
  if (!ctx) return null
  return ctx
}

export function NavigationOverlayProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false)
  const [targetPath, setTargetPath] = useState<string | null>(null)

  const showOverlayFor = useCallback((path: string) => {
    setTargetPath(path)
    setShow(true)
  }, [])

  const clearOverlay = useCallback(() => {
    setShow(false)
    setTargetPath(null)
  }, [])

  return (
    <NavigationOverlayContext.Provider value={{ show, targetPath, showOverlayFor, clearOverlay }}>
      {children}
    </NavigationOverlayContext.Provider>
  )
}

export function PageNavigationOverlay() {
  const ctx = useNavigationOverlay()
  const pathname = usePathname()

  useEffect(() => {
    if (!ctx?.targetPath || !ctx.show) return
    if (pathname === ctx.targetPath) {
      ctx.clearOverlay()
    }
  }, [pathname, ctx?.targetPath, ctx?.show, ctx])

  if (!ctx?.show) return null
  return <PostLoginLoader />
}
