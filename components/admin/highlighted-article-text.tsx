'use client'

import { useEffect, useRef } from 'react'
import { isValidArticleSpan, type ArticleSpan } from '@/lib/admin/article-span-highlight'

function scrollMarkIntoViewport(
  mark: HTMLElement,
  viewport: HTMLElement
) {
  const markRect = mark.getBoundingClientRect()
  const viewRect = viewport.getBoundingClientRect()

  if (markRect.top < viewRect.top) {
    viewport.scrollTop += markRect.top - viewRect.top
  } else if (markRect.bottom > viewRect.bottom) {
    viewport.scrollTop += markRect.bottom - viewRect.bottom
  }
}

export function HighlightedArticleText({
  text,
  highlight,
  scrollViewportRef,
}: {
  text: string
  highlight: ArticleSpan | null
  scrollViewportRef?: React.RefObject<HTMLElement | null>
}) {
  const markRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isValidArticleSpan(highlight, text.length) || !markRef.current || !scrollViewportRef?.current) {
      return
    }
    scrollMarkIntoViewport(markRef.current, scrollViewportRef.current)
  }, [highlight, text.length, scrollViewportRef])

  if (!isValidArticleSpan(highlight, text.length)) {
    return <>{text}</>
  }

  const { start, end } = highlight
  return (
    <>
      {text.slice(0, start)}
      <mark
        ref={markRef}
        className="rounded-sm bg-[var(--provenance-highlight-mark)] text-inherit"
      >
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  )
}
