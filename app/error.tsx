'use client'

import { useEffect } from 'react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log for debugging (e.g. chunk load failures)
    console.error('Application error:', error)
  }, [error])

  const isChunkError =
    error?.message?.includes('Loading chunk') ||
    error?.message?.includes('ChunkLoadError') ||
    error?.message?.includes('cannot find module')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Panel variant="soft" className="max-w-md space-y-6 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted">
          {isChunkError
            ? 'A page failed to load. Try opening the link in a new tab or refreshing.'
            : 'An unexpected error occurred. You can try again or go back home.'}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="primary">
            Try again
          </Button>
          <Button href="/" variant="primary">
            Go home
          </Button>
        </div>
        <p className="text-xs text-muted-soft">
          Using &quot;Go home&quot; does a full page load and often fixes load errors.
        </p>
      </Panel>
    </main>
  )
}
