'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, X } from 'lucide-react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { chunkAgentFlowHref } from '@/lib/admin/story-lifecycle'
import { chunkNeedsAction } from '@/lib/admin/pipeline-status/chunk-phase'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

function PhaseBadge({ label, tone }: { label: string; tone: 'muted' | 'action' | 'done' | 'warn' }) {
  const classes = {
    muted: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    action: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
    done: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    warn: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  }[tone]

  return (
    <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium', classes)}>
      {label}
    </span>
  )
}

function phaseTone(phase: string): 'muted' | 'action' | 'done' | 'warn' {
  if (phase === 'complete') return 'done'
  if (phase === 'needs_human') return 'warn'
  if (phase === 'not_started') return 'muted'
  return 'action'
}

export function ChunkWorkflowDrawer({
  open,
  onOpenChange,
  storyId,
  payload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  storyId: string
  payload: StoryExtractionReviewPayload
}) {
  const [needsActionOnly, setNeedsActionOnly] = useState(false)

  const rows = useMemo(() => {
    const storyRef = {
      story_id: payload.story.story_id,
      friendly_id: payload.story.friendly_id,
    }
    return payload.chunks
      .filter((chunk) => chunk.content != null && chunk.content.length > 0)
      .filter((chunk) => {
        if (!needsActionOnly) return true
        return (
          chunkNeedsAction('claims', chunk) ||
          chunkNeedsAction('positions', chunk)
        )
      })
      .map((chunk) => ({
        chunk,
        href: chunkAgentFlowHref(storyRef, { friendly_id: chunk.friendly_id }),
      }))
  }, [payload, needsActionOnly])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="workflow-canvas-dark w-full sm:max-w-lg border-white/10 bg-zinc-950 text-zinc-100"
      >
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Chunk workflows</SheetTitle>
          <SheetDescription className="text-zinc-400">
            Each chunk has its own extract → review → refine loop. Open a chunk to run or revert
            steps.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={needsActionOnly ? 'secondary' : 'outline'}
            className="h-8 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            onClick={() => setNeedsActionOnly((v) => !v)}
          >
            {needsActionOnly ? 'Showing needs action' : 'Needs action only'}
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-400">No chunks match this filter.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {rows.map(({ chunk, href }) => (
              <li key={chunk.friendly_id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">{chunk.friendly_id}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <PhaseBadge
                        label={`Claims: ${chunk.claims_lane_phase_label}`}
                        tone={phaseTone(chunk.claims_lane_phase)}
                      />
                      <PhaseBadge
                        label={`Positions: ${chunk.positions_lane_phase_label}`}
                        tone={phaseTone(chunk.positions_lane_phase)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-indigo-300 hover:bg-white/10 hover:text-indigo-200"
                    asChild
                  >
                    <Link href={href} onClick={() => onOpenChange(false)}>
                      Open
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="absolute right-4 top-4 rounded-md p-1 text-zinc-400 hover:text-zinc-200 sm:hidden"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </SheetContent>
    </Sheet>
  )
}
