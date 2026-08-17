'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Compass,
  Info,
  PanelLeftClose,
  Search,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useTopicExplore, type TocSection } from '@/components/topic-explore-context'
import { HOME_PATH } from '@/lib/constants'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  icon: LucideIcon
  href: string
  matchPrefix?: boolean
}

const mainNav: NavItem[] = [
  { label: 'Debates', icon: Compass, href: HOME_PATH, matchPrefix: false },
  { label: 'People', icon: User, href: '/people', matchPrefix: true },
  { label: 'Search', icon: Search, href: '/search', matchPrefix: true },
  { label: 'About', icon: Info, href: '/about' },
]

const tocBackLinkClassName =
  'h-auto items-center bg-surface py-2 pl-[2px] font-normal text-muted no-underline hover:bg-surface hover:font-normal hover:text-muted hover:underline active:bg-surface active:text-muted data-[active=true]:bg-surface data-[active=true]:font-normal data-[active=true]:text-muted data-[state=open]:hover:bg-surface data-[state=open]:hover:text-muted [&>svg]:!size-3'

const tocItemClassName =
  'h-auto bg-surface py-2 font-normal text-muted no-underline hover:bg-surface hover:font-bold hover:text-muted hover:underline active:bg-surface active:text-muted data-[active=true]:bg-surface data-[active=true]:font-bold data-[active=true]:text-foreground data-[active=true]:underline data-[state=open]:hover:bg-surface data-[state=open]:hover:text-muted'

function sectionDepth(section: TocSection) {
  return section.depth ?? 0
}

function getParentIdsWithChildren(sections: TocSection[]): Set<string> {
  const parents = new Set<string>()
  for (let i = 0; i < sections.length; i++) {
    const depth = sectionDepth(sections[i])
    const next = sections[i + 1]
    if (next && sectionDepth(next) > depth) {
      parents.add(sections[i].id)
    }
  }
  return parents
}

function isSectionHidden(
  sections: TocSection[],
  index: number,
  collapsedIds: Set<string>
): boolean {
  let depth = sectionDepth(sections[index])
  if (depth === 0) return false

  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    const ancestorDepth = sectionDepth(sections[i])
    if (ancestorDepth < depth) {
      if (collapsedIds.has(sections[i].id)) return true
      depth = ancestorDepth
    }
  }
  return false
}

function isNavActive(pathname: string, item: NavItem) {
  if (item.href === HOME_PATH) {
    return pathname === HOME_PATH || pathname.startsWith('/c/')
  }
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }
  return pathname === item.href
}

function TableOfContentsNav() {
  const explore = useTopicExplore()
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())

  const sections = explore?.sections ?? []
  const sectionIdsKey = sections.map((section) => section.id).join('|')

  useEffect(() => {
    setCollapsedIds(new Set())
  }, [sectionIdsKey])

  const parentIds = useMemo(() => getParentIdsWithChildren(sections), [sections])

  if (!explore || sections.length === 0) return null

  const { backLink, activeSectionId, scrollToSection } = explore

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <SidebarGroup>
      {backLink && (
        <div className="mb-1 flex items-center gap-1">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={`Return to ${backLink.label}`}
                className={tocBackLinkClassName}
              >
                <Link href={backLink.href} data-testid="sidebar-back-link">
                  <ArrowLeft className="size-3 shrink-0 self-center" aria-hidden />
                  <span className="ml-[2px] text-xs font-normal leading-none">
                    Return to {backLink.label}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Hide sidebar"
            data-testid="sidebar-collapse-button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
          >
            <PanelLeftClose className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      <SidebarGroupLabel className="text-foreground">Table of Contents</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sections.map((section, index) => {
            if (isSectionHidden(sections, index, collapsedIds)) return null

            const depth = sectionDepth(section)
            const isParent = parentIds.has(section.id)
            const isExpanded = !collapsedIds.has(section.id)
            const Chevron = isExpanded ? ChevronDown : ChevronRight

            const title = (
              <span className="line-clamp-2 text-left text-xs leading-snug">{section.title}</span>
            )

            return (
              <SidebarMenuItem key={section.id}>
                <div
                  className="flex w-full items-start gap-0.5"
                  style={depth ? { paddingLeft: `${depth * 1.5}rem` } : undefined}
                >
                  {isParent ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse ${section.title}` : `Expand ${section.title}`}
                      className="mt-2.5 inline-flex size-3.5 shrink-0 items-center justify-center text-muted"
                      onClick={() => toggleCollapsed(section.id)}
                    >
                      <Chevron className="size-3" aria-hidden />
                    </button>
                  ) : null}
                  {section.href ? (
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === section.href}
                      tooltip={section.title}
                      className={cn(tocItemClassName, 'min-w-0 flex-1')}
                    >
                      <Link href={section.href}>{title}</Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      type="button"
                      isActive={activeSectionId === section.id}
                      tooltip={section.title}
                      className={cn(tocItemClassName, 'min-w-0 flex-1')}
                      onClick={() => scrollToSection(section.id)}
                    >
                      {title}
                    </SidebarMenuButton>
                  )}
                </div>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function MainNavigation() {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {mainNav.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton asChild isActive={isNavActive(pathname, item)} tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function ExploreSidebarNav() {
  const explore = useTopicExplore()
  const showToc = (explore?.sections.length ?? 0) > 0

  if (showToc) {
    return <TableOfContentsNav />
  }

  return <MainNavigation />
}
