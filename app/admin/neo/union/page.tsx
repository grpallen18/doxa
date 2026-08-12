'use client'

import { Suspense } from 'react'
import { NeoUnionWorkspace } from '@/components/admin/neo/neo-union-workspace'

export default function AdminNeoUnionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#050508]">
          <p className="p-6 text-sm text-zinc-400">Loading Neo…</p>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <NeoUnionWorkspace />
      </div>
    </Suspense>
  )
}
