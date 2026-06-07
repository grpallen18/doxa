'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ViewMode = 'markdown' | 'json'

export function JsonMarkdownViewer({
  markdown,
  json,
  defaultMode = 'markdown',
  className,
}: {
  markdown?: string
  json?: string
  defaultMode?: ViewMode
  className?: string
}) {
  const hasMarkdown = Boolean(markdown?.trim())
  const hasJson = Boolean(json?.trim())
  const [mode, setMode] = useState<ViewMode>(
    hasMarkdown ? defaultMode : hasJson ? 'json' : 'markdown'
  )

  if (!hasMarkdown && !hasJson) {
    return <p className="text-xs text-muted">No output available.</p>
  }

  const content = mode === 'markdown' && hasMarkdown ? markdown : json

  return (
    <div className={cn('space-y-2', className)}>
      {hasMarkdown && hasJson && (
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === 'markdown' ? 'default' : 'outline'}
            onClick={() => setMode('markdown')}
          >
            Markdown
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'json' ? 'default' : 'outline'}
            onClick={() => setMode('json')}
          >
            JSON
          </Button>
        </div>
      )}
      <pre className="max-h-96 overflow-auto rounded-md border border-subtle bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}
