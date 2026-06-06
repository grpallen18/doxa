import Link from 'next/link'
import { exploreLinkClassName } from '@/lib/explore-link-styles'
import type { Position, RelatedControversy, SupportingClaim } from '@/lib/mock/topic-explore'
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

function ExploreLinkList({
  items,
  linkTestId,
}: {
  items: { id: string; label: string; href: string }[]
  linkTestId?: string
}) {
  return (
    <ul className="list-none space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className={exploreLinkClassName} data-testid={linkTestId}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ClaimList({
  claims,
  linkTestId,
}: {
  claims: SupportingClaim[]
  linkTestId?: string
}) {
  return (
    <ExploreLinkList
      linkTestId={linkTestId}
      items={claims.map((claim) => ({
        id: claim.id,
        label: claim.text,
        href: `#${claim.id}`,
      }))}
    />
  )
}

function ControversyList({
  items,
  linkTestId,
}: {
  items: RelatedControversy[]
  linkTestId?: string
}) {
  return (
    <ExploreLinkList
      linkTestId={linkTestId}
      items={items.map((item) => ({
        id: item.id,
        label: item.title,
        href: `#${item.id}`,
      }))}
    />
  )
}

export function PositionDetailContent({ position }: { position: Position }) {
  const sectionId = `position-${position.id}`

  return (
    <div className="space-y-6" data-testid="position-detail-content">
      {!position.narrative && (
        <p className="text-sm leading-relaxed text-foreground/90">{position.description}</p>
      )}

      <div className="space-y-3">
        <WikiSubheading id={`${sectionId}-supporting`}>Key supporting claims</WikiSubheading>
        <ClaimList claims={position.supportingClaims} linkTestId="position-supporting-claim-link" />
      </div>

      <div className="space-y-3">
        <WikiSubheading id={`${sectionId}-opposing`}>Top opposing claims</WikiSubheading>
        <ClaimList claims={position.opposingClaims} linkTestId="position-opposing-claim-link" />
      </div>

      <div className="space-y-3">
        <WikiSubheading id={`${sectionId}-controversies`}>Related controversies</WikiSubheading>
        <ControversyList
          items={position.relatedControversies}
          linkTestId="position-controversy-link"
        />
      </div>
    </div>
  )
}
