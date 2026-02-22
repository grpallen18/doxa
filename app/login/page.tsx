'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { Panel } from '@/components/Panel'
import { PostLoginLoader } from '@/components/auth/PostLoginLoader'
import { LoginFadeWrapper } from '@/components/LoginFadeWrapper'
import { LOADER_DURATION_MS } from '@/lib/constants'

function LoginFormWrapper() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/'
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
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <LoginFadeWrapper>
        <div
          className={`mx-auto flex max-w-md flex-col gap-8 pt-12 transition-opacity duration-500 ${transitioning ? 'opacity-0' : 'opacity-100'}`}
          aria-hidden={transitioning}
        >
          <div className="text-center">
            <span className="text-6xl font-semibold uppercase tracking-[0.18em] text-[rgb(96,84,72)] font-['Times_New_Roman',serif] sm:text-7xl">
              {'DOXA'.split('').map((letter, i) => (
                <span
                  key={i}
                  className="inline-block animate-doxa-letter opacity-0"
                  style={{ animationDelay: `${i * 360}ms` }}
                >
                  {letter}
                </span>
              ))}
            </span>
          </div>
          <Panel variant="soft" interactive={false} className="animate-panel-fade-in p-6 opacity-0">
            <LoginForm onLoginSuccess={() => setTransitioning(true)} />
          </Panel>
        </div>
      </LoginFadeWrapper>
      {transitioning && (
        <PostLoginLoader
          duration={LOADER_DURATION_MS}
          fadeOut={loaderFadingOut}
          onComplete={handleLoaderComplete}
        />
      )}
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginFormWrapper />
    </Suspense>
  )
}

function LoginPageFallback() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-md flex-col gap-8 pt-12">
        <div className="text-center">
          <span className="text-6xl font-semibold uppercase tracking-[0.18em] text-[rgb(96,84,72)] font-['Times_New_Roman',serif] sm:text-7xl">DOXA</span>
        </div>
        <Panel variant="soft" interactive={false} className="flex flex-col gap-6 p-6">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </Panel>
      </div>
    </main>
  )
}
