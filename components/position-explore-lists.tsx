import { cn } from '@/lib/utils'
import { DoxaLink } from '@/components/doxa-link'
import { exploreLinkGridClassName, exploreLinkGridItemClassName, type ExploreLinkListLayout } from '@/lib/explore-link-styles'
import { positionPath } from '@/lib/topic-routes'
import type { OpposingClaim, Position, RelatedControversy, SupportingClaim, Topic } from '@/lib/mock/topic-explore'

function ExploreLinkList({
  items,
  linkTestId,
  layout = 'stack',
}: {
  items: { id: string; label: string; href: string }[]
  linkTestId?: string
  layout?: ExploreLinkListLayout
}) {
  const truncate = layout === 'auto-grid'

  return (
    <ul
      className={cn(
        'list-none',
        layout === 'auto-grid' ? exploreLinkGridClassName : 'space-y-2'
      )}
    >
      {items.map((item) => (
        <li key={item.id} className={truncate ? exploreLinkGridItemClassName : undefined}>
          <DoxaLink href={item.href} truncate={truncate} data-testid={linkTestId}>
            {item.label}
          </DoxaLink>
        </li>
      ))}
    </ul>
  )
}

export function ClaimLinkList({
  claims,
  linkTestId,
  layout = 'stack',
}: {
  claims: SupportingClaim[] | OpposingClaim[]
  linkTestId?: string
  layout?: ExploreLinkListLayout
}) {
  return (
    <ExploreLinkList
      linkTestId={linkTestId}
      layout={layout}
      items={claims.map((claim) => ({
        id: claim.id,
        label: claim.text,
        href: `#${claim.id}`,
      }))}
    />
  )
}

export function ControversyLinkList({
  items,
  linkTestId,
  layout = 'stack',
}: {
  items: RelatedControversy[]
  linkTestId?: string
  layout?: ExploreLinkListLayout
}) {
  return (
    <ExploreLinkList
      linkTestId={linkTestId}
      layout={layout}
      items={items.map((item) => ({
        id: item.id,
        label: item.title,
        href: `#${item.id}`,
      }))}
    />
  )
}

export function CounterClaimsList({
  topic,
  position,
  positionId,
  linkTestId = 'position-counter-claim-link',
  layout = 'stack',
}: {
  topic: Topic
  position: Position
  positionId: string
  linkTestId?: string
  layout?: ExploreLinkListLayout
}) {
  const items = [
    ...topic.positions
      .filter((item) => item.id !== positionId)
      .map((item) => ({
        id: item.id,
        label: item.headline,
        href: positionPath(topic.id, item.id),
      })),
    ...position.opposingClaims.map((claim) => ({
      id: claim.id,
      label: claim.text,
      href: `#${claim.id}`,
    })),
    ...position.relatedControversies.map((item) => ({
      id: item.id,
      label: item.title,
      href: `#${item.id}`,
    })),
  ]

  return (
    <ExploreLinkList
      linkTestId={linkTestId}
      layout={layout}
      items={items}
    />
  )
}
