'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { PipelineStepState } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  SCRAPE_PIPELINE_COMPONENTS,
  formatStepRunHistoryLine,
  scrapeStoryStateRows,
} from '@/lib/admin/workflow-canvas/scrape-worker-step'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { StoryStepExportButtons } from '@/components/admin/stories/story-step-export-buttons'
import { Button } from '@/components/ui/button'

export function ScrapeWorkerOverviewPanel({
  payload,
  stepState,
}: {
  payload: StoryExtractionReviewPayload
  stepState: PipelineStepState
}) {
  const stateRows = scrapeStoryStateRows(payload)

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 text-sm text-zinc-300">
        <p className="font-medium text-orange-300">Cloudflare scrape pipeline</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          No LLM on this step. Supabase dispatches to the Worker; the Worker callbacks into{' '}
          <span className="font-mono text-zinc-300">receive_scraped_content</span> when HTML is
          extracted or skipped.
        </p>
      </div>

      <dl className="grid gap-2 text-sm">
        {stateRows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs text-zinc-500">{row.label}</dt>
            <dd className="break-all text-zinc-300">{row.value}</dd>
          </div>
        ))}
        {stepState.progress ? (
          <div>
            <dt className="text-xs text-zinc-500">Checklist</dt>
            <dd className="text-zinc-300">{stepState.progress}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Components
        </p>
        <ul className="space-y-2">
          {SCRAPE_PIPELINE_COMPONENTS.map((item) => (
            <li
              key={item.name}
              className="rounded-md border border-white/5 bg-zinc-950/40 px-3 py-2"
            >
              <p className="font-mono text-xs text-orange-300">{item.name}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {item.role}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <StoryStepExportButtons stepId="scrape-story-content" payload={payload} />

      <Button
        variant="outline"
        size="sm"
        className="w-full border-white/10 bg-transparent text-zinc-300"
        asChild
      >
        <Link href="/admin/agents/scrape-story-content">
          <ExternalLink className="mr-2 h-4 w-4" />
          View dispatch handler
        </Link>
      </Button>
    </div>
  )
}

export function ScrapeWorkerHistoryPanel({ payload }: { payload: StoryExtractionReviewPayload }) {
  const runs = payload.step_run_history?.['scrape-story-content'] ?? []

  return (
    <ul className="space-y-2 text-sm">
      {runs.length === 0 ? (
        <li className="text-zinc-500">No step runs logged yet</li>
      ) : (
        runs.map((run) => (
          <li
            key={run.id}
            className="rounded-md border border-white/5 bg-zinc-950/40 px-3 py-2"
          >
            <p className="text-zinc-200">{formatStepRunHistoryLine(run.outcome)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatAdminDateTime(run.occurred_at)} · {run.trigger}
            </p>
            {run.error ? <p className="mt-1 text-xs text-rose-400">{run.error}</p> : null}
          </li>
        ))
      )}
    </ul>
  )
}
