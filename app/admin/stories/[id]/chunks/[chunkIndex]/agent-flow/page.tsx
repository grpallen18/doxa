import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { resolveChunkIndex } from '@/lib/admin/resolve-chunk-ref'
import { ChunkWorkflowCanvasPage } from '@/components/admin/workflow-canvas/chunk-workflow-canvas-page'

export default async function AdminChunkAgentFlowPage({
  params,
}: {
  params: Promise<{ id: string; chunkIndex: string }>
}) {
  const { id, chunkIndex: chunkRef } = await params
  const supabase = createAdminClient()
  const resolved = await resolveStoryIdParam(supabase, id)
  if ('response' in resolved) notFound()

  const chunkIndex = await resolveChunkIndex(supabase, resolved.storyUuid, chunkRef)
  if (chunkIndex == null) notFound()

  const { data: chunkRow } = await supabase
    .from('story_chunks')
    .select('friendly_id')
    .eq('story_id', resolved.storyUuid)
    .eq('chunk_index', chunkIndex)
    .maybeSingle()

  if (!chunkRow?.friendly_id) notFound()

  return (
    <ChunkWorkflowCanvasPage
      chunkIndex={chunkIndex}
      chunkFriendlyId={chunkRow.friendly_id as string}
    />
  )
}
