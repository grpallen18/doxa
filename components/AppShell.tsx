'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LayoutDashboard, Search, FileText, BookOpen, Activity, Map } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { useUserRole } from '@/hooks/use-user-role'
import { SidebarUserSection } from '@/components/SidebarUserSection'
import { AppFooter } from '@/components/AppFooter'

const navigationItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/atlas', label: 'Atlas', icon: Map },
  { href: '/about', label: 'About', icon: FileText },
]

const adminItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/topics', label: 'Topics', icon: FileText },
  { href: '/admin/stories', label: 'Stories', icon: BookOpen },
  { href: '/admin/health', label: 'Health', icon: Activity },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const role = useUserRole()

  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen flex-col [--header-height:calc(theme(spacing.14))]">
      <SidebarProvider className="flex min-h-0 flex-1 flex-col">
        <header className="flex sticky top-0 z-50 w-full shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4">
          <div className="flex h-[--header-height] w-full items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="font-semibold text-sidebar-foreground">Doxa</span>
          </div>
        </header>
        <div className="flex flex-1 min-h-0">
          <Sidebar
            side="left"
            className="top-[--header-height] !h-[calc(100svh-var(--header-height))]"
          >
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigationItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname === item.href || (item.href === '/atlas' && pathname.startsWith('/atlas'))}
                          tooltip={item.label}
                        >
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
              {role === 'admin' && (
                <SidebarGroup>
                  <SidebarGroupLabel>Admin</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {adminItems.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={pathname === item.href}
                            tooltip={item.label}
                          >
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
              )}
            </SidebarContent>
            <SidebarFooter className="border-t border-sidebar-border">
              <SidebarUserSection />
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset>
            {children}
          </SidebarInset>
        </div>
      </SidebarProvider>
      <AppFooter />
    </div>
  )
}
