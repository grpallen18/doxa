'use client'

import { Handle, Position } from '@xyflow/react'

const invisibleHandleClass =
  '!opacity-0 !w-1 !h-1 !min-w-0 !min-h-0 !border-0 pointer-events-none'

export function CanvasInvisibleHandles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={invisibleHandleClass}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        isConnectable={false}
        className={invisibleHandleClass}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={invisibleHandleClass}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="fail"
        isConnectable={false}
        className={invisibleHandleClass}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="pending"
        isConnectable={false}
        className={invisibleHandleClass}
      />
    </>
  )
}
