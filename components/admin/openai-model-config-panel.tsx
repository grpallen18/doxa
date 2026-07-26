'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AdminDashboardWidget } from '@/components/admin/admin-dashboard-widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  showPipelineError,
  showPipelineSuccess,
} from '@/lib/admin/pipeline-toast'
import type { ResolvedOpenAiModelEntry } from '@/lib/admin/openai-model-config'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type ModelsApiResponse = {
  models: ResolvedOpenAiModelEntry[]
}

type FieldDraft = {
  value: string
  label: string
  description: string
}

const FIELD_LABEL_CLASS =
  'shrink-0 whitespace-nowrap text-xs font-semibold tracking-tight text-foreground'
const FIELD_CONTROL_CLASS =
  'min-w-0 flex-1 bg-surface-section text-xs tracking-tight md:text-xs'
const STATIC_FIELD_LABELS = [
  'Model (Technical):',
  'Model (Friendly):',
  'Model Description:',
] as const
const LABEL_COLUMN_PAD_CH = 2

export function OpenAiModelConfigPanel() {
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<ResolvedOpenAiModelEntry[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [applyingKey, setApplyingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const selected = useMemo(
    () => models.find((entry) => entry.key === selectedKey) ?? null,
    [models, selectedKey]
  )

  const labelColumnStyle = useMemo(() => {
    const maxLen = Math.max(...STATIC_FIELD_LABELS.map((label) => label.length), 1)
    return { width: `${maxLen + LABEL_COLUMN_PAD_CH}ch` }
  }, [])

  const draft = selected
    ? (drafts[selected.key] ?? {
        value: selected.effectiveValue,
        label: selected.label,
        description: selected.description,
      })
    : null

  const applying = selected != null && applyingKey === selected.key
  const unchanged =
    selected != null &&
    draft != null &&
    draft.value.trim() === selected.effectiveValue &&
    draft.label.trim() === selected.label &&
    draft.description.trim() === selected.description
  const canSave = Boolean(
    selected &&
      draft &&
      !unchanged &&
      !applying &&
      draft.value.trim() &&
      draft.label.trim() &&
      draft.description.trim()
  )

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
          json.data.models.map((entry) => [
            entry.key,
            {
              value: entry.effectiveValue,
              label: entry.label,
              description: entry.description,
            },
          ])
        )
      )
      setRowErrors({})
      setSelectedKey((prev) => {
        if (prev && json.data!.models.some((entry) => entry.key === prev)) return prev
        return json.data!.models[0]?.key ?? null
      })
    } catch {
      setLoadError('Failed to load model config')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateDraft(key: string, patch: Partial<FieldDraft>) {
    setDrafts((prev) => {
      const current = prev[key]
      if (!current) return prev
      return { ...prev, [key]: { ...current, ...patch } }
    })
    setRowErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function syncEntryToState(entry: ResolvedOpenAiModelEntry) {
    setModels((prev) => prev.map((row) => (row.key === entry.key ? entry : row)))
    setDrafts((prev) => ({
      ...prev,
      [entry.key]: {
        value: entry.effectiveValue,
        label: entry.label,
        description: entry.description,
      },
    }))
  }

  async function saveRow(entry: ResolvedOpenAiModelEntry) {
    const fields = drafts[entry.key]
    if (!fields) return

    const value = fields.value.trim()
    const label = fields.label.trim()
    const description = fields.description.trim()
    if (!value || !label || !description) return

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
        body: JSON.stringify({ key: entry.key, value, label, description }),
      })
      const json = (await res.json()) as {
        data?: {
          entry: ResolvedOpenAiModelEntry
          test: { ok: boolean; message: string; latencyMs?: number } | null
          sync: { ok: boolean; message: string } | null
          warning?: string | null
        }
        error?: { message?: string }
      }

      if (!res.ok || !json.data) {
        const message = json.error?.message ?? 'Failed to save model'
        setRowErrors((prev) => ({ ...prev, [entry.key]: message }))
        setDrafts((prev) => ({
          ...prev,
          [entry.key]: {
            value: entry.effectiveValue,
            label: entry.label,
            description: entry.description,
          },
        }))
        showPipelineError(message)
        return
      }

      syncEntryToState(json.data.entry)

      if (json.data.warning) {
        setRowErrors((prev) => ({ ...prev, [entry.key]: json.data!.warning! }))
        showPipelineError(json.data.warning)
        return
      }

      const technicalValidated = json.data.test != null
      if (technicalValidated) {
        const latency =
          json.data.test?.latencyMs != null ? ` (${json.data.test.latencyMs}ms)` : ''
        const syncOk = json.data.sync?.ok !== false
        showPipelineSuccess(
          syncOk
            ? `${json.data.entry.label} saved${latency}`
            : `${json.data.entry.label} saved${latency}. ${json.data.sync?.message ?? ''}`
        )
      } else {
        showPipelineSuccess('Changes saved successfully!')
      }
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [entry.key]: 'Save request failed',
      }))
      setDrafts((prev) => ({
        ...prev,
        [entry.key]: {
          value: entry.effectiveValue,
          label: entry.label,
          description: entry.description,
        },
      }))
      showPipelineError('Failed to save model')
    } finally {
      setApplyingKey(null)
    }
  }

  const modelPicker = loading ? (
    <Skeleton className="h-7 w-40" aria-hidden />
  ) : !loadError && models.length > 0 ? (
      <Select value={selectedKey ?? undefined} onValueChange={setSelectedKey}>
        <SelectTrigger
          id="openai-model-picker"
          aria-label="Choose model configuration"
          className={cn(
            'h-7 w-auto min-w-[10rem] max-w-[18rem] gap-1 bg-surface-soft px-2 focus:border-input focus:ring-0',
            'text-xs font-semibold tracking-tight text-foreground'
          )}
        >
          {selected ? (
            <span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
          ) : (
            <SelectValue placeholder="Choose a model" />
          )}
        </SelectTrigger>
        <SelectContent
          align="center"
          position="popper"
          className="max-w-[min(40rem,calc(100vw-2rem))]"
        >
          {models.map((entry) => (
            <SelectItem
              key={entry.key}
              value={entry.key}
              className="whitespace-normal py-2 text-xs font-normal tracking-tight leading-snug"
            >
              <span className="font-semibold">{entry.label}</span>
              {': '}
              {entry.description}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  const usedByAside = loading ? (
    <Skeleton className="h-4 w-24" aria-hidden />
  ) : selected != null ? (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-[11px] text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Used in {selected.usedByStepIds.length}{' '}
            {selected.usedByStepIds.length === 1 ? 'workflow' : 'workflows'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          {selected.usedByStepIds.length === 0 ? (
            <p className="text-xs text-muted">No pipeline steps reference this model.</p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {selected.usedByStepIds.map((stepId) => (
                <li key={stepId} className="font-mono text-xs text-foreground">
                  {stepId}
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    ) : null

  const saveButton = loading ? (
    <Skeleton className="h-7 w-12" aria-hidden />
  ) : selected && draft ? (
    <Button
      type="button"
      size="sm"
      disabled={!canSave}
      onClick={() => void saveRow(selected)}
      className="h-7 px-2 text-xs border-0 bg-[var(--accent-primary)] text-inverted shadow-sm hover:bg-[var(--accent-primary)] hover:brightness-110 hover:text-inverted"
    >
      {applying ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          Save
        </>
      ) : (
        'Save'
      )}
    </Button>
  ) : null

  return (
    <AdminDashboardWidget
      title="AI Model Manager"
      titleClassName="text-sm font-semibold tracking-tight text-foreground"
      headerCenter={modelPicker}
      headerAside={
        <>
          {usedByAside}
          {saveButton}
        </>
      }
    >
      {loading ? (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          aria-busy="true"
          aria-label="Loading model configuration"
        >
          {STATIC_FIELD_LABELS.slice(0, 2).map((label) => (
            <div key={label} className="flex items-center gap-3">
              <Skeleton
                className="h-4 shrink-0"
                style={labelColumnStyle}
                aria-hidden
              />
              <Skeleton className="h-8 min-w-0 flex-1" aria-hidden />
            </div>
          ))}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-36" aria-hidden />
            <Skeleton className="min-h-[4rem] w-full flex-1" aria-hidden />
          </div>
        </div>
      ) : loadError ? (
        <p className="text-xs text-destructive">{loadError}</p>
      ) : models.length === 0 ? (
        <p className="text-xs text-muted">No model keys found.</p>
      ) : selected && draft ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <Label
              htmlFor="openai-model-technical"
              className={FIELD_LABEL_CLASS}
              style={labelColumnStyle}
            >
              Model (Technical):
            </Label>
            <Input
              id="openai-model-technical"
              type="text"
              value={draft.value}
              onChange={(e) => updateDraft(selected.key, { value: e.target.value })}
              disabled={applying}
              className={cn('h-8', FIELD_CONTROL_CLASS)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label
              htmlFor="openai-model-friendly"
              className={FIELD_LABEL_CLASS}
              style={labelColumnStyle}
            >
              Model (Friendly):
            </Label>
            <Input
              id="openai-model-friendly"
              type="text"
              value={draft.label}
              onChange={(e) => updateDraft(selected.key, { label: e.target.value })}
              disabled={applying}
              className={cn('h-8', FIELD_CONTROL_CLASS)}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            <Label
              htmlFor="openai-model-description"
              className={FIELD_LABEL_CLASS}
            >
              Model Description:
            </Label>
            <Textarea
              id="openai-model-description"
              value={draft.description}
              onChange={(e) => updateDraft(selected.key, { description: e.target.value })}
              disabled={applying}
              className={cn(
                'min-h-[4rem] w-full flex-1 resize-none',
                FIELD_CONTROL_CLASS
              )}
            />
          </div>

          {rowErrors[selected.key] ? (
            <p className="text-xs text-destructive">{rowErrors[selected.key]}</p>
          ) : null}
        </div>
      ) : null}
    </AdminDashboardWidget>
  )
}
