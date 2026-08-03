import { Suspense } from 'react'
import { NeoUnionWorkspace } from '@/components/admin/neo/neo-union-workspace'

export default function AdminNeoUnionPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <p className="p-6 text-sm text-zinc-400">Loading story union…</p>
        }
      >
        <NeoUnionWorkspace />
      </Suspense>
    </div>
  )
}
