'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Bookmark,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  Compass,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { useTopicExplore } from '@/components/topic-explore-context'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  icon: LucideIcon
  href?: string
  comingSoon?: boolean
}

const mainNav: NavItem[] = [
  { label: 'Explore Topics', icon: Compass, href: '/' },
  { label: 'Saved Briefs', icon: Bookmark, comingSoon: true },
  { label: 'Comparisons', icon: Columns3, comingSoon: true },
  { label: 'Alerts & Trends', icon: Bell, comingSoon: true },
]

function TopicTableOfContents() {
  const explore = useTopicExplore()
  if (!explore || explore.sections.length === 0) return null

  const { sections, activeSectionId, scrollToSection, expandAll, collapseAll } = explore

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between gap-2 pr-0">
        <span>On this page</span>
        <span className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Expand all sections"
            onClick={expandAll}
          >
            <ChevronsDownUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Collapse all sections"
            onClick={collapseAll}
          >
            <ChevronsUpDown className="size-3.5" />
          </Button>
        </span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sections.map((section) => (
            <SidebarMenuItem key={section.id}>
              <SidebarMenuButton
                type="button"
                isActive={activeSectionId === section.id}
                tooltip={section.title}
                className={cn('h-auto py-2')}
                onClick={() => scrollToSection(section.id)}
              >
                <span className="line-clamp-2 text-left text-xs leading-snug">{section.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function MainNavigation() {
  const pathname = usePathname()
  const onHome = pathname === '/'

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {mainNav.map((item) => (
            <SidebarMenuItem key={item.label}>
              {item.comingSoon ? (
                <SidebarMenuButton
                  disabled
                  tooltip="Coming soon"
                  className="cursor-not-allowed opacity-60"
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton asChild isActive={onHome} tooltip={item.label}>
                  <Link href={item.href ?? '/'}>
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              )}
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
    return <TopicTableOfContents />
  }

  return <MainNavigation />
}
