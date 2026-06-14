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
import { WorkflowCanvasProvider } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { WorkflowCanvas, ReactFlowProvider } from '@/components/admin/workflow-canvas/workflow-canvas'
import { WorkflowCanvasToolbar } from '@/components/admin/workflow-canvas/workflow-canvas-toolbar'
import { WorkflowCanvasInspector } from '@/components/admin/workflow-canvas/workflow-canvas-inspector'
import { WorkflowCanvasConsole } from '@/components/admin/workflow-canvas/workflow-canvas-console'

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
  const dismissInspectorRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (focusNodeId) setSelectedNodeId(focusNodeId)
  }, [focusNodeId])

  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
  }, [])

  const contextValue = useMemo(
    () => ({
      storyId,
      payload,
      pipelineActions,
      onSelectNode: handleSelectNode,
      hoveredNodeId,
      setHoveredNodeId,
    }),
    [storyId, payload, pipelineActions, handleSelectNode, hoveredNodeId]
  )

  const storyTitle = payload.story.title ?? payload.story.url ?? storyId

  return (
    <WorkflowCanvasProvider value={contextValue}>
      <div className="workflow-canvas-dark flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
        <ReactFlowProvider>
          <WorkflowCanvasToolbar storyTitle={storyTitle} storyId={storyId} />

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
                onRegisterDismissInspector={(dismiss) => {
                  dismissInspectorRef.current = dismiss
                }}
              />
            </div>

            <WorkflowCanvasInspector
              selectedNodeId={selectedNodeId}
              onClose={() => dismissInspectorRef.current?.()}
              payload={payload}
              pipelineActions={pipelineActions}
            />
          </main>
        </ReactFlowProvider>

        <WorkflowCanvasConsole storyId={storyId} />

        <AlertDialog
          open={pipelineActions.revertTarget != null}
          onOpenChange={(open) => {
            if (!open) pipelineActions.cancelRevert()
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revert this step?</AlertDialogTitle>
              <AlertDialogDescription>
                {pipelineActions.revertTarget
                  ? pipelineActions.getRevertStepDescription(pipelineActions.revertTarget)
                  : 'This will undo the latest completed step.'}{' '}
                Only the latest completed step can be reverted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pipelineActions.revertingStepId != null}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                disabled={
                  pipelineActions.revertingStepId != null || pipelineActions.revertTarget == null
                }
                onClick={(e) => {
                  e.preventDefault()
                  pipelineActions.confirmRevert()
                }}
              >
                {pipelineActions.revertingStepId != null ? 'Reverting…' : 'Confirm revert'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </WorkflowCanvasProvider>
  )
}
