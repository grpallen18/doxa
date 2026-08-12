import { Suspense } from 'react'
import { NeoUnionV3Workspace } from '@/components/admin/neo/neo-union-v3-workspace'

export default function AdminNeoUnionV3Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <p className="p-6 text-sm text-zinc-400">Loading Union 3.0…</p>
        }
      >
        <NeoUnionV3Workspace />
      </Suspense>
    </div>
  )
}
