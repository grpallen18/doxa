'use client'

import { useCamera, useSigma } from '@react-sigma/core'
import { Minus, Plus, Scan } from 'lucide-react'
import { frameGraphInViewport } from '@/lib/admin/neo-graph/frame-viewport'
import { cn } from '@/lib/utils'

/**
 * Dark zoom controls. Avoids @react-sigma ZoomControl, which uses light CSS
 * variables and breaks to full-width top rows when the Sigma container
 * collapses to ~1px during HMR.
 */
const CAMERA_OPTS = { duration: 200, factor: 1.5 } as const

const btnClass =
  'flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/80 text-zinc-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-white/10'

export function NeoZoomControls({ className }: { className?: string }) {
  const sigma = useSigma()
  const { zoomIn, zoomOut } = useCamera(CAMERA_OPTS)

  return (
    <div
      className={cn(
        'pointer-events-auto absolute bottom-3 right-3 z-30 flex flex-col gap-2',
        className
      )}
      role="group"
      aria-label="Graph zoom"
    >
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={() => zoomIn()}
        className={btnClass}
      >
        <Plus className="size-3.5" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={() => zoomOut()}
        className={btnClass}
      >
        <Minus className="size-3.5" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        title="Fit graph"
        aria-label="Fit graph to view"
        onClick={() => frameGraphInViewport(sigma, { animateMs: 200 })}
        className={btnClass}
      >
        <Scan className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  )
}
