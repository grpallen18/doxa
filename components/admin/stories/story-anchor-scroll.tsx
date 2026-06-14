'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { storyAgentFlowHref } from '@/lib/admin/story-lifecycle'
import { getVisionNodeIdForStep } from '@/lib/admin/workflow-canvas/vision-node-step-map'

const SECTION_IDS = [
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
  const router = useRouter()
  const { payload } = useStoryReview()
  const onSectionVisibleRef = useRef(onSectionVisible)
  onSectionVisibleRef.current = onSectionVisible

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return

    if (payload && (hash === 'lifecycle-flowchart' || hash.startsWith('step-'))) {
      const stepId = hash.startsWith('step-') ? (hash.slice(5) as PipelineStepId) : null
      const nodeId = stepId ? getVisionNodeIdForStep(stepId) : null
      router.replace(storyAgentFlowHref(payload.story, { nodeId }))
      return
    }

    const resolvedHash = hash === 'source-content' ? 'story-info' : hash
    if (SECTION_IDS.includes(hash)) {
      onSectionVisibleRef.current?.(resolvedHash)
    }

    const target = document.getElementById(hash) ?? document.getElementById(resolvedHash)
    if (!target) return

    const t = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)

    return () => window.clearTimeout(t)
  }, [payload, router])

  return null
}
