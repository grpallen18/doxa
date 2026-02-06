"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLinkIcon } from "lucide-react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"

export type RecentStory = {
  story_id: string
  title: string
  url: string
  created_at: string
  source_name: string | null
}

function StoryItem({
  story,
  open,
  onOpenChange,
}: {
  story: RecentStory
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <HoverCard
      openDelay={1000}
      closeDelay={100}
      open={open}
      onOpenChange={onOpenChange}
    >
      <HoverCardTrigger asChild>
        <Item asChild>
          <a
            href={story.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ItemContent>
              <ItemTitle className="text-xs line-clamp-2">{story.title}</ItemTitle>
              <ItemDescription>
                {story.source_name ?? ""}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ExternalLinkIcon className="size-4" />
            </ItemActions>
          </a>
        </Item>
      </HoverCardTrigger>
      <HoverCardContent side="top">
        <p>{story.title}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

const AUTO_SCROLL_PX_PER_FRAME = 0.5
const RESUME_DELAY_MS = 1000

export function TrendingStoriesList({ stories }: { stories: RecentStory[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const firstBlockRef = useRef<HTMLDivElement>(null)
  const [openStoryId, setOpenStoryId] = useState<string | null>(null)
  const autoScrollRafRef = useRef<number | null>(null)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programmaticScrollRef = useRef(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const firstBlock = firstBlockRef.current
    if (!viewport || !firstBlock || stories.length === 0) return

    const blockHeight = firstBlock.offsetHeight

    function startAutoScroll() {
      if (pausedRef.current || !viewportRef.current || !firstBlockRef.current)
        return
      const viewport = viewportRef.current
      const firstBlock = firstBlockRef.current
      if (!viewport || !firstBlock) return

      const tick = () => {
        if (pausedRef.current) return
        const v = viewportRef.current
        const block = firstBlockRef.current
        if (!v || !block) return
        const blockH = block.offsetHeight
        let next = v.scrollTop + AUTO_SCROLL_PX_PER_FRAME
        if (next >= blockH) next = next - blockH
        programmaticScrollRef.current = true
        v.scrollTop = next
        autoScrollRafRef.current = requestAnimationFrame(tick)
      }
      autoScrollRafRef.current = requestAnimationFrame(tick)
    }

    function pauseOnly() {
      pausedRef.current = true
      if (autoScrollRafRef.current != null) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
      if (resumeTimeoutRef.current != null) {
        clearTimeout(resumeTimeoutRef.current)
        resumeTimeoutRef.current = null
      }
    }

    function pauseAndResumeLater() {
      pausedRef.current = true
      if (autoScrollRafRef.current != null) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
      if (resumeTimeoutRef.current != null) {
        clearTimeout(resumeTimeoutRef.current)
        resumeTimeoutRef.current = null
      }
      resumeTimeoutRef.current = setTimeout(() => {
        resumeTimeoutRef.current = null
        pausedRef.current = false
        startAutoScroll()
      }, RESUME_DELAY_MS)
    }

    const onScroll = () => {
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false
      } else {
        pauseAndResumeLater()
      }
      setOpenStoryId(null)
      const { scrollTop } = viewport
      if (scrollTop >= blockHeight) {
        programmaticScrollRef.current = true
        viewport.scrollTop = scrollTop - blockHeight
      }
    }

    const onClick = () => {
      pauseAndResumeLater()
    }

    viewport.addEventListener("scroll", onScroll, { passive: true })
    viewport.addEventListener("click", onClick, { capture: true })
    viewport.addEventListener("wheel", pauseAndResumeLater, { passive: true })
    viewport.addEventListener("touchmove", pauseAndResumeLater, {
      passive: true,
    })
    viewport.addEventListener("mouseenter", pauseOnly)
    viewport.addEventListener("mouseleave", pauseAndResumeLater)
    startAutoScroll()

    return () => {
      viewport.removeEventListener("scroll", onScroll)
      viewport.removeEventListener("click", onClick)
      viewport.removeEventListener("wheel", pauseAndResumeLater)
      viewport.removeEventListener("touchmove", pauseAndResumeLater)
      viewport.removeEventListener("mouseenter", pauseOnly)
      viewport.removeEventListener("mouseleave", pauseAndResumeLater)
      if (autoScrollRafRef.current != null) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
      if (resumeTimeoutRef.current != null) {
        clearTimeout(resumeTimeoutRef.current)
        resumeTimeoutRef.current = null
      }
    }
  }, [stories.length])

  if (stories.length === 0) {
    return (
      <ScrollArea className="h-96 w-full rounded-bevel panel-bevel-soft p-3">
        <div className="flex flex-col gap-4 py-4 px-3 pr-4">
          <p className="text-sm text-muted">No stories yet.</p>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea
      ref={viewportRef}
      className="h-96 w-full rounded-bevel panel-bevel-soft p-3"
    >
      <div className="flex flex-col gap-4">
        <div ref={firstBlockRef} className="flex flex-col gap-4 pt-4 px-3 pr-4">
          {stories.map((story) => (
            <StoryItem
              key={`a-${story.story_id}`}
              story={story}
              open={openStoryId === story.story_id}
              onOpenChange={(open) =>
                setOpenStoryId(open ? story.story_id : null)
              }
            />
          ))}
        </div>
        <div className="flex flex-col gap-4 pb-4 px-3 pr-4">
          {stories.map((story) => (
            <StoryItem
              key={`b-${story.story_id}`}
              story={story}
              open={openStoryId === story.story_id}
              onOpenChange={(open) =>
                setOpenStoryId(open ? story.story_id : null)
              }
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
