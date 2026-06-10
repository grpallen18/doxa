'use client'

import { type NodeProps } from '@xyflow/react'
import { CanvasInvisibleHandles } from '@/components/admin/workflow-canvas/nodes/canvas-invisible-handles'
import { Network } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CanvasFanoutNode({ data, selected }: NodeProps) {
  const { label } = data as { label: string }

  return (
    <div
      className={cn(
        'w-40 rounded-full border bg-zinc-900/80 backdrop-blur-md overflow-hidden transition-all shadow-lg flex items-center justify-center p-2 gap-2',
        selected
          ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]'
          : 'border-white/10'
      )}
    >
      <CanvasInvisibleHandles />
      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
        <Network className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs font-semibold text-zinc-200 pr-2">{label}</span>
    </div>
  )
}
