'use client'

import type { ReactNode } from 'react'
import { CanvasInvisibleHandles } from '@/components/admin/workflow-canvas/nodes/canvas-invisible-handles'
import { cn } from '@/lib/utils'

export function CanvasUtilityNodeShell({
  icon,
  label,
  desc,
  status,
  selected,
  actions,
  tone = 'indigo',
}: {
  icon: ReactNode
  label: string
  desc?: string
  status?: string
  selected?: boolean
  actions?: ReactNode
  tone?: 'indigo' | 'rose'
}) {
  const isRose = tone === 'rose'

  return (
    <div
      className={cn(
        'w-56 rounded-xl border backdrop-blur-md overflow-hidden transition-all',
        isRose
          ? 'bg-rose-950/20 shadow-[0_0_15px_rgba(244,63,94,0.05)]'
          : 'bg-indigo-950/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]',
        selected
          ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]'
          : isRose
            ? 'border-rose-500/30'
            : 'border-indigo-500/30'
      )}
    >
      <CanvasInvisibleHandles />

      <div className="p-3 flex items-center gap-3 relative overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 pointer-events-none',
            isRose
              ? 'bg-gradient-to-r from-rose-500/10 to-transparent'
              : 'bg-gradient-to-r from-indigo-500/10 to-transparent'
          )}
        />
        <div
          className={cn(
            'w-9 h-9 rounded-full border flex items-center justify-center shrink-0',
            isRose
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
              : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3
            className={cn(
              'text-sm font-bold truncate',
              isRose ? 'text-rose-100' : 'text-indigo-100'
            )}
          >
            {label}
          </h3>
          {desc ? (
            <p
              className={cn(
                'text-[10px] mt-0.5 leading-tight line-clamp-2',
                isRose ? 'text-rose-300/70' : 'text-indigo-300/70'
              )}
            >
              {desc}
            </p>
          ) : null}
          {status ? (
            <p
              className={cn(
                'text-[10px] mt-1',
                isRose ? 'text-rose-400/80' : 'text-indigo-400/80'
              )}
            >
              {status}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="px-2 pb-2 flex justify-end gap-1">{actions}</div> : null}
    </div>
  )
}
