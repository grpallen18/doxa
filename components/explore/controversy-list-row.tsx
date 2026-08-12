import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { controversyPath } from '@/lib/explore-routes'
import type { ExploreControversyListItem } from '@/lib/explore/types'

function formatUpdated(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function ControversyListRow({
  item,
  topicSlug,
}: {
  item: ExploreControversyListItem
  topicSlug?: string | null
}) {
  const href = controversyPath(item.uid, topicSlug ?? item.topic_slug)
  return (
    <Panel
      as={Link}
      href={href}
      variant="soft"
      className="block space-y-2 p-4 no-underline transition-colors hover:bg-surface-soft"
    >
      <p className="text-sm font-medium leading-snug text-foreground">{item.question}</p>
      {item.summary ? (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted">{item.summary}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-md bg-surface-section px-2 py-0.5">
          {item.sides_count} side{item.sides_count === 1 ? '' : 's'}
        </span>
        {item.source_count > 0 ? (
          <span className="rounded-md bg-surface-section px-2 py-0.5">
            {item.source_count} source{item.source_count === 1 ? '' : 's'}
          </span>
        ) : null}
        {item.updated_at ? <span>Updated {formatUpdated(item.updated_at)}</span> : null}
      </div>
    </Panel>
  )
}
