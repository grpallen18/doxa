import { notFound, redirect } from 'next/navigation'
import { unionV2NodeHref } from '@/lib/admin/neo-graph/union-v2-focus'

type HubKind = 'controversy' | 'proposition' | 'entity'

const KINDS: HubKind[] = ['controversy', 'proposition', 'entity']

function isHubKind(value: string): value is HubKind {
  return KINDS.includes(value as HubKind)
}

type PageProps = {
  params: Promise<{ kind: string; uid: string }>
}

/** Hub explorers retired — focus the root node in Neo. */
export default async function AdminNeoHubRedirectPage({ params }: PageProps) {
  const { kind: rawKind, uid: rawUid } = await params
  const kind = decodeURIComponent(rawKind || '')
  const uid = decodeURIComponent(rawUid || '')
  if (!isHubKind(kind) || !uid) notFound()
  redirect(unionV2NodeHref(kind, uid))
}
