'use client'

import Link from 'next/link'
import { Activity, ArrowLeft, FileText, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { storyAgentFlowHref } from '@/lib/admin/story-lifecycle'

export function WorkflowCanvasToolbar({
  storyTitle,
  storyId,
  chunksReady = false,
  onOpenChunkWorkflows,
  chunkLabel,
  backHref,
  backLabel = 'Story',
  chunkPageHref,
}: {
  storyTitle: string
  storyId: string
  chunksReady?: boolean
  onOpenChunkWorkflows?: () => void
  chunkLabel?: string
  backHref?: string
  backLabel?: string
  chunkPageHref?: string
}) {
  return (
    <header className="h-12 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm tracking-tight shrink-0">
          <Activity className="w-4 h-4" />
          {chunkLabel ? 'Chunk Flow' : 'Agent Flow'}
        </div>
        <div className="h-4 w-px bg-white/10" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-zinc-400 hover:text-zinc-200"
          asChild
        >
          <Link href={backHref ?? `/admin/stories/${storyId}`}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            {backLabel}
          </Link>
        </Button>
        {chunkPageHref ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-zinc-400 hover:text-zinc-200"
            asChild
          >
            <Link href={chunkPageHref}>
              <FileText className="w-4 h-4 mr-1" />
              Chunk page
            </Link>
          </Button>
        ) : null}
        <div className="hidden sm:flex items-center gap-2 bg-white/5 rounded-md px-3 py-1 border border-white/5 text-sm min-w-0">
          <span className="text-zinc-400 shrink-0">{chunkLabel ? 'Chunk:' : 'Story:'}</span>
          <span className="text-zinc-200 truncate">{chunkLabel ?? storyTitle}</span>
        </div>
      </div>

      {onOpenChunkWorkflows ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
          disabled={!chunksReady}
          onClick={onOpenChunkWorkflows}
        >
          <Layers className="mr-1.5 h-3.5 w-3.5" />
          Chunk workflows
        </Button>
      ) : null}
    </header>
  )
}
