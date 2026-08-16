'use client'

import { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LANDING_PATH } from '@/lib/constants'

const FADE_DURATION_MS = 500
const LOGOUT_STORAGE_KEY = 'fromLogoutTransition'

type LogoutTransitionContextValue = {
  startLogout: () => void
}

const LogoutTransitionContext = createContext<LogoutTransitionContextValue | null>(null)

export function useLogoutTransition() {
  return useContext(LogoutTransitionContext)
}

export function LogoutTransitionWrapper({
  children,
  signedIn = false,
}: {
  children: React.ReactNode
  signedIn?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const startLogout = useCallback(() => {
    setIsLoggingOut(true)
  }, [])

  useEffect(() => {
    if (!isLoggingOut) return
    const t = setTimeout(() => {
      createClient().auth.signOut().then(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(LOGOUT_STORAGE_KEY, '1')
        }
        router.push(LANDING_PATH)
        router.refresh()
      })
    }, FADE_DURATION_MS)
    return () => clearTimeout(t)
  }, [isLoggingOut, router])

  // Landing is a real route change from /home, so path alone ends the fade.
  useEffect(() => {
    if (pathname === LANDING_PATH || pathname === '/login') {
      setIsLoggingOut(false)
    }
  }, [pathname])

  // Session refresh also clears the overlay if the path check races.
  useEffect(() => {
    if (!signedIn) {
      setIsLoggingOut(false)
    }
  }, [signedIn])

  return (
    <LogoutTransitionContext.Provider value={{ startLogout }}>
      <div
        className="transition-opacity ease-out"
        style={{
          opacity: isLoggingOut ? 0 : 1,
          transitionDuration: `${FADE_DURATION_MS}ms`,
        }}
      >
        {children}
      </div>
    </LogoutTransitionContext.Provider>
  )
}
