'use client'

import { useRef } from 'react'
import { HighlightedArticleText } from '@/components/admin/highlighted-article-text'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export function ChunkContentExtractionLayout({ content }: { content: string }) {
  const contentViewportRef = useRef<HTMLDivElement>(null)

  return (
    <div className="min-h-0">
      <ScrollArea
        ref={contentViewportRef}
        type="always"
        className={cn(
          'h-[min(50vh,28rem)] min-h-0 overflow-hidden rounded-md border border-subtle bg-surface',
          '[&_[data-slot=scroll-area-viewport]]:h-full [&_[data-slot=scroll-area-viewport]]:max-h-full',
          '[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/50'
        )}
      >
        <div className="p-4">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
            {content ? (
              <HighlightedArticleText
                text={content}
                highlight={null}
                scrollViewportRef={contentViewportRef}
              />
            ) : (
              <p className="text-muted italic">No chunk content available.</p>
            )}
          </article>
        </div>
      </ScrollArea>
    </div>
  )
}
