'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AgentDetail } from '@/lib/admin/agent-detail'
import type { AgentPromptResponse } from '@/lib/admin/agent-prompt-store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  showPipelineError,
  showPipelineSuccess,
} from '@/lib/admin/pipeline-toast'
import { PromptSchemaSyncDialog } from '@/components/admin/agents/prompt-schema-sync-dialog'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'

export function AgentPromptSection({
  stepId,
  agent,
}: {
  stepId: string
  agent: AgentDetail
}) {
  const [data, setData] = useState<AgentPromptResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncingSchema, setSyncingSchema] = useState(false)
  const [schemaSyncDialogOpen, setSchemaSyncDialogOpen] = useState(false)
  const [schemaSyncMessage, setSchemaSyncMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const loadPrompt = useCallback(async (versionId?: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const url =
        versionId && versionId !== 'active'
          ? `/api/admin/agents/${stepId}/prompt?versionId=${encodeURIComponent(versionId)}`
          : `/api/admin/agents/${stepId}/prompt`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!json.data) {
        setError(json.error?.message ?? 'Failed to load prompt')
        setData(null)
        return
      }
      if (versionId && versionId !== 'active') {
        setDraft(json.data.systemPrompt as string)
        return
      }
      setData(json.data as AgentPromptResponse)
      const activeId = (json.data as AgentPromptResponse).slot?.activeVersion?.versionId ?? null
      setSelectedVersionId(activeId)
      setDraft(
        (json.data as AgentPromptResponse).slot?.activeVersion?.systemPrompt ??
          ''
      )
    } catch {
      setError('Failed to load prompt')
    } finally {
      setLoading(false)
    }
  }, [stepId])

  useEffect(() => {
    if (agent.promptKind === 'llm') {
      loadPrompt()
    } else {
      setLoading(false)
    }
  }, [agent.promptKind, loadPrompt])

  const handleVersionChange = async (value: string) => {
    setSelectedVersionId(value)
    setEditing(false)
    setActionError(null)
    setActionMessage(null)
    if (value === data?.slot?.activeVersion?.versionId) {
      setDraft(data.slot.activeVersion?.systemPrompt ?? '')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/agents/${stepId}/prompt?versionId=${encodeURIComponent(value)}`,
        { cache: 'no-store' }
      )
      const json = await res.json()
      if (json.data?.systemPrompt) {
        setDraft(json.data.systemPrompt as string)
      }
    } catch {
      setActionError('Failed to load version')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/agents/${stepId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: draft,
          changeNote: changeNote.trim() || undefined,
          activate: true,
        }),
      })
      const json = await res.json()
      if (!json.data) {
        setActionError(json.error?.message ?? 'Failed to save prompt')
        return
      }
      setActionMessage(
        `Saved version ${json.data.versionNumber}. Takes effect on the next agent run (within ~60s).`
      )
      setChangeNote('')
      setEditing(false)
      await loadPrompt()
      if (json.data.schemaMismatch?.mismatched && json.data.schemaMismatch.message) {
        setSchemaSyncMessage(json.data.schemaMismatch.message as string)
        setSchemaSyncDialogOpen(true)
      }
    } catch {
      setActionError('Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }

  const handleSyncSchema = async () => {
    setSyncingSchema(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/agents/${stepId}/prompt/sync-schema`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.data) {
        const message = json.error?.message ?? 'Failed to sync response schema'
        setActionError(message)
        showPipelineError(message)
        return
      }
      const version = json.data.promptVersionNumber as number | undefined
      setActionMessage(
        `Response schema synced from prompt OUTPUT${version != null ? ` (v${version})` : ''}. Takes effect on the next agent run (within ~60s).`
      )
      showPipelineSuccess('Response schema synced from prompt OUTPUT.')
      await loadPrompt()
    } catch {
      const message = 'Failed to sync response schema'
      setActionError(message)
      showPipelineError(message)
    } finally {
      setSyncingSchema(false)
    }
  }

  const handleActivate = async () => {
    if (!selectedVersionId) return
    setSaving(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/agents/${stepId}/prompt/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: selectedVersionId }),
      })
      const json = await res.json()
      if (!json.data) {
        setActionError(json.error?.message ?? 'Failed to activate version')
        return
      }
      setActionMessage('Active version updated.')
      await loadPrompt()
      if (json.data.schemaMismatch?.mismatched && json.data.schemaMismatch.message) {
        setSchemaSyncMessage(json.data.schemaMismatch.message as string)
        setSchemaSyncDialogOpen(true)
      }
    } catch {
      setActionError('Failed to activate version')
    } finally {
      setSaving(false)
    }
  }

  if (agent.promptKind === 'none') {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">No LLM system prompt</p>
        <p className="text-muted">
          This agent does not use a chat completion system prompt.
        </p>
      </div>
    )
  }

  if (agent.promptKind === 'embeddings') {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">No LLM system prompt</p>
        <p className="text-muted">
          This agent does not use a chat completion system prompt. Uses embedding API
          only.
        </p>
      </div>
    )
  }

  if (loading && !data) {
    return <p className="text-sm text-muted">Loading prompt…</p>
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  const activeVersionId = data?.slot?.activeVersion?.versionId ?? null
  const isViewingActive = selectedVersionId === activeVersionId
  const hasVersions = (data?.recentVersions.length ?? 0) > 0

  const schemaMismatch = data?.schemaMismatch?.mismatched ? data.schemaMismatch : null
  const responseSchema = data?.responseSchema

  return (
    <div className="space-y-4">
      {schemaMismatch && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="text-amber-950 dark:text-amber-100">{schemaMismatch.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncingSchema || saving}
            onClick={handleSyncSchema}
          >
            {syncingSchema ? 'Syncing…' : 'Sync schema from prompt'}
          </Button>
        </div>
      )}

      {responseSchema?.hasOverride && !schemaMismatch && responseSchema.updatedAt && (
        <p className="text-xs text-muted">
          Response schema synced {formatAdminDateTime(responseSchema.updatedAt)} (runtime override active).
        </p>
      )}

      {!data?.slot?.activeVersion && (
        <p className="text-sm text-muted">
          Prompt not configured. Paste an initial system prompt and save to create version
          1.
        </p>
      )}

      {hasVersions && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label className="text-xs text-muted">Version</Label>
            <Select
              value={selectedVersionId ?? undefined}
              onValueChange={handleVersionChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {data?.recentVersions.map((v) => (
                  <SelectItem key={v.versionId} value={v.versionId}>
                    v{v.versionNumber}
                    {v.isActive ? ' (active)' : ''}
                    {v.changeNote ? ` — ${v.changeNote}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isViewingActive && selectedVersionId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={handleActivate}
            >
              Set as active
            </Button>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <Label className="text-xs text-muted">System prompt</Label>
          {!editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(true)
                setActionError(null)
                setActionMessage(null)
              }}
            >
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setDraft(data?.slot?.activeVersion?.systemPrompt ?? draft)
                  setChangeNote('')
                }}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save new version'}
              </Button>
            </div>
          )}
        </div>
        <textarea
          readOnly={!editing}
          value={draft}
          onChange={(e) => {
            if (editing) setDraft(e.target.value)
          }}
          rows={14}
          className={cn(
            'w-full resize-y rounded-md border border-subtle bg-background px-3 py-2 font-mono text-xs leading-relaxed',
            !editing && 'text-muted-foreground'
          )}
        />
      </div>

      {editing && (
        <div>
          <Label htmlFor="change-note" className="text-xs text-muted">
            Change note (optional)
          </Label>
          <input
            id="change-note"
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder="What changed and why"
          />
          <p className="mt-2 text-xs text-muted">
            Saving creates a new version and activates it. Changes take effect on the
            next agent run (within ~60s). Existing extractions are not updated.
          </p>
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {actionMessage && <p className="text-sm text-muted">{actionMessage}</p>}

      {agent.userPayloadDoc && (
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs font-medium text-muted hover:text-foreground">
            <ChevronDown className="size-3.5" />
            User payload (read-only)
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-subtle bg-muted/30 p-3 font-mono text-xs text-muted">
              {agent.userPayloadDoc}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {agent.sourcePath && (
        <p className="font-mono text-xs text-muted">{agent.sourcePath}/handler.ts</p>
      )}

      {schemaSyncMessage && (
        <PromptSchemaSyncDialog
          open={schemaSyncDialogOpen}
          onOpenChange={setSchemaSyncDialogOpen}
          stepId={stepId}
          message={schemaSyncMessage}
          onSynced={async () => {
            setActionMessage(
              'Response schema synced from prompt OUTPUT. Takes effect on the next agent run (within ~60s).'
            )
            await loadPrompt()
          }}
        />
      )}
    </div>
  )
}

