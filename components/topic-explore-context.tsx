'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TocSection = {
  id: string
  title: string
}

type TopicExploreContextValue = {
  sections: TocSection[]
  setSections: (sections: TocSection[]) => void
  isCollapsed: (id: string) => boolean
  setSectionCollapsed: (id: string, collapsed: boolean) => void
  expandAll: () => void
  collapseAll: () => void
  scrollToSection: (id: string) => void
  activeSectionId: string | null
  setActiveSectionId: (id: string | null) => void
}

const TopicExploreContext = createContext<TopicExploreContextValue | null>(null)

export function TopicExploreProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<TocSection[]>([])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  const isCollapsed = useCallback((id: string) => collapsedIds.has(id), [collapsedIds])

  const setSectionCollapsed = useCallback((id: string, collapsed: boolean) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (collapsed) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const expandAll = useCallback(() => setCollapsedIds(new Set()), [])

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(sections.map((section) => section.id)))
  }, [sections])

  const scrollToSection = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    setActiveSectionId(id)
  }, [])

  const value = useMemo(
    () => ({
      sections,
      setSections,
      isCollapsed,
      setSectionCollapsed,
      expandAll,
      collapseAll,
      scrollToSection,
      activeSectionId,
      setActiveSectionId,
    }),
    [
      sections,
      isCollapsed,
      setSectionCollapsed,
      expandAll,
      collapseAll,
      scrollToSection,
      activeSectionId,
    ]
  )

  return <TopicExploreContext.Provider value={value}>{children}</TopicExploreContext.Provider>
}

export function useTopicExplore() {
  return useContext(TopicExploreContext)
}
