'use client'

import { useEffect, useState } from 'react'
import { Panel } from '@/components/Panel'
import type { VizNode } from './types'

interface StoryClaimWithStory {
  story_claim_id: string
  story_id: string
  raw_text: string
  polarity: string
  stance: string | null
  extraction_confidence: number
  created_at: string
  stories: {
    story_id: string
    title: string
    url: string
    published_at: string | null
    sources: { source_id: string; name: string } | null
  } | null
}

interface AtlasSidePanelProps {
  node: VizNode | null
  onClose?: () => void
}

export default function AtlasSidePanel({ node, onClose }: AtlasSidePanelProps) {
  const [claimDetail, setClaimDetail] = useState<{ canonical_text: string } | null>(null)
  const [storyClaims, setStoryClaims] = useState<StoryClaimWithStory[]>([])
  const [thesisDetail, setThesisDetail] = useState<{ thesis_text: string; label: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!node) {
      setClaimDetail(null)
      setStoryClaims([])
      setThesisDetail(null)
      return
    }

    setLoading(true)
    const key = `${node.entity_type}:${node.entity_id}`

    if (node.entity_type === 'thesis') {
      fetch(`/api/atlas/theses/${node.entity_id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.data) setThesisDetail(d.data)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
      setClaimDetail(null)
      setStoryClaims([])
    } else if (node.entity_type === 'claim') {
      fetch(`/api/atlas/claims/${node.entity_id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.data) setClaimDetail(d.data)
        })
        .catch(() => {})
      fetch(`/api/atlas/claims/${node.entity_id}/story-claims`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.data) setStoryClaims(d.data)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
      setThesisDetail(null)
    } else {
      setClaimDetail(null)
      setThesisDetail(null)
      setStoryClaims([])
      setLoading(false)
    }
  }, [node?.entity_type, node?.entity_id])

  if (!node) return null

  return (
    <Panel variant="soft" className="flex h-full flex-col overflow-hidden p-4">
      <div className="flex items-center justify-between gap-2 border-b border-subtle pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {node.entity_type}
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground"
            aria-label="Close panel"
          >
            ×
          </button>
        )}
      </div>

      <div className="mt-3 flex-1 overflow-y-auto text-sm">
        {loading && (
          <p className="text-muted">Loading…</p>
        )}

        {node.entity_type === 'thesis' && thesisDetail && (
          <div className="space-y-3">
            {thesisDetail.label && (
              <p className="font-medium text-foreground">{thesisDetail.label}</p>
            )}
            <p className="text-muted">{thesisDetail.thesis_text}</p>
          </div>
        )}

        {node.entity_type === 'claim' && claimDetail && (
          <div className="space-y-4">
            <p className="text-foreground">{claimDetail.canonical_text}</p>
            {storyClaims.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted">Story claims</h4>
                <ul className="space-y-2">
                  {storyClaims.map((sc) => (
                    <li key={sc.story_claim_id} className="border-l-2 border-subtle pl-3">
                      <p className="text-foreground">{sc.raw_text}</p>
                      {sc.stories && (
                        <a
                          href={sc.stories.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-xs text-accent-primary hover:underline"
                        >
                          {sc.stories.title}
                          {sc.stories.sources?.name && ` — ${sc.stories.sources.name}`}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {node.entity_type === 'story_claim' && (
          <p className="text-muted">Story claim details (expand from claim)</p>
        )}
      </div>
    </Panel>
  )
}
