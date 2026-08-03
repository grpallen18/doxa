import { notFound } from 'next/navigation'
import { NeoHubWorkspace } from '@/components/admin/neo/neo-hub-workspace'
import type { NeoHubRootKind } from '@/lib/neo4j/queries/hub'

const KINDS = new Set<NeoHubRootKind>(['controversy', 'proposition', 'entity'])

type PageProps = {
  params: Promise<{ kind: string; uid: string }>
}

export default async function AdminNeoHubPage({ params }: PageProps) {
  const { kind: rawKind, uid: rawUid } = await params
  const kind = decodeURIComponent(rawKind || '') as NeoHubRootKind
  const uid = decodeURIComponent(rawUid || '')
  if (!KINDS.has(kind) || !uid) notFound()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NeoHubWorkspace kind={kind} uid={uid} />
    </div>
  )
}
