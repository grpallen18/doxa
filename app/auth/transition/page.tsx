'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PostLoginLoader } from '@/components/auth/PostLoginLoader'
import { LOADER_DURATION_MS } from '@/lib/constants'

function AuthTransitionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const [loaderFadingOut, setLoaderFadingOut] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoaderFadingOut(true), LOADER_DURATION_MS)
    return () => clearTimeout(t)
  }, [])

  function handleLoaderComplete() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('fromAuthTransition', '1')
    }
    router.push(redirect)
    router.refresh()
  }

  return (
    <PostLoginLoader
      duration={LOADER_DURATION_MS}
      fadeOut={loaderFadingOut}
      onComplete={handleLoaderComplete}
    />
  )
}

export default function AuthTransitionPage() {
  return (
    <Suspense fallback={<PostLoginLoader duration={LOADER_DURATION_MS} />}>
      <AuthTransitionContent />
    </Suspense>
  )
}
