import { Suspense } from 'react'
import { NeoUnionV2Workspace } from '@/components/admin/neo/neo-union-v2-workspace'

export default function AdminNeoUnionV2Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <p className="p-6 text-sm text-zinc-400">Loading Union 2.0…</p>
        }
      >
        <NeoUnionV2Workspace />
      </Suspense>
    </div>
  )
}
