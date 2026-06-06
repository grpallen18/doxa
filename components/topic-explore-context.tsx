'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TocSection = {
  id: string
  title: string
  href?: string
  /** Nesting depth for position page subsections (0 = top level). */
  depth?: number
}

export type TocBackLink = {
  href: string
  label: string
}

type TopicExploreContextValue = {
  sections: TocSection[]
  setSections: (sections: TocSection[]) => void
  backLink: TocBackLink | null
  setBackLink: (link: TocBackLink | null) => void
  scrollToSection: (id: string) => void
  activeSectionId: string | null
  setActiveSectionId: (id: string | null) => void
}

const TopicExploreContext = createContext<TopicExploreContextValue | null>(null)

export function TopicExploreProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<TocSection[]>([])
  const [backLink, setBackLink] = useState<TocBackLink | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  const scrollToSection = useCallback((id: string) => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    setActiveSectionId(id)
  }, [])

  const value = useMemo(
    () => ({
      sections,
      setSections,
      backLink,
      setBackLink,
      scrollToSection,
      activeSectionId,
      setActiveSectionId,
    }),
    [sections, backLink, scrollToSection, activeSectionId]
  )

  return <TopicExploreContext.Provider value={value}>{children}</TopicExploreContext.Provider>
}

export function useTopicExplore() {
  return useContext(TopicExploreContext)
}

export function useRegisterToc({
  backLink = null,
  sections,
}: {
  backLink?: TocBackLink | null
  sections: TocSection[]
}) {
  const ctx = useTopicExplore()
  const setSections = ctx?.setSections
  const setBackLink = ctx?.setBackLink
  const setActiveSectionId = ctx?.setActiveSectionId
  const backHref = backLink?.href ?? null
  const backLabel = backLink?.label ?? null

  useEffect(() => {
    if (!setSections || !setBackLink || !setActiveSectionId) return

    setBackLink(backHref && backLabel ? { href: backHref, label: backLabel } : null)
    setSections(sections)
    setActiveSectionId(null)

    return () => {
      setBackLink(null)
      setSections([])
      setActiveSectionId(null)
    }
  }, [setSections, setBackLink, setActiveSectionId, backHref, backLabel, sections])

  useEffect(() => {
    if (!ctx) return

    const scrollIds = sections.filter((section) => !section.href).map((section) => section.id)
    if (scrollIds.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target.id) {
          ctx.setActiveSectionId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    )

    for (const id of scrollIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [ctx, sections])
}
