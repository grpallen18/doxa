'use client'

import { useEffect, useRef } from 'react'

const SECTION_IDS = [
  'lifecycle-flowchart',
  'story-info',
  'source-content',
  'chunks',
  'extracted-atoms',
  'audit-history',
]

export function StoryAnchorScroll({
  onSectionVisible,
}: {
  onSectionVisible?: (sectionId: string) => void
}) {
  const onSectionVisibleRef = useRef(onSectionVisible)
  onSectionVisibleRef.current = onSectionVisible

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return

    const resolvedHash = hash === 'source-content' ? 'story-info' : hash
    if (SECTION_IDS.includes(hash) || hash.startsWith('step-')) {
      onSectionVisibleRef.current?.(resolvedHash)
    }

    const target = document.getElementById(hash) ?? document.getElementById(resolvedHash)
    if (!target) return

    const t = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)

    return () => window.clearTimeout(t)
  }, [])

  return null
}
