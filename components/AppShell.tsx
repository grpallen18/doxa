'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useUserRole } from '@/hooks/use-user-role'
import { useHeadroomHeader } from '@/hooks/use-headroom-header'
import { ExploreSidebarNav } from '@/components/explore-sidebar-nav'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'
import { HeaderSearch } from '@/components/header-search'
import { HeaderAdminMenu } from '@/components/header-admin-menu'
import { HeaderUserMenu } from '@/components/header-user-menu'
import { TopicExploreProvider } from '@/components/topic-explore-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const role = useUserRole()
  const headerVisible = useHeadroomHeader()

  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')
  const isAdmin = pathname.startsWith('/admin')

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen flex-col [--header-height:calc(theme(spacing.14))]">
      <TopicExploreProvider>
      <SidebarProvider className="flex min-h-0 flex-1 flex-col">
        <header
          className={cn(
            'fixed top-0 z-50 flex w-full shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none',
            !headerVisible && '-translate-y-full'
          )}
        >
          <div className="relative flex h-[--header-height] w-full items-stretch">
            <div className="inline-flex w-fit shrink-0 flex-col items-stretch gap-0.5 py-px">
              <Image
                src="/logo-color-no-bg.png"
                alt="DOXA"
                width={2172}
                height={724}
                priority
                className="block h-[calc(var(--header-height)-1rem)] w-auto dark:hidden"
              />
              <Image
                src="/logo-color-no-bg-dark.png"
                alt="DOXA"
                width={2172}
                height={724}
                priority
                className="hidden h-[calc(var(--header-height)-1rem)] w-auto dark:block"
              />
              <p className="w-full pb-px text-center font-cinzel text-[11px] font-medium leading-none tracking-[0.14em] text-sidebar-foreground/70">
                Belief, Mapped.
              </p>
            </div>
            {!isAdmin && (
              <div className="pointer-events-none absolute inset-y-0 left-1/2 flex w-full max-w-md -translate-x-1/2 items-center px-4">
                <HeaderSearch className="pointer-events-auto w-full" />
              </div>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1 self-center">
              {role === 'admin' && <HeaderAdminMenu />}
              <HeaderUserMenu />
            </div>
          </div>
        </header>
        <div className="h-[--header-height] shrink-0" aria-hidden />
        <div className="flex min-h-[calc(100svh-var(--header-height))] flex-1">
          <div
            className="hidden w-[--sidebar-width] shrink-0 md:block"
            aria-hidden
          />
          <Sidebar
            side="left"
            collapsible="none"
            className={cn(
              'fixed left-0 z-10 !flex w-[--sidebar-width] border-r border-sidebar-border transition-[top,height] duration-300 ease-in-out motion-reduce:transition-none',
              headerVisible
                ? 'top-[--header-height] h-[calc(100svh-var(--header-height))]'
                : 'top-0 h-svh'
            )}
          >
            <SidebarContent>
              {isAdmin ? <AdminSidebarNav /> : <ExploreSidebarNav />}
            </SidebarContent>
          </Sidebar>
          <SidebarInset>
            {children}
          </SidebarInset>
        </div>
      </SidebarProvider>
      </TopicExploreProvider>
    </div>
  )
}
