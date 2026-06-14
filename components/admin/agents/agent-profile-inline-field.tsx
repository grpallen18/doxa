'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Pencil, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  showPipelineError,
  showPipelineSuccess,
} from '@/lib/admin/pipeline-toast'
import type { ResolvedAgentProfile } from '@/lib/admin/agent-display-names'
import {
  AGENT_BIO_MAX_LENGTH,
  AGENT_DISPLAY_NAME_MAX_LENGTH,
  AGENT_JOB_TITLE_MAX_LENGTH,
} from '@/lib/admin/agent-display-names'
import { cn } from '@/lib/utils'

const DISPLAY_NAME_CLASS =
  'text-xl font-semibold tracking-tight text-[var(--record-section-header-fg)] sm:text-2xl md:text-2xl'
const JOB_TITLE_CLASS = 'text-sm font-medium text-[var(--record-section-header-fg)]/90'
const BIO_CLASS = 'max-w-2xl text-sm leading-relaxed text-muted'

const EDITABLE_FIELD_CLASS =
  'block h-auto min-h-0 rounded border border-subtle bg-background px-1.5 py-0 shadow-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

/** Two icon buttons (32px each + gap) in the absolute toolbar. */
const PROFILE_TOOLBAR_PAD = 'pr-[4.5rem]'

type ProfileDraft = {
  displayName: string
  jobTitle: string
  bio: string
}

function draftFromProfile(profile: ResolvedAgentProfile): ProfileDraft {
  return {
    displayName: profile.displayName,
    jobTitle: profile.jobTitle,
    bio: profile.bio,
  }
}

function hasProfileOverrides(profile: ResolvedAgentProfile): boolean {
  return (
    profile.displayNameOverride != null ||
    profile.jobTitleOverride != null ||
    profile.bioOverride != null
  )
}

function resolvePatchValue(
  draft: string,
  current: string,
  defaultValue: string
): string | null | undefined {
  const trimmed = draft.trim()
  if (!trimmed) return null
  if (trimmed === defaultValue) return null
  if (trimmed === current) return undefined
  return trimmed
}

export function AgentProfileEditor({
  stepId,
  profile,
  departmentLabel,
  optionalBadge,
  identityRow,
  metrics,
  footer,
  onSaved,
}: {
  stepId: string
  profile: ResolvedAgentProfile
  departmentLabel: string
  optionalBadge?: ReactNode
  identityRow: ReactNode
  metrics: ReactNode
  footer?: ReactNode
  onSaved: (profile: ResolvedAgentProfile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(profile))
  const [saving, setSaving] = useState(false)
  const displayNameRef = useRef<HTMLInputElement>(null)
  const bioRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(draftFromProfile(profile))
  }, [profile, editing])

  useEffect(() => {
    if (!editing) return
    displayNameRef.current?.focus()
    displayNameRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const el = bioRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing, draft.bio])

  function startEditing() {
    setDraft(draftFromProfile(profile))
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(draftFromProfile(profile))
    setEditing(false)
  }

  async function persist(patch: Partial<Record<'displayName' | 'jobTitle' | 'bio', string | null>>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/agents/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = (await res.json()) as {
        data?: ResolvedAgentProfile
        error?: { message?: string }
      }

      if (!res.ok || !json.data) {
        showPipelineError(json.error?.message ?? 'Failed to update profile')
        return
      }

      onSaved(json.data)
      setEditing(false)
      showPipelineSuccess(
        hasProfileOverrides(json.data) ? 'Profile updated' : 'Profile reset to defaults'
      )
    } catch {
      showPipelineError('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function saveEditing() {
    const displayName = draft.displayName.trim()
    const jobTitle = draft.jobTitle.trim()
    const bio = draft.bio.trim()

    if (!displayName) {
      showPipelineError('Display name is required')
      return
    }
    if (!jobTitle) {
      showPipelineError('Job title is required')
      return
    }
    if (!bio) {
      showPipelineError('Description is required')
      return
    }

    const patch: Partial<Record<'displayName' | 'jobTitle' | 'bio', string | null>> = {}

    const displayNamePatch = resolvePatchValue(
      displayName,
      profile.displayName,
      profile.defaultDisplayName
    )
    if (displayNamePatch !== undefined) patch.displayName = displayNamePatch

    const jobTitlePatch = resolvePatchValue(
      jobTitle,
      profile.jobTitle,
      profile.defaultJobTitle
    )
    if (jobTitlePatch !== undefined) patch.jobTitle = jobTitlePatch

    const bioPatch = resolvePatchValue(bio, profile.bio, profile.defaultBio)
    if (bioPatch !== undefined) patch.bio = bioPatch

    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }

    await persist(patch)
  }

  async function resetAll() {
    await persist({
      displayName: null,
      jobTitle: null,
      bio: null,
    })
  }

  const toolbar = (
    <div className="absolute right-0 top-0 flex items-center gap-0.5">
      {editing ? (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
            disabled={saving}
            aria-label="Cancel editing"
            onClick={cancelEditing}
          >
            <X className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-green-600 hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-500/15 dark:hover:text-green-300"
            disabled={saving}
            aria-label="Save profile"
            onClick={() => void saveEditing()}
          >
            <Check className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-muted hover:text-[var(--record-section-header-fg)]"
            aria-label="Edit profile"
            onClick={startEditing}
          >
            <Pencil className="size-3.5" />
          </Button>
          {hasProfileOverrides(profile) ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-muted hover:text-[var(--record-section-header-fg)]"
              aria-label="Reset profile to defaults"
              disabled={saving}
              onClick={() => void resetAll()}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : null}
        </>
      )}
    </div>
  )

  if (editing) {
    return (
      <div className={cn('relative flex flex-col gap-4', PROFILE_TOOLBAR_PAD)}>
        {toolbar}
        <div className="flex min-w-0 items-stretch gap-4">
          {identityRow}
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Input
                ref={displayNameRef}
                value={draft.displayName}
                onChange={(e) => setDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                maxLength={AGENT_DISPLAY_NAME_MAX_LENGTH}
                disabled={saving}
                className={cn(
                  DISPLAY_NAME_CLASS,
                  EDITABLE_FIELD_CLASS,
                  'min-w-0 w-auto max-w-full flex-1'
                )}
                aria-label="Display name"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelEditing()
                  }
                }}
              />
              {optionalBadge}
            </div>
            <Input
              value={draft.jobTitle}
              onChange={(e) => setDraft((prev) => ({ ...prev, jobTitle: e.target.value }))}
              maxLength={AGENT_JOB_TITLE_MAX_LENGTH}
              disabled={saving}
              className={cn(JOB_TITLE_CLASS, EDITABLE_FIELD_CLASS, 'w-full max-w-none')}
              aria-label="Job title"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelEditing()
                }
              }}
            />
            <p className="text-sm text-muted">{departmentLabel}</p>
          </div>
        </div>

        {metrics}

        <Textarea
          ref={bioRef}
          value={draft.bio}
          onChange={(e) => setDraft((prev) => ({ ...prev, bio: e.target.value }))}
          maxLength={AGENT_BIO_MAX_LENGTH}
          disabled={saving}
          rows={1}
          className={cn(
            BIO_CLASS,
            EDITABLE_FIELD_CLASS,
            'w-full max-w-none resize-none overflow-hidden [field-sizing:content]'
          )}
          aria-label="Description"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              cancelEditing()
            }
          }}
        />

        {footer}
      </div>
    )
  }

  return (
    <div className={cn('relative flex flex-col gap-4', PROFILE_TOOLBAR_PAD)}>
      {toolbar}
      <div className="flex min-w-0 items-stretch gap-4">
        {identityRow}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={DISPLAY_NAME_CLASS}>{profile.displayName}</h1>
            {optionalBadge}
          </div>
          <p className={JOB_TITLE_CLASS}>{profile.jobTitle}</p>
          <p className="text-sm text-muted">{departmentLabel}</p>
        </div>
      </div>

      {metrics}

      <p className={BIO_CLASS}>{profile.bio}</p>

      {footer}
    </div>
  )
}
