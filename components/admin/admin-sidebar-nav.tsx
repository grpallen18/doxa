'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BookOpen,
  FileText,
  GitBranch,
  LayoutDashboard,
  Map,
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

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  match?: (pathname: string) => boolean
}

const overviewNav: NavItem[] = [
  {
    label: 'Overview',
    href: '/admin',
    icon: LayoutDashboard,
    match: (pathname) => pathname === '/admin',
  },
]

const pipelineNav: NavItem[] = [
  {
    label: 'Stories',
    href: '/admin/stories',
    icon: BookOpen,
    match: (pathname) => pathname.startsWith('/admin/stories'),
  },
]

const contentNav: NavItem[] = [
  {
    label: 'Topics',
    href: '/admin/topics',
    icon: FileText,
    match: (pathname) => pathname.startsWith('/admin/topics'),
  },
]

const topologyNav: NavItem[] = [
  {
    label: 'Agreements',
    href: '/admin/positions',
    icon: GitBranch,
    match: (pathname) => pathname.startsWith('/admin/positions'),
  },
]

const monitorNav: NavItem[] = [
  {
    label: 'Health',
    href: '/admin/health',
    icon: Activity,
    match: (pathname) => pathname.startsWith('/admin/health'),
  },
]

const metaNav: NavItem[] = [
  {
    label: 'Pipeline roadmap',
    href: '/admin/pipeline-roadmap',
    icon: Map,
    match: (pathname) => pathname.startsWith('/admin/pipeline-roadmap'),
  },
]

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = item.match?.(pathname) ?? pathname === item.href
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function OverviewNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = item.match?.(pathname) ?? pathname === item.href

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link href={item.href}>
          <item.icon className="size-4 shrink-0" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AdminSidebarNav() {
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {overviewNav.map((item) => (
              <OverviewNavItem key={item.href} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <NavGroup label="Pipeline" items={pipelineNav} />
      <NavGroup label="Content" items={contentNav} />
      <NavGroup label="Topology" items={topologyNav} />
      <NavGroup label="Monitor" items={monitorNav} />
      <NavGroup label="Reference" items={metaNav} />
    </>
  )
}
