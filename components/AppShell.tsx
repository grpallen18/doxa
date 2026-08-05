'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeft } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useUserRole } from '@/hooks/use-user-role'
import { useHeadroomHeader } from '@/hooks/use-headroom-header'
import { ExploreSidebarNav } from '@/components/explore-sidebar-nav'
import { AdminHeaderSearch } from '@/components/admin/admin-pipeline-search'
import { HeaderSearch } from '@/components/header-search'
import { HeaderAdminMenu } from '@/components/header-admin-menu'
import { HeaderPagesMenu } from '@/components/header-pages-menu'
import { HeaderUserMenu } from '@/components/header-user-menu'
import { TopicExploreProvider } from '@/components/topic-explore-context'

const SIDEBAR_PANE_MS = 500

const sidebarPaneTransitionStyle = {
  transitionDuration: `${SIDEBAR_PANE_MS}ms`,
  transitionTimingFunction: 'ease-in-out',
} as const

function ExploreSidebarPane({
  headerVisible,
  children,
}: {
  headerVisible: boolean
  children: React.ReactNode
}) {
  const { open, toggleSidebar } = useSidebar()

  return (
    <>
      <div
        className={cn(
          'hidden shrink-0 md:block transition-[width] motion-reduce:transition-none',
          open ? 'w-[--sidebar-width]' : 'w-0'
        )}
        style={sidebarPaneTransitionStyle}
        aria-hidden
      />
      <Sidebar
        side="left"
        collapsible="none"
        className={cn(
          'fixed left-0 z-10 !flex w-[--sidebar-width] border-r border-border bg-surface text-foreground transition-[top,height,transform] motion-reduce:transition-none',
          headerVisible
            ? 'top-[--header-height] h-[calc(100svh-var(--header-height))]'
            : 'top-0 h-svh',
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        )}
        style={sidebarPaneTransitionStyle}
        aria-hidden={!open}
      >
        <SidebarContent>
          <ExploreSidebarNav />
        </SidebarContent>
      </Sidebar>
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Show sidebar"
        data-testid="sidebar-expand-button"
        className={cn(
          'fixed left-0 z-20 flex size-7 items-center justify-center rounded-md border border-l-0 border-border bg-surface text-muted transition-[top,opacity,transform] hover:text-foreground motion-reduce:transition-none',
          headerVisible
            ? 'top-[calc(var(--header-height)+0.5rem)]'
            : 'top-2',
          open
            ? 'pointer-events-none -translate-x-full opacity-0'
            : 'translate-x-0 opacity-100'
        )}
        style={sidebarPaneTransitionStyle}
      >
        <PanelLeft className="size-3.5" aria-hidden />
      </button>
      <SidebarInset>{children}</SidebarInset>
    </>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const role = useUserRole()
  const headerVisible = useHeadroomHeader()

  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')
  const isAdmin = pathname.startsWith('/admin')

  if (isAuthPage) {
    return <>{children}</>
  }

  const shellBody = (
    <>
      <header
        className={cn(
          'fixed top-0 z-50 flex w-full shrink-0 items-center gap-2 border-b border-border bg-surface transition-transform duration-300 ease-in-out motion-reduce:transition-none',
          !headerVisible && '-translate-y-full'
        )}
      >
        <div className="relative flex h-[--header-height] w-full items-stretch">
          <Link
            href="/admin"
            className="inline-flex w-fit shrink-0 items-center py-2 pl-3"
            aria-label="Admin Center"
          >
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
          </Link>
          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 left-1/2 flex w-full -translate-x-1/2 items-center px-4',
              isAdmin ? 'max-w-xl' : 'max-w-md'
            )}
          >
            {isAdmin ? (
              <AdminHeaderSearch className="pointer-events-auto w-full" />
            ) : (
              <HeaderSearch className="pointer-events-auto w-full" />
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 self-center pr-4">
            <HeaderPagesMenu />
            {role === 'admin' && <HeaderAdminMenu />}
            <HeaderUserMenu />
          </div>
        </div>
      </header>
      <div className="h-[--header-height] shrink-0" aria-hidden />
      <div className="flex min-h-[calc(100svh-var(--header-height))] flex-1">
        {isAdmin ? (
          <main className="relative flex w-full flex-1 flex-col bg-background">
            {children}
          </main>
        ) : (
          <ExploreSidebarPane headerVisible={headerVisible}>{children}</ExploreSidebarPane>
        )}
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen flex-col [--header-height:calc(theme(spacing.12))]">
      <TopicExploreProvider>
        {isAdmin ? (
          <div className="flex min-h-0 flex-1 flex-col">{shellBody}</div>
        ) : (
          <SidebarProvider className="flex min-h-0 flex-1 flex-col">{shellBody}</SidebarProvider>
        )}
      </TopicExploreProvider>
    </div>
  )
}
