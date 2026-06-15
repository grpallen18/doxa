'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { derivePipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { ChunkWorkflowDrawer } from '@/components/admin/workflow-canvas/chunk-workflow-drawer'
import { WorkflowCanvasProvider } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { WorkflowCanvas, ReactFlowProvider } from '@/components/admin/workflow-canvas/workflow-canvas'
import { WorkflowCanvasToolbar } from '@/components/admin/workflow-canvas/workflow-canvas-toolbar'
import { WorkflowCanvasInspector } from '@/components/admin/workflow-canvas/workflow-canvas-inspector'
import { WorkflowCanvasConsole } from '@/components/admin/workflow-canvas/workflow-canvas-console'
import { isStepComplete } from '@/lib/admin/story-pipeline-checklist'

export function WorkflowCanvasShell({
  storyId,
  payload,
  pipelineActions,
  onApproveQa,
  approvingQa,
}: {
  storyId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
}) {
  const searchParams = useSearchParams()
  const focusNodeId = searchParams.get('node')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(focusNodeId)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [chunkDrawerOpen, setChunkDrawerOpen] = useState(false)
  const dismissInspectorRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (focusNodeId) setSelectedNodeId(focusNodeId)
  }, [focusNodeId])

  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const chunksReady =
    isStepComplete('chunk-story-bodies', payload) && payload.chunks.some((c) => c.content)

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
  }, [])

  const contextValue = useMemo(
    () => ({
      storyId,
      payload,
      pipelineActions,
      canvasScope: 'story' as const,
      onSelectNode: handleSelectNode,
      hoveredNodeId,
      setHoveredNodeId,
      onOpenChunkWorkflows: () => setChunkDrawerOpen(true),
    }),
    [storyId, payload, pipelineActions, handleSelectNode, hoveredNodeId]
  )

  const storyTitle = payload.story.title ?? payload.story.url ?? storyId

  return (
    <WorkflowCanvasProvider value={contextValue}>
      <div className="workflow-canvas-dark flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
        <ReactFlowProvider>
          <WorkflowCanvasToolbar
            storyTitle={storyTitle}
            storyId={storyId}
            chunksReady={chunksReady}
            onOpenChunkWorkflows={() => setChunkDrawerOpen(true)}
          />

          {checklist.isPipelineBlocked && checklist.blockedReason ? (
            <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs shrink-0">
              <p className="min-w-0 text-amber-100">{checklist.blockedReason}</p>
              <button
                type="button"
                className="shrink-0 font-medium text-indigo-300 underline underline-offset-4 hover:text-indigo-200 disabled:pointer-events-none disabled:opacity-50"
                disabled={approvingQa}
                onClick={() => void onApproveQa()}
              >
                {approvingQa ? 'Approving…' : 'Approve QA'}
              </button>
            </div>
          ) : null}

          <main className="relative flex min-h-0 min-w-0 flex-1">
            <div className="relative min-h-0 min-w-0 flex-1">
              <WorkflowCanvas
                checklist={checklist}
                payload={payload}
                isStepRunning={pipelineActions.isStepRunning}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                focusNodeId={focusNodeId}
                graphMode="story"
                onRegisterDismissInspector={(dismiss) => {
                  dismissInspectorRef.current = dismiss
                }}
              />
            </div>

            <WorkflowCanvasInspector
              selectedNodeId={selectedNodeId}
              onClose={() => setSelectedNodeId(null)}
              payload={payload}
              pipelineActions={pipelineActions}
            />
          </main>

          <WorkflowCanvasConsole storyId={storyId} />
        </ReactFlowProvider>
      </div>

      <ChunkWorkflowDrawer
        open={chunkDrawerOpen}
        onOpenChange={setChunkDrawerOpen}
        storyId={storyId}
        payload={payload}
      />

      <AlertDialog
        open={pipelineActions.revertTarget != null}
        onOpenChange={(open) => {
          if (!open) pipelineActions.cancelRevert()
        }}
      >
        <AlertDialogContent className="workflow-canvas-dark border-white/10 bg-zinc-900 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert pipeline step?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {pipelineActions.revertTarget
                ? pipelineActions.getRevertStepDescription(pipelineActions.revertTarget)
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-zinc-200 hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => pipelineActions.confirmRevert()}
            >
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkflowCanvasProvider>
  )
}
