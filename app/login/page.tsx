'use client'

import { Suspense, useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { Panel } from '@/components/Panel'
import { PostLoginLoader } from '@/components/auth/PostLoginLoader'
import { LoginFadeWrapper } from '@/components/LoginFadeWrapper'
import { LOADER_DURATION_MS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const LOGO_REVEAL_DELAY_MS = 500

function LoginBrandLogo() {
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), LOGO_REVEAL_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex h-20 justify-center sm:h-24">
      <Image
        src="/logo-color-no-bg.png"
        alt="DOXA"
        width={2172}
        height={724}
        priority
        className={cn(
          'doxa-logo-ltr h-20 w-auto sm:h-24',
          reveal ? 'animate-doxa-logo-ltr' : 'invisible'
        )}
        style={reveal ? undefined : { opacity: 0, visibility: 'hidden' }}
      />
    </div>
  )
}

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
          <LoginBrandLogo />
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
        {/* Spacer only — never show the logo before the controlled reveal */}
        <div className="h-20 sm:h-24" aria-hidden />
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
