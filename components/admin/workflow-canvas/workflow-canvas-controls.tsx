'use client'

import { Map, ZoomIn, ZoomOut } from 'lucide-react'
import { Panel, useReactFlow } from '@xyflow/react'
import { FIT_VIEW_OPTIONS } from '@/components/admin/workflow-canvas/workflow-canvas-constants'

export function WorkflowCanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <Panel position="bottom-center" className="!m-0 mb-4">
      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1 shadow-lg backdrop-blur-md">
        <button
          type="button"
          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoomOut({ duration: 200 })}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => zoomIn({ duration: 200 })}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          title="Fit view"
          aria-label="Fit view"
          onClick={() => fitView(FIT_VIEW_OPTIONS)}
        >
          <Map className="h-4 w-4" />
        </button>
      </div>
    </Panel>
  )
}
