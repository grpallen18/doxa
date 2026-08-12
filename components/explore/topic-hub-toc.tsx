'use client'

import { useMemo } from 'react'
import { useRegisterToc } from '@/components/topic-explore-context'
import { homePath } from '@/lib/explore-routes'

export function TopicHubToc({
  title,
  hasFacts,
  hasAnalyzed,
  hasRelated,
}: {
  title: string
  hasFacts: boolean
  hasAnalyzed: boolean
  hasRelated: boolean
}) {
  const sections = useMemo(
    () => [
      { id: 'topic-title', title },
      ...(hasFacts ? [{ id: 'core-facts', title: 'Core facts' }] : []),
      { id: 'controversies', title: 'Controversies' },
      ...(hasAnalyzed ? [{ id: 'analyzed', title: 'Analyzed' }] : []),
      ...(hasRelated ? [{ id: 'related-topics', title: 'Related topics' }] : []),
    ],
    [title, hasFacts, hasAnalyzed, hasRelated]
  )

  useRegisterToc({
    sections,
    backLink: { href: homePath(), label: 'Explore' },
  })

  return null
}
