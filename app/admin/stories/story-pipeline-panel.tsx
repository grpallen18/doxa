'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Circle, Loader2, Minus, XCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  derivePipelineChecklist,
  getStepOutputSnapshot,
  isStepBlocked,
  isStepComplete,
  type PipelineStepId,
  type PipelineStepStatus,
} from '@/lib/admin/story-pipeline-checklist'
import { PipelineStepDetail, type PipelineStepDetailProps, type SpanHighlightProps, pipelineStepHasDetailContent } from './pipeline-step-details'
import { STEP_DETAIL_REVEAL_DURATION_MS } from './step-detail-reveal'

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 36

function StatusIcon({ status }: { status: PipelineStepStatus }) {
  switch (status) {
    case 'complete':
      return <Check className="size-4 shrink-0 text-green-600" aria-hidden />
    case 'blocked':
      return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
    case 'optional':
      return <Minus className="size-4 shrink-0 text-muted" aria-hidden />
    case 'current':
      return <Circle className="size-4 shrink-0 fill-current text-foreground" aria-hidden />
    default:
      return <Circle className="size-4 shrink-0 text-muted" aria-hidden />
  }
}

export function StoryPipelinePanel({
  payload,
  storyId,
  onRefresh,
  onApproveQa,
  approvingQa,
  headerActions,
  renderFeedback,
  spanHighlight,
}: {
  payload: StoryExtractionReviewPayload
  storyId: string
  onRefresh: () => Promise<void>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
  headerActions?: ReactNode
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
  spanHighlight?: SpanHighlightProps
}) {
  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const [runningStepId, setRunningStepId] = useState<PipelineStepId | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [revealTarget, setRevealTarget] = useState<{ stepId: PipelineStepId; epoch: number } | null>(
    null
  )
  const pollCountRef = useRef(0)
  const runBaselineRef = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    setRunningStepId(null)
    pollCountRef.current = 0
  }, [])

  useEffect(() => {
    if (!runningStepId) return

    pollCountRef.current = 0
    const intervalId = setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current > MAX_POLLS) {
        setActionMessage('Step may still be running. Refresh the page or run the step again.')
        runBaselineRef.current = null
        stopPolling()
        return
      }
      void onRefresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [runningStepId, onRefresh, stopPolling])

  useEffect(() => {
    if (!runningStepId) return

    const snapshot = JSON.stringify(getStepOutputSnapshot(runningStepId, payload))
    const snapshotChanged = runBaselineRef.current != null && snapshot !== runBaselineRef.current
    const hasContent = pipelineStepHasDetailContent(runningStepId, payload)
    const done = isStepComplete(runningStepId, payload) || isStepBlocked(runningStepId, payload)

    if (done && hasContent && snapshotChanged) {
      setRevealTarget({ stepId: runningStepId, epoch: Date.now() })
      runBaselineRef.current = null
      setActionMessage(null)
      setExpanded((prev) => (prev.includes(runningStepId) ? prev : [...prev, runningStepId]))
      stopPolling()
    }
  }, [payload, runningStepId, stopPolling])

  useEffect(() => {
    if (!revealTarget) return
    const timeoutId = setTimeout(() => setRevealTarget(null), STEP_DETAIL_REVEAL_DURATION_MS + 150)
    return () => clearTimeout(timeoutId)
  }, [revealTarget])

  const runStep = async (stepId: PipelineStepId) => {
    setStepError(null)
    setActionMessage(null)
    setRevealTarget(null)
    runBaselineRef.current = JSON.stringify(getStepOutputSnapshot(stepId, payload))
    setRunningStepId(stepId)
    setExpanded((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]))
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/run-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStepError(json.error?.message ?? 'Step failed to start')
        setRunningStepId(null)
        runBaselineRef.current = null
        return
      }
      void onRefresh()
    } catch {
      setStepError('Failed to invoke pipeline step')
      setRunningStepId(null)
      runBaselineRef.current = null
    }
  }

  const clearExtraction = async () => {
    setClearing(true)
    setStepError(null)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/clear-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStepError(json.error?.message ?? 'Clear failed')
        return
      }
      setShowClearConfirm(false)
      setActionMessage('Extraction data cleared.')
      setExpanded([])
      setRevealTarget(null)
      await onRefresh()
    } catch {
      setStepError('Clear failed')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Pipeline</h3>
          <p className="mt-1 text-xs text-muted">
            Run one step at a time. Expand a step to review its output.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={clearing || runningStepId != null}
              >
                Clear extraction
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear extraction data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all extracted entities, QA artifacts, and feedback for
                  this story. Chunks are kept. Story-only canonical rows are deleted;
                  shared canonical data on other stories is preserved. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'destructive' })}
                  disabled={clearing}
                  onClick={(e) => {
                    e.preventDefault()
                    void clearExtraction()
                  }}
                >
                  {clearing ? 'Clearing…' : 'Confirm clear'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {checklist.isPipelineBlocked && checklist.blockedReason && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p>{checklist.blockedReason}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={approvingQa}
            onClick={() => void onApproveQa()}
          >
            {approvingQa ? 'Approving…' : 'Approve QA'}
          </Button>
        </div>
      )}

      {stepError && <p className="text-xs text-destructive">{stepError}</p>}
      {actionMessage && <p className="text-xs text-muted">{actionMessage}</p>}

      <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="space-y-4">
        {checklist.stages.map((stage) => {
          const stageSteps = checklist.steps.filter((s) => s.stageId === stage.id)
          if (stageSteps.length === 0) return null
          return (
            <div key={stage.id} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {stage.label}
              </h4>
              <div className="space-y-2">
                {stageSteps.map((step) => {
                  const isRunning = runningStepId === step.id
                  return (
                    <AccordionItem
                      key={step.id}
                      value={step.id}
                      className={`rounded-lg border border-subtle px-3 ${
                        isRunning || step.status === 'current' ? 'bg-muted/30' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 py-1">
                        <div className="min-w-0 flex-1">
                          <AccordionTrigger className="w-full py-2 hover:no-underline [&>svg]:hidden">
                            <div className="flex w-full min-w-0 items-start gap-3 text-left">
                              <StatusIcon status={isRunning ? 'current' : step.status} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium leading-tight">{step.label}</p>
                                  {step.manifestStatus !== 'active' && (
                                    <span
                                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                      title={step.inactiveNote ?? undefined}
                                    >
                                      inactive
                                    </span>
                                  )}
                                </div>
                                {step.progress && (
                                  <p className="text-xs text-muted">{step.progress}</p>
                                )}
                                {step.status === 'optional' && (
                                  <p className="text-xs text-muted">Not required — nothing to refine</p>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={step.status === 'current' ? 'default' : 'outline'}
                          className="shrink-0"
                          disabled={!step.runnable || runningStepId != null || clearing}
                          onClick={() => void runStep(step.id)}
                        >
                          {isRunning ? (
                            <>
                              <Loader2 className="mr-1 size-3 animate-spin" />
                              Running…
                            </>
                          ) : (
                            'Run'
                          )}
                        </Button>
                      </div>
                      <AccordionContent className="border-t border-subtle pb-3 pt-2">
                        <PipelineStepDetail
                          stepId={step.id}
                          payload={payload}
                          reveal={revealTarget?.stepId === step.id}
                          revealKey={revealTarget?.epoch}
                          renderFeedback={renderFeedback}
                          spanHighlight={spanHighlight}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </div>
            </div>
          )
        })}
      </Accordion>
    </div>
  )
}
