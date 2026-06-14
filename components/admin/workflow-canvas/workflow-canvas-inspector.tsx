'use client'

import { useEffect, useState, type TransitionEvent } from 'react'
import Link from 'next/link'
import { Edit3, History, X } from 'lucide-react'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import {
  formatAgentRunSubtitle,
  resolveStoryStepRunModelLabel,
} from '@/lib/admin/run-models'
import {
  derivePipelineChecklist,
  isStepRevertible,
  type PipelineStepState,
} from '@/lib/admin/story-pipeline-checklist'
import { getVisionNodeById } from '@/lib/admin/workflow-canvas/vision-flow-layout'
import {
  isScrapeWorkerStep,
  scrapeWorkerSubtitle,
} from '@/lib/admin/workflow-canvas/scrape-worker-step'
import {
  ScrapeWorkerHistoryPanel,
  ScrapeWorkerOverviewPanel,
} from '@/components/admin/workflow-canvas/workflow-canvas-scrape-panel'
import { isCatalogStepId } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { CanvasStepActionButtons } from '@/components/admin/workflow-canvas/canvas-step-action-buttons'
import {
  CanvasStepIconAvatar,
  resolveStepIconVariant,
} from '@/components/admin/workflow-canvas/canvas-step-icon'
import { StoryStepExportButtons } from '@/components/admin/stories/story-step-export-buttons'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { resolveAgentDisplayName } from '@/lib/admin/agent-display-names'
import { useAgentDisplayNames } from '@/components/admin/agents/use-agent-display-names'
import { Button } from '@/components/ui/button'
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
}: {
  selectedNodeId: string | null
  onClose: () => void
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
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
  onClose,
}: {
  selectedNodeId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'prompt' | 'history'>('prompt')
  const [agentData, setAgentData] = useState<AgentApiResponse | null>(null)
  const [runs, setRuns] = useState<AgentRunSummary[]>([])
  const [loading, setLoading] = useState(false)
  const { displayNames } = useAgentDisplayNames()

  const visionNode = getVisionNodeById(selectedNodeId)
  const catalogStepId =
    visionNode?.catalogStepId ??
    (isCatalogStepId(selectedNodeId) ? selectedNodeId : null)

  const checklist = derivePipelineChecklist(payload)
  const stepState: PipelineStepState | undefined = catalogStepId
    ? checklist.steps.find((s) => s.id === catalogStepId)
    : undefined
  const isScrapeStep = isScrapeWorkerStep(catalogStepId)

  useEffect(() => {
    setActiveTab('prompt')
    if (!catalogStepId || isScrapeStep) {
      setAgentData(null)
      setRuns([])
      return
    }

    let cancelled = false
    setLoading(true)
    void Promise.all([
      fetch(`/api/admin/agents/${catalogStepId}`).then((r) => r.json()),
      fetch(`/api/admin/agents/${catalogStepId}/runs?limit=5`).then((r) => r.json()),
    ])
      .then(([agentJson, runsJson]) => {
        if (cancelled) return
        setAgentData(agentJson.data ?? null)
        setRuns(runsJson.data?.runs ?? [])
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
  const revertible = isStepRevertible(catalogStepId, payload)
  const isRunning = pipelineActions.isStepRunning(catalogStepId)
  const isReverting = pipelineActions.revertingStepId === catalogStepId

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
                  <dt className="text-xs text-zinc-500">Deploy</dt>
                  <dd className="font-mono text-xs text-zinc-300">{stepState.deployName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Stage</dt>
                  <dd className="text-zinc-300">{stepState.stageLabel}</dd>
                </div>
                {stepState.progress ? (
                  <div>
                    <dt className="text-xs text-zinc-500">Progress</dt>
                    <dd className="text-zinc-300">{stepState.progress}</dd>
                  </div>
                ) : null}
              </dl>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-white/10 bg-transparent text-zinc-300"
                asChild
              >
                <Link href={`/admin/agents/${catalogStepId}`}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit prompt
                </Link>
              </Button>
            </div>
          )
        ) : null}

        {activeTab === 'history' && !loading ? (
          isScrapeStep ? (
            <ScrapeWorkerHistoryPanel payload={payload} />
          ) : (
            <ul className="space-y-2 text-sm">
              {runs.length === 0 ? (
                <li className="text-zinc-500">No recent runs</li>
              ) : (
                runs.map((run) => (
                  <li
                    key={run.run_id}
                    className="rounded-md border border-white/5 bg-zinc-950/40 px-3 py-2"
                  >
                    <p className="text-zinc-200">{run.status}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatAdminDateTime(run.started_at)}
                      {run.model_name ? ` · ${run.model_name}` : ''}
                    </p>
                    {run.error ? <p className="mt-1 text-xs text-rose-400">{run.error}</p> : null}
                  </li>
                ))
              )}
            </ul>
          )
        ) : null}
      </div>

      <footer className="mt-auto flex shrink-0 justify-center border-t border-white/10 p-4">
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
      </footer>
    </>
  )
}
