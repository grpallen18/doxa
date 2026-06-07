'use client'

import { useEffect } from 'react'

const SECTION_IDS = [
  'lifecycle',
  'story-info',
  'source-content',
  'extracted-atoms',
  'agent-outputs',
  'validation-review',
  'merge-results',
  'post-merge-actions',
  'audit-history',
]

export function StoryAnchorScroll({
  onSectionVisible,
}: {
  onSectionVisible?: (sectionId: string) => void
}) {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return

    const scrollToTarget = () => {
      const target = document.getElementById(hash)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onSectionVisible?.(hash)
    }

    const t = window.setTimeout(scrollToTarget, 100)
    return () => window.clearTimeout(t)
  }, [onSectionVisible])

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (hash && SECTION_IDS.includes(hash)) {
      onSectionVisible?.(hash)
    }
  }, [onSectionVisible])

  return null
}
