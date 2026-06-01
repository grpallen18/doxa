'use client'

import { useEffect, useRef } from 'react'
import { isValidArticleSpan, type ArticleSpan } from '@/lib/admin/article-span-highlight'

export function HighlightedArticleText({
  text,
  highlight,
}: {
  text: string
  highlight: ArticleSpan | null
}) {
  const markRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (isValidArticleSpan(highlight, text.length) && markRef.current) {
      markRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlight, text.length])

  if (!isValidArticleSpan(highlight, text.length)) {
    return <>{text}</>
  }

  const { start, end } = highlight
  return (
    <>
      {text.slice(0, start)}
      <mark
        ref={markRef}
        className="rounded-sm bg-yellow-300/50 text-inherit dark:bg-yellow-500/35"
      >
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  )
}
