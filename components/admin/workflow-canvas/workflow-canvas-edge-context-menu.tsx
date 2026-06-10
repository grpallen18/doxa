'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EdgeColor } from '@/lib/admin/workflow-canvas/edge-meta'
import { EDGE_COLOR_STYLES } from '@/lib/admin/workflow-canvas/edge-meta'

const COLOR_OPTIONS: { id: EdgeColor; label: string }[] = [
  { id: 'green', label: 'Green' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'red', label: 'Red' },
]

export function WorkflowCanvasEdgeContextMenu({
  edgeId,
  x,
  y,
  open,
  onOpenChange,
  onSelectColor,
}: {
  edgeId: string | null
  x: number
  y: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectColor: (edgeId: string, color: EdgeColor) => void
}) {
  if (!edgeId) return null

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <span
          className="fixed z-[2000] h-px w-px"
          style={{ left: x, top: y }}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="workflow-canvas-dark min-w-[140px]">
        {COLOR_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            className="gap-2"
            onClick={() => {
              onSelectColor(edgeId, option.id)
              onOpenChange(false)
            }}
          >
            <span
              className="h-3 w-3 rounded-full border border-white/20"
              style={{ backgroundColor: EDGE_COLOR_STYLES[option.id].stroke }}
            />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
