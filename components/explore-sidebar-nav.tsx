'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Bell, Bookmark, Columns3, Compass } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { defaultTopicId, topicNav } from '@/lib/mock/topic-explore'

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

export function ExploreSidebarNav() {
  return (
    <Suspense fallback={null}>
      <ExploreSidebarNavInner />
    </Suspense>
  )
}

function ExploreSidebarNavInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTopic = searchParams.get('topic') ?? defaultTopicId
  const onHome = pathname === '/'

  return (
    <>
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

      <SidebarGroup>
        <SidebarGroupLabel>Topics</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {topicNav.map((topic) => (
              <SidebarMenuItem key={topic.id}>
                <SidebarMenuButton
                  asChild
                  isActive={onHome && activeTopic === topic.id}
                  tooltip={topic.title}
                >
                  <Link href={`/?topic=${topic.id}`}>
                    <span>{topic.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}
