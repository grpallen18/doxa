import { ClaimLinkList, ControversyLinkList } from '@/components/position-explore-lists'
import {
  narrativeHasSeeAlso,
  narrativeSectionHasRenderAs,
  positionSectionId,
} from '@/lib/position-toc'
import type { Position } from '@/lib/mock/topic-explore'

function WikiSubheading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      className="scroll-mt-[calc(var(--header-height)+1rem)] border-b border-subtle pb-1 text-sm font-semibold text-foreground"
    >
      {children}
    </h3>
  )
}

export function PositionDetailContent({ position }: { position: Position }) {
  const sectionId = positionSectionId(position.id)
  const hasSeeAlso = position.narrative && narrativeHasSeeAlso(position.narrative)
  const hasPrimaryClaimsInNarrative =
    position.narrative &&
    (narrativeSectionHasRenderAs(position.narrative.sections, 'primary-claims') ||
      narrativeSectionHasRenderAs(position.narrative.sections, 'common-claims'))

  if (hasSeeAlso) {
    return null
  }

  return (
    <div className="space-y-6" data-testid="position-detail-content">
      {!position.narrative && (
        <p className="text-sm leading-relaxed text-foreground/90">{position.description}</p>
      )}

      {(!position.narrative || !hasPrimaryClaimsInNarrative) && (
        <div className="space-y-3">
          <WikiSubheading id={`${sectionId}-supporting`}>Key supporting claims</WikiSubheading>
          <ClaimLinkList claims={position.supportingClaims} linkTestId="position-supporting-claim-link" />
        </div>
      )}

      <div className="space-y-3">
        <WikiSubheading id={`${sectionId}-opposing`}>Top opposing claims</WikiSubheading>
        <ClaimLinkList claims={position.opposingClaims} linkTestId="position-opposing-claim-link" />
      </div>

      <div className="space-y-3">
        <WikiSubheading id={`${sectionId}-controversies`}>Related controversies</WikiSubheading>
        <ControversyLinkList
          items={position.relatedControversies}
          linkTestId="position-controversy-link"
        />
      </div>
    </div>
  )
}
