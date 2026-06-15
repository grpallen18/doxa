import type { HistoryEvent } from '@/lib/admin/history'
import type { StoryStepOutcome, StoryStepRunHistoryRow } from '@/lib/admin/story-step-runs'
import {
  isPipelineDebugTrace,
  type PipelineDebugTracePayload,
} from '@/lib/admin/pipeline-debug-trace'

export type StepAuditAction = 'run' | 'revert'

export type StepAuditStatus = 'success' | 'failed' | 'skipped' | 'in_progress' | 'no_op'

export type StepAuditEntry = {
  id: string
  at: string
  action: StepAuditAction
  status: StepAuditStatus
  error: string | null
  debugTrace?: PipelineDebugTracePayload | null
}

const PIPELINE_STEP_AUDIT_LABELS: Record<
  string,
  { action: StepAuditAction; status: StepAuditStatus }
> = {
  'Pipeline step run': { action: 'run', status: 'success' },
  'Pipeline step failed': { action: 'run', status: 'failed' },
  'Pipeline step skipped': { action: 'run', status: 'skipped' },
  'Pipeline step reverted': { action: 'revert', status: 'success' },
  'Chunk pipeline step reverted': { action: 'revert', status: 'success' },
}

function mapRunOutcome(outcome: StoryStepOutcome): StepAuditStatus {
  switch (outcome) {
    case 'success':
      return 'success'
    case 'failure':
      return 'failed'
    case 'skipped':
      return 'skipped'
    case 'looping':
      return 'in_progress'
    case 'no_op':
      return 'no_op'
  }
}

export function runsToStepAuditEntries(runs: StoryStepRunHistoryRow[]): StepAuditEntry[] {
  return runs.map((run) => {
    const rawTrace =
      run.meta?.debug_trace ?? run.meta?.invoke_debug_trace ?? run.meta?.chunk_debug_trace
    return {
      id: `run-${run.id}`,
      at: run.occurred_at,
      action: 'run',
      status: mapRunOutcome(run.outcome),
      error: run.error,
      debugTrace: isPipelineDebugTrace(rawTrace) ? rawTrace : null,
    }
  })
}

export function historyEventsToStepAuditEntries(events: HistoryEvent[]): StepAuditEntry[] {
  return events.flatMap((event) => {
    const mapped = PIPELINE_STEP_AUDIT_LABELS[event.label]
    if (!mapped) return []

    return [
      {
        id: event.id,
        at: event.at,
        action: mapped.action,
        status: mapped.status,
        error: mapped.status === 'failed' ? event.newValue : null,
      },
    ]
  })
}

export function mergeStepAuditEntries(...groups: StepAuditEntry[][]): StepAuditEntry[] {
  const seen = new Set<string>()
  return groups
    .flat()
    .filter((entry) => {
      if (seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

export function formatStepAuditAction(action: StepAuditAction): string {
  return action === 'run' ? 'Run' : 'Revert'
}

export function formatStepAuditStatus(status: StepAuditStatus): string {
  switch (status) {
    case 'success':
      return 'Success'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
    case 'in_progress':
      return 'In progress'
    case 'no_op':
      return 'No work'
  }
}
