'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  deriveStageSummaries,
  type StageSummary,
  type StageSummaryStatus,
} from '@/lib/admin/pipeline-status'
import { cn } from '@/lib/utils'

const STAGE_BORDER = 'border-[#7a6249] dark:border-[#a68b6d]'
const STAGE_BORDER_ACTIVE = 'border-black dark:border-black'
const STAGE_COMPLETE = 'bg-[#7a6249] text-white dark:bg-[#7a6249] dark:text-white'
const STAGE_CURRENT =
  'bg-[#c9b08a] text-[#5c4a38] dark:bg-[#a68b6d] dark:text-[#2d241c]'
const STAGE_PENDING = 'bg-white dark:bg-white'
const TRACK_COMPLETE = 'bg-[#7a6249] dark:bg-[#7a6249]'
const TRACK_MUTED = 'bg-[#7a6249]/25 dark:bg-[#a68b6d]/30'
const TRACK_TOP = 'calc(0.125rem + 0.875rem)'
const STAGE_COUNT = 4
const TRACK_INSET = `${100 / STAGE_COUNT / 2}%`

function stageBorderClass(active: boolean) {
  return active ? STAGE_BORDER_ACTIVE : STAGE_BORDER
}

const nodeLinkClass =
  'group z-10 flex min-w-0 flex-col items-center gap-1.5 px-1 text-center transition-opacity'

const nodeLabelClass =
  'w-full text-xs font-medium leading-tight text-foreground sm:text-[0.8125rem]'

function segmentClass(afterStatus: StageSummaryStatus | 'hub'): string {
  if (afterStatus === 'hub') return TRACK_MUTED
  if (afterStatus === 'complete') return TRACK_COMPLETE
  if (afterStatus === 'blocked') return 'bg-destructive/50'
  return TRACK_MUTED
}

function StoryProgressNode({ href, active }: { href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        nodeLinkClass,
        active ? 'opacity-100' : 'opacity-90 hover:opacity-100'
      )}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          stageBorderClass(active),
          STAGE_COMPLETE
        )}
        aria-hidden
      />
      <p className={nodeLabelClass}>Story</p>
    </Link>
  )
}

function StageTimelineNode({
  stage,
  active,
}: {
  stage: StageSummary
  active: boolean
}) {
  const { status, label, href } = stage

  return (
    <Link
      href={href}
      className={cn(
        nodeLinkClass,
        active ? 'opacity-100' : 'opacity-90 hover:opacity-100'
      )}
    >
      <div
        className={cn(
          'relative flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          stageBorderClass(active),
          status === 'complete' && STAGE_COMPLETE,
          status === 'current' && STAGE_CURRENT,
          status === 'blocked' && 'bg-destructive/80 text-white',
          status === 'pending' && STAGE_PENDING
        )}
      >
        {status === 'complete' && <Check className="size-3.5 stroke-[2.5]" aria-hidden />}
        {status === 'current' && (
          <Loader2 className="size-3.5 animate-spin stroke-[2.5]" aria-hidden />
        )}
      </div>
      <p className={cn(nodeLabelClass, 'break-words')}>{label}</p>
    </Link>
  )
}

export function PipelineStepper({
  storyId,
  payload,
}: {
  storyId: string
  payload: StoryExtractionReviewPayload
}) {
  const pathname = usePathname()
  const summaries = useMemo(() => deriveStageSummaries(storyId, payload), [storyId, payload])
  const hubHref = `/admin/stories/${storyId}`
  const onHub = pathname === hubHref

  const trackSegments: Array<{ key: string; after: StageSummaryStatus | 'hub' }> = [
    { key: 'hub-ingestion', after: 'hub' },
    ...summaries.slice(0, -1).map((stage) => ({
      key: `${stage.stageId}-segment`,
      after: stage.status,
    })),
  ]

  return (
    <nav aria-label="Pipeline stages" className="w-full overflow-y-visible px-0.5 pt-1.5">
      <div className="relative w-full min-w-0 pt-0.5">
        <div
          className="pointer-events-none absolute flex h-0.5 -translate-y-1/2"
          style={{
            top: TRACK_TOP,
            left: TRACK_INSET,
            width: `calc(100% - ${100 / STAGE_COUNT}%)`,
          }}
          aria-hidden
        >
          {trackSegments.map((segment) => (
            <div
              key={segment.key}
              className={cn('h-full flex-1', segmentClass(segment.after))}
            />
          ))}
        </div>

        <div className="relative grid w-full grid-cols-4 items-start">
          <div className="flex min-w-0 justify-center">
            <StoryProgressNode href={hubHref} active={onHub} />
          </div>
          {summaries.map((stage) => {
            const active = pathname === stage.href
            return (
              <div key={stage.stageId} className="flex min-w-0 justify-center">
                <StageTimelineNode stage={stage} active={active} />
              </div>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
