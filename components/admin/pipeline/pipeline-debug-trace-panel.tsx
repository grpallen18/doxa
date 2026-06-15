'use client'

import {
  formatPipelineDebugTraceLines,
  type PipelineDebugTracePayload,
} from '@/lib/admin/pipeline-debug-trace'

export function PipelineDebugTracePanel({
  trace,
  title = 'Run trace',
}: {
  trace: PipelineDebugTracePayload
  title?: string
}) {
  const lines = formatPipelineDebugTraceLines(trace)
  if (lines.length === 0) return null

  return (
    <details className="mt-2 rounded border border-white/5 bg-black/20 px-2 py-1.5">
      <summary className="cursor-pointer text-xs font-medium text-zinc-400">
        {title}
        {trace.total_ms != null ? ` (${(trace.total_ms / 1000).toFixed(1)}s)` : ''}
      </summary>
      <ol className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-zinc-400">
        {lines.map((line, index) => (
          <li key={`${trace.started_at ?? 'trace'}-${index}`}>{line}</li>
        ))}
      </ol>
    </details>
  )
}
