'use client'

import { Panel } from '@/components/Panel'
import { Separator } from '@/components/ui/separator'
import { positionAccentVar } from '@/lib/topic-explore-ui'
import type { ExploreViewpoint, SampleProposition } from '@/lib/explore/types'
import { PropositionRow } from '@/components/explore/proposition-row'

export function ViewpointPanel({
  viewpoint,
  ordinal,
  onOpenProposition,
}: {
  viewpoint: ExploreViewpoint
  ordinal: number
  onOpenProposition: (prop: SampleProposition) => void
}) {
  const accent = positionAccentVar(ordinal)
  const props = viewpoint.sample_propositions

  return (
    <Panel
      variant="soft"
      interactive={false}
      className="flex h-full flex-col gap-3 border-l-4 p-4"
      style={{ borderLeftColor: accent }}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-snug text-foreground">{viewpoint.label}</h3>
        {viewpoint.summary ? (
          <p className="text-sm leading-relaxed text-muted">{viewpoint.summary}</p>
        ) : null}
      </div>
      <Separator />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Claims</p>
        {props.length === 0 ? (
          <p className="text-sm text-muted">No sample propositions projected yet.</p>
        ) : (
          props.map((p) => (
            <PropositionRow key={p.uid} proposition={p} onOpen={() => onOpenProposition(p)} />
          ))
        )}
      </div>
      {viewpoint.grounding_summary ? (
        <p className="mt-auto rounded-md bg-surface-section px-2 py-1 text-xs text-muted">
          {viewpoint.grounding_summary}
        </p>
      ) : null}
    </Panel>
  )
}
