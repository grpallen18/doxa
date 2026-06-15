'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import type {
  ChunkLifecycleIssue,
  OrphanedClaimVersionRow,
} from '@/lib/admin/orphaned-claim-versions'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { cn } from '@/lib/utils'

export function OrphanedClaimVersionsPanel({
  apiPath,
  variant = 'panel',
  theme = 'default',
  alwaysShow = false,
  onChanged,
}: {
  apiPath: string
  variant?: 'panel' | 'plain'
  theme?: 'default' | 'canvas'
  alwaysShow?: boolean
  onChanged?: () => void
}) {
  const [orphans, setOrphans] = useState<OrphanedClaimVersionRow[]>([])
  const [lifecycleIssues, setLifecycleIssues] = useState<ChunkLifecycleIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? 'Failed to load claim lifecycle repairs')
      }
      setOrphans(json.data?.orphaned_versions ?? [])
      setLifecycleIssues(json.data?.lifecycle_issues ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claim lifecycle repairs')
      setOrphans([])
      setLifecycleIssues([])
    } finally {
      setLoading(false)
    }
  }, [apiPath])

  useEffect(() => {
    void load()
  }, [load])

  async function runAction(body: Record<string, unknown>) {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, ...body }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? 'Cleanup action failed')
    }
    await load()
    onChanged?.()
    return json.data
  }

  async function handleDelete(versionId: string) {
    setBusyId(versionId)
    setError(null)
    try {
      await runAction({ action: 'delete', version_id: versionId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRelink(orphan: OrphanedClaimVersionRow) {
    setBusyId(orphan.version_id)
    setError(null)
    try {
      await runAction({
        action: 'relink',
        version_id: orphan.version_id,
        review_artifact_id: orphan.suggested_review_artifact_id,
        refinement_artifact_id: orphan.refinement_artifact_id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relink failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleBulk(action: 'relink_all' | 'delete_all') {
    setBulkBusy(action)
    setError(null)
    try {
      await runAction({ action })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk cleanup failed')
    } finally {
      setBulkBusy(null)
    }
  }

  async function handleResetCounter() {
    setBulkBusy('reset_refinement_counter')
    setError(null)
    try {
      await runAction({ action: 'reset_refinement_counter' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setBulkBusy(null)
    }
  }

  const hasRepairs = orphans.length > 0 || lifecycleIssues.length > 0
  const isCanvas = theme === 'canvas'
  const title = 'Claim lifecycle repair'

  if (loading) {
    if (!alwaysShow && !hasRepairs) return null
    return (
      <RepairShell title={title} variant={variant} isCanvas={isCanvas} id="orphaned-claim-versions">
        <p className={cn('text-sm', isCanvas ? 'text-zinc-400' : 'text-muted')}>
          Checking claim lifecycle…
        </p>
      </RepairShell>
    )
  }

  if (!alwaysShow && !hasRepairs && !error) {
    return null
  }

  return (
    <RepairShell
      title={title}
      variant={variant}
      isCanvas={isCanvas}
      id="orphaned-claim-versions"
      headerActions={
        orphans.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkBusy != null}
              onClick={() => void handleBulk('relink_all')}
            >
              {bulkBusy === 'relink_all' ? 'Relinking…' : 'Relink all'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={bulkBusy != null}
              onClick={() => void handleBulk('delete_all')}
            >
              {bulkBusy === 'delete_all' ? 'Deleting…' : 'Delete all safe'}
            </Button>
          </div>
        ) : null
      }
    >
      {!hasRepairs && !error ? (
        <p className={cn('text-sm', isCanvas ? 'text-zinc-500' : 'text-muted')}>
          No orphaned refiner versions or stale refinement counter detected.
        </p>
      ) : (
        <p className={cn('mb-3 text-sm', isCanvas ? 'text-zinc-400' : 'text-muted')}>
          Partial refine runs (timeouts) can leave an unlinked refiner version or a stale
          refinement counter. Relink repairs v1 into the official lifecycle; reset clears a counter
          when the output row was already removed.
        </p>
      )}

      {error ? (
        <p className={cn('mb-3 text-sm', isCanvas ? 'text-rose-400' : 'text-destructive')}>
          {error}
        </p>
      ) : null}

      {lifecycleIssues.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {lifecycleIssues.map((issue) => (
            <li
              key={issue.kind}
              className={cn(
                'rounded-md border px-3 py-3 text-sm',
                isCanvas ? 'border-amber-500/30 bg-amber-500/10' : 'border-subtle'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className={isCanvas ? 'text-amber-100' : undefined}>{issue.message}</p>
                {issue.suggested_actions.includes('reset_refinement_counter') ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy != null || busyId != null}
                    onClick={() => void handleResetCounter()}
                  >
                    {bulkBusy === 'reset_refinement_counter'
                      ? 'Resetting…'
                      : 'Reset counter'}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {orphans.length > 0 ? (
        <ul className="space-y-3">
          {orphans.map((orphan) => (
            <li
              key={orphan.version_id}
              className={cn(
                'rounded-md border px-3 py-3 text-sm',
                isCanvas ? 'border-white/10 bg-zinc-900/60' : 'border-subtle'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className={cn('font-medium', isCanvas && 'text-zinc-100')}>
                    {orphan.version_label}
                    {orphan.is_active ? (
                      <span className="ml-2 text-xs text-amber-500">active</span>
                    ) : null}
                  </p>
                  <p className="font-mono text-xs text-muted break-all">{orphan.version_id}</p>
                  <p className="text-xs text-muted">
                    Created {formatAdminDateTime(orphan.created_at)}
                  </p>
                  <p className="text-xs">
                    Reasons: {orphan.orphan_reasons.join(', ')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId != null || bulkBusy != null}
                    onClick={() => void handleRelink(orphan)}
                  >
                    {busyId === orphan.version_id ? 'Relinking…' : 'Relink'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={orphan.is_active || busyId != null || bulkBusy != null}
                    onClick={() => void handleDelete(orphan.version_id)}
                  >
                    {busyId === orphan.version_id ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </RepairShell>
  )
}

function RepairShell({
  id,
  title,
  variant,
  isCanvas,
  headerActions,
  children,
}: {
  id: string
  title: string
  variant: 'panel' | 'plain'
  isCanvas: boolean
  headerActions?: React.ReactNode
  children: ReactNode
}) {
  if (isCanvas) {
    return (
      <section
        id={id}
        className="shrink-0 border-t border-amber-500/20 bg-amber-500/5 px-4 py-3"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            {title}
          </h3>
          {headerActions}
        </div>
        {children}
      </section>
    )
  }

  return (
    <RecordSectionCard
      id={id}
      title={title}
      variant={variant === 'plain' ? 'panel' : variant}
      headerActions={headerActions}
    >
      {children}
    </RecordSectionCard>
  )
}
