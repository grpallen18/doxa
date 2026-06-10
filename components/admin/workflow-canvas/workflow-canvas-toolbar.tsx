'use client'

import Link from 'next/link'
import { Activity, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WorkflowCanvasToolbar({
  storyTitle,
  storyId,
}: {
  storyTitle: string
  storyId: string
}) {
  return (
    <header className="h-12 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm tracking-tight shrink-0">
          <Activity className="w-4 h-4" />
          Agent Flow
        </div>
        <div className="h-4 w-px bg-white/10" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-zinc-400 hover:text-zinc-200"
          asChild
        >
          <Link href={`/admin/stories/${storyId}`}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Story
          </Link>
        </Button>
        <div className="hidden sm:flex items-center gap-2 bg-white/5 rounded-md px-3 py-1 border border-white/5 text-sm min-w-0">
          <span className="text-zinc-400 shrink-0">Story:</span>
          <span className="text-zinc-200 truncate">{storyTitle}</span>
        </div>
      </div>
    </header>
  )
}
