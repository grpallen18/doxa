import { redirect } from 'next/navigation'
import { unionV2DocumentHref } from '@/lib/admin/neo-graph/union-v2-focus'

type PageProps = { params: Promise<{ storyId: string }> }

/** Per-story Neo explorer retired — focus the document in Neo. */
export default async function AdminNeoDocumentRedirectPage({ params }: PageProps) {
  const { storyId } = await params
  redirect(unionV2DocumentHref(storyId))
}
