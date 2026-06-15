export type PipelineDebugTraceStep = {
  step: string
  status: 'ok' | 'skip' | 'fail'
  ms: number
  detail?: Record<string, unknown>
  error?: string
}

export type PipelineDebugTracePayload = {
  deploy?: string
  started_at?: string
  ended_at?: string
  total_ms?: number
  steps: PipelineDebugTraceStep[]
}

export function isPipelineDebugTrace(value: unknown): value is PipelineDebugTracePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const steps = (value as PipelineDebugTracePayload).steps
  return Array.isArray(steps)
}

export function formatPipelineDebugTraceSummary(trace: PipelineDebugTracePayload): string {
  const steps = trace.steps ?? []
  const ok = steps.filter((s) => s.status === 'ok').length
  const failed = steps.find((s) => s.status === 'fail')
  const skipped = steps.filter((s) => s.status === 'skip').length
  const totalMs = trace.total_ms != null ? ` in ${(trace.total_ms / 1000).toFixed(1)}s` : ''
  if (failed) {
    return `Refine trace: ${ok}/${steps.length} steps ok${totalMs} — failed at "${failed.step}"${failed.error ? `: ${failed.error}` : ''}`
  }
  if (steps.length === 0) return 'Refine trace: no steps recorded'
  return `Refine trace: ${ok} ok${skipped ? `, ${skipped} skipped` : ''}${totalMs}`
}

export function formatPipelineDebugTraceLines(trace: PipelineDebugTracePayload): string[] {
  return (trace.steps ?? []).map((step) => {
    const detail =
      step.detail && Object.keys(step.detail).length > 0
        ? ` ${JSON.stringify(step.detail)}`
        : ''
    const error = step.error ? ` — ${step.error}` : ''
    return `${step.status === 'ok' ? '✓' : step.status === 'skip' ? '○' : '✗'} ${step.step} (+${step.ms}ms)${detail}${error}`
  })
}
