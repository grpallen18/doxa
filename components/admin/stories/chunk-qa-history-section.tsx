'use client'

import { useEffect, useState } from 'react'
import type { ChunkQaHistoryPayload, ChunkQaHistoryEvent } from '@/lib/admin/chunk-qa-history'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import {
  FocusAccordion,
  FocusAccordionItem,
  AccordionContent,
  AccordionTrigger,
} from '@/components/admin/pipeline/focus-accordion'
import { RecordLedgerCell, recordLedgerValueClass } from '@/components/admin/record/record-ledger-table'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { ClaimsReviewReportDisplay } from '@/components/admin/extraction/claims-review-report'
import { cn } from '@/lib/utils'

function eventTitle(event: ChunkQaHistoryEvent): string {
  const base =
    event.kind === 'review'
      ? `Review${event.cycle_number != null ? ` #${event.cycle_number}` : ''}`
      : `Refine${event.cycle_number != null ? ` #${event.cycle_number}` : ''}`
  return event.reverted ? `${base} (reverted)` : base
}

function eventStatusLine(event: ChunkQaHistoryEvent): string {
  const promptLabel =
    event.prompt_version_number != null ? `prompt v${event.prompt_version_number}` : null
  if (event.kind === 'review') {
    const status =
      event.review_passes === true
        ? 'Passed review'
        : event.review_passes === false
          ? 'Needs refinement'
          : 'Review completed'
    return promptLabel ? `${status} · ${promptLabel}` : status
  }
  const changes = event.claim_diffs.length
  const changeLabel =
    changes === 0 ? 'No claim changes' : `${changes} claim change${changes === 1 ? '' : 's'}`
  return promptLabel ? `${changeLabel} · ${promptLabel}` : changeLabel
}

function RefinePatches({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return null
  const patches = (report as { patches?: unknown[] }).patches ?? []
  if (patches.length === 0) return <p className="text-xs text-muted">No patches recorded.</p>
  return (
    <ul className="space-y-1.5">
      {patches.map((p, i) => (
        <li key={i} className="rounded bg-muted/20 px-2 py-1.5 font-mono text-xs">
          {JSON.stringify(p)}
        </li>
      ))}
    </ul>
  )
}

function ClaimDiffTable({ event }: { event: ChunkQaHistoryEvent }) {
  if (event.claim_diffs.length === 0) {
    return <p className="text-xs text-muted">No claim changes in this step.</p>
  }

  return (
    <div className="min-w-0 rounded-md border border-subtle text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-subtle bg-muted/10 px-3 py-2 font-medium">
        <span>Claim ID</span>
        <span>Before</span>
        <span>After</span>
      </div>
      <ul className="divide-y divide-subtle">
        {event.claim_diffs.map((diff) => (
          <li
            key={`${diff.claim_id}-${diff.change}`}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 px-3 py-2"
          >
            <span className="font-mono text-[10px] text-muted" title={diff.claim_id}>
              {diff.claim_id}
            </span>
            <span className={recordLedgerValueClass}>
              <RecordLedgerCell>
                {diff.before?.raw_text ?? (
                  <span className="text-muted italic">—</span>
                )}
              </RecordLedgerCell>
            </span>
            <span className={recordLedgerValueClass}>
              <RecordLedgerCell>
                {diff.after?.raw_text ?? (
                  <span className="text-muted italic">removed</span>
                )}
              </RecordLedgerCell>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ClaimVersionMatrix({ payload }: { payload: ChunkQaHistoryPayload }) {
  const { claim_version_matrix: rows, version_labels: labels } = payload
  if (rows.length === 0 || labels.length === 0) {
    return <p className="text-xs text-muted">No claim versions recorded yet.</p>
  }

  const gridStyle = {
    gridTemplateColumns: `minmax(0, 1.5fr) repeat(${labels.length}, minmax(0, 1fr))`,
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-subtle text-xs">
      <div
        className="grid min-w-[32rem] gap-x-3 border-b border-subtle bg-muted/10 px-3 py-2 font-medium"
        style={gridStyle}
      >
        <span>Claim</span>
        {labels.map((label) => (
          <span key={label} className="min-w-0 truncate" title={label}>
            {label}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-subtle">
        {rows.map((row) => (
          <li key={row.row_key} className="grid min-w-[32rem] gap-x-3 px-3 py-2" style={gridStyle}>
            <span className={recordLedgerValueClass} title={row.label}>
              <RecordLedgerCell>{row.label}</RecordLedgerCell>
            </span>
            {row.versions.map((cell) => (
              <span
                key={`${row.row_key}-${cell.version}`}
                className={cn(
                  recordLedgerValueClass,
                  cell.changed && 'rounded bg-amber-500/10 px-1'
                )}
                title={cell.raw_text ?? undefined}
              >
                <RecordLedgerCell>
                  {cell.raw_text ?? <span className="text-muted italic">—</span>}
                </RecordLedgerCell>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

function QaEventDetail({ event }: { event: ChunkQaHistoryEvent }) {
  const meta: string[] = []
  if (event.prompt_version_number != null && event.prompt_step_id) {
    meta.push(`Prompt v${event.prompt_version_number}`)
  }
  if (event.model_name) meta.push(event.model_name)
  if (event.run_id) meta.push(`Run ${event.run_id.slice(0, 8)}`)

  return (
    <div className="space-y-3">
      {meta.length > 0 ? (
        <p className="text-xs text-muted">{meta.join(' · ')}</p>
      ) : null}

      {event.kind === 'review' ? (
        <>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Review findings</p>
            <ClaimsReviewReportDisplay report={event.report} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">
              Claims at review ({event.claims_after.length})
            </p>
            {event.claims_after.length === 0 ? (
              <p className="text-xs text-muted">No claims.</p>
            ) : (
              <ul className="space-y-1">
                {event.claims_after.map((c) => (
                  <li key={c.claim_id} className="rounded bg-muted/20 px-2 py-1 text-xs">
                    <span className="font-mono text-[10px] text-muted">{c.claim_id}</span>
                    <span className="mx-1 text-muted">·</span>
                    {c.raw_text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Patches applied</p>
            <RefinePatches report={event.report} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Claim changes</p>
            <ClaimDiffTable event={event} />
          </div>
        </>
      )}
    </div>
  )
}

export function ChunkQaHistorySection({
  apiPath,
  variant = 'panel',
}: {
  apiPath: string
  variant?: 'card' | 'panel'
}) {
  const [payload, setPayload] = useState<ChunkQaHistoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(apiPath, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || json.error || !json.data) {
          setError(json.error?.message ?? 'Failed to load QA history')
          setPayload(null)
          return
        }
        setPayload(json.data)
      })
      .catch(() => {
        setError('Failed to load QA history')
        setPayload(null)
      })
      .finally(() => setLoading(false))
  }, [apiPath])

  const events = payload?.events ?? []
  const reversed = [...events].reverse()

  return (
    <RecordSectionCard id="chunk-qa-history" title="Review & refine history" variant={variant}>
      {loading && <p className="text-xs text-muted">Loading QA history…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && !error && events.length === 0 ? (
        <p className="text-xs text-muted">No review or refine runs recorded for this chunk yet.</p>
      ) : null}
      {!loading && !error && payload && events.length > 0 ? (
        <div className="space-y-6">
          {payload.version_timeline ? (
            <p className="text-xs text-muted font-mono">{payload.version_timeline}</p>
          ) : null}
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted">Claim versions across refinements</h3>
            <ClaimVersionMatrix payload={payload} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium text-muted">Run timeline</h3>
            <FocusAccordion defaultValue={reversed[0] ? [reversed[0].id] : []}>
              {reversed.map((event) => (
                <FocusAccordionItem key={event.id} value={event.id}>
                  <AccordionTrigger className="py-2 text-xs hover:no-underline">
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="font-medium">{eventTitle(event)}</span>
                      <span className="text-muted">{eventStatusLine(event)}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted">
                        {formatAdminDateTime(event.created_at)}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <QaEventDetail event={event} />
                  </AccordionContent>
                </FocusAccordionItem>
              ))}
            </FocusAccordion>
          </section>
        </div>
      ) : null}
    </RecordSectionCard>
  )
}
