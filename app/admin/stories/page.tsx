'use client'

import Link from 'next/link'
import { Panel } from '@/components/Panel'

export default function AdminStoriesPage() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            Home
          </Link>
          <span className="text-muted">/</span>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">
            Admin
          </Link>
          <span className="text-muted">/</span>
          <span className="text-sm font-medium">Stories</span>
        </div>

        <Panel variant="soft" interactive={false} className="p-6">
          <h2 className="mb-2 text-lg font-semibold">Story review</h2>
          <p className="text-sm text-muted">
            Review and moderate stories. This page is under construction.
          </p>
        </Panel>
      </div>
    </main>
  )
}
