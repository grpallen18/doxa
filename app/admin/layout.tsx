'use client'

import { usePathname } from 'next/navigation'
import { AdminCenterNav } from '@/components/admin/admin-center-nav'
import { AdminShell } from '@/components/admin/admin-shell'
import { cn } from '@/lib/utils'

const SHELL_X_PADDING = 'px-4 sm:px-6 md:px-8 lg:px-10'

function isEntityRecordRoute(pathname: string): boolean {
  return (
    /^\/admin\/stories\/[^/]+/.test(pathname) ||
    /^\/admin\/neo\/[^/]+/.test(pathname) ||
    pathname.startsWith('/admin/records/') ||
    pathname.startsWith('/admin/agents/') ||
    pathname.startsWith('/admin/agreements/') ||
    /^\/admin\/controversies\/[^/]+/.test(pathname)
  )
}

function isAgentFlowRoute(pathname: string): boolean {
  return /\/admin\/stories\/[^/]+\/(agent-flow|chunks\/[^/]+\/agent-flow)$/.test(pathname)
}

function isNeoDetailRoute(pathname: string): boolean {
  return /^\/admin\/neo\/[^/]+/.test(pathname)
}

function adminShellClass(pathname: string): string | undefined {
  if (isAgentFlowRoute(pathname)) {
    return 'min-h-0 h-[calc(100svh-var(--header-height))] max-h-[calc(100svh-var(--header-height))] gap-0 bg-zinc-950 px-0 pb-0 pt-0 sm:px-0 md:px-0 lg:px-0 overflow-hidden'
  }
  if (isNeoDetailRoute(pathname)) {
    return 'min-h-0 h-[calc(100svh-var(--header-height))] max-h-[calc(100svh-var(--header-height))] gap-0 overflow-hidden px-0 pb-0 pt-0 sm:px-0 md:px-0 lg:px-0'
  }
  if (isEntityRecordRoute(pathname)) {
    return 'min-h-full bg-surface-canvas px-0 sm:px-0 md:px-0 lg:px-0'
  }
  return undefined
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const neoDetail = isNeoDetailRoute(pathname)
  const showCenterNav = !isAgentFlowRoute(pathname) && !neoDetail
  const entityRoute = isEntityRecordRoute(pathname) && !neoDetail

  return (
    <AdminShell
      maxWidth="full"
      className={cn(adminShellClass(pathname), showCenterNav && 'px-0 sm:px-0 md:px-0 lg:px-0')}
    >
      {showCenterNav && <AdminCenterNav />}
      {neoDetail ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      ) : showCenterNav && !entityRoute ? (
        <div className={SHELL_X_PADDING}>{children}</div>
      ) : (
        children
      )}
    </AdminShell>
  )
}
