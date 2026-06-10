import { Suspense } from 'react'
import { WorkflowCanvasPage } from '@/components/admin/workflow-canvas/workflow-canvas-page'

export default function StoryAgentFlowPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading agent flow…</p>}>
      <WorkflowCanvasPage />
    </Suspense>
  )
}
