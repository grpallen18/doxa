'use client'

import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { ConfidenceBadge } from '@/components/admin/record/confidence-badge'

export function RelationshipPanel({ payload }: { payload: StoryExtractionReviewPayload }) {
  const { links, claims, positions, events, evidence } = payload

  const claimById = new Map(claims.map((c) => [c.story_claim_id, c]))
  const positionById = new Map(positions.map((p) => [p.story_position_id, p]))
  const eventById = new Map(events.map((e) => [e.story_event_id, e]))
  const evidenceById = new Map(evidence.map((e) => [e.evidence_id, e]))

  const hasLinks =
    links.claimEvidence.length > 0 ||
    links.claimPosition.length > 0 ||
    links.eventClaim.length > 0 ||
    links.positionEvidence.length > 0

  if (!hasLinks) {
    return <p className="text-xs text-muted">No story-local relationships recorded.</p>
  }

  return (
    <div className="space-y-4 text-sm">
      {links.claimEvidence.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Claim ↔ evidence
          </h3>
          <ul className="mt-2 space-y-2">
            {links.claimEvidence.map((link) => {
              const claim = claimById.get(link.story_claim_id)
              const ev = evidenceById.get(link.evidence_id)
              return (
                <li
                  key={`${link.story_claim_id}-${link.evidence_id}`}
                  className="rounded-md border border-subtle px-3 py-2 text-xs"
                >
                  <p className="font-medium">{claim?.raw_text?.slice(0, 120) ?? link.story_claim_id}</p>
                  <p className="mt-1 text-muted">{ev?.excerpt?.slice(0, 160) ?? link.evidence_id}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="text-muted">{link.relation_type}</span>
                    <ConfidenceBadge value={link.confidence} />
                  </div>
                  {link.rationale && (
                    <p className="mt-1 text-muted italic">{link.rationale}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {links.claimPosition.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Position ↔ claim
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {links.claimPosition.map((link) => (
              <li key={`${link.story_position_id}-${link.story_claim_id}`}>
                {positionById.get(link.story_position_id)?.raw_text?.slice(0, 80) ?? link.story_position_id}
                {' → '}
                {claimById.get(link.story_claim_id)?.raw_text?.slice(0, 80) ?? link.story_claim_id}
              </li>
            ))}
          </ul>
        </section>
      )}

      {links.eventClaim.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Event ↔ claim
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {links.eventClaim.map((link) => (
              <li key={`${link.story_event_id}-${link.story_claim_id}`}>
                {eventById.get(link.story_event_id)?.event_summary?.slice(0, 80) ?? link.story_event_id}
                {' → '}
                {claimById.get(link.story_claim_id)?.raw_text?.slice(0, 80) ?? link.story_claim_id}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
