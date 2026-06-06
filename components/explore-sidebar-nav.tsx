'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  Bookmark,
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
import { useTopicExplore } from '@/components/topic-explore-context'
import { cn } from '@/lib/utils'
import { defaultTopicId } from '@/lib/mock/topic-explore'
import { topicPath } from '@/lib/topic-routes'

type NavItem = {
  label: string
  icon: LucideIcon
  href?: string
  comingSoon?: boolean
}

const mainNav: NavItem[] = [
  { label: 'Explore Topics', icon: Compass, href: topicPath(defaultTopicId) },
  { label: 'Saved Briefs', icon: Bookmark, comingSoon: true },
  { label: 'Comparisons', icon: Columns3, comingSoon: true },
  { label: 'Alerts & Trends', icon: Bell, comingSoon: true },
]

function TableOfContentsNav() {
  const explore = useTopicExplore()
  const pathname = usePathname()
  if (!explore || explore.sections.length === 0) return null

  const { sections, backLink, activeSectionId, scrollToSection } = explore

  return (
    <SidebarGroup>
      {backLink && (
        <SidebarMenu className="mb-1">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={backLink.label} className="h-auto py-2">
              <Link href={backLink.href} data-testid="sidebar-back-link">
                <ArrowLeft className="size-4 shrink-0" />
                <span className="text-xs">{backLink.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
      <SidebarGroupLabel>Table of Contents</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sections.map((section) => (
            <SidebarMenuItem key={section.id}>
              {section.href ? (
                <SidebarMenuButton
                  asChild
                  isActive={pathname === section.href}
                  tooltip={section.title}
                  className={cn('h-auto py-2')}
                >
                  <Link href={section.href}>
                    <span className="line-clamp-2 text-left text-xs leading-snug">{section.title}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  type="button"
                  isActive={activeSectionId === section.id}
                  tooltip={section.title}
                  className={cn('h-auto py-2', section.depth ? 'pl-2' : undefined)}
                  style={
                    section.depth
                      ? { paddingLeft: `${0.75 + section.depth * 0.75}rem` }
                      : undefined
                  }
                  onClick={() => scrollToSection(section.id)}
                >
                  <span className="line-clamp-2 text-left text-xs leading-snug">{section.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function MainNavigation() {
  const pathname = usePathname()
  const onTopics = pathname.startsWith('/topics/')

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
                <SidebarMenuButton asChild isActive={onTopics} tooltip={item.label}>
                  <Link href={item.href ?? topicPath(defaultTopicId)}>
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
    return <TableOfContentsNav />
  }

  return <MainNavigation />
}
