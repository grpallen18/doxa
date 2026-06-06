import Link from 'next/link'
import { exploreLinkClassName } from '@/lib/explore-link-styles'
import { positionPath } from '@/lib/topic-routes'
import type { Position, Topic } from '@/lib/mock/topic-explore'

export function PositionLinkList({
  topic,
  positions,
  excludePositionId,
  linkTestId = 'position-topic-link',
}: {
  topic: Topic
  positions: Position[]
  excludePositionId?: string
  linkTestId?: string
}) {
  const items = excludePositionId
    ? positions.filter((position) => position.id !== excludePositionId)
    : positions

  return (
    <ul className="list-none space-y-2">
      {items.map((position) => (
        <li key={position.id}>
          <Link
            id={`topic-position-${position.id}`}
            href={positionPath(topic.id, position.id)}
            className={exploreLinkClassName}
            data-testid={linkTestId}
          >
            {position.headline}
          </Link>
        </li>
      ))}
    </ul>
  )
}
