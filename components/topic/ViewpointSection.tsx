'use client'

import { Viewpoint } from '@/lib/types'
import { Panel } from '@/components/Panel'

interface ViewpointSectionProps {
  viewpoint: Viewpoint
  /** When true, omit the panel styling so the content sits inside a parent Panel. */
  embedInPanel?: boolean
}

export default function ViewpointSection({
  viewpoint,
  embedInPanel = false,
}: ViewpointSectionProps) {
  return (
    <div
      className={
        embedInPanel
          ? 'min-w-0 space-y-4 p-5'
          : 'panel-bevel-soft space-y-4 p-5'
      }
    >
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{viewpoint.title}</h3>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-foreground">{viewpoint.summary}</p>
      </div>
    </div>
  )
}
