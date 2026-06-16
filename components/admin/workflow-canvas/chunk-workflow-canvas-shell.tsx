'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
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
import { chunkAdminHref } from '@/lib/admin/chunk-record'
import { storyAgentFlowHref } from '@/lib/admin/story-lifecycle'
import type { ChunkPipelineActions } from '@/components/admin/pipeline/use-chunk-pipeline-actions'
import { WorkflowCanvasProvider } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { WorkflowCanvas, ReactFlowProvider } from '@/components/admin/workflow-canvas/workflow-canvas'
import { WorkflowCanvasToolbar } from '@/components/admin/workflow-canvas/workflow-canvas-toolbar'
import { WorkflowCanvasInspector } from '@/components/admin/workflow-canvas/workflow-canvas-inspector'
import { WorkflowCanvasConsole } from '@/components/admin/workflow-canvas/workflow-canvas-console'
import { OrphanedClaimVersionsPanel } from '@/components/admin/stories/orphaned-claim-versions-panel'
import { canUndoHumanOverride } from '@/lib/admin/qa-override'

export function ChunkWorkflowCanvasShell({
  storyId,
  chunkIndex,
  chunkFriendlyId,
  payload,
  pipelineActions,
  onRefresh,
}: {
  storyId: string
  chunkIndex: number
  chunkFriendlyId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: ChunkPipelineActions
  onRefresh?: () => Promise<void>
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [undoingOverride, setUndoingOverride] = useState(false)
  const dismissInspectorRef = useRef<(() => void) | null>(null)

  const showUndoHumanApproval = useMemo(() => canUndoHumanOverride(payload), [payload])

  const undoHumanApproval = useCallback(async () => {
    setUndoingOverride(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/qa-override/revert`, {
        method: 'POST',
      })
      if (res.ok) await onRefresh?.()
    } finally {
      setUndoingOverride(false)
    }
  }, [storyId, onRefresh])

  const checklist = useMemo(
    () => derivePipelineChecklist(payload, { scope: 'chunk', chunkIndex }),
    [payload, chunkIndex]
  )

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
  }, [])

  const contextValue = useMemo(
    () => ({
      storyId,
      payload,
      pipelineActions,
      canvasScope: 'chunk' as const,
      chunkIndex,
      onSelectNode: handleSelectNode,
      hoveredNodeId,
      setHoveredNodeId,
    }),
    [storyId, payload, pipelineActions, chunkIndex, handleSelectNode, hoveredNodeId]
  )

  const storyTitle = payload.story.title ?? payload.story.url ?? storyId
  const lifecycleRepairPath = `/api/admin/stories/${storyId}/chunks/${encodeURIComponent(chunkFriendlyId)}/orphaned-claim-versions`
  const storyRef = {
    story_id: payload.story.story_id,
    friendly_id: payload.story.friendly_id,
  }
  const backHref = storyAgentFlowHref(storyRef, { nodeId: 'chunk-story-bodies' })
  const chunkPageHref = chunkAdminHref(storyRef, { friendly_id: chunkFriendlyId })

  return (
    <WorkflowCanvasProvider value={contextValue}>
      <div className="workflow-canvas-dark flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
        <ReactFlowProvider>
          <WorkflowCanvasToolbar
            storyTitle={storyTitle}
            storyId={storyId}
            chunkLabel={chunkFriendlyId}
            backHref={backHref}
            backLabel="Story flow"
            chunkPageHref={chunkPageHref}
          />

          {showUndoHumanApproval ? (
            <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs shrink-0">
              <p className="min-w-0 text-indigo-100">
                Human QA approval is active. Undo it to restore prior chunk review status and re-enable
                chunk revert.
              </p>
              <button
                type="button"
                className="shrink-0 font-medium text-indigo-300 underline underline-offset-4 hover:text-indigo-200 disabled:pointer-events-none disabled:opacity-50"
                disabled={undoingOverride}
                onClick={() => void undoHumanApproval()}
              >
                {undoingOverride ? 'Undoing…' : 'Undo human approval'}
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
                focusNodeId={null}
                graphMode="chunk"
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
              chunkIndex={chunkIndex}
            />
          </main>

          <OrphanedClaimVersionsPanel
            apiPath={lifecycleRepairPath}
            theme="canvas"
            onChanged={() => {
              void onRefresh?.()
            }}
          />

          <WorkflowCanvasConsole storyId={storyId} />
        </ReactFlowProvider>
      </div>

      <AlertDialog
        open={pipelineActions.revertTarget != null}
        onOpenChange={(open) => {
          if (!open) pipelineActions.cancelRevert()
        }}
      >
        <AlertDialogContent className="workflow-canvas-dark border-white/10 bg-zinc-900 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert chunk step?</AlertDialogTitle>
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
