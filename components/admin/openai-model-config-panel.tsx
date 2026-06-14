'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AdminDashboardWidget } from '@/components/admin/admin-dashboard-widget'
import { Button } from '@/components/ui/button'
import {
  showPipelineError,
  showPipelineSuccess,
} from '@/lib/admin/pipeline-toast'
import type { ResolvedOpenAiModelEntry } from '@/lib/admin/openai-model-config'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'

type ModelsApiResponse = {
  models: ResolvedOpenAiModelEntry[]
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'Not saved yet'
  return formatAdminDateTime(iso)
}

function ModelConfigRow({
  entry,
  draft,
  onDraftChange,
  onApply,
  applying,
  rowError,
}: {
  entry: ResolvedOpenAiModelEntry
  draft: string
  onDraftChange: (value: string) => void
  onApply: () => void
  applying: boolean
  rowError: string | null
}) {
  const unchanged = draft.trim() === entry.effectiveValue
  const canApply = !unchanged && !applying && Boolean(draft.trim())

  return (
    <div className="grid gap-2 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:items-start sm:gap-4">
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-foreground">{entry.key}</p>
        <p className="mt-0.5 text-xs font-medium text-muted">{entry.label}</p>
        <p className="mt-1 text-[11px] leading-snug text-muted">{entry.description}</p>
        <p className="mt-1 text-[11px] text-muted">
          Code default: <span className="text-foreground/80">{entry.codeDefault}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Used by {entry.usedByStepIds.length} step{entry.usedByStepIds.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="min-w-0 space-y-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={applying}
          className="h-8 w-full rounded-md border border-[color-mix(in_srgb,var(--accent-primary)_45%,var(--border-subtle))] bg-white px-3 py-1 font-mono text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:border-accent-primary focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-primary)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background"
          aria-label={`${entry.key} model value`}
        />
        <p className="text-[11px] text-muted">Last saved: {formatUpdatedAt(entry.updatedAt)}</p>
        {rowError ? <p className="text-[11px] text-destructive">{rowError}</p> : null}
      </div>

      <div className="flex shrink-0 items-center sm:items-start">
        <Button
          type="button"
          size="sm"
          disabled={!canApply}
          onClick={onApply}
          className="min-w-[5.5rem]"
        >
          {applying ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Apply
            </>
          ) : (
            'Apply'
          )}
        </Button>
      </div>
    </div>
  )
}

export function OpenAiModelConfigPanel() {
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<ResolvedOpenAiModelEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [applyingKey, setApplyingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/openai-models')
      const json = (await res.json()) as {
        data?: ModelsApiResponse
        error?: { message?: string }
      }
      if (!res.ok || !json.data) {
        setLoadError(json.error?.message ?? 'Failed to load model config')
        return
      }

      setModels(json.data.models)
      setDrafts(
        Object.fromEntries(
          json.data.models.map((entry) => [entry.key, entry.effectiveValue])
        )
      )
      setRowErrors({})
    } catch {
      setLoadError('Failed to load model config')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateDraft(key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }))
    setRowErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function applyRow(entry: ResolvedOpenAiModelEntry) {
    const value = drafts[entry.key]?.trim() ?? ''
    if (!value) return

    setApplyingKey(entry.key)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[entry.key]
      return next
    })

    try {
      const res = await fetch('/api/admin/openai-models/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: entry.key, value }),
      })
      const json = (await res.json()) as {
        data?: {
          entry: ResolvedOpenAiModelEntry
          test: { ok: boolean; message: string; latencyMs?: number }
          sync: { ok: boolean; message: string }
        }
        error?: { message?: string }
      }

      if (!res.ok || !json.data) {
        const message = json.error?.message ?? 'Failed to apply model'
        setRowErrors((prev) => ({ ...prev, [entry.key]: message }))
        setDrafts((prev) => ({ ...prev, [entry.key]: entry.effectiveValue }))
        showPipelineError(message)
        return
      }

      setModels((prev) =>
        prev.map((row) => (row.key === entry.key ? json.data!.entry : row))
      )
      setDrafts((prev) => ({ ...prev, [entry.key]: json.data!.entry.effectiveValue }))

      const latency =
        json.data.test.latencyMs != null ? ` (${json.data.test.latencyMs}ms)` : ''
      showPipelineSuccess(
        json.data.sync.ok
          ? `${entry.key} updated globally${latency}`
          : `${entry.key} saved to database${latency}. ${json.data.sync.message}`
      )
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [entry.key]: 'Apply request failed',
      }))
      setDrafts((prev) => ({ ...prev, [entry.key]: entry.effectiveValue }))
      showPipelineError('Failed to apply model')
    } finally {
      setApplyingKey(null)
    }
  }

  return (
    <AdminDashboardWidget title="AI model configuration" className="sm:col-span-2 lg:col-span-3">
      <p className="mb-3 text-sm leading-relaxed text-muted">
        Global OpenAI model IDs for Edge Functions. Apply runs a live model test first; failed tests
        are rejected and the previous value is kept.
      </p>

      {loading ? (
        <p className="mt-4 text-xs text-muted">Loading model configuration…</p>
      ) : loadError ? (
        <p className="mt-4 text-xs text-destructive">{loadError}</p>
      ) : (
        <div className="mt-4 divide-y divide-border/60">
          {models.map((entry) => (
            <ModelConfigRow
              key={entry.key}
              entry={entry}
              draft={drafts[entry.key] ?? entry.effectiveValue}
              onDraftChange={(value) => updateDraft(entry.key, value)}
              onApply={() => void applyRow(entry)}
              applying={applyingKey === entry.key}
              rowError={rowErrors[entry.key] ?? null}
            />
          ))}
        </div>
      )}
    </AdminDashboardWidget>
  )
}
