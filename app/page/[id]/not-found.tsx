import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'

export default function TopicNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Panel variant="soft" className="max-w-md space-y-6 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Topic not found
        </h1>
        <p className="text-sm text-muted">
          The topic you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button href="/topics" variant="primary">
            Browse topics
          </Button>
          <Button href="/" variant="primary">
            Go home
          </Button>
        </div>
      </Panel>
    </main>
  )
}
