'use client'

import { useEffect, useState, type TransitionEvent } from 'react'
import Link from 'next/link'
import { History, X } from 'lucide-react'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  formatAgentRunSubtitle,
  resolveStoryStepRunModelLabel,
} from '@/lib/admin/run-models'
import {
  derivePipelineChecklist,
  getChunkRefineRecoveryMessage,
  getChunkStepRevertBlockedReason,
  isChunkStepRevertible,
  isStepRevertible,
  type PipelineStepState,
} from '@/lib/admin/story-pipeline-checklist'
import { isChunkParallelStep } from '@/lib/admin/pipeline-status/extraction-groups'
import { getVisionNodeById } from '@/lib/admin/workflow-canvas/vision-flow-layout'
import {
  isScrapeWorkerStep,
  scrapeWorkerSubtitle,
} from '@/lib/admin/workflow-canvas/scrape-worker-step'
import { ScrapeWorkerOverviewPanel } from '@/components/admin/workflow-canvas/workflow-canvas-scrape-panel'
import { WorkflowCanvasStepAuditLog } from '@/components/admin/workflow-canvas/workflow-canvas-step-audit-log'
import { isCatalogStepId } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { CanvasStepActionButtons } from '@/components/admin/workflow-canvas/canvas-step-action-buttons'
import {
  CanvasStepIconAvatar,
  resolveStepIconVariant,
} from '@/components/admin/workflow-canvas/canvas-step-icon'
import { StoryStepExportButtons } from '@/components/admin/stories/story-step-export-buttons'
import type { WorkflowPipelineActions } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { resolveAgentDisplayName } from '@/lib/admin/agent-display-names'
import { useAgentDisplayNames } from '@/components/admin/agents/use-agent-display-names'
import { mergeEligibilitySnapshot } from '@/lib/admin/claims-merge-eligibility'
import { chunkLanePhaseLabel, laneForChunkStep } from '@/lib/admin/pipeline-status/chunk-phase'
import { cn } from '@/lib/utils'

type AgentApiResponse = {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
  displayName?: string
}

const INSPECTOR_WIDTH_PX = 384
const INSPECTOR_TRANSITION_MS = 300

const INSPECTOR_ICON_BUTTON =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function WorkflowCanvasInspector({
  selectedNodeId,
  onClose,
  payload,
  pipelineActions,
  chunkIndex,
}: {
  selectedNodeId: string | null
  onClose: () => void
  payload: StoryExtractionReviewPayload
  pipelineActions: WorkflowPipelineActions
  chunkIndex?: number
}) {
  const [panelNodeId, setPanelNodeId] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (selectedNodeId) {
      setPanelNodeId(selectedNodeId)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
    setVisible(false)
  }, [selectedNodeId])

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'width') return
    if (!visible && !selectedNodeId) {
      setPanelNodeId(null)
    }
  }

  if (!panelNodeId) return null

  return (
    <div
      className="h-full shrink-0 overflow-hidden transition-[width] ease-in-out"
      style={{
        width: visible ? INSPECTOR_WIDTH_PX : 0,
        transitionDuration: `${INSPECTOR_TRANSITION_MS}ms`,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <aside
        className={cn(
          'workflow-canvas-dark flex h-full w-96 flex-col overflow-hidden border-l border-white/10 bg-zinc-900/95 text-zinc-200 backdrop-blur-xl',
          'transition-transform ease-in-out',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ transitionDuration: `${INSPECTOR_TRANSITION_MS}ms` }}
      >
        <WorkflowCanvasInspectorBody
          selectedNodeId={panelNodeId}
          payload={payload}
          pipelineActions={pipelineActions}
          chunkIndex={chunkIndex}
          onClose={onClose}
        />
      </aside>
    </div>
  )
}

function resolveInspectorSubtitle(
  catalogStepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  globalLastRun: AgentRunSummary | null
): string {
  const storyRun = payload.step_runs?.[catalogStepId] ?? null
  const storyModelLabel = resolveStoryStepRunModelLabel(
    catalogStepId,
    storyRun,
    payload.story
  )
  const modelLabel = storyRun ? storyModelLabel : globalLastRun?.model_name ?? null

  return formatAgentRunSubtitle({ modelLabel })
}

function WorkflowCanvasInspectorBody({
  selectedNodeId,
  payload,
  pipelineActions,
  chunkIndex,
  onClose,
}: {
  selectedNodeId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: WorkflowPipelineActions
  chunkIndex?: number
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'prompt' | 'history'>('prompt')
  const [agentData, setAgentData] = useState<AgentApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const { displayNames } = useAgentDisplayNames()

  const visionNode = getVisionNodeById(selectedNodeId)
  const catalogStepId: PipelineStepId | null =
    visionNode?.catalogStepId && isCatalogStepId(visionNode.catalogStepId)
      ? visionNode.catalogStepId
      : isCatalogStepId(selectedNodeId)
        ? selectedNodeId
        : null

  const checklist =
    chunkIndex != null
      ? derivePipelineChecklist(payload, { scope: 'chunk', chunkIndex })
      : derivePipelineChecklist(payload)
  const stepState: PipelineStepState | undefined = catalogStepId
    ? checklist.steps.find((s) => s.id === catalogStepId)
    : undefined
  const chunk =
    chunkIndex != null ? payload.chunks.find((c) => c.chunk_index === chunkIndex) : undefined
  const chunkLayerOnly =
    chunkIndex == null && catalogStepId != null && isChunkParallelStep(catalogStepId)
  const isScrapeStep = isScrapeWorkerStep(catalogStepId)

  useEffect(() => {
    setActiveTab('prompt')
    if (!catalogStepId || isScrapeStep) {
      setAgentData(null)
      return
    }

    let cancelled = false
    setLoading(true)
    void fetch(`/api/admin/agents/${catalogStepId}`)
      .then((r) => r.json())
      .then((agentJson) => {
        if (cancelled) return
        setAgentData(agentJson.data ?? null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [catalogStepId, selectedNodeId, isScrapeStep])

  if (!catalogStepId || !stepState) {
    const maturity = visionNode?.maturity ?? 'placeholder'
    const title = visionNode?.visionLabel ?? selectedNodeId

    return (
      <>
        <header className="grid shrink-0 gap-1.5 border-b border-white/10 p-4 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-none tracking-tight text-zinc-100">
                {title}
              </h2>
              <p className="text-sm text-zinc-400">
                {maturity === 'partial'
                  ? 'Partial implementation'
                  : 'Planned pipeline step'}
              </p>
            </div>
            <button
              type="button"
              className={INSPECTOR_ICON_BUTTON}
              aria-label="Close inspector"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <span
            className={cn(
              'inline-block w-fit text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
              maturity === 'partial'
                ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                : 'text-zinc-500 border-zinc-600 bg-zinc-800/50'
            )}
          >
            {maturity === 'partial' ? 'Partial' : 'Planned'}
          </span>
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
          {visionNode?.roadmapNote ? (
            <p className="text-sm text-zinc-400 leading-relaxed">{visionNode.roadmapNote}</p>
          ) : (
            <p className="text-sm text-zinc-500">
              This step is part of the target pipeline architecture.
            </p>
          )}
          {visionNode?.handlerPath ? (
            <p className="mt-4 text-xs text-zinc-500 font-mono">{visionNode.handlerPath}</p>
          ) : null}
        </div>
      </>
    )
  }

  const label =
    agentData?.displayName ??
    resolveAgentDisplayName(catalogStepId, stepState.label, displayNames)
  const revertible =
    chunk && catalogStepId
      ? isChunkStepRevertible(catalogStepId, chunk, payload)
      : catalogStepId
        ? isStepRevertible(catalogStepId, payload)
        : false
  const isRunning = pipelineActions.isStepRunning(catalogStepId)
  const isReverting = pipelineActions.revertingStepId === catalogStepId
  const refineRecoveryMessage =
    chunk && chunkIndex != null
      ? getChunkRefineRecoveryMessage(catalogStepId, chunk, payload)
      : null
  const revertBlockedReason =
    chunk && chunkIndex != null && !revertible
      ? getChunkStepRevertBlockedReason(catalogStepId, chunk, payload)
      : null

  return (
    <>
      <header className="grid shrink-0 gap-1.5 border-b border-white/10 p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <CanvasStepIconAvatar variant={resolveStepIconVariant(visionNode)} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-none tracking-tight">
                <Link
                  href={`/admin/agents/${catalogStepId}`}
                  className="text-zinc-100 transition-colors hover:text-indigo-300"
                >
                  {label}
                </Link>
              </h2>
              <p
                className="truncate text-sm text-zinc-400"
                title={
                  isScrapeStep
                    ? scrapeWorkerSubtitle()
                    : resolveInspectorSubtitle(catalogStepId, payload, agentData?.lastRun ?? null)
                }
              >
                {isScrapeStep
                  ? scrapeWorkerSubtitle()
                  : resolveInspectorSubtitle(catalogStepId, payload, agentData?.lastRun ?? null)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={INSPECTOR_ICON_BUTTON}
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-stretch border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('prompt')}
          className={cn(
            'flex-1 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'prompt'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          )}
        >
          {isScrapeStep ? 'Overview' : 'Configuration'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex-1 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'history'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          )}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <History className="w-4 h-4" /> History
          </span>
        </button>
        <div className="flex flex-1 items-center justify-end gap-1 border-b-2 border-transparent px-2 py-2">
          <StoryStepExportButtons
            stepId={catalogStepId}
            payload={payload}
            chunkIndex={chunkIndex}
            variant="dark"
          />
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4 min-h-0">
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

        {activeTab === 'prompt' && !loading ? (
          isScrapeStep ? (
            <ScrapeWorkerOverviewPanel payload={payload} stepState={stepState} />
          ) : (
            <div className="space-y-4">
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">Procedure Name:</dt>
                  <dd className="font-mono text-xs text-zinc-300">{stepState.deployName}</dd>
                </div>
                {stepState.progress ? (
                  <div>
                    <dt className="text-xs text-zinc-500">Status:</dt>
                    <dd className="text-zinc-300">{stepState.progress}</dd>
                  </div>
                ) : null}
                {chunk && catalogStepId && laneForChunkStep(catalogStepId) === 'claims' ? (
                  <>
                    <div>
                      <dt className="text-xs text-zinc-500">Chunk lane phase:</dt>
                      <dd className="text-zinc-300">{chunkLanePhaseLabel('claims', chunk)}</dd>
                    </div>
                    <ChunkParkingSummary chunk={chunk} />
                  </>
                ) : null}
              </dl>
            </div>
          )
        ) : null}

        {activeTab === 'history' && catalogStepId ? (
          <WorkflowCanvasStepAuditLog
            storyId={payload.story.story_id}
            stepId={catalogStepId}
            chunkIndex={chunkIndex}
            runs={(payload.step_run_history?.[catalogStepId] ?? []).filter(
              (run) => chunkIndex == null || run.chunk_index === chunkIndex
            )}
          />
        ) : null}
      </div>

      <footer className="mt-auto flex shrink-0 flex-col gap-3 border-t border-white/10 p-4">
        {refineRecoveryMessage ? (
          <p className="text-center text-xs leading-relaxed text-amber-300/90">
            {refineRecoveryMessage}
          </p>
        ) : null}
        {revertBlockedReason ? (
          <p className="text-center text-xs leading-relaxed text-amber-300/90">
            {revertBlockedReason}
          </p>
        ) : null}
        {chunkLayerOnly ? (
          <p className="text-center text-xs text-zinc-500">
            Open chunk workflows from the toolbar to run or revert this step.
          </p>
        ) : (
          <CanvasStepActionButtons
            stepId={catalogStepId}
            runnable={stepState.runnable}
            revertible={revertible}
            isRunning={isRunning}
            isReverting={isReverting}
            onRun={pipelineActions.runStep}
            onRevert={pipelineActions.requestRevert}
            size="md"
          />
        )}
      </footer>
    </>
  )
}

function ChunkParkingSummary({
  chunk,
}: {
  chunk: StoryExtractionReviewPayload['chunks'][number]
}) {
  const merge = mergeEligibilitySnapshot(chunk.claims_merge_eligibility)
  if (
    merge.parked_count === 0 &&
    merge.repair_queue_ids.length === 0 &&
    merge.pending_approval_ids.length === 0 &&
    merge.rejected_final_count === 0
  ) {
    return null
  }

  return (
    <div className="col-span-full space-y-1 rounded-md border border-white/10 bg-zinc-950/50 px-3 py-2">
      <p className="text-xs font-medium text-zinc-400">Claim parking</p>
      <ul className="space-y-0.5 text-xs text-zinc-300">
        <li>Parked: {merge.parked_count}</li>
        {merge.repair_queue_ids.length > 0 ? (
          <li>Repair queue: {merge.repair_queue_ids.join(', ')}</li>
        ) : null}
        {merge.pending_approval_ids.length > 0 ? (
          <li>Pending approval: {merge.pending_approval_ids.join(', ')}</li>
        ) : null}
        {merge.rejected_final_count > 0 ? (
          <li>Rejected final: {merge.rejected_final_count}</li>
        ) : null}
      </ul>
    </div>
  )
}
