'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ChunkQaHistoryPayload } from '@/lib/admin/chunk-qa-history'
import { buildClaimReviewWorkspace } from '@/lib/admin/claim-review-workspace'
import {
  CHUNK_REVIEW_ATOM_TABS,
  DEFAULT_CHUNK_REVIEW_ATOM,
  type ChunkReviewAtomId,
} from '@/lib/admin/chunk-review-atoms'
import { ClaimReviewHistoryDrawer } from '@/components/admin/stories/claim-review-history-drawer'
import {
  RecordLedgerTable,
  recordLedgerRowClass,
  recordLedgerValueClass,
} from '@/components/admin/record/record-ledger-table'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { cn } from '@/lib/utils'

const WORKSPACE_GRID =
  'grid grid-cols-[2.25rem_minmax(5.5rem,6.5rem)_3rem_minmax(0,1fr)] gap-x-3'

const WORKSPACE_COLUMNS = ['#', 'Status', 'Ver', 'Preview']

const ATOM_LABELS: Record<ChunkReviewAtomId, string> = {
  claims: 'claims',
  positions: 'positions',
  events: 'events',
  evidence: 'evidence',
}

function statusTone(status: string): string {
  switch (status) {
    case 'approved':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'needs_refinement':
      return 'text-amber-600 dark:text-amber-400'
    case 'rejected':
      return 'text-destructive'
    default:
      return 'text-muted'
  }
}

function AtomLaneEmptyState({ atom }: { atom: ChunkReviewAtomId }) {
  return (
    <li className="px-3 py-8 text-center">
      <p className="text-xs text-muted">
        No {ATOM_LABELS[atom]} review history recorded for this chunk yet.
      </p>
      <p className="mt-1 text-xs italic text-muted">
        Status tabs and version history for this lane will appear here as the parallel review
        pipeline is wired up.
      </p>
    </li>
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
  const [activeAtom, setActiveAtom] = useState<ChunkReviewAtomId>(DEFAULT_CHUNK_REVIEW_ATOM)
  const [activeTab, setActiveTab] = useState('approved')
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

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

  const workspace = useMemo(
    () => (payload ? buildClaimReviewWorkspace(payload) : null),
    [payload]
  )

  useEffect(() => {
    if (!workspace || activeAtom !== 'claims') return
    if (workspace.tabs.some((tab) => tab.id === activeTab)) return
    setActiveTab(workspace.defaultTabId)
  }, [workspace, activeTab, activeAtom])

  useEffect(() => {
    setSelectedClaimId(null)
    setDrawerOpen(false)
  }, [activeAtom])

  const activeRows = activeAtom === 'claims' ? (workspace?.rowsByTab[activeTab] ?? []) : []
  const selectedLifecycle =
    selectedClaimId && workspace
      ? (workspace.lifecycleByClaimId.get(selectedClaimId) ?? null)
      : null

  const handleRowClick = (claimId: string) => {
    setSelectedClaimId(claimId)
    setDrawerOpen(true)
  }

  const hasClaimsHistory =
    payload != null &&
    (payload.claim_versions.length > 0 || payload.events.some((event) => !event.reverted))

  const showClaimsTable = activeAtom === 'claims' && hasClaimsHistory && workspace != null
  const claimsStatusTabs = showClaimsTable && workspace.tabs.length > 0 ? workspace.tabs : undefined

  return (
    <RecordSectionCard id="chunk-qa-history" title="Chunk review workspace" variant={variant}>
      {loading && <p className="text-xs text-muted">Loading review history…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && !error ? (
        <div className="space-y-4">
          <RecordLedgerTable
            columns={WORKSPACE_COLUMNS}
            gridClass={WORKSPACE_GRID}
            laneTabs={CHUNK_REVIEW_ATOM_TABS}
            activeLaneTab={activeAtom}
            onLaneTabChange={(tabId) => setActiveAtom(tabId as ChunkReviewAtomId)}
            tabs={claimsStatusTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            showColumns={activeAtom === 'claims'}
          >
            <ol className="divide-y divide-subtle">
              {activeAtom !== 'claims' ? (
                <AtomLaneEmptyState atom={activeAtom} />
              ) : !hasClaimsHistory ? (
                <li className="px-3 py-2">
                  <p className="text-xs italic text-muted">
                    No review or refine runs recorded for this chunk yet.
                  </p>
                </li>
              ) : workspace?.tabs.length === 0 ? (
                <li className="px-3 py-2">
                  <p className="text-xs italic text-muted">No claims recorded yet.</p>
                </li>
              ) : activeRows.length === 0 ? (
                <li className="px-3 py-2">
                  <p className="text-xs italic text-muted">No claims in this status.</p>
                </li>
              ) : (
                activeRows.map((row) => (
                  <li key={row.claimId}>
                    <button
                      type="button"
                      className={cn(
                        recordLedgerRowClass(WORKSPACE_GRID),
                        'w-full cursor-pointer text-left hover:bg-muted/30'
                      )}
                      onClick={() => handleRowClick(row.claimId)}
                    >
                      <span className={cn(recordLedgerValueClass, 'tabular-nums text-foreground')}>
                        {row.claimNumber}
                      </span>
                      <span className={cn(recordLedgerValueClass, statusTone(row.status))}>
                        {row.statusLabel}
                      </span>
                      <span className={cn(recordLedgerValueClass, 'tabular-nums')}>
                        {row.versionCount}
                      </span>
                      <span
                        className="min-w-0 truncate text-xs leading-snug text-muted"
                        title={row.preview}
                      >
                        {row.preview}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ol>
          </RecordLedgerTable>

          {activeAtom === 'claims' ? (
            <ClaimReviewHistoryDrawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              lifecycle={selectedLifecycle}
            />
          ) : null}
        </div>
      ) : null}
    </RecordSectionCard>
  )
}
