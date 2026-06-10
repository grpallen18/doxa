'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, TerminalSquare } from 'lucide-react'
import { AuditHistoryPanel } from '@/components/admin/record/audit-history-panel'
import { cn } from '@/lib/utils'

export function WorkflowCanvasConsole({
  storyId,
  open: controlledOpen,
  onOpenChange,
}: {
  storyId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  return (
    <div
      className={cn(
        'border-t border-white/10 bg-zinc-950/90 backdrop-blur-md shrink-0 transition-all',
        open ? 'h-48' : 'h-9'
      )}
    >
      <button
        type="button"
        className="w-full h-9 px-4 flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="inline-flex items-center gap-2">
          <TerminalSquare className="w-3.5 h-3.5" />
          Execution log
        </span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
      {open ? (
        <div className="h-[calc(100%-2.25rem)] overflow-y-auto px-4 pb-3">
          <AuditHistoryPanel
            apiPath={`/api/admin/stories/${storyId}/audit`}
            emptyMessage="No audit events for this story"
          />
        </div>
      ) : null}
    </div>
  )
}
