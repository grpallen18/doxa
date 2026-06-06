import { cn } from '@/lib/utils'
import { DoxaLink } from '@/components/doxa-link'
import { exploreLinkGridClassName, exploreLinkGridItemClassName, type ExploreLinkListLayout } from '@/lib/explore-link-styles'
import { positionPath } from '@/lib/topic-routes'
import type { Position, Topic } from '@/lib/mock/topic-explore'

export function PositionLinkList({
  topic,
  positions,
  excludePositionId,
  linkTestId = 'position-topic-link',
  layout = 'stack',
}: {
  topic: Topic
  positions: Position[]
  excludePositionId?: string
  linkTestId?: string
  layout?: ExploreLinkListLayout
}) {
  const items = excludePositionId
    ? positions.filter((position) => position.id !== excludePositionId)
    : positions
  const truncate = layout === 'auto-grid'

  return (
    <ul
      className={cn(
        'list-none',
        layout === 'auto-grid' ? exploreLinkGridClassName : 'space-y-2'
      )}
    >
      {items.map((position) => (
        <li key={position.id} className={truncate ? exploreLinkGridItemClassName : undefined}>
          <DoxaLink
            id={`topic-position-${position.id}`}
            href={positionPath(topic.id, position.id)}
            truncate={truncate}
            data-testid={linkTestId}
          >
            {position.headline}
          </DoxaLink>
        </li>
      ))}
    </ul>
  )
}
