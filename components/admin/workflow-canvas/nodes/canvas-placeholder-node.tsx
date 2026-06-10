'use client'

import { type NodeProps } from '@xyflow/react'
import { MapPin } from 'lucide-react'
import { CanvasUtilityNodeShell } from '@/components/admin/workflow-canvas/nodes/canvas-utility-node-shell'

type PlaceholderNodeData = {
  label: string
  desc?: string
}

export function CanvasPlaceholderNode({ data, selected }: NodeProps) {
  const { label, desc } = data as PlaceholderNodeData

  return (
    <CanvasUtilityNodeShell
      icon={<MapPin className="w-4 h-4" />}
      label={label}
      desc={desc}
      status="Planned"
      selected={selected}
    />
  )
}
