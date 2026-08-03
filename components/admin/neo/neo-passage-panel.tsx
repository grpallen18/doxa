'use client'

import { useEffect, useMemo, useRef } from 'react'

export function NeoPassagePanel({
  title,
  content,
  highlight,
}: {
  title?: string | null
  content: string
  highlight: { start: number; end: number } | null
}) {
  const markRef = useRef<HTMLElement | null>(null)

  const parts = useMemo(() => {
    if (!content) return null
    if (
      !highlight ||
      highlight.start < 0 ||
      highlight.end <= highlight.start ||
      highlight.start >= content.length
    ) {
      return { before: content, mid: '', after: '' }
    }
    const start = Math.min(highlight.start, content.length)
    const end = Math.min(highlight.end, content.length)
    return {
      before: content.slice(0, start),
      mid: content.slice(start, end),
      after: content.slice(end),
    }
  }, [content, highlight])

  useEffect(() => {
    if (markRef.current) {
      markRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlight?.start, highlight?.end, parts?.mid])

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-white/10 bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Passage
          </p>
          {title ? (
            <p className="truncate text-sm text-zinc-200">{title}</p>
          ) : null}
        </div>
        {highlight ? (
          <p className="shrink-0 text-xs text-zinc-500">
            chars {highlight.start}–{highlight.end}
          </p>
        ) : (
          <p className="shrink-0 text-xs text-zinc-500">Select an utterance</p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!content ? (
          <p className="text-sm text-zinc-500">No cleaned body text for this story.</p>
        ) : parts ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
            {parts.before}
            {parts.mid ? (
              <mark
                ref={markRef}
                className="rounded-sm bg-amber-400/35 px-0.5 text-zinc-50"
              >
                {parts.mid}
              </mark>
            ) : null}
            {parts.after}
          </pre>
        ) : null}
      </div>
    </div>
  )
}
