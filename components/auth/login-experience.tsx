'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { AuthScene } from '@/components/auth/auth-scene'
import { PostLoginLoader } from '@/components/auth/PostLoginLoader'
import { LoginFadeWrapper } from '@/components/LoginFadeWrapper'
import { LOADER_DURATION_MS } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * The whole log-in view. `redirectTo` is resolved on the server so this never
 * needs a Suspense boundary — the card mounts once and fades in once.
 */
export function LoginExperience({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [transitioning, setTransitioning] = useState(false)
  const [loaderFadingOut, setLoaderFadingOut] = useState(false)

  useEffect(() => {
    if (!transitioning) return
    const t = setTimeout(() => setLoaderFadingOut(true), LOADER_DURATION_MS)
    return () => clearTimeout(t)
  }, [transitioning])

  function handleLoaderComplete() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('fromAuthTransition', '1')
    }
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
      <LoginFadeWrapper>
        <div
          className={cn(
            'w-full transition-opacity duration-500',
            transitioning ? 'opacity-0' : 'opacity-100'
          )}
          aria-hidden={transitioning}
        >
          <AuthScene>
            <LoginForm
              redirectTo={redirectTo}
              onLoginSuccess={() => setTransitioning(true)}
            />
          </AuthScene>
        </div>
      </LoginFadeWrapper>
      {transitioning && (
        <PostLoginLoader
          duration={LOADER_DURATION_MS}
          fadeOut={loaderFadingOut}
          onComplete={handleLoaderComplete}
        />
      )}
    </>
  )
}
