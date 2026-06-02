'use client'

import { Sparkles } from 'lucide-react'
import { StepDetailReveal } from '@/app/admin/stories/step-detail-reveal'
import { Panel } from '@/components/Panel'
import { cn } from '@/lib/utils'
import type { Topic } from '@/lib/mock/topic-explore'

export function TopicBriefPanel({ topic }: { topic: Topic }) {
  return (
    <Panel
      variant="soft"
      interactive={false}
      className={cn('p-5', 'bg-[color-mix(in_srgb,var(--accent-secondary)_10%,var(--surface))]')}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2" data-no-reveal>
          <Sparkles className="size-4 text-accent-secondary" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">AI Topic Brief</h2>
        </div>
        <StepDetailReveal active key={topic.id}>
          <div className="space-y-3">
            {topic.briefParagraphs.map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground/90">
                {paragraph}
              </p>
            ))}
          </div>
        </StepDetailReveal>
      </div>
    </Panel>
  )
}
