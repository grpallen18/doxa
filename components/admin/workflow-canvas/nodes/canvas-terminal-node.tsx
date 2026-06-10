'use client'

import { type NodeProps } from '@xyflow/react'
import { OctagonX } from 'lucide-react'
import { CanvasUtilityNodeShell } from '@/components/admin/workflow-canvas/nodes/canvas-utility-node-shell'

export function CanvasTerminalNode({ data, selected }: NodeProps) {
  const { label, desc } = data as { label: string; desc?: string }

  return (
    <CanvasUtilityNodeShell
      icon={<OctagonX className="w-4 h-4" />}
      label={label}
      desc={desc}
      selected={selected}
      tone="rose"
    />
  )
}
