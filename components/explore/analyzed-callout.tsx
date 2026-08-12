import { Panel } from '@/components/Panel'
import type { ExploreAssessment } from '@/lib/explore/types'

export function AnalyzedCallout({ assessments }: { assessments: ExploreAssessment[] }) {
  if (!assessments.length) return null
  return (
    <Panel variant="soft" interactive={false} className="space-y-3 p-5" id="analyzed">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Analyzed</p>
      <p className="text-xs text-muted">
        Model-derived framing and coherence notes — not extracted source facts.
      </p>
      <ul className="space-y-3">
        {assessments.map((a) => (
          <li key={a.uid} className="space-y-1">
            {a.kind ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{a.kind}</p>
            ) : null}
            <p className="text-sm leading-relaxed text-foreground">{a.summary}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
