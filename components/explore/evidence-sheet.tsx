'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ExploreEvidenceExcerpt, SampleProposition } from '@/lib/explore/types'
import { toast } from 'sonner'

const CRITIQUE_REASONS = [
  { value: 'missing_fact', label: 'Missing fact' },
  { value: 'bad_representation', label: 'Bad representation' },
  { value: 'weak_support', label: 'Weak support' },
  { value: 'other', label: 'Other' },
] as const

export function EvidenceSheet({
  open,
  onOpenChange,
  controversyUid,
  proposition,
  isAuthenticated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controversyUid: string
  proposition: SampleProposition | null
  isAuthenticated: boolean
}) {
  const [excerpts, setExcerpts] = useState<ExploreEvidenceExcerpt[]>([])
  const [loading, setLoading] = useState(false)
  const [reason, setReason] = useState<string>('weak_support')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !proposition) return
    let cancelled = false
    setLoading(true)
    fetch(
      `/api/explore/controversies/${encodeURIComponent(controversyUid)}/evidence?proposition_uid=${encodeURIComponent(proposition.uid)}`
    )
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load evidence')
        if (!cancelled) setExcerpts(json.excerpts ?? [])
      })
      .catch((err) => {
        if (!cancelled) {
          setExcerpts([])
          toast.error(err instanceof Error ? err.message : 'Failed to load evidence')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, proposition, controversyUid])

  const submitCritique = async () => {
    if (!proposition) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/explore/critiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_kind: 'proposition',
          target_uid: proposition.uid,
          reason,
          detail: detail.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')
      toast.success('Thanks — feedback recorded')
      setDetail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Feedback failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="text-base leading-snug">Evidence</SheetTitle>
          <SheetDescription className="text-sm leading-relaxed text-foreground">
            {proposition?.text}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="rounded-md bg-surface-section px-2 py-0.5 text-xs text-muted">
              Grounded in source utterances
            </span>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1 px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted">Loading excerpts…</p>
          ) : excerpts.length === 0 ? (
            <Panel variant="soft" interactive={false} className="p-4 text-sm text-muted">
              No projected excerpts for this claim yet. Re-run debate projection after analysis to
              populate quotes.
            </Panel>
          ) : (
            <div className="space-y-3">
              {excerpts.map((e) => (
                <Panel key={e.id} variant="soft" interactive={false} className="space-y-2 p-4">
                  <p className="text-xs text-muted">
                    {[e.speaker_name, e.publication_name || e.story_title].filter(Boolean).join(' · ') ||
                      'Source utterance'}
                  </p>
                  <blockquote className="border-l-2 border-accent-primary pl-3 text-sm leading-relaxed text-foreground">
                    {e.excerpt}
                  </blockquote>
                  {e.story_url ? (
                    <a
                      href={e.story_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary inline-flex text-sm"
                    >
                      Read source
                    </a>
                  ) : null}
                </Panel>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border px-5 py-4">
          {isAuthenticated ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Structured feedback
              </p>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Reason" />
                </SelectTrigger>
                <SelectContent>
                  {CRITIQUE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Optional detail"
                rows={3}
              />
              <Button variant="primary" onClick={submitCritique} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit feedback'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              <Link href="/login" className="doxa-link">
                Sign in
              </Link>{' '}
              to leave structured feedback on this claim.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
